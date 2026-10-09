import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/db'
import { technologies, userTechPreferences } from '@/db/schema'
import {
  createReleaseFetchRun,
  finishReleaseFetchRun,
  processTechReleases,
  type IngestionError,
} from '@/lib/release-ingestion'
import { requireCronAuth } from '@/lib/cron-auth'
import { createGithubFetchContext } from '@/lib/github'
import { dispatchReleaseWebhooks } from '@/lib/webhooks'

export const maxDuration = 300

const CHUNK_SIZE = 6
// Stop starting new chunks near the duration limit. Discovery remains limited to five releases.
const TIME_BUDGET_MS = 270_000
const MAX_REPORTED_ERRORS = 20

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const githubContext = createGithubFetchContext()
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
  const startedAt = Date.now()
  let webhooks = { webhooks: 0, sent: 0, errors: 0 }

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
    const db = getDb()
    const [allTechRows, followedRows] = await Promise.all([
      db.select().from(technologies),
      db.selectDistinct({ techId: userTechPreferences.techId }).from(userTechPreferences),
    ])

    // Registry stacks always fetch; custom repositories require a follower.
    const followedIds = new Set(followedRows.map((row) => row.techId))
    const allTechs = allTechRows.filter(
      (tech) => tech.category !== 'custom' || followedIds.has(tech.id),
    )
    summary.repositoriesPlanned = allTechs.length
    runId = await createReleaseFetchRun('cron')

    if (githubContext.authFailure) {
      const error = githubContext.authFailure
      runFailure({
        category: error.category,
        scope: 'global',
        repository: null,
        message: error.message,
      })
    }

    // A confirmed 401 blocks both new chunks and retries in already-running fetchers.
    // Already-running requests settle normally; successful inserts remain committed.
    for (let i = 0; i < allTechs.length && !fatal; i += CHUNK_SIZE) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        runFailure({
          category: 'TIME_BUDGET',
          scope: 'global',
          repository: null,
          message: 'Cron time budget reached; remaining repositories deferred',
        })
        break
      }

      const chunk = allTechs.slice(i, i + CHUNK_SIZE)
      summary.repositoriesAttempted += chunk.length
      const settled = await Promise.allSettled(
        chunk.map((tech) => processTechReleases(tech, githubContext)),
      )
      for (const [index, result] of settled.entries()) {
        if (result.status === 'fulfilled') {
          const value = result.value
          results.push(value.detail)
          insertedReleaseIds.push(...value.insertedReleaseIds)
          summary.repositoriesSucceeded += value.detail.errors === 0 ? 1 : 0
          summary.repositoriesFailed += value.detail.errors > 0 ? 1 : 0
          summary.releasesDiscovered += value.releasesDiscovered
          summary.releasesProcessed += value.releasesProcessed
          summary.releasesInserted += value.detail.inserted
          summary.releasesFailed += value.releasesFailed
          for (const failure of value.failures) recordFailure(failure)
        } else {
          // A rejected processor may have committed work before throwing. Report only
          // confirmed counts, and require DB inspection rather than estimating its inserts.
          releaseCountersComplete = false
          const failure: IngestionError = {
            category: 'PROCESSING',
            scope: 'repository',
            repository: chunk[index].name,
            message: 'Repository processor failed unexpectedly',
          }
          results.push({ tech: chunk[index].name, inserted: 0, errors: 1 })
          summary.repositoriesFailed++
          recordFailure(failure)
          console.error('release processing failed', failure)
        }
      }
    }
  } catch {
    runFailure({
      category: 'DATABASE',
      scope: 'global',
      repository: null,
      message: 'Cron database setup failed',
    })
  }

  summary.repositoriesDeferred = summary.repositoriesPlanned - summary.repositoriesAttempted

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
      await finishReleaseFetchRun({
        runId,
        details: results,
        additionalErrors,
        status:
          status === 'success'
            ? 'completed'
            : status === 'partial_success'
              ? 'completed_with_errors'
              : 'failed',
      })
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
      webhooks = await dispatchReleaseWebhooks(insertedReleaseIds)
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
    results,
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
  })
  return NextResponse.json(response, {
    status: status === 'failed' ? (internalFailure ? 500 : 502) : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
