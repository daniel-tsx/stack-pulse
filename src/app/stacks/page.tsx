import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight01Icon, Link01Icon } from 'hugeicons-react'

import { DigestSignupForm } from '@/components/landing/digest-signup-form'
import { Logo } from '@/components/logo'
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

      <header className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between relative z-20 border-b border-line/60">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <nav className="flex items-center gap-4 font-mono text-[11px] text-fade">
          <Link href="/" className="hover:text-dust transition-colors">
            home
          </Link>
          <Link href="/sign-in" className="text-lime hover:underline">
            track stack
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-14">
        <div className="font-mono text-[11px] text-fade tracking-[0.2em] uppercase flex flex-wrap items-center gap-3">
          <span className="text-lime">§</span>
          <span>stacks</span>
          <span className="text-mute">·</span>
          <span>{stacks.length} tracked</span>
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_360px] lg:items-start">
          <div>
            <h1 className="font-mono text-3xl font-bold tracking-tight text-ink sm:text-5xl">
              Framework release notes, breaking changes, and upgrade notes
              <span className="text-lime">.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-dust">
              Browse AI-distilled GitHub release feeds for common developer stacks. Each stack page
              collects source-linked release notes, risky changes, deprecations, and migration
              signals from the projects developers ship with.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
            <Stat label="active" value={activeStacks} tone="lime" />
            <Stat label="releases" value={totalReleases} tone="ink" />
            <Stat label="security" value={totalSecurity} tone="rose" />
            <Stat label="migrations" value={totalMigrations} tone="cyan" />
          </div>
          <DigestSignupForm source="stacks:index" />
        </div>

        <section className="mt-16" aria-labelledby="stack-directory">
          <div className="flex items-center gap-4">
            <h2
              id="stack-directory"
              className="font-mono text-[11px] uppercase tracking-[0.25em] text-fade"
            >
              §&nbsp;stack_directory
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">github-backed</span>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2 xl:grid-cols-3">
            {stacks.map((stack) => (
              <StackCard key={stack.id} stack={stack} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function StackCard({ stack }: { stack: PublicStackIndexItem }) {
  return (
    <article className="bg-shade p-6 transition-colors hover:bg-lift">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-fade">
            {stack.category || 'stack'}
          </div>
          <h3 className="mt-3 font-mono text-xl font-semibold tracking-tight text-ink">
            {stack.name}
          </h3>
        </div>
        <Link
          href={`/stacks/${stack.slug}`}
          aria-label={`Open ${stack.name} release notes`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ruling text-fade transition-colors hover:border-lime hover:text-lime"
        >
          <ArrowRight01Icon className="h-4 w-4" />
        </Link>
      </div>

      <p className="mt-3 min-h-[3.5rem] text-[14px] leading-relaxed text-dust">
        {stack.description || `Track ${stack.name} releases, breaking changes, and upgrade notes.`}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
        <MiniStat label="releases" value={stack.releases} tone="ink" />
        <MiniStat label="security" value={stack.security} tone="rose" />
        <MiniStat label="migrations" value={stack.migrations} tone="cyan" />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px]">
        <a
          href={stack.githubRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-fade transition-colors hover:text-lime"
        >
          <Link01Icon className="h-3 w-3" />
          repo
          <span className="text-mute">↗</span>
        </a>
        <span className="text-fade">
          {stack.latestPublishedAt
            ? `latest ${formatDate(stack.latestPublishedAt)}`
            : 'no releases yet'}
        </span>
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
  tone: 'ink' | 'lime' | 'rose' | 'cyan'
}) {
  const toneClass =
    tone === 'lime'
      ? 'text-lime'
      : tone === 'rose'
        ? 'text-rose'
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

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ink' | 'rose' | 'cyan'
}) {
  const toneClass = tone === 'rose' ? 'text-rose' : tone === 'cyan' ? 'text-cyan' : 'text-ink'

  return (
    <div className="bg-void px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-fade">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${toneClass}`}>{value}</div>
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
