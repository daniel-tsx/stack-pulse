'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshIcon } from 'hugeicons-react'
import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'

type ErrorViewProps = {
  error: Error & { digest?: string }
  retry: () => void
  /** Status line shown after `exit` — e.g. "uncaught exception in /dashboard". */
  context?: string
  homeHref?: string
  homeLabel?: string
}

export function ErrorView({
  error,
  retry,
  context = 'uncaught exception',
  homeHref = '/',
  homeLabel = 'cd ~/',
}: ErrorViewProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
          <ThemeSwitcher />
          <span className="font-mono text-[11px] text-fade">exit code 1</span>
        </div>

        <div className="frame overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/stderr</span>
            <span className="ml-auto text-rose">● error</span>
          </div>

          <div className="px-5 py-5 font-mono text-[13px] leading-relaxed">
            <div className="text-fade">{'// the process crashed before it could render'}</div>

            <div className="mt-3">
              <span className="text-fade">$ </span>
              <span className="text-rose">throw</span>
              <span className="text-dust"> {context}</span>
            </div>

            <div className="mt-3 rounded-md border border-rose/20 bg-rose/[0.04] px-3 py-2.5">
              <div className="text-[10px] text-rose/70 uppercase tracking-[0.2em] mb-1">
                message
              </div>
              <div className="text-ink break-words">
                {error.message || 'an unexpected error occurred'}
              </div>
              {error.digest && (
                <div className="mt-2 text-[11px] text-fade">
                  digest: <span className="text-dust">{error.digest}</span>
                </div>
              )}
            </div>

            <div className="mt-4 text-fade text-[12px]">
              <span>→ </span>
              <span>this is usually temporary. retry, or head back home.</span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={retry}
                className="inline-flex items-center gap-2 rounded-md bg-lime px-4 py-2 font-mono text-[12.5px] font-semibold text-void hover:bg-lime/85 transition-colors"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                retry
              </button>
              <Link
                href={homeHref}
                className="inline-flex items-center gap-2 rounded-md border border-ruling bg-shade px-4 py-2 font-mono text-[12.5px] font-medium text-ink hover:border-edge hover:bg-lift transition-colors"
              >
                {homeLabel}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
