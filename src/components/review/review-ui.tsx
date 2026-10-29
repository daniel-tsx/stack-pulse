import Link from 'next/link'
import { CheckmarkCircle02Icon, File01Icon } from 'hugeicons-react'
import type { ReactNode } from 'react'

import { Logo } from '@/components/logo'
import { ThemeSwitcher } from '@/components/theme-switcher'

// "Diff review" building blocks: public pages read like a pull request. Every surface is a
// file card, risky release notes are review comments and calls to action are a merge box.
// Server-safe (no hooks), Tailwind tokens only. See docs/DESIGN_SYSTEM.md.

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(' ')
}

export const button = {
  primary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lime px-4 font-mono text-[13px] font-semibold text-void transition-colors hover:bg-lime/85 disabled:opacity-70',
  secondary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ruling bg-shade px-4 font-mono text-[13px] font-medium text-ink transition-colors hover:border-edge hover:bg-lift',
  ghost:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 font-mono text-[13px] text-dust transition-colors hover:bg-lift hover:text-ink',
}

/** Semantic badge tones; keep in sync with the table in docs/DESIGN_SYSTEM.md. */
export const badgeTone: Record<string, string> = {
  breaking: 'border-rose/30 bg-rose/10 text-rose',
  security: 'border-rose/30 bg-rose/10 text-rose',
  critical: 'border-rose/30 bg-rose/10 text-rose',
  deprecation: 'border-amber/30 bg-amber/10 text-amber',
  high: 'border-amber/30 bg-amber/10 text-amber',
  migration: 'border-cyan/30 bg-cyan/10 text-cyan',
  medium: 'border-cyan/30 bg-cyan/10 text-cyan',
  feature: 'border-emerald/30 bg-emerald/10 text-emerald',
  open: 'border-emerald/30 bg-emerald/10 text-emerald',
  prerelease: 'border-violet/30 bg-violet/10 text-violet',
  low: 'border-ruling bg-lift text-dust',
  neutral: 'border-ruling bg-lift text-dust',
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-px font-mono text-[11px] leading-5',
        badgeTone[tone] ?? badgeTone.neutral,
      )}
    >
      {children}
    </span>
  )
}

