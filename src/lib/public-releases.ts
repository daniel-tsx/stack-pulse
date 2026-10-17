import { and, eq } from 'drizzle-orm'
import { cacheLife } from 'next/cache'

import { getDb } from '@/db'
import { releaseUpdates, technologies } from '@/db/schema'
import { deriveReleaseSignals, type PublicStackRelease } from './public-stacks'
import { releaseIdSchema } from './release-vote-types'

export type PublicRelease = {
  tech: { name: string; slug: string }
  release: PublicStackRelease & { codeSnippet: string | null }
}

function validReleasePath(slug: string, releaseId: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && releaseIdSchema.safeParse(releaseId).success
}

// A small uncached pre-stream check for HTML requests. The content query below
// remains cached; proxy does not fetch summaries or personalize the response.
export async function publicReleaseExists(slug: string, releaseId: string): Promise<boolean> {
  if (!validReleasePath(slug, releaseId)) return false
  const [row] = await getDb()
    .select({ id: releaseUpdates.id })
    .from(releaseUpdates)
    .innerJoin(technologies, eq(releaseUpdates.techId, technologies.id))
    .where(and(eq(releaseUpdates.id, releaseId), eq(technologies.slug, slug)))
    .limit(1)
  return Boolean(row)
}

export async function getPublicRelease(
  slug: string,
  releaseId: string,
): Promise<PublicRelease | null> {
  'use cache'
  cacheLife({ stale: 3600, revalidate: 3600, expire: 86400 })

  if (!validReleasePath(slug, releaseId)) {
    return null
  }

  const [row] = await getDb()
    .select({
      tech: { name: technologies.name, slug: technologies.slug },
      release: {
        id: releaseUpdates.id,
        version: releaseUpdates.version,
        title: releaseUpdates.title,
        summary: releaseUpdates.summary,
        newFeatures: releaseUpdates.newFeatures,
        breakingChanges: releaseUpdates.breakingChanges,
        securityNotes: releaseUpdates.securityNotes,
        deprecations: releaseUpdates.deprecations,
        migrationSteps: releaseUpdates.migrationSteps,
        impactSummary: releaseUpdates.impactSummary,
        recommendedAction: releaseUpdates.recommendedAction,
        releaseSignals: releaseUpdates.releaseSignals,
        importanceLevel: releaseUpdates.importanceLevel,
        publishedAt: releaseUpdates.publishedAt,
        rawReleaseUrl: releaseUpdates.rawReleaseUrl,
        isPrerelease: releaseUpdates.isPrerelease,
        codeSnippet: releaseUpdates.codeSnippet,
      },
    })
    .from(releaseUpdates)
    .innerJoin(technologies, eq(releaseUpdates.techId, technologies.id))
    .where(and(eq(releaseUpdates.id, releaseId), eq(technologies.slug, slug)))
    .limit(1)

  if (!row) return null
  return {
    tech: row.tech,
    release: { ...row.release, releaseSignals: deriveReleaseSignals(row.release) },
  }
}
