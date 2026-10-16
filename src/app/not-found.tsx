import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'

export const metadata: Metadata = {
  title: '404 — route not found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
          <ThemeSwitcher />
          <span className="font-mono text-[11px] text-fade">http 404</span>
        </div>

        <div className="frame overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/router</span>
            <span className="ml-auto text-amber">● 404</span>
          </div>

          <div className="px-5 py-6 font-mono text-[13px] leading-relaxed">
            <div>
              <span className="text-fade">$ </span>
              <span className="text-lime">cd</span>
              <span className="text-dust"> ./the-page-you-wanted</span>
            </div>
            <div className="mt-1 text-rose">
              bash: cd: no such file or directory
            </div>

            <div className="mt-5 font-mono font-bold tracking-tight text-ink text-5xl sm:text-6xl">
              404<span className="text-lime caret" />
            </div>
            <p className="mt-3 text-dust text-[13px]">
              this route doesn&apos;t exist — it may have moved, or never shipped.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-md bg-lime px-4 py-2 font-mono text-[12.5px] font-semibold text-void hover:bg-lime/85 transition-colors"
              >
                <span className="text-void/60">$</span>
                cd ~/
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-md border border-ruling bg-shade px-4 py-2 font-mono text-[12.5px] font-medium text-ink hover:border-edge hover:bg-lift transition-colors"
              >
                open dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
