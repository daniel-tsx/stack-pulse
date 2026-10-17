import { z } from 'zod'

export const releaseIdSchema = z.uuid()
export const voteRequestSchema = z.strictObject({
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
})
export type VoteValue = z.infer<typeof voteRequestSchema>['value']
export type ReleaseVoteState = {
  score: number
  upvotes: number
  downvotes: number
  // null means anonymous; 0 means signed in without an active vote.
  myVote: VoteValue | null
}
