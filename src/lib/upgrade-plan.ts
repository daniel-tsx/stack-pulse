import { desc, eq } from 'drizzle-orm'
import { cacheLife } from 'next/cache'

import { getDb } from '@/db'
import { releaseUpdates, technologies } from '@/db/schema'
import { compareLooseVersion, parseLooseVersion } from '@/lib/version'

const MAX_STORED_RELEASES = 100

export type UpgradePlanItem = {
  version: string
  item: string
}

export type UpgradePlanRelease = {
  id: string
  version: string
  title: string | null
  summary: string | null
  importanceLevel: string | null
  isPrerelease: boolean
  rawReleaseUrl: string | null
  publishedAt: Date | null
}

export type UpgradePlan = {
  tech: {
    id: string
    name: string
    slug: string
    description: string | null
    githubRepoUrl: string
  }
  latest: UpgradePlanRelease | null
  fromVersion: string | null
  fromIsValid: boolean
  releasesInRange: UpgradePlanRelease[]
  breaking: UpgradePlanItem[]
  security: UpgradePlanItem[]
  deprecations: UpgradePlanItem[]
  migrationSteps: UpgradePlanItem[]
  storedCount: number
  oldestStored: UpgradePlanRelease | null
}

export async function getUpgradePlan(
  slug: string,
  fromVersion: string | null,
): Promise<UpgradePlan | null> {
  'use cache'
  cacheLife({ stale: 3600, revalidate: 3600, expire: 86400 })

  const db = getDb()

  const [tech] = await db
    .select({
      id: technologies.id,
      name: technologies.name,
      slug: technologies.slug,
      description: technologies.description,
      githubRepoUrl: technologies.githubRepoUrl,
    })
    .from(technologies)
    .where(eq(technologies.slug, slug))
    .limit(1)

  if (!tech) return null

  const rows = await db
    .select({
      id: releaseUpdates.id,
      version: releaseUpdates.version,
      title: releaseUpdates.title,
      summary: releaseUpdates.summary,
      breakingChanges: releaseUpdates.breakingChanges,
      securityNotes: releaseUpdates.securityNotes,
      deprecations: releaseUpdates.deprecations,
      migrationSteps: releaseUpdates.migrationSteps,
      importanceLevel: releaseUpdates.importanceLevel,
      isPrerelease: releaseUpdates.isPrerelease,
      rawReleaseUrl: releaseUpdates.rawReleaseUrl,
      publishedAt: releaseUpdates.publishedAt,
    })
    .from(releaseUpdates)
    .where(eq(releaseUpdates.techId, tech.id))
    .orderBy(desc(releaseUpdates.publishedAt), desc(releaseUpdates.id))
    .limit(MAX_STORED_RELEASES)

  const toRelease = (row: (typeof rows)[number]): UpgradePlanRelease => ({
    id: row.id,
    version: row.version,
    title: row.title,
    summary: row.summary,
    importanceLevel: row.importanceLevel,
    isPrerelease: row.isPrerelease,
    rawReleaseUrl: row.rawReleaseUrl,
    publishedAt: row.publishedAt,
  })

  const latest = rows.find((row) => !row.isPrerelease) ?? rows[0] ?? null
  const trimmedFrom = fromVersion?.trim() || null
  const from = trimmedFrom ? parseLooseVersion(trimmedFrom) : null

  const base: UpgradePlan = {
    tech,
    latest: latest ? toRelease(latest) : null,
    fromVersion: trimmedFrom,
    fromIsValid: trimmedFrom !== null && from !== null,
    releasesInRange: [],
    breaking: [],
    security: [],
    deprecations: [],
    migrationSteps: [],
    storedCount: rows.length,
    oldestStored: rows.length > 0 ? toRelease(rows[rows.length - 1]) : null,
  }

  if (!from) return base

  // Newest → oldest rows strictly above the user's current version.
  const inRange = rows.filter((row) => {
    const version = parseLooseVersion(row.version)
    return version !== null && compareLooseVersion(version, from) > 0
  })

  base.releasesInRange = inRange.map(toRelease)

  // Checklists read oldest → newest so steps apply in upgrade order.
  for (const row of [...inRange].reverse()) {
    for (const item of row.breakingChanges ?? []) {
      base.breaking.push({ version: row.version, item })
    }
    for (const item of row.securityNotes ?? []) {
      base.security.push({ version: row.version, item })
    }
    for (const item of row.deprecations ?? []) {
      base.deprecations.push({ version: row.version, item })
    }
    for (const item of row.migrationSteps ?? []) {
      base.migrationSteps.push({ version: row.version, item })
    }
  }

  return base
}
