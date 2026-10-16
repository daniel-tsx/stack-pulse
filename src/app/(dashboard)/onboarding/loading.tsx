import Link from 'next/link'
import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Skeleton } from '@/components/ui/skeleton'
import { PulseLoader } from '@/components/ui/pulse-loader'

export default function OnboardingLoading() {
  return (
    <div className="flex-1">
      {/* Header shell */}
      <header className="sticky top-0 z-30 border-b border-line bg-void/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Logo size="sm" />
          </Link>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-fade">
            <span className="text-mute">~/</span>
            <span className="text-dust">onboarding</span>
            <span className="text-mute">/</span>
            <span className="text-lime">configure</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <Skeleton className="h-5 w-20 sm:w-40" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 relative z-10">
        {/* Section heading — static */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
          <span className="text-lime">§</span>
          <span>step 01</span>
          <span className="text-mute">/</span>
          <span>configure</span>
        </div>
        <h1 className="mt-3 font-mono text-3xl sm:text-[40px] font-bold tracking-tight text-ink lowercase">
          choose your stack<span className="text-lime">.</span>
        </h1>

        <div className="mt-3">
          <PulseLoader size="sm" label="loading registry…" />
        </div>

        {/* Config frame skeleton */}
        <div className="mt-10 frame overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/stack.config.ts</span>
          </div>
          <div className="px-4 py-4 space-y-2.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3.5 w-32 ml-4" />
            <Skeleton className="h-3.5 w-40 ml-4" />
            <Skeleton className="h-3.5 w-36 ml-4" />
            <Skeleton className="h-3.5 w-6" />
          </div>
        </div>

        {/* Search bar skeleton */}
        <div className="mt-10">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>

        {/* Package grid skeleton */}
        <div className="mt-10 space-y-10">
          {Array.from({ length: 2 }).map((_, s) => (
            <div key={s}>
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[11px] text-mute">└─</span>
                <Skeleton className="h-3 w-24" />
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line border border-line rounded-md overflow-hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-shade p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-2.5 w-full" />
                        <Skeleton className="h-2.5 w-3/4" />
                      </div>
                      <Skeleton className="w-5 h-5 rounded-[3px]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
