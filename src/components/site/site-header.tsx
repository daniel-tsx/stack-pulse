import Link from 'next/link'
import type { ReactNode } from 'react'

import { Logo } from '@/components/logo'
import { cx } from '@/components/review/review-ui'
import { ThemeSwitcher } from '@/components/theme-switcher'

type Section = 'home' | 'stacks' | 'skills'

const links: { id: Section; href: string; label: string }[] = [
  { id: 'stacks', href: '/stacks', label: 'stacks' },
  { id: 'skills', href: '/skills', label: 'skills' },
]

/** Sticky public header shared by the homepage, stacks, skills, legal and status pages. */
export function SiteHeader({
  active,
  account,
  width = 'max-w-6xl',
}: {
  active?: Section
  /** Replaces the sign-in link, e.g. with the release page's account control. */
  account?: ReactNode
  width?: string
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-void/85 backdrop-blur-md">
      <div
        className={cx(
          'mx-auto flex h-14 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6',
          width,
        )}
      >
        <Link
          href="/"
          aria-label="StackPulse home"
          className="shrink-0 transition-opacity hover:opacity-80"
        >
          {/* Mark only on phones so the nav fits at 320px. */}
          <Logo size="md" showWordmark={false} className="sm:hidden" />
          <Logo size="md" animated={active === 'home'} className="max-sm:hidden" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 font-mono text-[12.5px] sm:gap-2">
          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={active === link.id ? 'page' : undefined}
              className={cx(
                'rounded-md px-2 py-1.5 transition-colors hover:bg-lift hover:text-ink',
                active === link.id ? 'text-ink' : 'text-dust',
                link.id === 'stacks' && 'max-[359px]:hidden',
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            className="hidden rounded-md px-2 py-1.5 text-dust transition-colors hover:bg-lift hover:text-ink md:inline"
          >
            public feed
          </Link>
          {account ?? (
            <Link
              href="/sign-in"
              className="ml-1 inline-flex items-center rounded-md border border-ruling bg-shade px-3 py-1.5 text-ink transition-colors hover:border-edge hover:bg-lift"
            >
              sign in
            </Link>
          )}
          <ThemeSwitcher />
        </nav>
      </div>
    </header>
  )
}
