'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshIcon } from 'hugeicons-react'

import { CenteredShell, DiffLine, DiffLines, FileCard, button } from '@/components/review/review-ui'

type ErrorViewProps = {
  error: Error & { digest?: string }
  retry: () => void
  /** Short label for where it failed — e.g. "uncaught exception in /dashboard". */
  context?: string
  homeHref?: string
  homeLabel?: string
}

export function ErrorView({
  error,
  retry,
  context = 'uncaught exception',
  homeHref = '/',
  homeLabel = 'Go home',
}: ErrorViewProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <CenteredShell meta={<span>exit code 1</span>}>
      <FileCard path="stderr.log" meta={<span className="text-rose">error</span>}>
        <DiffLines>
          <DiffLine kind="hunk">@@ {context} @@</DiffLine>
          <DiffLine kind="del" n={1}>
            {error.message || 'An unexpected error occurred.'}
          </DiffLine>
          {error.digest && (
            <DiffLine n={2}>
              <span className="text-dust">digest: {error.digest}</span>
            </DiffLine>
          )}
        </DiffLines>
        <div className="border-t border-line px-6 py-6">
          <h1 className="font-mono text-2xl font-bold tracking-[-0.03em] text-ink">
            This page crashed before it could render.
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-dust">
            This is usually temporary. Try again, or head back home.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={retry} className={button.primary}>
              <RefreshIcon aria-hidden="true" className="size-3.5" />
              Try again
            </button>
            <Link href={homeHref} className={button.secondary}>
              {homeLabel}
            </Link>
          </div>
        </div>
      </FileCard>
    </CenteredShell>
  )
}
