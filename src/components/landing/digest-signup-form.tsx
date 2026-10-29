'use client'

import { useId, useState, useTransition } from 'react'

import { PulseLoader } from '@/components/ui/pulse-loader'
import { subscribeToDigest } from '@/lib/actions'

export function DigestSignupForm({
  stackSlug,
  source = 'public',
  framed = true,
}: {
  stackSlug?: string
  source?: string
  /** Draw its own card; turn off when the form already sits inside one. */
  framed?: boolean
}) {
  const emailId = useId()
  const messageId = useId()
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className={framed ? 'rounded-xl border border-line bg-shade p-4' : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        setMessage(null)

        startTransition(async () => {
          const result = await subscribeToDigest({ email, stackSlug, source, website })
          setIsSuccess(result.ok)
          setMessage(result.ok ? 'saved. weekly digest signup recorded.' : result.error)
          if (result.ok) {
            setEmail('')
            setWebsite('')
          }
        })
      }}
    >
      <label htmlFor={emailId} className="font-mono text-[13px] font-semibold text-ink">
        Weekly upgrade digest
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        <input
          id={emailId}
          type="email"
          required
          autoComplete="email"
          aria-describedby={messageId}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="h-11 min-w-0 rounded-lg border border-ruling bg-void px-3 font-mono text-[13px] text-ink placeholder:text-fade"
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-lime px-4 font-mono text-[13px] font-semibold text-void transition-colors hover:bg-lime/85 disabled:opacity-70"
        >
          {isPending ? <PulseLoader size="inline" tone="dark" label="saving" /> : 'Notify me'}
        </button>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-dust">
        Get source-linked upgrade notes and occasional sponsor recommendations. No GitHub login
        required.
      </p>
      <p
        id={messageId}
        role="status"
        className={`mt-2 font-mono text-[12px] empty:hidden ${isSuccess ? 'text-emerald' : 'text-rose'}`}
      >
        {message}
      </p>
    </form>
  )
}
