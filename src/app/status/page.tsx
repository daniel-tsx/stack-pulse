import type { Metadata } from 'next'
import { cacheLife } from 'next/cache'
import Link from 'next/link'
import { ArrowLeft01Icon } from 'hugeicons-react'

import { Logo } from '@/components/logo'
import { getRecentFetchRuns, type FetchRunRow } from '@/lib/release-ingestion'

export const metadata: Metadata = {
  title: 'Status — ingestion runs',
  description:
    'StackPulse ingestion health: recent release fetch runs, stacks scanned, releases inserted, and errors.',
  alternates: { canonical: '/status' },
}

const statusTone: Record<string, string> = {
  completed: 'border-emerald/30 bg-emerald/10 text-emerald',
  completed_with_errors: 'border-amber/30 bg-amber/10 text-amber',
  failed: 'border-rose/30 bg-rose/10 text-rose',
  running: 'border-cyan/30 bg-cyan/10 text-cyan',
}

function formatDuration(run: FetchRunRow) {
  if (!run.finishedAt) return '—'
  const seconds = Math.max(0, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000))
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
      <header className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between relative z-20 border-b border-line/60">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <nav className="flex items-center gap-4 font-mono text-[11px] text-fade">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-dust transition-colors">
            <ArrowLeft01Icon className="w-3 h-3" />
            cd ..
          </Link>
          <Link href="/stacks" className="hover:text-dust transition-colors">
            stacks
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-14">
        <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase flex items-center gap-3">
          <span className="text-lime">#</span>
          <span>status</span>
        </div>

        <h1 className="mt-6 font-mono text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          ingestion status<span className="text-lime">.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-dust">
          Every release fetch run, in the open: stacks scanned, releases inserted, and errors. The
          cron runs twice daily; custom repos also fetch the moment they are added.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          <div className="bg-shade px-4 py-3">
            <div className="font-mono text-xl font-bold text-ink">
              {lastRun ? formatRelative(lastRun.startedAt) : 'no runs yet'}
            </div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fade">
              last fetch run
            </div>
          </div>
          <div className="bg-shade px-4 py-3">
            <div className="font-mono text-xl font-bold text-ink">
              {finished.length > 0 ? `${cleanRuns}/${finished.length}` : '—'}
            </div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fade">
              clean runs (last {finished.length || '0'})
            </div>
          </div>
          <div className="bg-shade px-4 py-3">
            <div className="font-mono text-xl font-bold text-lime">{insertedTotal}</div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fade">
              releases inserted (shown runs)
            </div>
          </div>
        </div>

        <div className="frame mt-10 overflow-hidden">
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/var/log/fetch-runs.log</span>
            <span className="ml-auto text-mute">last {runs.length} runs</span>
          </div>

          {runs.length === 0 ? (
            <div className="p-6 font-mono text-[13px] text-fade">
              → no fetch runs recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.18em] text-fade">
                    <th className="px-4 py-2.5 font-normal">started</th>
                    <th className="px-4 py-2.5 font-normal">trigger</th>
                    <th className="px-4 py-2.5 font-normal">status</th>
                    <th className="px-4 py-2.5 font-normal text-right">scanned</th>
                    <th className="px-4 py-2.5 font-normal text-right">inserted</th>
                    <th className="px-4 py-2.5 font-normal text-right">errors</th>
                    <th className="px-4 py-2.5 font-normal text-right">duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-lift transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-dust">
                        {run.startedAt.toISOString().slice(0, 16).replace('T', ' ')} utc
                      </td>
                      <td className="px-4 py-2.5 text-cyan">{run.trigger}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-widest ${
                            statusTone[run.status] ?? 'border-fade/20 bg-dust/10 text-fade'
                          }`}
                        >
                          {run.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-dust">{run.technologiesScanned}</td>
                      <td className="px-4 py-2.5 text-right text-ink">{run.releasesInserted}</td>
                      <td
                        className={`px-4 py-2.5 text-right ${run.errors > 0 ? 'text-rose' : 'text-fade'}`}
                      >
                        {run.errors}
                      </td>
                      <td className="px-4 py-2.5 text-right text-fade">{formatDuration(run)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-6 font-mono text-[11.5px] text-fade">
          {'// '}this page revalidates every 5 minutes. errors here mean a stack&apos;s GitHub fetch
          or AI summarisation failed for that run. Later runs check the latest five releases;
          older gaps may need recovery.
        </p>
      </main>
    </div>
  )
}
