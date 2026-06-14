import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuth } from '@/lib/auth'
import { headers } from 'next/headers'
import {
  ReactIcon,
  TailwindcssIcon,
  Typescript03Icon,
  Database02Icon,
  SourceCodeIcon,
  ZapIcon,
  ShadcnIcon,
  ServerStack01Icon,
  RocketIcon,
  Package01Icon,
  Atom01Icon,
  Flag03Icon,
} from 'hugeicons-react'
import { Logo } from '@/components/logo'
import { DigestSignupForm } from '@/components/landing/digest-signup-form'
import { StackPulseHero } from '@/components/stack-pulse-hero'
import { getLandingStats } from '@/lib/landing-stats'

const steps = [
  {
    n: '01',
    cmd: 'stack add <tool>',
    title: 'pick your stack',
    body: 'Paste your package.json and follow your whole stack in one click, choose from 90+ registry stacks, or add any GitHub repo URL.',
  },
  {
    n: '02',
    cmd: 'pulse --watch',
    title: 'we watch the releases',
    body: 'Every new GitHub release for your stack is fetched twice a day, parsed, and run through an AI summariser tuned for changelogs and migration notes.',
  },
  {
    n: '03',
    cmd: 'feed --read',
    title: 'review upgrade risk',
    body: 'Read one feed with breaking changes, deprecations, new APIs, and source links called out before you update production dependencies.',
  },
]

const trackedStacks = [
  { name: 'react', slug: 'react', icon: ReactIcon },
  { name: 'next', slug: 'nextjs', icon: SourceCodeIcon },
  { name: 'tailwind', slug: 'tailwindcss', icon: TailwindcssIcon },
  { name: 'shadcn', slug: 'shadcn-ui', icon: ShadcnIcon },
  { name: 'typescript', slug: 'typescript', icon: Typescript03Icon },
  { name: 'drizzle', slug: 'drizzle-orm', icon: Database02Icon },
  { name: 'remix', slug: 'remix', icon: ServerStack01Icon },
  { name: 'astro', slug: 'astro', icon: RocketIcon },
  { name: 'vite', slug: 'vite', icon: ZapIcon },
  { name: 'bun', slug: 'bun', icon: Package01Icon },
  { name: 'svelte', slug: 'svelte', icon: Flag03Icon },
  { name: 'solid', slug: 'solidjs', icon: Atom01Icon },
]

const releaseSignals = [
  {
    label: 'breaking changes',
    title: 'Find the release notes that can break production.',
    body: 'StackPulse highlights risky changes from upstream changelogs so you can scan the impact before bumping a framework, package, or tool.',
  },
  {
    label: 'deprecations',
    title: 'Catch deprecated APIs before they disappear.',
    body: 'Follow the libraries in your stack and surface removals, renamed options, and migration warnings in the same place as normal releases.',
  },
  {
    label: 'upgrade notes',
    title: 'Turn long changelogs into practical next steps.',
    body: 'Each digest keeps the important context close: what changed, why it matters, and where to read the original release before changing code.',
  },
]

