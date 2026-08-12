import Link from 'next/link'
import { ArrowLeft01Icon } from 'hugeicons-react'

import { Logo } from '@/components/logo'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { Skeleton } from '@/components/ui/skeleton'

export default function UpgradePlannerLoading() {
  return (
    <div className="relative flex-1">
      <header className="relative z-20 mx-auto flex h-14 max-w-6xl items-center justify-between border-b border-line/60 px-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo size="md" />
        </Link>
        <nav className="flex items-center gap-4 font-mono text-[11px] text-fade">
          <Link
            href="/stacks"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-dust"
          >
            <ArrowLeft01Icon className="h-3 w-3" />
            cd ..
          </Link>
          <Link href="/sign-in" className="text-lime hover:underline">
            track stack
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-6 py-14">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-fade">
          <span className="text-lime">#</span>
          <span>stacks</span>
          <span className="text-mute">/</span>
          <Skeleton className="h-3 w-20" />
          <span className="text-mute">/</span>
          <span>upgrade</span>
        </div>

        <Skeleton className="mt-6 h-12 w-2/3" />
        <div className="mt-4">
          <PulseLoader size="sm" label="building upgrade plan…" />
        </div>

        <div className="frame mt-8 overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/upgrade-planner.sh</span>
            <span className="ml-auto text-mute">no sign-in needed</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-36 rounded-sm" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
          {['releases in range', 'breaking', 'security', 'deprecations'].map((label) => (
            <div key={label} className="bg-shade px-4 py-3">
              <Skeleton className="h-6 w-10" />
              <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.18em] text-fade">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 space-y-10">
          {['breaking changes', 'security notes', 'deprecations', 'migration checklist'].map(
            (section) => (
              <section key={section}>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-fade">
                    §&nbsp;{section.replace(/ /g, '_')}
                  </span>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <div className="mt-4 space-y-px overflow-hidden rounded-md border border-line bg-line">
                  <Skeleton className="h-11 w-full rounded-none" />
                  <Skeleton className="h-11 w-full rounded-none" />
                </div>
              </section>
            ),
          )}
        </div>
      </main>
    </div>
  )
}
