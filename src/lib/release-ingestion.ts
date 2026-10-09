import { and, desc, eq } from 'drizzle-orm'

import { getDb } from '@/db'
import {
  releaseFetchRuns,
  releaseUpdates,
  technologies,
  type ReleaseFetchRunDetail,
} from '@/db/schema'
import { summarizeRelease } from '@/lib/ai'
import {
  fetchLatestReleases,
  GithubApiError,
  type GithubFetchContext,
  type GithubRelease,
} from '@/lib/github'

export const RELEASES_PER_TECH = 5

type Tech = typeof technologies.$inferSelect

export function isPublishable(release: GithubRelease): boolean {
  return !release.draft && !!release.published_at && !!release.tag_name
}

export type ProcessTechResult = {
  detail: ReleaseFetchRunDetail
  insertedReleaseIds: string[]
  releasesDiscovered: number
  releasesProcessed: number
  releasesFailed: number
  failures: IngestionError[]
}

export type IngestionError = {
  category:
    GithubApiError['category'] | 'DATABASE' | 'AI' | 'PROCESSING' | 'TIME_BUDGET' | 'WEBHOOK'
  scope: 'global' | 'repository' | 'release'
  repository: string | null
  message: string
  upstreamStatus?: number
}

function databaseErrorScope(error: unknown): 'global' | 'release' {
  // Drizzle wraps driver errors in cause. Data/constraint errors are release-specific;
  // unknown database failures are conservatively fatal, including connection failures.
  const dbError = error as { code?: string; cause?: { code?: string } } | null
  const code = dbError?.cause?.code ?? dbError?.code
  return typeof code === 'string' && /^(22|23)/.test(code) ? 'release' : 'global'
}

export async function processTechReleases(
  tech: Tech,
  githubContext?: GithubFetchContext,
): Promise<ProcessTechResult> {
  let inserted = 0
  let releasesProcessed = 0
  let releasesFailed = 0
  const failures: IngestionError[] = []
  const insertedReleaseIds: string[] = []

  function recordFailure(failure: IngestionError) {
    failures.push(failure)
    console.error('release processing failed', failure)
  }

  function result(releasesDiscovered: number): ProcessTechResult {
    return {
      detail: { tech: tech.name, inserted, errors: failures.length },
      insertedReleaseIds,
      releasesDiscovered,
      releasesProcessed,
      releasesFailed,
      failures,
    }
  }

  let releases: GithubRelease[]
  try {
    releases = await fetchLatestReleases(tech.githubRepoUrl, RELEASES_PER_TECH, githubContext)
  } catch (err) {
    const error = err instanceof GithubApiError ? err : new GithubApiError('GITHUB_UPSTREAM')
    recordFailure({
      category: error.category,
      scope: error.scope,
      repository: tech.name,
      message: error.message,
      upstreamStatus: error.upstreamStatus,
    })
    return result(0)
  }

  for (const release of releases) {
    let stage: 'PROCESSING' | 'DATABASE' | 'AI' = 'PROCESSING'
    try {
      // Keep validation inside the result boundary so a later bad entry cannot
      // discard earlier committed counters or notification IDs.
      if (
        !release ||
        typeof release !== 'object' ||
        typeof release.tag_name !== 'string' ||
        typeof release.draft !== 'boolean' ||
        (release.published_at !== null && typeof release.published_at !== 'string')
      )
        throw new Error('Invalid GitHub release entry')
      if (!isPublishable(release)) continue

      stage = 'DATABASE'
      const db = getDb()
      const existing = await db
        .select({ id: releaseUpdates.id })
        .from(releaseUpdates)
        .where(
          and(eq(releaseUpdates.techId, tech.id), eq(releaseUpdates.version, release.tag_name)),
        )
        .limit(1)

      if (existing.length > 0) {
        releasesProcessed++
        continue
      }

      const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat'
      stage = 'AI'
      const summary = await summarizeRelease({
        repoName: tech.name,
        version: release.tag_name,
        title: release.name,
        body: release.body,
        url: release.html_url,
        prerelease: release.prerelease,
      })

      stage = 'DATABASE'
      const result = await db
        .insert(releaseUpdates)
        .values({
          techId: tech.id,
          version: release.tag_name,
          title: release.name || release.tag_name,
          summary: summary.summary,
          newFeatures: summary.new_features,
          breakingChanges: summary.breaking_changes,
          securityNotes: summary.security_notes,
          deprecations: summary.deprecations,
          migrationSteps: summary.migration_steps,
          impactSummary: summary.impact_summary ?? null,
          recommendedAction: summary.recommended_action ?? null,
          releaseSignals: summary.release_signals,
          codeSnippet: summary.code_snippet ?? null,
          importanceLevel: summary.importance_level,
          summaryModel: model,
          summarizedAt: new Date(),
          rawReleaseBody: release.body,
          isPrerelease: release.prerelease,
          rawReleaseUrl: release.html_url,
          publishedAt: new Date(release.published_at!),
        })
        .onConflictDoNothing({
          target: [releaseUpdates.techId, releaseUpdates.version],
        })
        .returning({ id: releaseUpdates.id })

      if (result.length > 0) {
        inserted++
        insertedReleaseIds.push(result[0].id)
      }
      releasesProcessed++
    } catch (err) {
      releasesFailed++
      const upstreamStatus =
        stage === 'AI' && typeof (err as { status?: unknown } | null)?.status === 'number'
          ? (err as { status: number }).status
          : undefined
      recordFailure({
        category: stage,
        scope: stage === 'DATABASE' ? databaseErrorScope(err) : 'release',
        repository: tech.name,
        message:
          stage === 'DATABASE'
            ? 'Release database operation failed'
            : stage === 'AI'
              ? 'Release AI summarization failed'
              : 'Release processing failed unexpectedly',
        upstreamStatus,
      })
    }
  }

  return result(releases.length)
}

