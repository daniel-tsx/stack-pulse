import { SiteHeader } from '@/components/site/site-header'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { Skeleton } from '@/components/ui/skeleton'

export default function UpgradePlannerLoading() {
  return (
    <div className="relative flex-1">
      <SiteHeader active="stacks" width="max-w-4xl" />

      <main
        className="relative z-10 mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-14"
        aria-busy="true"
      >
        <div className="flex items-center gap-2.5 font-mono text-[12px] text-dust">
          <span>stackpulse</span>
          <span className="text-fade">/</span>
          <span>stacks</span>
          <span className="text-fade">/</span>
          <Skeleton className="h-3 w-20" />
          <span className="text-fade">/</span>
          <span>upgrade</span>
        </div>
        <Skeleton className="mt-5 h-10 w-2/3 sm:h-12" />
        <div className="mt-5 max-w-2xl space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>

        <div className="mt-10 overflow-hidden rounded-xl border border-line bg-shade">
          <div className="border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px] text-ink">
            Compare versions
          </div>
          <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
            <Skeleton className="h-11 w-44 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg" />
            <Skeleton className="h-11 w-28 rounded-lg sm:ml-auto" />
          </div>
        </div>

        <div className="mt-8">
          <PulseLoader size="sm" label="lining up releases" />
        </div>
      </main>
    </div>
  )
}
