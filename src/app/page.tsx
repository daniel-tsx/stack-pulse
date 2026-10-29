import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GithubIcon } from 'hugeicons-react'

import { DigestSignupForm } from '@/components/landing/digest-signup-form'
import {
  Badge,
  Checks,
  DiffLine,
  DiffLines,
  FileCard,
  MergeBox,
  ReviewComment,
  button,
} from '@/components/review/review-ui'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { getAuth } from '@/lib/auth'
import { getLandingStats } from '@/lib/landing-stats'

const steps = [
  {
    title: 'Pick your stack',
    body: 'Paste your package.json and follow your whole stack in one click, choose from 90+ registry stacks, or add any GitHub repo URL.',
  },
  {
    title: 'StackPulse watches the releases',
    body: 'Every new GitHub release for your stack is fetched twice a day, parsed, and run through an AI summariser tuned for changelogs and migration notes.',
  },
  {
    title: 'Review the upgrade risk',
    body: 'Read one feed with breaking changes, deprecations, new APIs, and source links called out before you update production dependencies.',
  },
]

const trackedStacks = [
  { name: 'react', slug: 'react' },
  { name: 'next', slug: 'nextjs' },
  { name: 'tailwind', slug: 'tailwindcss' },
  { name: 'shadcn', slug: 'shadcn-ui' },
  { name: 'typescript', slug: 'typescript' },
  { name: 'drizzle', slug: 'drizzle-orm' },
  { name: 'remix', slug: 'remix' },
  { name: 'astro', slug: 'astro' },
  { name: 'vite', slug: 'vite' },
  { name: 'bun', slug: 'bun' },
  { name: 'svelte', slug: 'svelte' },
  { name: 'solid', slug: 'solidjs' },
]

const releaseSignals = [
  {
    tone: 'breaking',
    label: 'breaking changes',
    title: 'Find the release notes that can break production.',
    body: 'StackPulse highlights risky changes from upstream changelogs so you can scan the impact before bumping a framework, package, or tool.',
  },
  {
    tone: 'deprecation',
    label: 'deprecations',
    title: 'Catch deprecated APIs before they disappear.',
    body: 'Follow the libraries in your stack and surface removals, renamed options, and migration warnings in the same place as normal releases.',
  },
  {
    tone: 'migration',
    label: 'upgrade notes',
    title: 'Turn long changelogs into practical next steps.',
    body: 'Each digest keeps the important context close: what changed, why it matters, and where to read the original release before changing code.',
  },
]

const delivery = [
  {
    title: 'Weekly digest',
    body: 'One email on Mondays with what shipped in the stacks you follow.',
  },
  {
    title: 'Slack or Discord',
    body: 'Send new releases above an importance threshold to one webhook.',
  },
  {
    title: 'Ask about a release',
    body: 'Signed in, ask follow-up questions about a specific upgrade.',
  },
  {
    title: 'Public stack pages',
    body: 'Source-linked release history for every stack in the registry.',
  },
]

// Illustrative rows for the homepage review. Labelled "example" where they render.
const exampleReleases: { stack: string; version: string; signal: string; comment?: string }[] = [
  {
    stack: 'next',
    version: 'v16.2.6',
    signal: 'breaking',
    comment:
      'Migration impact highlighted. Read the summary and the source release before you bump.',
  },
  {
    stack: 'drizzle-orm',
    version: 'v0.45.2',
    signal: 'deprecation',
    comment: 'Deprecated options called out. Plan the replacement before the next major.',
  },
  { stack: 'tailwindcss', version: 'v4.0.0', signal: 'migration' },
  { stack: 'react', version: 'v19.2.0', signal: 'feature' },
  { stack: 'better-auth', version: 'v1.6.10', signal: 'feature' },
]

