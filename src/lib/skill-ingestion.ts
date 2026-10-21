import { randomUUID } from 'node:crypto'
import { approvedSkill } from '@/lib/skill-catalog'
import { analyzeSkillUpdate, SkillAnalysisFailure } from '@/lib/skill-analysis'
import { createAiExecutionContext, AiProviderError } from '@/lib/ai-resilience'
import { createExecutionBudget, ExecutionDeadlineError } from '@/lib/execution-budget'
import { createGithubFetchContext, GithubApiError } from '@/lib/github'
import { createSkillGithub, SkillEvidenceError } from '@/lib/skill-github'
import { createSkillStore } from '@/lib/skill-store'
import type { SkillTelemetry } from '@/lib/skill-types'

function retainRuns(previous: SkillTelemetry | null, current: SkillTelemetry): SkillTelemetry {
  const run = { ...current }
  delete run.runs
  return { ...current, runs: [...(previous?.runs ?? (previous ? [previous] : [])), run].slice(-3) }
}

export function skillFailureCategory(error: unknown) {
  if (error instanceof GithubApiError || error instanceof AiProviderError) return error.category
  if (error instanceof SkillEvidenceError) return 'INCOMPLETE_EVIDENCE'
  if (error instanceof ExecutionDeadlineError) return 'EXECUTION_DEADLINE'
  return 'SKILL_PROCESSING_FAILED'
}

export async function ingestSkillUpdates(dryRun = false) {
  const started = performance.now()
  const execution = createExecutionBudget(started + 270000)
  const context = createGithubFetchContext()
  context.execution = execution
  const github = createSkillGithub(context)
  const ai = createAiExecutionContext(Date.now() + 270000, {}, execution)
  const store = createSkillStore(execution.signal)
  const counters = {
    checked: 0,
    baselines: 0,
    detected: 0,
    unchanged: 0,
    analyzed: 0,
    failed: 0,
    skipped: 0,
    deferred: 0,
  }
  let analysisJobs = 0
  try {
    if (context.authFailure) throw context.authFailure
    const skills = await store.list()
    for (const candidate of skills) {
      if (execution.remainingMs() < 12000) {
        counters.deferred++
        continue
      }
      const source = approvedSkill(candidate)
      const token = randomUUID()
      const skill = dryRun ? candidate : await store.acquire(candidate.id, token)
      if (!skill) {
        counters.skipped++
        continue
      }
      try {
        if (!dryRun) await store.recoverInterrupted(skill.id, token)
        try {
          // Resolve mutable source state only after acquisition; another skill's
          // earlier observation cannot supply this lease's repository HEAD.
          const next = await github.observe(source)
          counters.checked++
          if (!skill.baselineRevision && next.tree && next.hasSkillFile) counters.baselines++
          else if (skill.baselineRevision && skill.observedTree !== next.tree) {
            if (dryRun) counters.detected++
          } else if (skill.baselineRevision) counters.unchanged++
          if (!dryRun) counters.detected += await store.observe(skill, token, next)
        } catch (error) {
          counters.failed++
          if (!dryRun) await store.checkFailed(skill.id, token, skillFailureCategory(error))
          console.warn('skill check failed', {
            slug: source.slug,
            category: skillFailureCategory(error),
          })
        }
        // Discovery failure does not prevent recovery of already persisted work.
        if (!dryRun && analysisJobs < 4 && execution.remainingMs() > 30000) {
          const [pending] = await store.pending(skill.id)
          if (pending) {
            analysisJobs++
            await store.saveUpdate(skill.id, token, pending.id, {
              analysisStatus: 'analyzing',
              analysisAttempts: pending.analysisAttempts + 1,
              analysisError: null,
            })
            try {
              const evidence =
                pending.evidence ??
                (await github.evidence(source, pending.previousTree, pending.newTree))
              await store.saveUpdate(skill.id, token, pending.id, { evidence })
              const result = await analyzeSkillUpdate(
                {
                  repository: source.repository,
                  directory: source.directory,
                  previousRevision: pending.previousRevision,
                  newRevision: pending.newRevision,
                  evidence,
                },
                ai,
              )
              await store.saveUpdate(skill.id, token, pending.id, {
                ...result,
                telemetry: retainRuns(pending.telemetry, result.telemetry),
                analysisStatus: 'complete',
                analyzedAt: new Date(),
                analysisError: null,
              })
              counters.analyzed++
            } catch (error) {
              counters.failed++
              await store.saveUpdate(skill.id, token, pending.id, {
                analysisStatus: 'failed',
                analysisError: skillFailureCategory(error),
                ...(error instanceof SkillAnalysisFailure && error.telemetry
                  ? { telemetry: retainRuns(pending.telemetry, error.telemetry) }
                  : {}),
              })
              console.warn('skill analysis failed', {
                slug: source.slug,
                category: skillFailureCategory(error),
              })
            }
          }
        } else if (!dryRun) counters.deferred++
      } finally {
        // Use a fresh cleanup budget: a cancelled write may have committed remotely.
        if (!dryRun) await createSkillStore(AbortSignal.timeout(5000)).release(skill.id, token)
      }
      if (context.authFailure) break
    }
    return { dryRun, ...counters, ai: ai.stats, elapsedMs: Math.round(performance.now() - started) }
  } finally {
    execution.close()
  }
}
