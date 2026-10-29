import type { Metadata } from 'next'
import { cacheLife } from 'next/cache'

import { Badge, CardNote, FileCard, PageIntro } from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { getRecentFetchRuns, type FetchRunRow } from '@/lib/release-ingestion'

export const metadata: Metadata = {
  title: 'Status — ingestion runs',
  description:
    'StackPulse ingestion health: recent release fetch runs, stacks scanned, releases inserted, and errors.',
  alternates: { canonical: '/status' },
}

const statusTone: Record<string, string> = {
  completed: 'feature',
  completed_with_errors: 'deprecation',
  failed: 'breaking',
  running: 'migration',
}

function formatDuration(run: FetchRunRow) {
  if (!run.finishedAt) return '—'
  const seconds = Math.max(
    0,
    Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000),
  )
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function formatRelative(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default async function StatusPage() {
  'use cache'
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 })

  const runs = await getRecentFetchRuns(20)

  const lastRun = runs[0] ?? null
  const finished = runs.filter((run) => run.status !== 'running')
  const cleanRuns = finished.filter((run) => run.status === 'completed').length
  const insertedTotal = runs.reduce((sum, run) => sum + run.releasesInserted, 0)

  return (
    <div className="relative flex-1">
      <SiteHeader />

      <main className="relative z-10 mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-14">
        <PageIntro
          path={[{ label: 'stackpulse', href: '/' }, { label: 'status' }]}
          state={
            lastRun
              ? {
                  label: lastRun.status.replace(/_/g, ' '),
                  tone: statusTone[lastRun.status] ?? 'neutral',
                }
              : undefined
          }
          title="Ingestion status"
          lede="Every release fetch run, in the open: stacks scanned, releases inserted, and errors. The cron runs twice daily; custom repos also fetch the moment they are added."
        />

        <dl className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
          <div className="bg-shade px-5 py-4">
            <dt className="font-mono text-[12px] text-dust">last fetch run</dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-ink">
              {lastRun ? formatRelative(lastRun.startedAt) : 'no runs yet'}
            </dd>
          </div>
          <div className="bg-shade px-5 py-4">
            <dt className="font-mono text-[12px] text-dust">
              clean runs (last {finished.length || '0'})
            </dt>
            <dd className="mt-1 font-mono text-xl font-semibold text-ink">
              {finished.length > 0 ? `${cleanRuns}/${finished.length}` : '—'}
            </dd>
          </div>
          <div className="bg-shade px-5 py-4">
            <dt className="font-mono text-[12px] text-dust">releases inserted (shown runs)</dt>
            <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-lime">
              {insertedTotal}
            </dd>
          </div>
        </dl>

        <FileCard path="var/log/fetch-runs.log" meta={`last ${runs.length} runs`} className="mt-8">
          {runs.length === 0 ? (
            <CardNote title="No fetch runs recorded yet.">
              The first run appears here after the next scheduled fetch at 00:00 or 12:00 UTC.
            </CardNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[12.5px]">
                <caption className="sr-only">Recent release fetch runs</caption>
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-dust">
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      started
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      trigger
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-normal">
                      status
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      scanned
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      inserted
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      errors
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      duration
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {runs.map((run) => (
                    <tr key={run.id} className="transition-colors hover:bg-lift">
                      <td className="whitespace-nowrap px-4 py-2.5 text-dust">
                        {run.startedAt.toISOString().slice(0, 16).replace('T', ' ')} utc
                      </td>
                      <td className="px-4 py-2.5 text-cyan">{run.trigger}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <Badge tone={statusTone[run.status] ?? 'neutral'}>
                          {run.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-dust">
                        {run.technologiesScanned}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                        {run.releasesInserted}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums ${run.errors > 0 ? 'text-rose' : 'text-dust'}`}
                      >
                        {run.errors}
                      </td>
                      <td className="px-4 py-2.5 text-right text-dust">{formatDuration(run)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FileCard>

        <p className="mt-6 font-mono text-[12px] leading-relaxed text-dust">
          {'// '}This page revalidates every 5 minutes. Errors here mean a stack&apos;s GitHub fetch
          or AI summarisation failed for that run. Later runs check the latest five releases;
          older gaps may need recovery.
        </p>
      </main>

      <SiteFooter />
    </div>
  )
}
