'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft01Icon } from 'hugeicons-react'
import { authClient } from '@/lib/auth-client'
import { safeReturnPath } from '@/lib/auth-return-path'
import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { PulseLoader } from '@/components/ui/pulse-loader'

export default function SignInPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGithubSignIn() {
    setLoading(true)
    setError(null)
    const { error } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: safeReturnPath(new URLSearchParams(window.location.search).get('returnTo')),
    })
    if (error) {
      setError('could not sign in with github')
      setLoading(false)
    }
  }

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <Link href="/" aria-label="StackPulse home" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" animated />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-dust hover:text-ink transition-colors"
            >
              <ArrowLeft01Icon aria-hidden="true" className="w-3 h-3" />
              Back
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-shade">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px] text-dust">
            <span className="text-ink">auth/sign-in</span>
            <span className="rounded-full border border-emerald/30 bg-emerald/10 px-2 text-emerald">
              github only
            </span>
          </div>

          <div className="px-6 py-7">
            <h1 className="font-mono text-2xl font-bold tracking-[-0.03em] text-ink">
              Welcome back.
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-dust">
              We use GitHub sign-in only, the same account you use to ship code.
            </p>

            <button
              type="button"
              onClick={handleGithubSignIn}
              disabled={loading}
              className="mt-7 min-h-11 w-full rounded-lg bg-lime px-4 py-3 font-mono text-[13px] font-semibold text-void hover:bg-lime/85 transition-colors disabled:opacity-80 inline-flex items-center justify-center gap-2.5"
            >
              {loading ? (
                <PulseLoader size="inline" tone="dark" label="redirecting…" />
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  <span>Continue with GitHub</span>
                </>
              )}
            </button>

            {error && (
              <p className="mt-4 font-mono text-[12.5px] text-rose" role="alert">
                Could not sign in with GitHub. Try again in a moment.
              </p>
            )}

            <ul className="mt-6 grid gap-1 font-mono text-[12px] leading-relaxed text-dust">
              <li>No password and no spam.</li>
              <li>We read your public profile and email only.</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4 font-mono text-[12px] text-dust">
            <span className="text-ink">New here?</span>
            <span>The same button creates your account.</span>
          </div>
        </div>
      </div>
    </main>
  )
}
