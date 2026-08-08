import Link from 'next/link'
import { ArrowLeft01Icon } from 'hugeicons-react'

import { Logo } from '@/components/logo'
import { Skeleton } from '@/components/ui/skeleton'
import { PulseLoader } from '@/components/ui/pulse-loader'

// `/stacks/[slug]` reads `searchParams` for the signal filter, which makes the route
// dynamic — so a `<Link>` has no static shell to prefetch and clicks used to sit on the
// previous page until the server responded. This loading boundary is what `<Link>`
// prefetches instead, so the URL and this shell land immediately on click.
// Chrome and the section headings match the real page so only the data regions animate.
export default function StackPageLoading() {
  return (
    <div className="relative flex-1">
      <header className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between relative z-20 border-b border-line/60">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <nav className="flex items-center gap-4 font-mono text-[11px] text-fade">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-dust transition-colors"
          >
            <ArrowLeft01Icon className="w-3 h-3" />
            cd ..
          </Link>
          <Link href="/sign-in" className="text-lime hover:underline">
            track stack
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-14">
        <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase flex flex-wrap items-center gap-3">
          <span className="text-lime">#</span>
          <span>stacks</span>
          <span className="text-mute">/</span>
          <Skeleton className="h-3 w-20" />
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <div className="space-y-3">
              <Skeleton className="h-9 w-[85%] sm:h-12" />
              <Skeleton className="h-9 w-[60%] sm:h-12" />
            </div>
            <div className="mt-5 max-w-2xl space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[94%]" />
              <Skeleton className="h-4 w-[70%]" />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Skeleton className="h-[38px] w-32 rounded-md" />
              <Skeleton className="h-[38px] w-36 rounded-md" />
              <Skeleton className="h-[38px] w-32 rounded-md" />
              <Skeleton className="h-[38px] w-20 rounded-md" />
            </div>
            <div className="mt-6">
              <PulseLoader size="sm" label="loading releases…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
            {['releases', 'breaking', 'security', 'deprecated', 'migrations'].map((label) => (
              <div key={label} className="bg-shade px-4 py-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fade">
                  {label}
                </div>
                <Skeleton className="mt-1 h-8 w-12" />
              </div>
            ))}
          </div>
        </div>

        <section className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-shade p-6">
              <Skeleton className="h-2.5 w-28" />
              <Skeleton className="mt-4 h-6 w-3/4" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-[88%]" />
                <Skeleton className="h-3.5 w-3/5" />
              </div>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fade">
              # latest_releases
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">source-backed</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {['all', 'breaking', 'deprecation', 'migration', 'security'].map((signal) => (
              <Skeleton key={signal} className="h-[30px] w-24 rounded-md" />
            ))}
          </div>

          <div className="mt-10 space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="frame overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="ml-auto h-3 w-24" />
                </div>
                <div className="px-5 py-5">
                  <Skeleton className="h-6 w-2/3" />
                  <div className="mt-2.5 space-y-2">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-[92%]" />
                    <Skeleton className="h-3.5 w-3/5" />
                  </div>
                  <div className="mt-5 rounded-md border border-line bg-void p-3">
                    <Skeleton className="h-3 w-[88%]" />
                    <Skeleton className="mt-2 h-3 w-[70%]" />
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
