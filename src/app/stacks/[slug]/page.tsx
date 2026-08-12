import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft01Icon, ArrowUp01Icon, Link01Icon, RssIcon } from 'hugeicons-react'

import { DigestSignupForm } from '@/components/landing/digest-signup-form'
import { Logo } from '@/components/logo'
import {
  getPublicStackPage,
  getPublicStackSlugs,
  type PublicStackRelease,
} from '@/lib/public-stacks'

type Props = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const signalTone: Record<string, string> = {
  breaking: 'border-rose/30 bg-rose/10 text-rose',
  deprecation: 'border-amber/30 bg-amber/10 text-amber',
  migration: 'border-cyan/30 bg-cyan/10 text-cyan',
  feature: 'border-emerald/30 bg-emerald/10 text-emerald',
  security: 'border-rose/30 bg-rose/10 text-rose',
}

const importanceTone: Record<string, string> = {
  critical: 'border-rose/30 bg-rose/10 text-rose',
  high: 'border-amber/30 bg-amber/10 text-amber',
  medium: 'border-cyan/30 bg-cyan/10 text-cyan',
  low: 'border-fade/20 bg-dust/10 text-fade',
}

const signalFilters = ['all', 'breaking', 'deprecation', 'migration', 'security'] as const
type SignalFilter = (typeof signalFilters)[number]

