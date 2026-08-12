import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft01Icon } from 'hugeicons-react'

import { Logo } from '@/components/logo'
import { getUpgradePlan, type UpgradePlanItem } from '@/lib/upgrade-plan'

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function readFromParam(query: Record<string, string | string[] | undefined> | undefined) {
  const raw = query?.from
  const value = typeof raw === 'string' ? raw.trim().slice(0, 80) : ''
  return value || null
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const from = readFromParam(await searchParams)
  const plan = await getUpgradePlan(slug, from)

  if (!plan) {
    return { title: 'Stack not found', robots: { index: false, follow: false } }
  }

  const title = from
    ? `Upgrade ${plan.tech.name} from ${from}: breaking changes and migration checklist`
    : `${plan.tech.name} upgrade planner — breaking changes between versions`
  const description = `Enter your current ${plan.tech.name} version and get every stored breaking change, deprecation, security note, and migration step between it and the latest release.`

  return {
    title,
    description,
    alternates: { canonical: `/stacks/${plan.tech.slug}/upgrade` },
    openGraph: { title, description, url: `/stacks/${plan.tech.slug}/upgrade` },
  }
}

export default async function UpgradePlannerPage({ params, searchParams }: Props) {
  const { slug } = await params
  const from = readFromParam(await searchParams)
  const plan = await getUpgradePlan(slug, from)

  if (!plan) notFound()

  const hasRange = plan.fromIsValid && plan.fromVersion !== null

  return (
    <div className="relative flex-1">
      <header className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between relative z-20 border-b border-line/60">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <nav className="flex items-center gap-4 font-mono text-[11px] text-fade">
          <Link
            href={`/stacks/${plan.tech.slug}`}
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

      <main className="relative z-10 mx-auto max-w-4xl px-6 py-14">
        <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase flex flex-wrap items-center gap-3">
          <span className="text-lime">#</span>
          <span>stacks/{plan.tech.slug}/upgrade</span>
        </div>

        <h1 className="mt-6 font-mono text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          upgrade {plan.tech.name.toLowerCase()}
          <span className="text-lime">.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-dust">
          Enter the version you run today. StackPulse lines up every stored breaking change,
          deprecation, security note, and migration step between it and{' '}
          {plan.latest ? (
            <span className="text-ink">{plan.latest.version}</span>
          ) : (
            'the latest release'
          )}
          .
        </p>

        {/* Version form */}
        <form
          method="GET"
          action={`/stacks/${plan.tech.slug}/upgrade`}
          className="frame mt-8 overflow-hidden"
        >
          <div className="frame-titlebar">
            <span className="win-dots">
              <span style={{ background: '#fb7185' }} />
              <span style={{ background: '#fbbf24' }} />
              <span style={{ background: '#34d399' }} />
            </span>
            <span className="text-dust">~/upgrade-planner.sh</span>
            <span className="ml-auto text-mute">no sign-in needed</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 p-4 font-mono text-[12.5px]">
            <span className="text-fade">$</span>
            <span className="text-lime">upgrade</span>
            <span className="text-dust">--from</span>
            <input
              type="text"
              name="from"
              defaultValue={plan.fromVersion ?? ''}
              placeholder={plan.oldestStored ? `e.g. ${plan.oldestStored.version}` : 'e.g. 14.2.0'}
              className="w-36 rounded-sm bg-void border border-line px-2 py-1 text-cyan placeholder:text-fade"
            />
            <span className="text-dust">--to</span>
            <span className="text-amber">{plan.latest?.version ?? 'latest'}</span>
            <button
              type="submit"
              className="ml-auto inline-flex items-center gap-2 rounded-md bg-lime px-4 py-1.5 font-semibold text-void hover:bg-lime/85 transition-colors"
            >
              plan upgrade
            </button>
          </div>
        </form>

        {plan.fromVersion && !plan.fromIsValid && (
          <p className="mt-4 font-mono text-[12px] text-rose">
            <span className="text-fade">→ </span>
            could not parse &quot;{plan.fromVersion}&quot; as a version — try something like 14.2.0
          </p>
        )}

        {hasRange && (
          <>
            {/* Range summary */}
            <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
              <PlanStat label="releases in range" value={plan.releasesInRange.length} tone="ink" />
              <PlanStat label="breaking" value={plan.breaking.length} tone="rose" />
              <PlanStat label="security" value={plan.security.length} tone="rose" />
              <PlanStat label="deprecations" value={plan.deprecations.length} tone="amber" />
            </div>

            {plan.releasesInRange.length === 0 ? (
              <div className="frame mt-10 p-6 font-mono text-[13px] text-dust">
                <span className="text-fade">→ </span>
                no stored releases newer than {plan.fromVersion}
                {plan.latest ? ` — you may already be on the latest (${plan.latest.version})` : ''}.
              </div>
            ) : (
              <div className="mt-10 space-y-10">
                <ItemSection
                  title="breaking changes"
                  tone="rose"
                  items={plan.breaking}
                  emptyNote="no breaking changes recorded in this range."
                />
                <ItemSection
                  title="security notes"
                  tone="rose"
                  items={plan.security}
                  emptyNote="no security notes recorded in this range."
                />
                <ItemSection
                  title="deprecations"
                  tone="amber"
                  items={plan.deprecations}
                  emptyNote="no deprecations recorded in this range."
                />
                <ItemSection
                  title="migration checklist"
                  tone="cyan"
                  items={plan.migrationSteps}
                  emptyNote="no source-backed migration steps recorded in this range."
                  checklist
                />

                {/* Releases in range */}
                <section>
                  <SectionHeading title="releases in range" count={plan.releasesInRange.length} />
                  <ul className="mt-4 grid gap-px overflow-hidden rounded-md border border-line bg-line">
                    {plan.releasesInRange.map((release) => (
                      <li
                        key={release.id}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-shade px-4 py-3 font-mono text-[12.5px]"
                      >
                        <a
                          href={release.rawReleaseUrl ?? plan.tech.githubRepoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lime hover:underline"
                        >
                          {release.version}
                        </a>
                        {release.isPrerelease && <span className="text-fade">[prerelease]</span>}
                        <span className="min-w-0 flex-1 truncate text-dust">
                          {release.title ?? ''}
                        </span>
                        <span className="text-fade text-[11px]">
                          {release.publishedAt
                            ? release.publishedAt.toISOString().slice(0, 10)
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            <p className="mt-10 font-mono text-[11.5px] leading-relaxed text-fade">
              {'// '}based on {plan.storedCount} stored release
              {plan.storedCount === 1 ? '' : 's'} for {plan.tech.name}
              {plan.oldestStored ? ` (oldest: ${plan.oldestStored.version})` : ''}. releases
              published before StackPulse started tracking this stack may be missing — always check
              the{' '}
              <a
                href={plan.tech.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-dust hover:text-lime underline"
              >
                source changelog
              </a>{' '}
              before shipping.
            </p>

            {/* CTA */}
            <div className="frame mt-10 p-6 sm:p-8 text-center">
              <p className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase">
                want project-specific advice?
              </p>
              <h2 className="mt-2 font-mono text-xl font-bold tracking-tight text-ink sm:text-2xl">
                ask the ai about this upgrade
                <span className="text-lime">.</span>
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-[13.5px] text-dust">
                Sign in, follow {plan.tech.name}, and ask upgrade questions on any release — with
                your project context taken into account.
              </p>
              <Link
                href="/sign-in"
                className="mt-5 inline-flex items-center gap-2 rounded-md bg-lime px-5 py-2.5 font-mono text-[13px] font-semibold text-void hover:bg-lime/85 transition-colors"
              >
                <span className="text-void/60">$</span>
                <span>./sign-in --github</span>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

const statTone: Record<string, string> = {
  ink: 'text-ink',
  rose: 'text-rose',
  amber: 'text-amber',
  cyan: 'text-cyan',
}

function PlanStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ink' | 'rose' | 'amber' | 'cyan'
}) {
  return (
    <div className="bg-shade px-4 py-3">
      <div className={`font-mono text-xl font-bold ${value > 0 ? statTone[tone] : 'text-fade'}`}>
        {value}
      </div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-fade">{label}</div>
    </div>
  )
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase">
        §&nbsp;{title.replace(/ /g, '_')}
      </h2>
      <div className="h-px flex-1 bg-line" />
      <span className="font-mono text-[11px] text-mute">{count}</span>
    </div>
  )
}

const itemTone: Record<string, string> = {
  rose: 'text-rose',
  amber: 'text-amber',
  cyan: 'text-cyan',
}

function ItemSection({
  title,
  tone,
  items,
  emptyNote,
  checklist = false,
}: {
  title: string
  tone: 'rose' | 'amber' | 'cyan'
  items: UpgradePlanItem[]
  emptyNote: string
  checklist?: boolean
}) {
  return (
    <section>
      <SectionHeading title={title} count={items.length} />
      {items.length === 0 ? (
        <p className="mt-4 font-mono text-[12px] text-fade">→ {emptyNote}</p>
      ) : (
        <ul className="mt-4 grid gap-px overflow-hidden rounded-md border border-line bg-line">
          {items.map((entry, index) => (
            <li
              key={`${entry.version}-${index}`}
              className="flex items-baseline gap-3 bg-shade px-4 py-3"
            >
              <span className={`shrink-0 font-mono text-[12px] ${itemTone[tone]}`}>
                {checklist ? '[ ]' : '!'}
              </span>
              <span className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-dust">
                {entry.item}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-fade">{entry.version}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
