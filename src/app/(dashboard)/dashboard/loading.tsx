import Link from 'next/link'
import { Logo } from '@/components/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { PulseLoader } from '@/components/ui/pulse-loader'

function SkeletonReleaseCard() {
  return (
    <div className="relative pl-10">
      <span
        className="absolute left-0 top-[18px] w-3.5 h-3.5 rounded-full bg-ruling ring-1 ring-line"
        aria-hidden
      />
      <div className="frame overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center gap-3">
          <Skeleton className="w-1.5 h-1.5 rounded-full" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3.5 w-16 ml-1" />
          <Skeleton className="h-3 w-20 ml-auto" />
        </div>
        <div className="px-5 py-5">
          <Skeleton className="h-5 w-2/3" />
          <div className="mt-3.5 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[92%]" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
            <div className="px-3 py-2 border-b border-line flex items-center justify-between">
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-2.5 w-14" />
            </div>
            <div className="p-3 space-y-2">
              <Skeleton className="h-3 w-[88%]" />
              <Skeleton className="h-3 w-[70%]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardLoading() {
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
            <span className="text-dust">dashboard</span>
            <span className="text-mute">/</span>
            <span className="text-lime">feed</span>
          </div>
          <Skeleton className="h-5 w-40" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 relative z-10">
        {/* Section heading — static, renders instantly */}
        <div className="flex items-center gap-3 font-mono text-[11px] text-fade tracking-[0.2em] uppercase">
          <span className="text-lime">§</span>
          <span>feed</span>
          <span className="text-mute">/</span>
          <span>latest</span>
        </div>
        <h1 className="mt-3 font-mono text-3xl sm:text-[40px] font-bold tracking-tight text-ink lowercase">
          release feed<span className="text-lime">.</span>
        </h1>

        {/* Loading status line — the signature pulse */}
        <div className="mt-3">
          <PulseLoader size="sm" label="loading feed…" />
        </div>

        {/* Stats skeleton */}
        <div className="mt-6 grid grid-cols-2 gap-px bg-line border border-line rounded-md overflow-hidden sm:grid-cols-4">
          {['loaded', 'unread / stacks', 'deprecated', 'breaking'].map((label) => (
            <div key={label} className="bg-shade px-4 py-3">
              <div className="font-mono text-[10px] text-fade tracking-[0.2em] uppercase">
                {label}
              </div>
              <Skeleton className="mt-2 h-7 w-10" />
            </div>
          ))}
        </div>

        {/* Timeline skeleton */}
        <div className="mt-10 relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" aria-hidden />
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonReleaseCard key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
