import { desc, eq, sql } from 'drizzle-orm'
import { cacheLife } from 'next/cache'

import { getDb } from '@/db'
import { releaseUpdates, technologies } from '@/db/schema'

export const PUBLIC_STACK_RELEASE_LIMIT = 20

export type PublicStackRelease = {
  id: string
  version: string
  title: string | null
  summary: string | null
  newFeatures: string[] | null
  breakingChanges: string[] | null
  securityNotes: string[] | null
  deprecations: string[] | null
  migrationSteps: string[] | null
  impactSummary: string | null
  recommendedAction: string | null
  releaseSignals: string[]
  importanceLevel: string | null
  publishedAt: Date | null
  rawReleaseUrl: string | null
  isPrerelease: boolean
}

export type PublicStackPageData = {
  tech: {
    id: string
    name: string
    slug: string
    description: string | null
    category: string | null
    githubRepoUrl: string
  }
  releases: PublicStackRelease[]
  stats: {
    releases: number
    breaking: number
    security: number
    deprecations: number
    migrations: number
  }
}

export type PublicStackIndexItem = {
  id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  githubRepoUrl: string
  releases: number
  breaking: number
  security: number
  deprecations: number
  migrations: number
  latestPublishedAt: Date | null
}

export async function getPublicStackSlugs() {
  'use cache'
  cacheLife({ stale: 3600, revalidate: 3600, expire: 86400 })

  return getDb()
    .select({
      slug: technologies.slug,
      name: technologies.name,
    })
    .from(technologies)
    .orderBy(technologies.slug)
}

export async function getPublicStackIndex(): Promise<PublicStackIndexItem[]> {
  'use cache'
  cacheLife({ stale: 3600, revalidate: 3600, expire: 86400 })

  const rows = await getDb()
    .select({
      id: technologies.id,
      name: technologies.name,
      slug: technologies.slug,
      description: technologies.description,
      category: technologies.category,
      githubRepoUrl: technologies.githubRepoUrl,
      releases: sql<number>`count(${releaseUpdates.id})::int`,
      breaking: sql<number>`(count(${releaseUpdates.id}) filter (where ${releaseUpdates.releaseSignals} ? 'breaking' or coalesce(jsonb_array_length(${releaseUpdates.breakingChanges}), 0) > 0))::int`,
      security: sql<number>`(count(${releaseUpdates.id}) filter (where ${releaseUpdates.releaseSignals} ? 'security' or coalesce(jsonb_array_length(${releaseUpdates.securityNotes}), 0) > 0))::int`,
      deprecations: sql<number>`(count(${releaseUpdates.id}) filter (where ${releaseUpdates.releaseSignals} ? 'deprecation' or coalesce(jsonb_array_length(${releaseUpdates.deprecations}), 0) > 0))::int`,
      migrations: sql<number>`(count(${releaseUpdates.id}) filter (where ${releaseUpdates.releaseSignals} ? 'migration' or coalesce(jsonb_array_length(${releaseUpdates.migrationSteps}), 0) > 0))::int`,
      latestPublishedAt: sql<Date | null>`max(${releaseUpdates.publishedAt})`,
    })
    .from(technologies)
    .leftJoin(releaseUpdates, eq(releaseUpdates.techId, technologies.id))
    .groupBy(technologies.id)
    .orderBy(technologies.name)

  return rows.map((row) => ({
    ...row,
    latestPublishedAt: normalizeDate(row.latestPublishedAt),
  }))
}

export async function getPublicStackPage(slug: string): Promise<PublicStackPageData | null> {
  'use cache'
  cacheLife({ stale: 3600, revalidate: 3600, expire: 86400 })

  const [tech] = await getDb()
    .select({
      id: technologies.id,
      name: technologies.name,
      slug: technologies.slug,
      description: technologies.description,
      category: technologies.category,
      githubRepoUrl: technologies.githubRepoUrl,
    })
    .from(technologies)
    .where(eq(technologies.slug, slug))
    .limit(1)

  if (!tech) return null

  const rows = await getDb()
    .select({
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
    })
    .from(releaseUpdates)
    .where(eq(releaseUpdates.techId, tech.id))
    .orderBy(desc(releaseUpdates.publishedAt), desc(releaseUpdates.id))
    .limit(PUBLIC_STACK_RELEASE_LIMIT)

  const releases = rows.map((row) => ({
    ...row,
    releaseSignals: deriveReleaseSignals(row),
  }))

  return {
    tech,
    releases,
    stats: {
      releases: releases.length,
      breaking: releases.filter((release) => release.releaseSignals.includes('breaking')).length,
      security: releases.filter((release) => release.releaseSignals.includes('security')).length,
      deprecations: releases.filter((release) => release.releaseSignals.includes('deprecation'))
        .length,
      migrations: releases.filter((release) => release.releaseSignals.includes('migration')).length,
    },
  }
}

function deriveReleaseSignals(row: {
  releaseSignals: string[] | null
  breakingChanges: string[] | null
  securityNotes: string[] | null
  deprecations: string[] | null
  migrationSteps: string[] | null
  newFeatures: string[] | null
}) {
  const signals = new Set(row.releaseSignals ?? [])

  if (row.breakingChanges?.length) signals.add('breaking')
  if (row.securityNotes?.length) signals.add('security')
  if (row.deprecations?.length) signals.add('deprecation')
  if (row.migrationSteps?.length) signals.add('migration')
  if (row.newFeatures?.length) signals.add('feature')

  return Array.from(signals)
}

function normalizeDate(value: Date | string | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
