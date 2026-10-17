'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown01Icon, ArrowUp01Icon } from 'hugeicons-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { useSession } from '@/lib/auth-client'
import { safeReturnPath } from '@/lib/auth-return-path'
import type { ReleaseVoteState, VoteValue } from '@/lib/release-vote-types'
import { cn } from '@/lib/utils'

export function ReleaseVote({ releaseId, returnPath }: { releaseId: string; returnPath: string }) {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = useSession()
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(safeReturnPath(returnPath))}`
  const queryClient = useQueryClient()
  const queryKey = ['release-vote', releaseId, session?.user.id ?? null]
  const endpoint = `/api/releases/${releaseId}/vote`
  const locked = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState(false)
  const votes = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<ReleaseVoteState> => {
      const response = await fetch(endpoint, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Could not load votes.')
      return response.json()
    },
    staleTime: 0,
    retry: false,
    enabled: !pending && !sessionPending,
  })

  async function chooseVote(value: -1 | 1) {
    if (locked.current || sessionPending) return
    if (!session || invite || votes.data?.myVote === null) {
      router.push(signInHref)
      return
    }
    if (!votes.data || votes.isError) return

    locked.current = true
    setPending(true)
    setError(null)
    const desired: VoteValue = votes.data.myVote === value ? 0 : value
    try {
      await queryClient.cancelQueries({ queryKey })
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: desired }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      })
      if (response.status === 401) {
        setInvite(true)
        throw new Error('Your session expired. Sign in with GitHub to vote.')
      }
      if (!response.ok)
        throw new Error('Could not save your vote. Check the current totals before trying again.')
      const state: ReleaseVoteState = await response.json()
      queryClient.setQueryData(queryKey, state)
      setInvite(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your vote.')
      // A network failure can happen after the write commits. Reconcile before
      // enabling another toggle; retain the previous state if this read also fails.
      await votes.refetch()
    } finally {
      locked.current = false
      setPending(false)
    }
  }

  const needsSignIn = !session || invite || votes.data?.myVote === null
  const disabled = pending || sessionPending || (!needsSignIn && (!votes.data || votes.isError))
  const waiting = pending || sessionPending || (!needsSignIn && votes.isFetching && !votes.data)
  function voteButton(value: -1 | 1) {
    const selected = votes.data?.myVote === value
    const Icon = value === 1 ? ArrowUp01Icon : ArrowDown01Icon
    return (
      <button
        key={value}
        type="button"
        onClick={() => void chooseVote(value)}
        disabled={disabled}
        aria-label={value === 1 ? 'Upvote' : 'Downvote'}
        aria-pressed={selected}
        title={selected ? 'Click again to remove your vote' : undefined}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime disabled:opacity-50',
          waiting ? 'cursor-wait' : disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          selected
            ? 'border-lime bg-lime-dim text-lime'
            : 'border-ruling bg-void text-dust hover:border-lime hover:text-lime',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
    )
  }

  return (
    <section
      aria-labelledby="release-votes-heading"
      aria-busy={pending || sessionPending || votes.isFetching}
      className="frame overflow-hidden"
    >
      <h2
        id="release-votes-heading"
        className="border-b border-line px-4 py-3 font-mono text-[11px] text-dust"
      >
        # community_signal
      </h2>
      <div className="p-4">
        <p className="text-sm leading-relaxed text-dust">
          How useful is this release to your stack?
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          {voteButton(1)}
          <div className="min-w-0 text-center font-mono">
            <div className="text-2xl tabular-nums text-ink" aria-label="Net vote score">
              {votes.data?.score ?? '—'}
            </div>
            <div className="text-[10px] text-dust">net score</div>
          </div>
          {voteButton(-1)}
        </div>
        {votes.data && (
          <p className="mt-3 text-center font-mono text-[11px] tabular-nums text-dust">
            {votes.data.upvotes} up / {votes.data.downvotes} down
          </p>
        )}
        <p role="status" aria-live="polite" className="mt-3 font-mono text-[11px] text-dust">
          {pending
            ? 'saving vote…'
            : votes.isFetching && !votes.data
              ? 'loading votes…'
              : votes.isError
                ? 'Vote totals are unavailable. Any displayed totals are from the last successful read.'
                : votes.data?.myVote
                  ? `Your ${votes.data.myVote === 1 ? 'upvote' : 'downvote'} is selected. Click again to remove it.`
                  : votes.data?.myVote === 0
                    ? 'You have not voted on this release.'
                    : 'Sign in with GitHub to cast your vote.'}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[12px] text-rose">
            {error}
          </p>
        )}
        {votes.isError && (
          <button
            type="button"
            onClick={() => void votes.refetch()}
            disabled={votes.isFetching}
            className="mt-3 min-h-11 cursor-pointer rounded border border-ruling px-3 py-2 font-mono text-[11px] text-lime disabled:cursor-wait disabled:opacity-50"
          >
            {votes.isFetching ? 'loading…' : 'reload votes'}
          </button>
        )}
        {needsSignIn && (
          <div className="mt-4 border-t border-line pt-4">
            <Link
              href={signInHref}
              className="flex min-h-11 items-center justify-center rounded-md bg-lime px-3 py-2 text-center font-mono text-[11px] font-semibold text-void transition-colors hover:bg-lime/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              Sign in with GitHub to vote
            </Link>
            <p className="mt-2 text-[12px] leading-relaxed text-dust">
              You’ll return to this release, then choose your vote.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
