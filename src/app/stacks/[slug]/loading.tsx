import { SiteHeader } from '@/components/site/site-header'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { Skeleton } from '@/components/ui/skeleton'

// `params` and `searchParams` are URL-specific, so Partial Prefetching shares this App
// Shell across every stack link instead of rendering every slug ahead of time. Chrome and
// section headings match the real page so only the URL-dependent data regions animate.
export default function StackPageLoading() {
  return (
    <div className="relative flex-1">
      <SiteHeader active="stacks" />

      <main
        className="relative z-10 mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-14"
        aria-busy="true"
      >
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div>
            <div className="flex items-center gap-2.5 font-mono text-[12px] text-dust">
              <span>stackpulse</span>
              <span className="text-fade">/</span>
              <span>stacks</span>
              <span className="text-fade">/</span>
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="mt-5 space-y-3">
              <Skeleton className="h-9 w-[85%] sm:h-11" />
              <Skeleton className="h-9 w-[60%] sm:h-11" />
            </div>
            <div className="mt-5 max-w-2xl space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[94%]" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Skeleton className="h-11 w-36 rounded-lg" />
              <Skeleton className="h-11 w-36 rounded-lg" />
              <Skeleton className="h-11 w-28 rounded-lg" />
            </div>
            <div className="mt-6">
              <PulseLoader size="sm" label="loading releases" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-shade">
            <div className="border-b border-line bg-lift px-4 py-2.5">
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="grid grid-cols-2 gap-px bg-line">
              {['releases', 'breaking', 'security', 'deprecated', 'migrations'].map((label) => (
                <div key={label} className="bg-shade px-4 py-3.5">
                  <div className="font-mono text-[11.5px] text-dust">{label}</div>
                  <Skeleton className="mt-1.5 h-7 w-12" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="mt-14">
          <h2 className="font-mono text-[19px] font-semibold tracking-[-0.02em] text-ink">
            Latest releases
          </h2>
          <div className="mt-6 grid gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-line bg-shade">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-lift px-4 py-3">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="ml-auto h-3 w-24" />
                </div>
                <div className="px-5 py-5">
                  <Skeleton className="h-6 w-2/3" />
                  <div className="mt-2.5 space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-[92%]" />
                    <Skeleton className="h-3.5 w-3/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
