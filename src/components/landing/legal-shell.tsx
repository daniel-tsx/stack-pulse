import Link from 'next/link'
import { ArrowLeft01Icon } from 'hugeicons-react'
import { Logo } from '@/components/logo'

export function LegalShell({
  title,
  slug,
  updatedAt,
  children,
}: {
  title: string
  slug: string
  updatedAt: string
  children: React.ReactNode
}) {
  return (
    <div className="relative flex-1">
      <header className="mx-auto max-w-3xl px-6 h-14 flex items-center justify-between relative z-20 border-b border-line/60">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fade hover:text-dust transition-colors"
        >
          <ArrowLeft01Icon className="w-3 h-3" />
          cd ..
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase flex items-center gap-3">
          <span className="text-lime">§</span>
          <span>{slug}</span>
          <span className="text-mute">·</span>
          <span>updated {updatedAt}</span>
        </div>
        <h1 className="mt-3 font-mono text-3xl sm:text-[40px] font-bold tracking-tight text-ink lowercase">
          {title}<span className="text-lime">.</span>
        </h1>

        <div className="mt-10 text-dust text-[15px] leading-relaxed legal-prose">{children}</div>
      </main>

      <footer className="border-t border-line mt-16">
        <div className="mx-auto max-w-3xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-fade">
          <Logo size="sm" />
          <p className="tracking-widest">
            {'From the '}
            <a
              href="https://eastbase.studio"
              target="_blank"
              rel="noopener"
              className="rounded-xs text-lime outline-none transition-colors hover:text-ink focus-visible:ring-1 focus-visible:ring-lime"
            >
              Eastbase
            </a>
            {' studio'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/privacy" className="hover:text-ink transition-colors">
              privacy
            </Link>
            <Link href="/terms" className="hover:text-ink transition-colors">
              terms
            </Link>
            <a
              href="https://github.com/daniel-ctn/stack-pulse"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              source ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
