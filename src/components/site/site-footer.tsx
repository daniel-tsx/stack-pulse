import Link from 'next/link'

import { Logo } from '@/components/logo'
import { cx } from '@/components/review/review-ui'

const links = [
  { href: '/stacks', label: 'stacks' },
  { href: '/skills', label: 'skills' },
  { href: '/status', label: 'status' },
  { href: '/privacy', label: 'privacy' },
  { href: '/terms', label: 'terms' },
]

/** Shared public footer. */
export function SiteFooter({ width = 'max-w-6xl' }: { width?: string }) {
  return (
    <footer className="relative z-10 mt-24 border-t border-line">
      <div
        className={cx(
          'mx-auto flex flex-col gap-6 px-5 py-8 font-mono text-[12px] text-dust sm:flex-row sm:items-center sm:justify-between sm:px-6',
          width,
        )}
      >
        <div className="flex flex-col gap-1.5">
          <Logo size="sm" />
          <p>
            Free and open source.{' '}
            <a
              href="https://daniel-tsx.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline decoration-ruling underline-offset-4 hover:decoration-lime"
            >
              Built by a developer
            </a>
            , from the{' '}
            <a
              href="https://eastbase.studio"
              target="_blank"
              rel="noopener"
              className="text-ink underline decoration-ruling underline-offset-4 hover:decoration-lime"
            >
              Eastbase
            </a>{' '}
            studio.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
          <a
            href="https://github.com/daniel-ctn/stack-pulse"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            source ↗
          </a>
        </nav>
      </div>
    </footer>
  )
}
