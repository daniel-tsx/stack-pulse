import type { Metadata } from 'next'
import Link from 'next/link'

import { CenteredShell, DiffLine, DiffLines, FileCard, button } from '@/components/review/review-ui'

export const metadata: Metadata = {
  title: '404 — route not found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <CenteredShell meta={<span>http 404</span>}>
      <FileCard path="router/routes.diff" meta={<span className="text-amber">404</span>}>
        <DiffLines>
          <DiffLine kind="hunk">@@ route lookup @@</DiffLine>
          <DiffLine kind="del" n={1}>
            /the-page-you-wanted
          </DiffLine>
        </DiffLines>
        <div className="border-t border-line px-6 py-6">
          <h1 className="font-mono text-5xl font-bold tracking-[-0.04em] text-ink">404</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-dust">
            This route doesn&apos;t exist. It may have moved, or it never shipped.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link href="/" className={button.primary}>
              Go home
            </Link>
            <Link href="/dashboard" className={button.secondary}>
              Open the feed
            </Link>
          </div>
        </div>
      </FileCard>
    </CenteredShell>
  )
}
