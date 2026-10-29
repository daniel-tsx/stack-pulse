import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GitCompareIcon } from 'hugeicons-react'

import {
  CardNote,
  FileCard,
  MergeBox,
  PageIntro,
  StatGrid,
  button,
  cx,
} from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
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
  const latest = plan.latest?.version ?? 'latest'

  return (
    <div className="relative flex-1">
      <SiteHeader active="stacks" width="max-w-4xl" />

      <main className="relative z-10 mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-14">
        <PageIntro
          path={[
            { label: 'stackpulse', href: '/' },
            { label: 'stacks', href: '/stacks' },
            { label: plan.tech.slug, href: `/stacks/${plan.tech.slug}` },
            { label: 'upgrade' },
          ]}
          title={`Upgrade ${plan.tech.name}`}
          lede={
            <>
              Enter the version you run today. StackPulse lines up every stored breaking change,
              deprecation, security note, and migration step between it and{' '}
              {plan.latest ? (
                <span className="text-ink">{plan.latest.version}</span>
              ) : (
                'the latest release'
              )}
              .
            </>
          }
        />

        <form
          method="GET"
          action={`/stacks/${plan.tech.slug}/upgrade`}
          className="mt-10 overflow-hidden rounded-xl border border-line bg-shade"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px] text-dust">
            <span className="flex items-center gap-2 text-ink">
              <GitCompareIcon aria-hidden="true" className="size-3.5 text-dust" />
              Compare versions
            </span>
            <span>no sign-in needed</span>
          </div>
          <div className="flex flex-wrap items-end gap-3 p-4 font-mono text-[13px] sm:p-5">
            <label className="grid gap-1.5">
              <span className="text-[12px] text-dust">from (your version)</span>
              <input
                type="text"
                name="from"
                defaultValue={plan.fromVersion ?? ''}
                placeholder={
                  plan.oldestStored ? `e.g. ${plan.oldestStored.version}` : 'e.g. 14.2.0'
                }
                className="h-11 w-44 rounded-lg border border-ruling bg-void px-3 text-cyan placeholder:text-fade"
              />
            </label>
            <span aria-hidden="true" className="pb-3 text-dust">
              …
            </span>
            <div className="grid gap-1.5">
              <span className="text-[12px] text-dust">to</span>
              <span className="flex h-11 items-center rounded-lg border border-line px-3 text-amber">
                {latest}
              </span>
            </div>
            <button type="submit" className={cx(button.primary, 'sm:ml-auto')}>
              Compare
            </button>
          </div>
        </form>

        {plan.fromVersion && !plan.fromIsValid && (
          <p role="alert" className="mt-4 font-mono text-[13px] text-rose">
            Could not read &quot;{plan.fromVersion}&quot; as a version. Try something like 14.2.0.
          </p>
        )}

        {hasRange && (
          <>
            <FileCard
              path={
                <>
                  Comparing <span className="text-cyan">{plan.fromVersion}</span>…
                  <span className="text-amber">{latest}</span>
                </>
              }
              meta={`${plan.releasesInRange.length} releases`}
              className="mt-10"
            >
              <StatGrid
                stats={[
                  { label: 'releases in range', value: plan.releasesInRange.length },
                  { label: 'breaking', value: plan.breaking.length, tone: 'rose' },
                  { label: 'security', value: plan.security.length, tone: 'rose' },
                  { label: 'deprecations', value: plan.deprecations.length, tone: 'amber' },
                ]}
              />
              {plan.releasesInRange.length === 0 && (
                <CardNote title={`No stored releases newer than ${plan.fromVersion}.`}>
                  {plan.latest
                    ? `You may already be on the latest version (${plan.latest.version}).`
                    : 'Nothing to compare yet.'}
                </CardNote>
              )}
            </FileCard>

            {plan.releasesInRange.length > 0 && (
              <div className="mt-6 grid gap-6">
                <ItemSection
                  path="review/breaking.md"
                  title="Breaking changes"
                  tone="rose"
                  items={plan.breaking}
                  emptyNote="No breaking changes recorded in this range."
                />
                <ItemSection
                  path="review/security.md"
                  title="Security notes"
                  tone="rose"
                  items={plan.security}
                  emptyNote="No security notes recorded in this range."
                />
                <ItemSection
                  path="review/deprecations.md"
                  title="Deprecations"
                  tone="amber"
                  items={plan.deprecations}
                  emptyNote="No deprecations recorded in this range."
                />
                <ItemSection
                  path="review/migration-checklist.md"
                  title="Migration checklist"
                  tone="cyan"
                  items={plan.migrationSteps}
                  emptyNote="No source-backed migration steps recorded in this range."
                  checklist
                />

                <FileCard
                  path="releases-in-range.log"
                  meta={`${plan.releasesInRange.length}`}
                  title="Releases in range"
                >
                  <ul className="border-t border-line font-mono text-[13px]">
                    {plan.releasesInRange.map((release) => (
                      <li
                        key={release.id}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3 last:border-b-0"
                      >
                        <a
                          href={release.rawReleaseUrl ?? plan.tech.githubRepoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lime underline-offset-4 hover:underline"
                        >
                          {release.version}
                        </a>
                        {release.isPrerelease && <span className="text-dust">[prerelease]</span>}
                        <span className="min-w-0 flex-1 truncate text-dust">
                          {release.title ?? ''}
                        </span>
                        <span className="text-[12px] text-dust">
                          {release.publishedAt
                            ? release.publishedAt.toISOString().slice(0, 10)
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </FileCard>
              </div>
            )}

            <p className="mt-8 font-mono text-[12px] leading-relaxed text-dust">
              {'// '}Based on {plan.storedCount} stored release
              {plan.storedCount === 1 ? '' : 's'} for {plan.tech.name}
              {plan.oldestStored ? ` (oldest: ${plan.oldestStored.version})` : ''}. Releases
              published before StackPulse started tracking this stack may be missing, so always
              check the{' '}
              <a
                href={plan.tech.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline underline-offset-4 hover:text-lime"
              >
                source changelog
              </a>{' '}
              before shipping.
            </p>

            <div className="mt-10">
              <MergeBox
                id="upgrade-cta"
                title="Ask about this upgrade."
                body={`Sign in, follow ${plan.tech.name}, and ask upgrade questions on any release, with your project context taken into account.`}
              >
                <div className="mt-6">
                  <Link href="/sign-in" className={button.primary}>
                    Sign in with GitHub
                  </Link>
                </div>
              </MergeBox>
            </div>
          </>
        )}
      </main>

      <SiteFooter width="max-w-4xl" />
    </div>
  )
}

const itemTone: Record<string, string> = {
  rose: 'text-rose',
  amber: 'text-amber',
  cyan: 'text-cyan',
}

function ItemSection({
  path,
  title,
  tone,
  items,
  emptyNote,
  checklist = false,
}: {
  path: string
  title: string
  tone: 'rose' | 'amber' | 'cyan'
  items: UpgradePlanItem[]
  emptyNote: string
  checklist?: boolean
}) {
  return (
    <FileCard path={path} meta={`${items.length}`} title={title}>
      {items.length === 0 ? (
        <CardNote title={emptyNote} />
      ) : (
        <ul className="border-t border-line">
          {items.map((entry, index) => (
            <li
              key={`${entry.version}-${index}`}
              className="flex items-baseline gap-3 border-b border-line px-5 py-3 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className={`shrink-0 font-mono text-[12px] ${itemTone[tone]}`}
              >
                {checklist ? '[ ]' : '!'}
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-relaxed text-ink">
                {entry.item}
              </span>
              <span className="shrink-0 font-mono text-[12px] text-dust">{entry.version}</span>
            </li>
          ))}
        </ul>
      )}
    </FileCard>
  )
}
