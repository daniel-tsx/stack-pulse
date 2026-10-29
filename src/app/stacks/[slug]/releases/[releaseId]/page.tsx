import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Link01Icon } from 'hugeicons-react'

import { ReleaseAuth } from '@/components/releases/release-auth'
import { ReleaseNotes } from '@/components/releases/release-notes'
import { ReleaseVote } from '@/components/releases/release-vote'
import { Badge, FileCard, PageIntro } from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
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
      <SiteHeader
        active="stacks"
        width="max-w-5xl"
        account={<ReleaseAuth returnPath={returnPath} />}
      />
      <main className="relative z-10 mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-14">
        <article className="min-w-0">
          <PageIntro
            path={[
              { label: 'stackpulse', href: '/' },
              { label: 'stacks', href: '/stacks' },
              { label: tech.slug, href: `/stacks/${tech.slug}` },
              { label: release.version },
            ]}
            state={release.isPrerelease ? { label: 'prerelease', tone: 'prerelease' } : undefined}
            title={
              <>
                {tech.name} <span className="text-amber">{release.version}</span>
              </>
            }
            lede={
              <>
                {release.title && release.title !== release.version && (
                  <p className="break-words font-mono text-[17px] text-ink">{release.title}</p>
                )}
                {release.publishedAt && (
                  <p className="mt-1 font-mono text-[13px]">
                    Published{' '}
                    <time dateTime={release.publishedAt.toISOString()}>
                      {new Intl.DateTimeFormat('en-US', {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      }).format(release.publishedAt)}
                    </time>
                  </p>
                )}
              </>
            }
          />
          <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
            <FileCard
              path={`${tech.slug}/${release.version}/review.md`}
              meta={
                <span className="flex flex-wrap items-center gap-1.5">
                  {release.importanceLevel && (
                    <Badge tone={release.importanceLevel}>{release.importanceLevel}</Badge>
                  )}
                  {release.releaseSignals.map((signal) => (
                    <Badge key={signal} tone={signal}>
                      {signal}
                    </Badge>
                  ))}
                </span>
              }
            >
              <div className="min-w-0 break-words px-5 pb-6 pt-2 sm:px-6">
                <ReleaseNotes release={release} />
                {release.rawReleaseUrl && (
                  <a
                    href={release.rawReleaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-2 font-mono text-[12px] text-lime underline-offset-4 hover:underline"
                  >
                    <Link01Icon className="h-3.5 w-3.5" aria-hidden="true" /> Source on GitHub{' '}
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
            </FileCard>
            <ReleaseVote releaseId={release.id} returnPath={returnPath} />
          </div>
        </article>
      </main>
      <SiteFooter width="max-w-5xl" />
    </div>
  )
}