const faqItems = [
  {
    question: 'What is StackPulse?',
    answer:
      'StackPulse is a free, open-source GitHub release tracker for developers. It watches the frameworks, libraries, and tools you choose, then turns release notes into AI-distilled digests.',
  },
  {
    question: 'Can StackPulse track breaking changes and deprecations?',
    answer:
      'Yes. StackPulse summarizes upstream release notes and calls out breaking changes, deprecations, migration notes, new APIs, and source links when those signals are present.',
  },
  {
    question: 'Which repositories can I follow?',
    answer:
      'The registry covers 90+ stacks — React, Next.js, Tailwind, Drizzle, Astro, Bun, Svelte, Vue, and more — and you can add any public GitHub repository on top.',
  },
  {
    question: 'Can my AI coding assistant use StackPulse?',
    answer:
      'Yes. StackPulse ships an MCP server, so Claude Code, Claude Desktop, Cursor, and other MCP clients can list stacks, read AI-distilled releases, search changelogs, and build upgrade plans directly from your editor.',
  },
]

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'StackPulse',
  url: appUrl,
  description:
    'Track GitHub releases for React, Next.js, Tailwind, Drizzle, and any other library. AI-summarised changelogs with breaking changes, deprecations, migration notes, and source links.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  browserRequirements: 'Requires modern browser with JavaScript enabled',
  keywords:
    'GitHub release tracker, breaking changes, deprecation tracker, upgrade notes, changelog summary, framework releases',
  featureList: [
    'Track public GitHub releases for selected repositories',
    'Summarise changelogs with AI',
    'Highlight breaking changes and deprecations',
    'Link every digest back to the source release',
  ],
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  author: {
    '@type': 'Person',
    name: 'Daniel',
    url: 'https://github.com/daniel-ctn',
  },
  creator: {
    '@type': 'Person',
    name: 'Daniel',
  },
  image: `${appUrl}/opengraph-image`,
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
}

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  })

  if (session) redirect('/dashboard')

  const stats = await getLandingStats()

  return (
    <div className="relative flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <header className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between relative z-20 border-b border-line/60">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size="md" />
        </Link>
        <nav className="flex items-center gap-2 font-mono text-[12px]">
          <span className="hidden sm:inline text-fade">v0.1.0</span>
          <span className="hidden sm:inline text-mute mx-2">·</span>
          <Link
            href="/stacks"
            className="hidden text-dust transition-colors hover:text-lime sm:inline"
          >
            stacks
          </Link>
          <Link
            href="/dashboard"
            className="hidden text-dust transition-colors hover:text-lime sm:inline"
          >
            public feed
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 rounded-md border border-ruling bg-shade px-3 py-1.5 text-ink hover:border-edge hover:bg-lift transition-colors"
          >
            <span className="text-lime">$</span>
            <span>continue with github</span>
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <StackPulseHero />

        {/* Live stats */}
        {stats && stats.releases > 0 && (
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line/60 py-3 font-mono text-[12px]">
              <span className="text-fade">$ stackpulse --stats</span>
              <span className="text-dust">
                <span className="font-semibold text-lime">{stats.releases.toLocaleString()}</span>{' '}
                releases distilled
              </span>
              <span className="text-dust">
                <span className="font-semibold text-rose">{stats.breaking.toLocaleString()}</span>{' '}
                with breaking changes
              </span>
              <span className="text-dust">
                <span className="font-semibold text-cyan">{stats.stacks.toLocaleString()}</span>{' '}
                stacks in registry
              </span>
            </div>
          </div>
        )}

        {/* Release signals */}
        <div className="mx-auto max-w-7xl px-6 mt-16 sm:mt-24">
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase">
              §&nbsp;release_intelligence
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">source-backed</span>
          </div>
        </div>

        <section
          aria-labelledby="release-intelligence"
          className="mx-auto max-w-7xl px-6 pt-10 pb-8"
        >
          <div className="max-w-3xl">
            <h2
              id="release-intelligence"
              className="font-mono text-2xl sm:text-4xl font-bold tracking-tight text-ink"
            >
              Release notes are easy to miss. Breaking changes are not.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-dust">
              StackPulse is built for developers who need to know when a framework release,
              dependency update, or package changelog contains work that can affect production code.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden">
            {releaseSignals.map((signal) => (
              <article
                key={signal.label}
                className="bg-shade p-7 lg:p-8 hover:bg-lift transition-colors"
              >
                <p className="font-mono text-[11px] text-lime tracking-[0.18em] uppercase">
                  {signal.label}
                </p>
                <h3 className="mt-5 font-mono text-[19px] font-semibold tracking-tight text-ink">
                  {signal.title}
                </h3>
                <p className="mt-3 text-[14px] text-dust leading-relaxed">{signal.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <div className="mx-auto max-w-7xl px-6 mt-16">
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase">
              §&nbsp;how_it_works
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">3 steps</span>
          </div>
        </div>

        <section aria-labelledby="how-it-works" className="mx-auto max-w-7xl px-6 pt-10 pb-24">
          <p className="sr-only" id="how-it-works">
            How StackPulse tracks GitHub releases and turns them into AI-summarised digests.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line rounded-lg overflow-hidden">
            {steps.map((s) => (
              <div
                key={s.n}
                className="group relative bg-shade p-7 lg:p-8 hover:bg-lift transition-colors"
              >
                <div className="flex items-center justify-between font-mono text-[11px] text-fade">
                  <span className="text-lime">{s.n}</span>
                  <span>step</span>
                </div>
                <div className="mt-6 font-mono text-[12px] text-dust">
                  <span className="text-fade">$ </span>
                  <span className="text-lime">{s.cmd.split(' ')[0]}</span>{' '}
                  <span>{s.cmd.split(' ').slice(1).join(' ')}</span>
                </div>
                <h3 className="mt-4 font-mono text-[20px] font-semibold tracking-tight text-ink lowercase">
                  {s.title}
                </h3>
                <p className="mt-3 text-[14px] text-dust leading-relaxed">{s.body}</p>
                <div className="mt-8 h-px w-8 bg-ruling group-hover:bg-lime group-hover:w-14 transition-all duration-300" />
              </div>
            ))}
          </div>
        </section>

        {/* Tracked stacks */}
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-4">
            <h2 className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase">
              §&nbsp;tracked_stacks
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">+ custom repos</span>
          </div>
        </div>

        <section aria-labelledby="tracked-stacks" className="mx-auto max-w-7xl px-6 pt-10 pb-24">
          <p className="sr-only" id="tracked-stacks">
            Frameworks and libraries StackPulse tracks out of the box, plus support for any custom
            GitHub repository.
          </p>
          <div className="frame overflow-hidden">
            <div className="frame-titlebar">
              <span className="win-dots">
                <span style={{ background: '#fb7185' }} />
                <span style={{ background: '#fbbf24' }} />
                <span style={{ background: '#34d399' }} />
              </span>
              <span className="text-dust">~/registry.json</span>
              <span className="ml-auto text-mute">90+ stacks in registry</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line">
              {trackedStacks.map(({ name, slug, icon: Icon }) => (
                <Link
                  key={name}
                  href={`/stacks/${slug}`}
                  className="bg-shade hover:bg-lift transition-colors px-4 py-5 flex items-center gap-3 group"
                >
                  <Icon
                    aria-hidden="true"
                    className="w-5 h-5 text-dust group-hover:text-lime transition-colors"
                  />
                  <span className="font-mono text-[13px] text-ink">{name}</span>
                </Link>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-line font-mono text-[11px] text-fade flex items-center justify-between">
              <span>missing one? add any github repo from onboarding</span>
              <Link href="/sign-in" className="text-lime hover:underline">
                add custom →
              </Link>
            </div>
          </div>
        </section>

        {/* CTA bar */}
        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="frame relative overflow-hidden p-8 sm:p-12 text-center">
            <div className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase mb-4">
              ready?
            </div>
            <h2 className="font-mono text-3xl sm:text-5xl font-bold tracking-tight text-ink">
              stop missing upgrade work.
            </h2>
            <p className="mt-3 text-dust">
              Free, open-source, no paywall. Sign in with GitHub and start tracking framework
              releases, breaking changes, and deprecation notes in under a minute.
            </p>
            <Link
              href="/dashboard"
              className="mt-7 inline-flex items-center gap-2 rounded-md bg-lime px-5 py-3 font-mono text-[13px] font-semibold text-void hover:bg-lime/85 transition-colors"
            >
              <span className="text-void/60">$</span>
              <span>./browse-public-feed</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/sign-in"
              className="ml-0 mt-3 inline-flex items-center gap-2 rounded-md border border-ruling bg-shade px-5 py-3 font-mono text-[13px] font-semibold text-ink hover:border-edge hover:bg-lift transition-colors sm:ml-3"
            >
              <span className="text-lime">$</span>
              <span>./track-my-stack</span>
            </Link>
            <div className="mx-auto mt-8 max-w-xl text-left">
              <DigestSignupForm source="landing" />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-7xl px-6 pb-24" aria-labelledby="faq">
          <div className="flex items-center gap-4">
            <h2 id="faq" className="font-mono text-[11px] text-fade tracking-[0.25em] uppercase">
              §&nbsp;faq
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-mute">searchable answers</span>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line">
            {faqItems.map((item) => (
              <article key={item.question} className="bg-shade p-6 sm:p-7">
                <h3 className="font-mono text-[16px] font-semibold text-ink">{item.question}</h3>
                <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-dust">
                  {item.answer}
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-7xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-fade">
            <Logo size="sm" />
            <div className="flex flex-col items-center gap-1.5 text-center">
              <p className="tracking-widest">
                {'// built for developers, by a '}
                <a
                  href="https://daniel-tsx.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lime hover:text-ink transition-colors"
                >
                  developer
                </a>
              </p>
              <p className="tracking-widest">
                {'From the '}
                <a
                  href="https://eastbase.studio"
                  target="_blank"
                  rel="noopener"
                  className="rounded-xs text-lime outline-none transition-colors hover:text-ink focus-visible:ring-1 focus-visible:ring-lime"
                >
                  Eastbase
                </a>
                {' studio'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/status" className="hover:text-ink transition-colors">
                status
              </Link>
              <Link href="/privacy" className="hover:text-ink transition-colors">
                privacy
              </Link>
              <Link href="/terms" className="hover:text-ink transition-colors">
                terms
              </Link>
              <a
                href="https://github.com/daniel-ctn/stack-pulse"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink transition-colors"
              >
                source ↗
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
