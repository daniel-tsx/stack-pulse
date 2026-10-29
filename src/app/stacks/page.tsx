import type { Metadata } from 'next'
import Link from 'next/link'
import { Link01Icon } from 'hugeicons-react'

import { DigestSignupForm } from '@/components/landing/digest-signup-form'
import { FileCard, PageIntro, StatGrid } from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { getPublicStackIndex, type PublicStackIndexItem } from '@/lib/public-stacks'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  title: 'Framework release notes, breaking changes, and upgrade notes',
  description:
    'Browse tracked developer stacks with GitHub release notes, breaking changes, deprecations, migration notes, and source links.',
  alternates: {
    canonical: '/stacks',
  },
  openGraph: {
    title: 'Framework release notes, breaking changes, and upgrade notes',
    description:
      'Browse tracked developer stacks with GitHub release notes, breaking changes, deprecations, migration notes, and source links.',
    url: '/stacks',
    siteName: 'StackPulse',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Framework release notes, breaking changes, and upgrade notes',
    description:
      'Browse tracked developer stacks with GitHub release notes, breaking changes, deprecations, migration notes, and source links.',
  },
}

export default async function StacksPage() {
  const stacks = await getPublicStackIndex()
  const activeStacks = stacks.filter((stack) => stack.releases > 0).length
  const totalReleases = stacks.reduce((sum, stack) => sum + stack.releases, 0)
  const totalSecurity = stacks.reduce((sum, stack) => sum + stack.security, 0)
  const totalMigrations = stacks.reduce((sum, stack) => sum + stack.migrations, 0)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Framework release notes, breaking changes, and upgrade notes',
    url: `${appUrl}/stacks`,
    description:
      'Tracked developer stacks with GitHub release notes, breaking changes, deprecations, migration notes, and source links.',
    mainEntity: stacks.map((stack) => ({
      '@type': 'SoftwareSourceCode',
      name: stack.name,
      url: `${appUrl}/stacks/${stack.slug}`,
      codeRepository: stack.githubRepoUrl,
      description: stack.description || undefined,
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
          path={[{ label: 'stackpulse', href: '/' }, { label: 'stacks' }]}
          state={{ label: `${stacks.length} tracked`, tone: 'open' }}
          title="Framework release notes, breaking changes, and upgrade notes"
          lede="Browse AI-distilled GitHub release feeds for common developer stacks. Each stack page collects source-linked release notes, risky changes, deprecations, and migration signals from the projects developers ship with."
          aside={
            <div className="grid gap-4">
              <FileCard path="stacks/summary">
                <StatGrid
                  stats={[
                    { label: 'active', value: activeStacks, tone: 'lime' },
                    { label: 'releases', value: totalReleases },
                    { label: 'security', value: totalSecurity, tone: 'rose' },
                    { label: 'migrations', value: totalMigrations, tone: 'cyan' },
                  ]}
                />
              </FileCard>
              <DigestSignupForm source="stacks:index" />
            </div>
          }
        />

        <section className="mt-16" aria-labelledby="stack-directory">
          <h2
            id="stack-directory"
            className="flex items-center gap-3 font-mono text-[19px] font-semibold tracking-[-0.02em] text-ink"
          >
            Stack directory
            <span className="rounded-full bg-lift px-2 font-mono text-[12px] font-normal text-dust">
              {stacks.length}
            </span>
          </h2>

          <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stacks.map((stack) => (
              <li key={stack.id} className="min-w-0">
                <StackCard stack={stack} />
              </li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function StackCard({ stack }: { stack: PublicStackIndexItem }) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-shade transition-colors hover:border-edge">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px]">
        <span className="min-w-0 truncate text-ink">stacks/{stack.slug}</span>
        <span className="shrink-0 text-dust">{stack.category || 'stack'}</span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <h3 className="font-mono text-[19px] font-semibold tracking-[-0.02em] text-ink">
          <Link
            href={`/stacks/${stack.slug}`}
            className="after:absolute after:inset-0 after:content-[''] group-hover:text-lime"
          >
            {stack.name}
          </Link>
        </h3>

        <p className="mt-2 flex-1 text-[14px] leading-relaxed text-dust">
          {stack.description ||
            `Track ${stack.name} releases, breaking changes, and upgrade notes.`}
        </p>

        <dl className="mt-5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
          <div className="flex gap-1.5">
            <dt className="text-dust">releases</dt>
            <dd className="tabular-nums text-ink">{stack.releases}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-dust">security</dt>
            <dd
              className={stack.security > 0 ? 'tabular-nums text-rose' : 'tabular-nums text-dust'}
            >
              {stack.security}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-dust">migrations</dt>
            <dd
              className={stack.migrations > 0 ? 'tabular-nums text-cyan' : 'tabular-nums text-dust'}
            >
              {stack.migrations}
            </dd>
          </div>
        </dl>

        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 font-mono text-[12px] text-dust">
          <a
            href={stack.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-lime"
          >
            <Link01Icon aria-hidden="true" className="size-3" />
            repo ↗
          </a>
          <span>
            {stack.latestPublishedAt
              ? `latest ${formatDate(stack.latestPublishedAt)}`
              : 'no releases yet'}
          </span>
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
