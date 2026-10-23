import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db'
import { technologies, userTechPreferences } from '@/db/schema'
import {
  createReleaseFetchRun,
  finishReleaseFetchRun,
  orderCronRepositories,
  processTechReleases,
  type IngestionError,
} from '@/lib/release-ingestion'
import { requireCronAuth } from '@/lib/cron-auth'
import { createGithubFetchContext } from '@/lib/github'
import { dispatchReleaseWebhooks } from '@/lib/webhooks'
import { createAiExecutionContext } from '@/lib/ai-resilience'
import {
  createExecutionBudget,
  ExecutionDeadlineError,
  type StageTimings,
} from '@/lib/execution-budget'

export const maxDuration = 300

const REPOSITORY_CONCURRENCY = 6
// Cooperative work cutoff; cleanup has separate bounded reserves before Vercel's limit.
const TIME_BUDGET_MS = 270_000
const FINALIZATION_DEADLINE_MS = 285_000
const DELIVERY_DEADLINE_MS = 295_000
const MAX_REPORTED_ERRORS = 20

export async function GET(request: NextRequest) {
  const startedAt = performance.now()
  const denied = requireCronAuth(request)
  if (denied) return denied

  const timings: StageTimings = {}
  const execution = createExecutionBudget(startedAt + TIME_BUDGET_MS, timings)
  const finalization = createExecutionBudget(startedAt + FINALIZATION_DEADLINE_MS, timings)
  const delivery = createExecutionBudget(startedAt + DELIVERY_DEADLINE_MS, timings)
  let progressTimer: ReturnType<typeof setInterval> | undefined
  try {
    const githubContext = createGithubFetchContext()
    githubContext.execution = execution
    const summary = {
      repositoriesPlanned: 0,
      repositoriesAttempted: 0,
      repositoriesSucceeded: 0,
      repositoriesFailed: 0,
      repositoriesDeferred: 0,
      releasesDiscovered: 0,
      releasesProcessed: 0,
      releasesInserted: 0,
      releasesFailed: 0,
      releasesSkipped: 0,
      releasesDeferred: 0,
      releasesCancelled: 0,
      aiOperationsFailed: 0,
    }
    const errors: IngestionError[] = []
    let errorCount = 0
    let additionalErrors = 0
    let fatal = false
    let internalFailure = false
    let runId: string | null = null
    let runFinalized = false
    let releaseCountersComplete = true
    const results: { tech: string; inserted: number; errors: number }[] = []
    const insertedReleaseIds: string[] = []
    const aiContext = createAiExecutionContext(Date.now() + TIME_BUDGET_MS, {}, execution)
    let webhooks: Awaited<ReturnType<typeof dispatchReleaseWebhooks>> = {
      webhooks: 0,
      sent: 0,
      errors: 0,
    }
    progressTimer = setInterval(
      () =>
        console.info('release cron progress', {
          runId,
          elapsedMs: Math.round(performance.now() - startedAt),
          remainingWorkMs: Math.round(execution.remainingMs()),
          timings,
          summary,
        }),
      30_000,
    )
    progressTimer.unref?.()

    function recordFailure(failure: IngestionError) {
      errorCount++
      if (errors.length < MAX_REPORTED_ERRORS) errors.push(failure)
      if (
        failure.category === 'DATABASE' ||
        failure.category === 'GITHUB_TOKEN_MISSING' ||
        failure.category === 'PROCESSING' ||
        failure.category === 'WEBHOOK'
      )
        internalFailure = true
      if (
        failure.scope === 'global' &&
        (failure.category === 'DATABASE' ||
          failure.category === 'GITHUB_AUTH' ||
          failure.category === 'GITHUB_TOKEN_MISSING')
      )
        fatal = true
    }

    function runFailure(failure: IngestionError) {
      recordFailure(failure)
      additionalErrors++
      console.error('release cron failed', failure)
    }

    try {
      const db = getDb(execution.signal)
      // Settle both reads even if one fails, before entering cleanup.
      const selection = await Promise.allSettled([
        execution.measure('repositorySelection', () => db.select().from(technologies)),
        execution.measure('repositorySelection', () =>
          db.selectDistinct({ techId: userTechPreferences.techId }).from(userTechPreferences),
        ),
      ])
      const [techSelection, followedSelection] = selection
      if (techSelection.status === 'rejected') throw techSelection.reason
      if (followedSelection.status === 'rejected') throw followedSelection.reason
      const allTechRows = techSelection.value
      const followedRows = followedSelection.value

      // Registry stacks always fetch; custom repositories require a follower.
      const followedIds = new Set(followedRows.map((row) => row.techId))
      const selectedTechs = allTechRows.filter(
        (tech) => tech.category !== 'custom' || followedIds.has(tech.id),
      )
      summary.repositoriesPlanned = selectedTechs.length
      const allTechs = await orderCronRepositories(selectedTechs, execution)
      execution.check(1000)
      runId = await createReleaseFetchRun('cron', execution)

      if (githubContext.authFailure) {
        const error = githubContext.authFailure
        runFailure({
          category: error.category,
          scope: 'global',
          repository: null,
          message: error.message,
        })
      }

      let nextIndex = 0
      let deadlineReported = false
      const insertedByRepository: string[][] = []
      // Refill idle slots without increasing repository or AI concurrency. A fatal
      // result stops admission; all already-started processors settle before cleanup.
      async function worker() {
        while (nextIndex < allTechs.length && !fatal) {
          if (execution.remainingMs() < 1000 || execution.signal.aborted) {
            if (!deadlineReported) {
              deadlineReported = true
              runFailure({
                category: 'TIME_BUDGET',
                scope: 'global',
                repository: null,
                message: 'Cron time budget reached; remaining repositories deferred',
              })
            }
            return
          }
          const index = nextIndex++
          const tech = allTechs[index]
          summary.repositoriesAttempted++
          try {
            const value = await processTechReleases(
              tech,
              githubContext,
              aiContext,
              execution,
              () => {
                fatal = true
              },
            )
            // Persist admission order, rather than completion order, for the next run.
            results[index] = value.detail
            insertedByRepository[index] = value.insertedReleaseIds
            summary.repositoriesSucceeded += value.detail.errors === 0 ? 1 : 0
            summary.repositoriesFailed += value.detail.errors > 0 ? 1 : 0
            summary.releasesDiscovered += value.releasesDiscovered
            summary.releasesProcessed += value.releasesProcessed
            summary.releasesInserted += value.detail.inserted
            summary.releasesFailed += value.releasesFailed
            summary.releasesSkipped += value.releasesSkipped
            summary.releasesDeferred += value.releasesDeferred
            summary.releasesCancelled += value.releasesCancelled
            releaseCountersComplete &&= value.releaseCountersComplete
            for (const failure of value.failures) recordFailure(failure)
          } catch {
            // A rejected processor may have committed work before throwing. Report only
            // confirmed counts, and require DB inspection rather than estimating its inserts.
            releaseCountersComplete = false
            const failure: IngestionError = {
              category: 'PROCESSING',
              scope: 'repository',
              repository: tech.name,
              message: 'Repository processor failed unexpectedly',
            }
            results[index] = { tech: tech.name, inserted: 0, errors: 1 }
            summary.repositoriesFailed++
            recordFailure(failure)
            console.error('release processing failed', failure)
          }
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(REPOSITORY_CONCURRENCY, allTechs.length) }, () => worker()),
      )
      insertedReleaseIds.push(...insertedByRepository.flat())
    } catch (cause) {
      const cancelled = cause instanceof ExecutionDeadlineError || execution.signal.aborted
      runFailure({
        category: cancelled ? 'TIME_BUDGET' : 'DATABASE',
        scope: 'global',
        repository: null,
        message: cancelled
          ? 'Cron setup cancelled at execution deadline'
          : 'Cron database setup failed',
      })
    }

    summary.repositoriesDeferred = summary.repositoriesPlanned - summary.repositoriesAttempted
    summary.aiOperationsFailed = aiContext.stats.failed

    function outcome(): 'success' | 'partial_success' | 'failed' {
      if (fatal) return 'failed'
      if (errorCount === 0) return 'success'
      return summary.repositoriesSucceeded > 0 || summary.releasesProcessed > 0
        ? 'partial_success'
        : 'failed'
    }

    if (runId) {
      try {
        const status = outcome()
        await finishReleaseFetchRun(
          {
            runId,
            details: results,
            additionalErrors,
            status:
              status === 'success'
                ? 'completed'
                : status === 'partial_success'
                  ? 'completed_with_errors'
                  : 'failed',
          },
          finalization,
        )
        runFinalized = true
      } catch {
        runFailure({
          category: 'DATABASE',
          scope: 'global',
          repository: null,
          message: 'Cron run finalization failed',
        })
      }
    }

    // Preserve finalization before delivery so a slow webhook cannot leave ingestion running.
    // Delivery counts stay separate from repository ingestion outcomes.
    if (runId) {
      try {
        webhooks = await dispatchReleaseWebhooks(insertedReleaseIds, delivery)
        if (webhooks.deadlineReached)
          runFailure({
            category: 'WEBHOOK',
            scope: 'global',
            repository: null,
            message: 'Webhook cleanup deadline reached; delivery may be incomplete',
          })
      } catch {
        runFailure({
          category: 'WEBHOOK',
          scope: 'global',
          repository: null,
          message: 'Release webhook dispatch failed',
        })
      }
    }

    const status = outcome()
    const response = {
      status,
      success: status === 'success',
      runId,
      runFinalized,
      releaseCountersComplete,
      summary,
      errorCount,
      errors,
      errorsTruncated: errorCount > errors.length,
      webhooks,
      ai: aiContext.stats,
      results,
      elapsedMs: Math.round(performance.now() - startedAt),
      timings,
    }
    console.info('release cron completed', {
      status,
      runId,
      runFinalized,
      releaseCountersComplete,
      summary,
      errorCount,
      errors,
      webhooks,
      ai: aiContext.stats,
      elapsedMs: response.elapsedMs,
      timings,
    })
    return NextResponse.json(response, {
      status: status === 'failed' ? (internalFailure ? 500 : 502) : 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } finally {
    if (progressTimer) clearInterval(progressTimer)
    execution.close()
    finalization.close()
    delivery.close()
  }
}