export async function generateStaticParams() {
  const stacks = await getPublicStackSlugs()
  return stacks.map((stack) => ({ slug: stack.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const data = await getPublicStackPage(slug)

  if (!data) {
    return {
      title: 'Stack not found',
      robots: { index: false, follow: false },
    }
  }

  const title = `${data.tech.name} release notes, breaking changes, and upgrade notes`
  const description = `Track ${data.tech.name} releases with AI-distilled summaries, breaking changes, deprecations, migration notes, and source links.`
  const canonical = `/stacks/${data.tech.slug}`

  return {
    title,
    description,
    alternates: {
      canonical,
      types: { 'application/rss+xml': `${canonical}/rss.xml` },
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'StackPulse',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function StackPage({ params, searchParams }: Props) {
  const { slug } = await params
  const query = await searchParams
  const signalFilter = parseSignalFilter(query?.signal)
  const data = await getPublicStackPage(slug)

  if (!data) notFound()

  const filteredReleases =
    signalFilter === 'all'
      ? data.releases
      : data.releases.filter((release) => release.releaseSignals.includes(signalFilter))
  const pageUrl = `${appUrl}/stacks/${data.tech.slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${data.tech.name} release notes and upgrade notes`,
    url: pageUrl,
    description: `Latest ${data.tech.name} releases with breaking changes, deprecations, migration notes, and source links.`,
    about: {
      '@type': 'SoftwareSourceCode',
      name: data.tech.name,
      codeRepository: data.tech.githubRepoUrl,
    },
    mainEntity: data.releases.slice(0, 10).map((release) => ({
      '@type': 'CreativeWork',
      name: release.title || `${data.tech.name} ${release.version}`,
      url: release.rawReleaseUrl || pageUrl,
      datePublished: release.publishedAt?.toISOString(),
      description: release.summary || undefined,
    })),
  }

  return (
    <div className="relative flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
          <span>stacks/{data.tech.slug}</span>
          {data.tech.category && (
            <>
              <span className="text-mute">/</span>
              <span>{data.tech.category}</span>
            </>
          )}
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <h1 className="font-mono text-3xl font-bold tracking-tight text-ink sm:text-5xl">
              {data.tech.name} release notes, breaking changes, and upgrade notes
              <span className="text-lime">.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-dust">
              {data.tech.description || `Follow ${data.tech.name} releases from GitHub.`} StackPulse
              turns upstream changelogs into scannable summaries with risky changes, deprecations,
              migration notes, and source links.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 font-mono text-[12px]">
              <a
                href={data.tech.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-ruling bg-shade px-3 py-2 text-dust transition-colors hover:border-lime hover:text-lime"
              >
                <Link01Icon className="h-3.5 w-3.5" />
                source repo
              </a>
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-md bg-lime px-3 py-2 font-semibold text-void transition-colors hover:bg-lime/85"
              >
                <span className="text-void/60">$</span>
                <span>track this stack</span>
              </Link>
              <Link
                href={`/stacks/${data.tech.slug}/upgrade`}
                className="inline-flex items-center gap-1.5 rounded-md border border-ruling bg-shade px-3 py-2 text-dust transition-colors hover:border-lime hover:text-lime"
              >
                <ArrowUp01Icon className="h-3.5 w-3.5" />
                plan upgrade
              </Link>
              <a
                href={`/stacks/${data.tech.slug}/rss.xml`}
                className="inline-flex items-center gap-1.5 rounded-md border border-ruling bg-shade px-3 py-2 text-dust transition-colors hover:border-lime hover:text-lime"
              >
                <RssIcon className="h-3.5 w-3.5" />
                rss
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
            <Stat label="releases" value={data.stats.releases} tone="ink" />
            <Stat label="breaking" value={data.stats.breaking} tone="rose" />
            <Stat label="security" value={data.stats.security} tone="rose" />
            <Stat label="deprecated" value={data.stats.deprecations} tone="amber" />
            <Stat label="migrations" value={data.stats.migrations} tone="cyan" />
          </div>
          <DigestSignupForm stackSlug={data.tech.slug} source={`stack:${data.tech.slug}`} />
        </div>

        <section className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          <SeoBlock
            label="what stackpulse tracks"
            title={`${data.tech.name} releases from GitHub`}
            body={`StackPulse watches ${data.tech.name} release notes and keeps the original source link close to every summary.`}
          />
          <SeoBlock
            label="upgrade risk"
            title="Breaking changes and deprecations"
            body="Risky changes are separated from normal feature notes so you can scan upgrade impact before changing production dependencies."
          />
          <SeoBlock
            label="migration notes"
            title="Source-backed next steps"
            body="Migration steps and recommended actions are only shown when the upstream release notes support them."
          />
        </section>

        <section className="mt-16" aria-labelledby="latest-releases">
          <div className="flex items-center gap-4">
            <h2
              id="latest-releases"
              className="font-mono text-[11px] uppercase tracking-[0.25em] text-fade"
            >
              # latest_releases
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">source-backed</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px]">
            {signalFilters.map((signal) => (
              <Link
                key={signal}
                href={
                  signal === 'all'
                    ? `/stacks/${data.tech.slug}`
                    : `/stacks/${data.tech.slug}?signal=${signal}`
                }
                className={`rounded-md border px-3 py-1.5 transition-colors ${
                  signalFilter === signal
                    ? 'border-lime bg-lime-dim text-lime'
                    : 'border-ruling bg-shade text-fade hover:border-edge hover:text-ink'
                }`}
              >
                {signal}
              </Link>
            ))}
          </div>

          {data.releases.length === 0 ? (
            <div className="mt-10 frame p-8 text-center">
              <p className="font-mono text-[13px] text-dust">
                no releases have been indexed for this stack yet.
              </p>
              <p className="mt-1 font-mono text-[11px] text-fade">
                follow it from the dashboard to start collecting release notes.
              </p>
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="mt-10 frame p-8 text-center">
              <p className="font-mono text-[13px] text-dust">
                no releases match the {signalFilter} filter.
              </p>
              <p className="mt-1 font-mono text-[11px] text-fade">
                try viewing all indexed releases for this stack.
              </p>
            </div>
          ) : (
            <div className="mt-10 space-y-6">
              {filteredReleases.map((release) => (
                <ReleaseArticle key={release.id} release={release} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function parseSignalFilter(value: string | string[] | undefined): SignalFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return signalFilters.includes(raw as SignalFilter) ? (raw as SignalFilter) : 'all'
}

function SeoBlock({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <article className="bg-shade p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">{label}</p>
      <h2 className="mt-4 font-mono text-lg font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-3 text-[14px] leading-relaxed text-dust">{body}</p>
    </article>
  )
}

function ReleaseArticle({ release }: { release: PublicStackRelease }) {
  const importance = release.importanceLevel || 'medium'
  const visibleSignals = release.releaseSignals.filter((signal) => signal in signalTone)
  const hasReleaseSignals = Boolean(
    release.securityNotes?.length ||
    release.breakingChanges?.length ||
    release.deprecations?.length ||
    release.newFeatures?.length,
  )

  return (
    <article className="frame overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 font-mono text-[12px]">
        <span className="text-amber">{release.version}</span>
        <span
          className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${importanceTone[importance] || importanceTone.medium}`}
        >
          {importance}
        </span>
        {visibleSignals.map((signal) => (
          <span
            key={signal}
            className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${signalTone[signal]}`}
          >
            {signal}
          </span>
        ))}
        {release.isPrerelease && (
          <span className="rounded-[3px] border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet">
            prerelease
          </span>
        )}
        {release.publishedAt && (
          <span className="ml-auto text-fade">{formatDate(release.publishedAt)}</span>
        )}
      </div>

      <div className="px-5 py-5">
        <h3 className="font-mono text-xl font-semibold tracking-tight text-ink">
          {release.title || release.version}
        </h3>

        {release.summary && (
          <p className="mt-2.5 text-[14px] leading-relaxed text-dust">{release.summary}</p>
        )}

        {(release.impactSummary || release.recommendedAction) && (
          <div className="mt-5 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
            {release.impactSummary && (
              <InfoBlock label="affected" tone="cyan" body={release.impactSummary} />
            )}
            {release.recommendedAction && (
              <InfoBlock label="action" tone="lime" body={release.recommendedAction} />
            )}
          </div>
        )}

        {hasReleaseSignals && (
          <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
            <div className="border-b border-line px-3 py-2 font-mono text-[10px] text-fade">
              release_signals
            </div>
            <div className="font-mono text-[12.5px] leading-[1.7]">
              {release.breakingChanges?.map((change) => (
                <SignalLine key={`b-${change}`} prefix="-" tone="rose" text={change} />
              ))}
              {release.securityNotes?.map((note) => (
                <SignalLine key={`s-${note}`} prefix="!" tone="rose" text={note} />
              ))}
              {release.deprecations?.map((deprecation) => (
                <SignalLine key={`d-${deprecation}`} prefix="!" tone="amber" text={deprecation} />
              ))}
              {release.newFeatures?.map((feature) => (
                <SignalLine key={`f-${feature}`} prefix="+" tone="emerald" text={feature} />
              ))}
            </div>
          </div>
        )}

        {release.migrationSteps?.length ? (
          <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-[10px] text-fade">
              <span>migration_steps</span>
              <span>{release.migrationSteps.length} steps</span>
            </div>
            <ol className="font-mono text-[12.5px] leading-[1.7]">
              {release.migrationSteps.map((step, index) => (
                <li key={step} className="flex gap-3 px-3 py-1.5">
                  <span className="select-none text-cyan">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-ink">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {release.rawReleaseUrl && (
          <a
            href={release.rawReleaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] text-fade transition-colors hover:text-lime"
          >
            <Link01Icon className="h-3 w-3" />
            view source on github
            <span className="text-mute">-&gt;</span>
          </a>
        )}
      </div>
    </article>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ink' | 'rose' | 'amber' | 'cyan'
}) {
  const toneClass =
    tone === 'rose'
      ? 'text-rose'
      : tone === 'amber'
        ? 'text-amber'
        : tone === 'cyan'
          ? 'text-cyan'
          : 'text-ink'

  return (
    <div className="bg-shade px-4 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fade">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}

function InfoBlock({ label, body, tone }: { label: string; body: string; tone: 'cyan' | 'lime' }) {
  return (
    <div className="bg-void px-3 py-3">
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${
          tone === 'cyan' ? 'text-cyan' : 'text-lime'
        }`}
      >
        {label}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-dust">{body}</p>
    </div>
  )
}

function SignalLine({
  prefix,
  tone,
  text,
}: {
  prefix: string
  tone: 'rose' | 'amber' | 'emerald'
  text: string
}) {
  const toneClass =
    tone === 'rose'
      ? 'border-rose bg-rose/[0.04] text-rose'
      : tone === 'amber'
        ? 'border-amber bg-amber/[0.04] text-amber'
        : 'border-emerald bg-emerald/[0.04] text-emerald'

  return (
    <div className={`flex gap-3 border-l-2 px-3 py-1 ${toneClass}`}>
      <span className="shrink-0 select-none">{prefix}</span>
      <span className="text-ink">{text}</span>
    </div>
  )
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
