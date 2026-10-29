import { SiteHeader } from '@/components/site/site-header'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingRelease() {
  return (
    <div className="relative flex-1">
      <SiteHeader active="stacks" width="max-w-5xl" />
      <main
        className="relative z-10 mx-auto w-full max-w-5xl px-5 py-12 sm:px-6 sm:py-14"
        aria-busy="true"
        aria-label="Loading release"
      >
        <PulseLoader size="sm" label="loading release notes" />
        <Skeleton className="mt-6 h-10 w-3/4" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="overflow-hidden rounded-xl border border-line bg-shade">
            <div className="border-b border-line bg-lift px-4 py-3">
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="space-y-4 p-6">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-line bg-shade p-4">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </main>
    </div>
  )
}