export type FetchRunRow = {
  id: string
  trigger: string
  status: string
  technologiesScanned: number
  releasesInserted: number
  errors: number
  startedAt: Date
  finishedAt: Date | null
}

export async function getRecentFetchRuns(limit = 20): Promise<FetchRunRow[]> {
  return getDb()
    .select({
      id: releaseFetchRuns.id,
      trigger: releaseFetchRuns.trigger,
      status: releaseFetchRuns.status,
      technologiesScanned: releaseFetchRuns.technologiesScanned,
      releasesInserted: releaseFetchRuns.releasesInserted,
      errors: releaseFetchRuns.errors,
      startedAt: releaseFetchRuns.startedAt,
      finishedAt: releaseFetchRuns.finishedAt,
    })
    .from(releaseFetchRuns)
    .orderBy(desc(releaseFetchRuns.startedAt))
    .limit(limit)
}

export async function createReleaseFetchRun(trigger: string) {
  const [run] = await getDb()
    .insert(releaseFetchRuns)
    .values({ trigger })
    .returning({ id: releaseFetchRuns.id })

  return run.id
}

export async function finishReleaseFetchRun({
  runId,
  details,
  status,
  additionalErrors = 0,
}: {
  runId: string
  details: ReleaseFetchRunDetail[]
  status?: 'completed' | 'completed_with_errors' | 'failed'
  additionalErrors?: number
}) {
  const releasesInserted = details.reduce((sum, detail) => sum + detail.inserted, 0)
  const errors = details.reduce((sum, detail) => sum + detail.errors, additionalErrors)

  await getDb()
    .update(releaseFetchRuns)
    .set({
      status: status ?? (errors > 0 ? 'completed_with_errors' : 'completed'),
      technologiesScanned: details.length,
      releasesInserted,
      errors,
      details,
      finishedAt: new Date(),
    })
    .where(eq(releaseFetchRuns.id, runId))

  return { releasesInserted, errors }
}