const files = [
  { id: 'feed', path: 'releases/since-last-read.diff', stat: '+5' },
  { id: 'how-it-works', path: 'how-it-works.sh', stat: '+6' },
  { id: 'signals', path: 'review/signals.md', stat: '3 comments' },
  { id: 'registry', path: 'registry.json', stat: '+12' },
  { id: 'mcp', path: '.mcp.json', stat: '+1' },
  { id: 'pricing', path: 'pricing.diff', stat: '+3' },
  { id: 'faq', path: 'FAQ.md', stat: '4 threads' },
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

// The session decides whether this route renders or redirects. Do not stream the public
// landing page to signed-in users while that decision is still pending.
export const instant = false

export default async function LandingPage() {
  const requestHeaders = await headers()
  const session = await getAuth().api.getSession({
    headers: requestHeaders,
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

      <SiteHeader active="home" />

      <main className="relative z-10">
        <section
          aria-labelledby="hero-title"
          className="mx-auto max-w-6xl px-5 pt-12 sm:px-6 sm:pt-20"
        >
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[12.5px] text-dust">
            <Badge tone="open">open</Badge>
            <span>
              <strong className="font-semibold text-ink">stackpulse</strong> wants to change how you
              upgrade
            </span>
          </p>

          <div className="mt-6 overflow-hidden rounded-xl border border-line bg-shade shadow-[var(--hero-shadow)]">
            <div className="flex items-center justify-between gap-4 border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px] text-dust">
              <span className="text-ink">your-week.md</span>
              <span>
                <span className="text-emerald">+1</span> <span className="text-rose">-1</span>
              </span>
            </div>
            <p
              aria-hidden="true"
              className="grid grid-cols-[1.25em_minmax(0,1fr)] items-baseline bg-rose/[0.07] py-1.5 pr-4 font-mono text-[clamp(1.5rem,6.2vw,4.5rem)] font-bold leading-[1.12] tracking-[-0.045em] text-dust"
            >
              <span className="text-center font-normal text-rose">-</span>
              <span className="relative w-fit">
                Read every changelog.
                <span className="absolute inset-x-0 top-[56%] h-[0.07em] origin-left bg-rose animate-diff-strike motion-reduce:animate-none" />
              </span>
            </p>
            <h1
              id="hero-title"
              className="grid grid-cols-[1.25em_minmax(0,1fr)] items-baseline bg-emerald/[0.08] py-1.5 pr-4 font-mono text-[clamp(1.5rem,6.2vw,4.5rem)] font-bold leading-[1.12] tracking-[-0.045em] text-ink animate-diff-land motion-reduce:animate-none"
            >
              <span aria-hidden="true" className="text-center font-normal text-emerald">
                +
              </span>
              <span>Review what breaks.</span>
            </h1>
          </div>

          <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
            <div>
              <p className="max-w-2xl text-[17px] leading-relaxed text-dust">
                Track GitHub releases for the libraries you ship with. StackPulse reads every
                changelog and leaves review comments on the ones that matter: breaking changes,
                deprecations, and migration notes, each linked to its source.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <Link href="/sign-in" className={button.primary}>
                  <GithubIcon aria-hidden="true" className="size-4" />
                  Sign in with GitHub
                </Link>
                <Link href="/dashboard" className={button.secondary}>
                  Browse the public feed
                </Link>
                <a
                  href="https://github.com/daniel-ctn/stack-pulse"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={button.ghost}
                >
                  Source ↗
                </a>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-shade px-4 py-3.5">
              <p className="mb-2.5 font-mono text-[12px] text-dust">checks</p>
              {stats && stats.releases > 0 ? (
                <Checks
                  items={[
                    { value: stats.releases.toLocaleString('en-US'), label: 'releases distilled' },
                    {
                      value: stats.breaking.toLocaleString('en-US'),
                      label: 'with breaking changes',
                    },
                    {
                      value: stats.stacks.toLocaleString('en-US'),
                      label: 'stacks in the registry',
                    },
                  ]}
                />
              ) : (
                <Checks
                  items={[
                    { label: 'source-linked summaries' },
                    { label: 'breaking changes flagged' },
                    { label: 'free and open source' },
                  ]}
                />
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto mt-16 grid max-w-6xl gap-8 px-5 sm:mt-24 sm:px-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start">
          <aside aria-label="Files changed" className="min-w-0 lg:sticky lg:top-20">
            <p className="mb-3 flex items-center gap-2 font-mono text-[12px] text-dust">
              Files changed
              <span className="rounded-full bg-lift px-2 text-ink">{files.length}</span>
            </p>
            <ol className="flex gap-1.5 overflow-x-auto pb-2 font-mono text-[12px] lg:flex-col lg:overflow-visible lg:pb-0">
              {files.map((file) => (
                <li key={file.id} className="shrink-0">
                  <a
                    href={`#${file.id}`}
                    className="flex items-center justify-between gap-3 whitespace-nowrap rounded-md border border-line px-2.5 py-1.5 text-dust transition-colors hover:bg-lift hover:text-ink lg:whitespace-normal lg:border-transparent"
                  >
                    <span title={file.path}>{file.path.split('/').pop()}</span>
                    <span className="shrink-0 text-emerald">{file.stat}</span>
                  </a>
                </li>
              ))}
            </ol>
          </aside>

          <div className="grid min-w-0 gap-6">
            <FileCard
              id="feed"
              path="releases/since-last-read.diff"
              meta={<Badge tone="neutral">example</Badge>}
              title="Your feed, as a review"
            >
              <DiffLines>
                <DiffLine kind="hunk">@@ 5 releases since your last read @@</DiffLine>
                {exampleReleases.map((release, i) => (
                  <div key={release.stack}>
                    <DiffLine kind="add" n={i + 1}>
                      <span className="text-cyan">{release.stack}</span>
                      <span className="text-dust">@</span>
                      <span className="text-amber">{release.version}</span>
                      {!release.comment && (
                        <span className="ml-3 inline-block align-middle">
                          <Badge tone={release.signal}>{release.signal}</Badge>
                        </span>
                      )}
                    </DiffLine>
                    {release.comment && (
                      <ReviewComment
                        tone={release.signal}
                        label={release.signal}
                        className="mx-4 mb-3 mt-1.5 sm:ml-[4rem]"
                      >
                        {release.comment}
                      </ReviewComment>
                    )}
                  </div>
                ))}
              </DiffLines>
            </FileCard>

            <FileCard
              id="how-it-works"
              path="how-it-works.sh"
              meta={<span className="text-emerald">+6</span>}
              title="How it works"
            >
              <DiffLines>
                {steps.map((step, i) => (
                  <div key={step.title}>
                    <DiffLine kind="add" n={i * 2 + 1}>
                      <span className="text-dust">
                        # {i + 1}. {step.title}
                      </span>
                    </DiffLine>
                    <DiffLine kind="add" n={i * 2 + 2}>
                      {step.body}
                    </DiffLine>
                  </div>
                ))}
              </DiffLines>
            </FileCard>

            <FileCard
              id="signals"
              path="review/signals.md"
              meta="3 comments"
              title="What every release is checked for"
            >
              <div className="grid gap-3 border-t border-line p-4 sm:p-5">
                {releaseSignals.map((signal) => (
                  <ReviewComment key={signal.label} tone={signal.tone} label={signal.label}>
                    <strong className="font-semibold">{signal.title}</strong>{' '}
                    <span className="text-dust">{signal.body}</span>
                  </ReviewComment>
                ))}
              </div>
              <ul className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
                {delivery.map((item) => (
                  <li key={item.title} className="bg-shade px-5 py-4">
                    <h3 className="font-mono text-[13px] font-semibold text-ink">{item.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-dust">{item.body}</p>
                  </li>
                ))}
              </ul>
            </FileCard>

            <FileCard
              id="registry"
              path="registry.json"
              meta="90+ stacks"
              title="Stacks you can follow today"
            >
              <DiffLines>
                <DiffLine n={1}>
                  <span className="text-dust">[</span>
                </DiffLine>
                {trackedStacks.map((stack, i) => (
                  <DiffLine key={stack.slug} kind="add" n={i + 2}>
                    <Link
                      href={`/stacks/${stack.slug}`}
                      className="text-cyan underline-offset-4 hover:text-lime hover:underline"
                    >
                      &quot;{stack.name}&quot;
                    </Link>
                    <span className="text-dust">,</span>
                  </DiffLine>
                ))}
                <DiffLine n={trackedStacks.length + 2}>
                  <span className="text-dust">
                    {'// …and more. Missing one? '}
                    <Link href="/sign-in" className="text-lime underline-offset-4 hover:underline">
                      Add any public GitHub repo
                    </Link>
                  </span>
                </DiffLine>
                <DiffLine n={trackedStacks.length + 3}>
                  <span className="text-dust">]</span>
                </DiffLine>
              </DiffLines>
            </FileCard>

            <FileCard
              id="mcp"
              path=".mcp.json"
              meta={<span className="text-emerald">+1</span>}
              title="Bring releases into your editor"
            >
              <DiffLines>
                <DiffLine kind="add" n={1}>
                  {`{ "mcpServers": { "stackpulse": { "url": "${appUrl}/api/mcp/mcp" } } }`}
                </DiffLine>
              </DiffLines>
              <p className="border-t border-line px-5 py-4 text-[14px] leading-relaxed text-dust">
                Claude Code, Claude Desktop, Cursor, and other MCP clients can list stacks, read
                AI-distilled releases, search changelogs, and build upgrade plans from your editor.
              </p>
            </FileCard>

            <FileCard
              id="pricing"
              path="pricing.diff"
              meta={<span className="text-emerald">+3</span>}
              title="What it costs"
            >
              <DiffLines>
                <DiffLine kind="add" n={1}>
                  <span className="text-cyan">price</span>
                  <span className="text-dust">: </span>
                  <span className="font-semibold text-amber">$0</span>
                </DiffLine>
                <DiffLine kind="add" n={2}>
                  <span className="text-dust"># free and open source, no paywall</span>
                </DiffLine>
                <DiffLine kind="add" n={3}>
                  <span className="text-dust"># self-host it if you prefer</span>
                </DiffLine>
              </DiffLines>
            </FileCard>

            <FileCard id="faq" path="FAQ.md" meta={`${faqItems.length} threads`} title="Questions">
              {faqItems.map((item) => (
                <div
                  key={item.question}
                  className="grid gap-3 border-t border-line px-4 py-5 sm:px-5"
                >
                  <h3 className="font-mono text-[15px] font-semibold text-ink">{item.question}</h3>
                  <ReviewComment action="answered">{item.answer}</ReviewComment>
                </div>
              ))}
            </FileCard>

            <MergeBox
              id="merge"
              title="Ready to merge into your week."
              body="Free, open source, no paywall. Sign in with GitHub and start tracking framework releases, breaking changes, and deprecation notes in under a minute."
            >
              <div className="mt-6 flex flex-wrap gap-2.5">
                <Link href="/sign-in" className={button.primary}>
                  <GithubIcon aria-hidden="true" className="size-4" />
                  Sign in with GitHub
                </Link>
                <Link href="/dashboard" className={button.secondary}>
                  Browse the public feed
                </Link>
              </div>
              <div className="mt-7 max-w-xl border-t border-dashed border-ruling pt-6">
                <DigestSignupForm source="landing" framed={false} />
              </div>
            </MergeBox>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
