import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft01Icon, Link01Icon } from 'hugeicons-react'

import { Logo } from '@/components/logo'
import { ReleaseAuth } from '@/components/releases/release-auth'
import { ReleaseNotes } from '@/components/releases/release-notes'
import { ReleaseVote } from '@/components/releases/release-vote'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { getPublicRelease } from '@/lib/public-releases'

type Props = { params: Promise<{ slug: string; releaseId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, releaseId } = await params
  const data = await getPublicRelease(slug, releaseId)
  if (!data) return { title: 'Release not found', robots: { index: false, follow: false } }

  const { tech, release } = data
  const title = `${tech.name} ${release.version}${release.title && release.title !== release.version ? ` — ${release.title}` : ''}`
  const description = (
    release.summary ||
    release.impactSummary ||
    `Release notes and upgrade guidance for ${tech.name} ${release.version}.`
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  const canonical = `/stacks/${tech.slug}/releases/${release.id}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'StackPulse',
      type: 'article',
      publishedTime: release.publishedAt?.toISOString(),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function ReleasePage({ params }: Props) {
  const { slug, releaseId } = await params
  const data = await getPublicRelease(slug, releaseId)
  if (!data) notFound()
  const { tech, release } = data
  const returnPath = `/stacks/${tech.slug}/releases/${release.id}`

  return (
    <div className="relative flex-1">
      <header className="relative z-20 mx-auto flex h-14 max-w-5xl items-center justify-between border-b border-line/60 px-4 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Logo size="md" />
        </Link>
        <nav aria-label="Account and appearance" className="flex items-center gap-3 sm:gap-4">
          <ThemeSwitcher />
          <ReleaseAuth returnPath={returnPath} />
        </nav>
      </header>
      <main className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          href={`/stacks/${tech.slug}`}
          className="inline-flex items-center gap-2 font-mono text-[12px] text-dust transition-colors hover:text-lime"
        >
          <ArrowLeft01Icon className="h-3.5 w-3.5" aria-hidden="true" /> all {tech.name} releases
        </Link>
        <article className="mt-8 min-w-0">
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-dust">
            <span className="text-lime"># {tech.slug}/release</span>
            {release.publishedAt && (
              <time dateTime={release.publishedAt.toISOString()}>
                {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
                  release.publishedAt,
                )}
              </time>
            )}
          </div>
          <h1 className="mt-4 break-words font-mono text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
            {tech.name} <span className="text-amber">{release.version}</span>
          </h1>
          {release.title && release.title !== release.version && (
            <p className="mt-3 break-words font-mono text-lg text-dust">{release.title}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
            {release.importanceLevel && (
              <span className="rounded border border-ruling bg-shade px-2 py-1 text-ink">
                importance: {release.importanceLevel}
              </span>
            )}
            {release.releaseSignals.map((signal) => (
              <span
                key={signal}
                className="rounded border border-cyan/30 bg-cyan/10 px-2 py-1 text-cyan"
              >
                {signal}
              </span>
            ))}
            {release.isPrerelease && (
              <span className="rounded border border-violet/30 bg-violet/10 px-2 py-1 text-violet">
                prerelease
              </span>
            )}
          </div>
          <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
            <div className="frame min-w-0 break-words px-5 pb-5 pt-3 sm:px-6">
              <ReleaseNotes release={release} />
              {release.rawReleaseUrl && (
                <a
                  href={release.rawReleaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-2 font-mono text-[12px] text-lime hover:underline"
                >
                  <Link01Icon className="h-3.5 w-3.5" aria-hidden="true" /> view source on github{' '}
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {!release.summary &&
                !release.impactSummary &&
                !release.recommendedAction &&
                !release.releaseSignals.length &&
                !release.codeSnippet && (
                  <p className="mt-4 text-sm text-dust">
                    Detailed notes have not been indexed for this release yet.
                  </p>
                )}
            </div>
            <ReleaseVote releaseId={release.id} returnPath={returnPath} />
          </div>
        </article>
      </main>
    </div>
  )
}
