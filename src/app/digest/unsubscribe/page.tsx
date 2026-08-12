import type { Metadata } from 'next'
import Link from 'next/link'

import { Logo } from '@/components/logo'
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
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
        </div>

        <div className="frame overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/digest/unsubscribe.sh</span>
          </div>

          <div className="px-6 py-7">
            {isDone ? (
              <>
                <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
                  <span className="text-lime">$</span> digest --unsubscribe
                </div>
                <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink lowercase">
                  unsubscribed<span className="text-lime">.</span>
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-dust">
                  Your email was removed. No more weekly digests will be sent to it.
                </p>
              </>
            ) : isError ? (
              <>
                <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
                  <span className="text-rose">$</span> digest --unsubscribe
                </div>
                <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink lowercase">
                  something broke<span className="text-rose">.</span>
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-dust">
                  Could not unsubscribe right now. Try the link from your email again in a minute.
                </p>
              </>
            ) : hasValidToken ? (
              <>
                <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
                  <span className="text-lime">$</span> digest --unsubscribe --confirm
                </div>
                <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink lowercase">
                  stop the weekly digest<span className="text-lime">?</span>
                </h1>
                <p className="mt-3 text-[14px] leading-relaxed text-dust">
                  Confirm to remove your email from the StackPulse weekly digest list.
                </p>
                <form action={unsubscribeFromDigest} className="mt-6">
                  <input type="hidden" name="token" value={token} />
                  <button
                    type="submit"
                    className="w-full rounded-md bg-rose px-4 py-2.5 font-mono text-[13px] font-semibold text-void hover:bg-rose/85 transition-colors"
                  >
                    unsubscribe me
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
                  <span className="text-rose">$</span> digest --unsubscribe
                </div>
                <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-ink lowercase">
                  invalid link<span className="text-rose">.</span>
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
                className="font-mono text-[11px] text-fade hover:text-dust transition-colors"
              >
                cd ~ → back to stackpulse
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
