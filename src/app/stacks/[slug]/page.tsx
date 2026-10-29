import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUp01Icon, GitCompareIcon, Link01Icon, RssIcon } from 'hugeicons-react'

import { DigestSignupForm } from '@/components/landing/digest-signup-form'
import { ReleaseNotes } from '@/components/releases/release-notes'
import {
  Badge,
  CardNote,
  FileCard,
  PageIntro,
  ReviewComment,
  StatGrid,
  button,
  cx,
} from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
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

const visibleSignals = new Set(['breaking', 'deprecation', 'migration', 'feature', 'security'])

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

      <SiteHeader active="stacks" />

      <main className="relative z-10 mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-14">
        <PageIntro
          path={[
            { label: 'stackpulse', href: '/' },
            { label: 'stacks', href: '/stacks' },
            { label: data.tech.slug },
          ]}
          state={data.tech.category ? { label: data.tech.category, tone: 'neutral' } : undefined}
          title={`${data.tech.name} release notes, breaking changes, and upgrade notes`}
          lede={
            <>
              {withFullStop(
                data.tech.description || `Follow ${data.tech.name} releases from GitHub`,
              )}{' '}
              StackPulse turns upstream changelogs into scannable summaries with risky changes,
              deprecations, migration notes, and source links.
            </>
          }
          actions={
            <>
              <Link href="/sign-in" className={button.primary}>
                Track this stack
              </Link>
              <Link href={`/stacks/${data.tech.slug}/upgrade`} className={button.secondary}>
                <ArrowUp01Icon aria-hidden="true" className="size-3.5" />
                Plan an upgrade
              </Link>
              <a
                href={data.tech.githubRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={button.ghost}
              >
                <Link01Icon aria-hidden="true" className="size-3.5" />
                Source repo
              </a>
              <a href={`/stacks/${data.tech.slug}/rss.xml`} className={button.ghost}>
                <RssIcon aria-hidden="true" className="size-3.5" />
                RSS
              </a>
            </>
          }
          aside={
            <div className="grid gap-4">
              <FileCard path={`stacks/${data.tech.slug}/summary`}>
                <StatGrid
                  stats={[
                    { label: 'releases', value: data.stats.releases },
                    { label: 'breaking', value: data.stats.breaking, tone: 'rose' },
                    { label: 'security', value: data.stats.security, tone: 'rose' },
                    { label: 'deprecated', value: data.stats.deprecations, tone: 'amber' },
                    { label: 'migrations', value: data.stats.migrations, tone: 'cyan' },
                  ]}
                />
              </FileCard>
              <DigestSignupForm stackSlug={data.tech.slug} source={`stack:${data.tech.slug}`} />
            </div>
          }
        />

        <FileCard path={`stacks/${data.tech.slug}/README.md`} meta="what you get" className="mt-14">
          <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-3">
            <ReviewComment tone="feature" label="tracking" action="tracks">
              <strong className="font-semibold">{data.tech.name} releases from GitHub.</strong>{' '}
              <span className="text-dust">
                StackPulse watches {data.tech.name} release notes and keeps the original source link
                close to every summary.
              </span>
            </ReviewComment>
            <ReviewComment tone="breaking" label="upgrade risk" action="flags">
              <strong className="font-semibold">Breaking changes and deprecations.</strong>{' '}
              <span className="text-dust">
                Risky changes are separated from normal feature notes so you can scan upgrade impact
                before changing production dependencies.
              </span>
            </ReviewComment>
            <ReviewComment tone="migration" label="migration notes" action="adds">
              <strong className="font-semibold">Source-backed next steps.</strong>{' '}
              <span className="text-dust">
                Migration steps and recommended actions are only shown when the upstream release
                notes support them.
              </span>
            </ReviewComment>
          </div>
        </FileCard>

        <section className="mt-14" aria-labelledby="latest-releases">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2
              id="latest-releases"
              className="flex items-center gap-3 font-mono text-[19px] font-semibold tracking-[-0.02em] text-ink"
            >
              Latest releases
              <span className="rounded-full bg-lift px-2 text-[12px] font-normal text-dust">
                {filteredReleases.length}
              </span>
            </h2>
            <nav
              aria-label="Filter releases by signal"
              className="flex flex-wrap gap-1.5 font-mono text-[12px]"
            >
              {signalFilters.map((signal) => (
                <Link
                  key={signal}
                  href={
                    signal === 'all'
                      ? `/stacks/${data.tech.slug}`
                      : `/stacks/${data.tech.slug}?signal=${signal}`
                  }
                  aria-current={signalFilter === signal ? 'page' : undefined}
                  className={cx(
                    'rounded-full border px-3 py-1 transition-colors',
                    signalFilter === signal
                      ? 'border-lime/50 bg-lime-dim text-ink'
                      : 'border-ruling text-dust hover:border-edge hover:text-ink',
                  )}
                >
                  {signal}
                </Link>
              ))}
            </nav>
          </div>

          {data.releases.length === 0 ? (
            <FileCard path={`stacks/${data.tech.slug}/releases`} className="mt-6">
              <CardNote title="No releases indexed yet.">
                Follow this stack from the dashboard to start collecting its release notes. New
                releases are fetched at 00:00 and 12:00 UTC.
              </CardNote>
            </FileCard>
          ) : filteredReleases.length === 0 ? (
            <FileCard
              path={`stacks/${data.tech.slug}/releases?signal=${signalFilter}`}
              className="mt-6"
            >
              <CardNote title={`No releases match the ${signalFilter} filter.`}>
                <Link
                  href={`/stacks/${data.tech.slug}`}
                  className="text-lime underline-offset-4 hover:underline"
                >
                  View all indexed releases
                </Link>
              </CardNote>
            </FileCard>
          ) : (
            <div className="mt-6 grid gap-5">
              {filteredReleases.map((release) => (
                <ReleaseArticle key={release.id} release={release} techSlug={data.tech.slug} />
              ))}
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function withFullStop(text: string) {
  return /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`
}

function parseSignalFilter(value: string | string[] | undefined): SignalFilter {
  const raw = Array.isArray(value) ? value[0] : value
  return signalFilters.includes(raw as SignalFilter) ? (raw as SignalFilter) : 'all'
}

function ReleaseArticle({ release, techSlug }: { release: PublicStackRelease; techSlug: string }) {
  const importance = release.importanceLevel || 'medium'
  const signals = release.releaseSignals.filter((signal) => visibleSignals.has(signal))

  return (
    <article className="min-w-0 overflow-clip rounded-xl border border-line bg-shade">
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px]">
        <span className="text-amber">{release.version}</span>
        <Badge tone={importance}>{importance}</Badge>
        {signals.map((signal) => (
          <Badge key={signal} tone={signal}>
            {signal}
          </Badge>
        ))}
        {release.isPrerelease && <Badge tone="prerelease">prerelease</Badge>}
        {release.publishedAt && (
          <time dateTime={release.publishedAt.toISOString()} className="ml-auto text-dust">
            {formatDate(release.publishedAt)}
          </time>
        )}
      </div>

      <div className="px-5 py-5">
        <h3 className="break-words font-mono text-[19px] font-semibold tracking-[-0.02em] text-ink">
          {release.title || release.version}
        </h3>

        <ReleaseNotes release={release} />

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-[12px]">
          <Link
            href={`/stacks/${techSlug}/releases/${release.id}`}
            className="inline-flex items-center gap-1.5 text-lime underline-offset-4 hover:underline"
          >
            <GitCompareIcon aria-hidden="true" className="size-3.5" />
            Review this release
          </Link>
          {release.rawReleaseUrl && (
            <a
              href={release.rawReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-dust transition-colors hover:text-lime"
            >
              <Link01Icon aria-hidden="true" className="size-3" />
              Source on GitHub ↗
            </a>
          )}
        </div>
      </div>
    </article>
  )
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}
