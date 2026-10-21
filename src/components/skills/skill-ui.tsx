import Link from 'next/link'
import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { skillAnalysisLabel } from '@/lib/public-skills'
import type { SkillReport } from '@/lib/skill-analysis'

export function SkillShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex-1">
      <header className="relative z-20 mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <Link href="/" aria-label="StackPulse home">
          <Logo size="md" />
        </Link>
        <nav
          aria-label="Public navigation"
          className="flex items-center gap-4 font-mono text-xs text-dust"
        >
          <Link href="/stacks" className="hover:text-lime">
            stacks
          </Link>
          <Link href="/skills" className="text-lime">
            skills
          </Link>
          <ThemeSwitcher />
        </nav>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>
    </div>
  )
}

export function SkillPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="frame mt-8 min-w-0 overflow-hidden">
      <div className="border-b border-line bg-shade px-5 py-3 font-mono text-xs text-dust">
        ~/skills/{title}
      </div>
      <div className="space-y-4 break-words p-5 text-sm leading-relaxed text-dust">{children}</div>
    </section>
  )
}

export function SkillDate({ value }: { value: Date | null }) {
  return value ? (
    <time dateTime={value.toISOString()}>
      {new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(value)}{' '}
      UTC
    </time>
  ) : (
    <>never</>
  )
}

export function UpdateRows({
  slug,
  updates,
}: {
  slug?: string
  updates: {
    id: string
    slug?: string
    previousRevision: string
    newRevision: string
    analysisStatus: string
    report: SkillReport | null
    createdAt: Date
  }[]
}) {
  if (!updates.length)
    return (
      <p className="border-l-2 border-lime pl-4">
        The first check establishes a baseline. Future changes will appear here with revision
        evidence and an impact assessment.
      </p>
    )
  return (
    <ul className="divide-y divide-line">
      {updates.map((update) => (
        <li key={update.id} className="py-5 first:pt-0">
          <Link
            href={`/skills/${slug ?? update.slug}/updates/${update.id}`}
            className="font-mono text-sm text-ink hover:text-lime"
          >
            {slug ?? update.slug}{' '}
            <span className="text-lime">
              {update.previousRevision.slice(0, 7)} → {update.newRevision.slice(0, 7)}
            </span>
          </Link>
          <p className="mt-2">
            {update.report?.summary ??
              'A directory change was detected. The impact report is not available yet.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 font-mono text-xs text-dust">
            <span>{skillAnalysisLabel(update.analysisStatus)}</span>
            <SkillDate value={update.createdAt} />
          </div>
          {update.report && (
            <p className="mt-2 font-mono text-xs text-amber">
              {update.report.recommendation.replaceAll('_', ' ')} · {update.report.confidence}{' '}
              confidence
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}