/** PR-style page intro: state pill + breadcrumb path, then title, lede and actions. */
export function PageIntro({
  path,
  state,
  title,
  lede,
  actions,
  aside,
}: {
  path: { label: string; href?: string }[]
  state?: { label: string; tone: string }
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  aside?: ReactNode
}) {
  return (
    <div
      className={cx(
        'grid gap-10',
        Boolean(aside) && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 font-mono text-[12px] text-dust">
          {state && <Badge tone={state.tone}>{state.label}</Badge>}
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5">
              {path.map((segment, i) => (
                <li key={`${segment.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-fade">
                      /
                    </span>
                  )}
                  {segment.href ? (
                    <Link href={segment.href} className="hover:text-lime">
                      {segment.label}
                    </Link>
                  ) : (
                    <span className="text-ink" aria-current="page">
                      {segment.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>
        <h1 className="mt-5 break-words font-mono text-[30px] font-bold leading-[1.08] tracking-[-0.035em] text-ink text-balance sm:text-[44px]">
          {title}
        </h1>
        {lede && (
          <div className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-dust">{lede}</div>
        )}
        {actions && <div className="mt-7 flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {aside}
    </div>
  )
}

/**
 * A titled panel styled as a changed file. The file header sticks under the site header
 * while the card scrolls (`overflow-clip` keeps sticky working inside rounded corners).
 */
export function FileCard({
  id,
  path,
  meta,
  title,
  titleAs: Title = 'h2',
  className,
  children,
}: {
  id?: string
  path: ReactNode
  meta?: ReactNode
  title?: ReactNode
  titleAs?: 'h2' | 'h3'
  className?: string
  children?: ReactNode
}) {
  const titleId = id && title ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cx(
        'min-w-0 scroll-mt-20 overflow-clip rounded-xl border border-line bg-shade',
        className,
      )}
    >
      <div className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-lift px-4 py-2.5 font-mono text-[12px]">
        <span className="flex min-w-0 items-center gap-2 text-ink">
          <File01Icon aria-hidden="true" className="size-3.5 shrink-0 text-dust" />
          <span className="min-w-0 break-all">{path}</span>
        </span>
        {meta && <span className="text-dust">{meta}</span>}
      </div>
      {title && (
        <Title
          id={titleId}
          className="px-5 pb-4 pt-5 font-mono text-[19px] font-semibold tracking-[-0.02em] text-ink sm:text-[21px]"
        >
          {title}
        </Title>
      )}
      {children}
    </section>
  )
}

export type DiffKind = 'add' | 'del' | 'ctx' | 'hunk'

const lineTone: Record<DiffKind, string> = {
  add: 'bg-emerald/[0.07]',
  del: 'bg-rose/[0.07]',
  ctx: '',
  hunk: 'bg-cyan/[0.06] text-cyan',
}
const signTone: Record<DiffKind, string> = {
  add: 'text-emerald',
  del: 'text-rose',
  ctx: '',
  hunk: '',
}
const signChar: Record<DiffKind, string> = { add: '+', del: '-', ctx: '', hunk: '' }

export function DiffLines({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('border-t border-line font-mono text-[13px] leading-[1.8]', className)}>
      {children}
    </div>
  )
}

export function DiffLine({
  kind = 'ctx',
  n,
  children,
}: {
  kind?: DiffKind
  n?: number
  children: ReactNode
}) {
  return (
    <div className={cx('grid grid-cols-[2.75rem_1.25rem_minmax(0,1fr)]', lineTone[kind])}>
      <span aria-hidden="true" className="select-none pr-3 text-right tabular-nums text-fade">
        {n ?? ''}
      </span>
      <span aria-hidden="true" className={cx('select-none text-center', signTone[kind])}>
        {signChar[kind]}
      </span>
      <span
        className={cx(
          'min-w-0 whitespace-pre-wrap break-words pr-4',
          kind === 'hunk' ? 'text-cyan' : 'text-ink',
        )}
      >
        {children}
      </span>
    </div>
  )
}

/** A review comment from StackPulse (or another author) attached under a line. */
export function ReviewComment({
  tone,
  label,
  author = 'stackpulse',
  action = 'reviewed',
  className,
  children,
}: {
  tone?: string
  label?: ReactNode
  author?: string
  action?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cx(
        'grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 rounded-lg border border-ruling bg-void px-3.5 py-3',
        className,
      )}
    >
      <span aria-hidden="true" className="pt-0.5">
        {author === 'stackpulse' ? (
          <Logo size="sm" showWordmark={false} />
        ) : (
          <span className="grid size-[18px] place-items-center rounded-full bg-lift font-mono text-[10px] text-ink">
            {author.slice(0, 1)}
          </span>
        )}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-dust">
          <strong className="font-semibold text-ink">{author}</strong>
          {action}
          {label && tone && <Badge tone={tone}>{label}</Badge>}
        </p>
        <div className="mt-1.5 text-[14px] leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  )
}

/** Merge-box call to action. */
export function MergeBox({
  id,
  title,
  body,
  children,
}: {
  id: string
  title: ReactNode
  body?: ReactNode
  children?: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 rounded-xl border border-emerald/40 bg-shade p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:p-7"
    >
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-emerald text-void"
      >
        <CheckmarkCircle02Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h2
          id={id}
          className="font-mono text-[22px] font-bold tracking-[-0.03em] text-ink sm:text-[28px]"
        >
          {title}
        </h2>
        {body && <div className="mt-2 max-w-xl text-[15px] leading-relaxed text-dust">{body}</div>}
        {children}
      </div>
    </section>
  )
}

/** CI-style check row, used for real counts (never invented numbers). */
export function Checks({ items }: { items: { label: ReactNode; value?: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12.5px] text-dust">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-2">
          <CheckmarkCircle02Icon aria-hidden="true" className="size-4 shrink-0 text-emerald" />
          {item.value !== undefined && (
            <span className="font-semibold tabular-nums text-ink">{item.value}</span>
          )}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Empty or failure state inside a file card: plain words plus one next step. */
export function CardNote({
  title,
  tone = 'neutral',
  children,
}: {
  title: ReactNode
  tone?: 'neutral' | 'error'
  children?: ReactNode
}) {
  return (
    <div className="grid justify-items-start gap-2 border-t border-line px-5 py-7 sm:pl-[4rem]">
      <p
        className={cx(
          'font-mono text-[14px] font-semibold',
          tone === 'error' ? 'text-rose' : 'text-ink',
        )}
      >
        {title}
      </p>
      {children && <div className="max-w-xl text-[14px] leading-relaxed text-dust">{children}</div>}
    </div>
  )
}

/** Small stat tile used inside file cards for real counts. */
export function StatGrid({
  stats,
}: {
  stats: { label: string; value: number; tone?: 'ink' | 'rose' | 'amber' | 'cyan' | 'lime' }[]
}) {
  const tone = {
    ink: 'text-ink',
    rose: 'text-rose',
    amber: 'text-amber',
    cyan: 'text-cyan',
    lime: 'text-lime',
  }
  return (
    <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-shade px-4 py-3.5 last:odd:col-span-2">
          <dt className="font-mono text-[11.5px] text-dust">{stat.label}</dt>
          <dd
            className={cx(
              'mt-1 font-mono text-2xl font-semibold tabular-nums',
              stat.value > 0 ? tone[stat.tone ?? 'ink'] : 'text-dust',
            )}
          >
            {stat.value.toLocaleString('en-US')}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Centered single-card layout for sign-in, 404, error and email-link pages. */
export function CenteredShell({ meta, children }: { meta?: ReactNode; children: ReactNode }) {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="StackPulse home"
            className="transition-opacity hover:opacity-80"
          >
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-3 font-mono text-[12px] text-dust">
            {meta}
            <ThemeSwitcher />
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}
