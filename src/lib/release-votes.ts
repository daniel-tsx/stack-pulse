import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { releaseUpdates, releaseVotes } from '@/db/schema'
import type { ReleaseVoteState, VoteValue } from './release-vote-types'

function voteStateQuery(releaseId: string, userId: string | null) {
  return getDb()
    .select({
      score: sql<number>`coalesce(sum(${releaseVotes.value}), 0)::int`,
      upvotes: sql<number>`count(*) filter (where ${releaseVotes.value} = 1)::int`,
      downvotes: sql<number>`count(*) filter (where ${releaseVotes.value} = -1)::int`,
      myVote:
        userId === null
          ? sql<null>`null::int`
          : sql<VoteValue>`coalesce(max(case when ${releaseVotes.userId} = ${userId} then ${releaseVotes.value} end), 0)::int`,
    })
    .from(releaseUpdates)
    .leftJoin(releaseVotes, eq(releaseVotes.releaseId, releaseUpdates.id))
    .where(eq(releaseUpdates.id, releaseId))
    .groupBy(releaseUpdates.id)
}

export async function getReleaseVoteState(
  releaseId: string,
  userId: string | null,
): Promise<ReleaseVoteState | null> {
  const [state] = await voteStateQuery(releaseId, userId)
  return state ?? null
}

export async function setReleaseVote(
  releaseId: string,
  userId: string,
  value: VoteValue,
): Promise<ReleaseVoteState | null> {
  const db = getDb()
  // One HTTP batch is a PostgreSQL transaction. The subsequent SELECT gets a new
  // READ COMMITTED snapshot and sees our write, unlike a sibling CTE aggregate.
  const mutation =
    value === 0
      ? db
          .delete(releaseVotes)
          .where(and(eq(releaseVotes.userId, userId), eq(releaseVotes.releaseId, releaseId)))
      : db.execute(sql`
        insert into ${releaseVotes} (user_id, release_id, value)
        select ${userId}, ${releaseUpdates.id}, ${value}::smallint
        from ${releaseUpdates} where ${releaseUpdates.id} = ${releaseId}::uuid
        on conflict (user_id, release_id) do update
        set value = excluded.value, updated_at = now()
      `)
  const [, states] = await db.batch([mutation, voteStateQuery(releaseId, userId)])
  return states[0] ?? null
}
