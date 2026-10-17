import { Logo } from '@/components/logo'
import { PulseLoader } from '@/components/ui/pulse-loader'
import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingRelease() {
  return (
    <main
      className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"
      aria-busy="true"
      aria-label="Loading release"
    >
      <Logo size="md" />
      <div className="mt-10">
        <PulseLoader size="sm" label="loading release notes…" />
      </div>
      <Skeleton className="mt-6 h-10 w-3/4" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="frame space-y-4 p-6">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="frame space-y-4 p-4">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </main>
  )
}
