import type { Metadata } from 'next'
import Link from 'next/link'

import { CenteredShell, FileCard } from '@/components/review/review-ui'
import { unsubscribeFromDigest } from '@/lib/actions'

export const metadata: Metadata = {
  title: 'Unsubscribe',
  description: 'Unsubscribe from the StackPulse weekly digest.',
  robots: { index: false, follow: false },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// This email-only route is keyed by a private URL token and has no in-app navigation path.
// Keep the token-dependent confirmation page out of the shared prefetched shell.
export const instant = false

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const token = typeof query.token === 'string' ? query.token : ''
  const isDone = query.done === '1'
  const isError = query.error === '1'
  const hasValidToken = UUID.test(token)

  return (
    <CenteredShell>
      <FileCard path="digest/unsubscribe">
        <div className="px-6 py-7">
          {isDone ? (
            <>
              <h1 className="font-mono text-2xl font-bold tracking-[-0.03em] text-ink">
                Unsubscribed.
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-dust">
                Your email was removed. No more weekly digests will be sent to it.
              </p>
            </>
          ) : isError ? (
            <>
              <h1 className="font-mono text-2xl font-bold tracking-[-0.03em] text-rose">
                Could not unsubscribe.
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-dust">
                Something went wrong on our side. Try the link from your email again in a minute.
              </p>
            </>
          ) : hasValidToken ? (
            <>
              <h1 className="font-mono text-2xl font-bold tracking-[-0.03em] text-ink">
                Stop the weekly digest?
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-dust">
                Confirm to remove your email from the StackPulse weekly digest list.
              </p>
              <form action={unsubscribeFromDigest} className="mt-6">
                <input type="hidden" name="token" value={token} />
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-rose px-4 font-mono text-[13px] font-semibold text-void transition-colors hover:bg-rose/85"
                >
                  Unsubscribe me
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-mono text-2xl font-bold tracking-[-0.03em] text-rose">
                Invalid link.
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-dust">
                This unsubscribe link is missing its token. Use the link from the bottom of a
                digest email.
              </p>
            </>
          )}

          <div className="mt-6 border-t border-line pt-4">
            <Link
              href="/"
              className="font-mono text-[12px] text-dust underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              Back to StackPulse
            </Link>
          </div>
        </div>
      </FileCard>
    </CenteredShell>
  )
}
