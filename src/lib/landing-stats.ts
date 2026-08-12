import { sql } from 'drizzle-orm'
import { cacheLife } from 'next/cache'

import { getDb } from '@/db'
import { releaseUpdates, technologies } from '@/db/schema'

export type LandingStats = {
  releases: number
  breaking: number
  stacks: number
}

async function getCachedLandingStats(): Promise<LandingStats> {
  'use cache'
  cacheLife({ stale: 600, revalidate: 600, expire: 3600 })

  const [row] = await getDb()
    .select({
      releases: sql<number>`count(*)::int`,
      breaking: sql<number>`(count(*) filter (where ${releaseUpdates.releaseSignals} ? 'breaking' or coalesce(jsonb_array_length(${releaseUpdates.breakingChanges}), 0) > 0))::int`,
      stacks: sql<number>`(select count(*) from ${technologies} where ${technologies.category} is distinct from 'custom')::int`,
    })
    .from(releaseUpdates)

  return row ?? { releases: 0, breaking: 0, stacks: 0 }
}

export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    return await getCachedLandingStats()
  } catch (err) {
    console.error('getLandingStats failed:', err)
    return null
  }
}
