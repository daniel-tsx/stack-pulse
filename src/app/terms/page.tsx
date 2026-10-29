import type { Metadata } from 'next'
import { LegalShell } from '@/components/landing/legal-shell'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms of use for StackPulse.',
}

export default function TermsPage() {
  return (
    <LegalShell title="Terms" slug="legal/terms" updatedAt="May 2026">
      <p>
        StackPulse is a non-profit, open-source side project. It&apos;s offered to the developer
        community for free, with no warranty. By using it you agree to a few common-sense things
        below.
      </p>

      <h2>What it is</h2>
      <p>
        A read-only feed of public GitHub release notes for libraries you choose to follow,
        summarised by an AI model. We rely on the GitHub API, OpenRouter, Neon Postgres, and
        Vercel. If any of those break, the service may degrade or pause.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t abuse the service — no scraping at scale, no automated account creation.</li>
        <li>
          Don&apos;t add custom repositories to harass, dox, or otherwise target a project or its
          maintainers.
        </li>
        <li>Don&apos;t attempt to bypass authentication or rate limits.</li>
        <li>One account per person, please.</li>
      </ul>
      <p>
        We may remove content, suspend accounts, or block IPs that abuse the service. We&apos;ll
        try to be reasonable about it.
      </p>

      <h2>Your content</h2>
      <p>
        The only &quot;content&quot; you generate is your selection of repos to follow. You retain
        ownership; we just store the list so we can show you a feed. Public release notes are
        owned by the upstream projects; we display summaries of them under fair-use terms and link
        back to the source.
      </p>

      <h2>AI-generated summaries</h2>
      <p>
        Release summaries are produced by a language model. They can be wrong, incomplete, or
        misleading. <strong>Always check the linked release</strong> before relying on a summary
        to update production code.
      </p>

      <h2>No warranty</h2>
      <p>
        StackPulse is provided &quot;as is&quot;. We make no warranties of any kind. The service
        may go down, lose data, or change behaviour at any time. We are not liable for any damages
        arising from your use of it.
      </p>

      <h2>Account closure</h2>
      <p>
        You can delete your account at any time from the user menu. We may close inactive accounts
        after long periods of dormancy. If we ever sunset the service we&apos;ll give notice via
        the repo.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms occasionally. Material changes will be announced in the repo.
        Continuing to use the service after a change means you accept it.
      </p>

      <h2>Contact</h2>
      <p>
        Open an issue at{' '}
        <a
          href="https://github.com/daniel-ctn/stack-pulse"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/daniel-ctn/stack-pulse
        </a>
        .
      </p>
    </LegalShell>
  )
}
