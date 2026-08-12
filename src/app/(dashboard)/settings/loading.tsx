import Link from 'next/link'

import { Logo } from '@/components/logo'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo size="sm" />
          </Link>
          <div className="hidden items-center gap-2 font-mono text-[11px] text-fade sm:flex">
            <span className="text-mute">~/</span>
            <span className="text-dust">dashboard</span>
            <span className="text-mute">/</span>
            <span className="text-lime">settings</span>
          </div>
          <Skeleton className="h-5 w-40" />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-fade">
          <span className="text-lime">§</span>
          <span>settings</span>
          <span className="text-mute">/</span>
          <span>notifications</span>
        </div>
        <h1 className="mt-3 font-mono text-3xl font-bold lowercase tracking-tight text-ink sm:text-[40px]">
          notifications<span className="text-lime">.</span>
        </h1>
        <div className="mt-3">
          <PulseLoader size="sm" label="loading notification settings…" />
        </div>

        <div className="frame mt-8 overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/notifications.config</span>
          </div>
          <div className="space-y-4 p-6">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </main>
    </div>
  )
}
