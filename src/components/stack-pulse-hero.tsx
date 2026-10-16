'use client'

import { motion } from 'motion/react'
import Link from 'next/link'

const stackLines: { kw: string; name: string; ver: string }[] = [
  { kw: 'import', name: 'react', ver: '^19.2.0' },
  { kw: 'import', name: 'next', ver: '^16.2.6' },
  { kw: 'import', name: 'tailwindcss', ver: '^4.0.0' },
  { kw: 'import', name: 'drizzle-orm', ver: '^0.45.2' },
  { kw: 'import', name: 'better-auth', ver: '^1.6.10' },
  { kw: 'import', name: 'motion', ver: '^12.38.0' },
]

const feedItems = [
  {
    tag: 'react',
    ver: 'v19.2.0',
    label: 'NEW',
    tone: 'emerald' as const,
    msg: 'stable API notes extracted',
  },
  {
    tag: 'next',
    ver: 'v16.2.6',
    label: 'BREAKING',
    tone: 'rose' as const,
    msg: 'migration impact highlighted',
  },
  {
    tag: 'tailwind',
    ver: 'v4.0.0',
    label: 'UPGRADE',
    tone: 'amber' as const,
    msg: 'config changes summarized',
  },
]

const toneClasses: Record<'emerald' | 'rose' | 'amber', string> = {
  emerald: 'text-emerald border-emerald/30 bg-emerald/10',
  rose: 'text-rose border-rose/30 bg-rose/10',
  amber: 'text-amber border-amber/30 bg-amber/10',
}

export function StackPulseHero() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 pt-14 pb-10 sm:pt-20">
      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-2.5 font-mono text-[11px] text-fade"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime" />
          </span>
          <span className="text-lime">live</span>
        </span>
        <span className="text-mute">·</span>
        <span>watching framework releases</span>
        <span className="text-mute">·</span>
        <span>flagging upgrade risk</span>
      </motion.div>

      <div className="mt-7 grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        {/* Left: Headline */}
        <div className="relative">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-mono font-bold tracking-tight text-ink text-[44px] leading-[1.02] sm:text-[60px] lg:text-[68px]"
          >
            <span className="text-fade">{'/* '}</span>
            <br className="hidden sm:block" />
            Track releases.
            <br />
            <span className="text-lime">Catch breaks.</span>
            <br />
            <span className="text-fade">{' */'}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-7 max-w-md text-[15px] leading-relaxed text-dust"
          >
            Track GitHub releases for the libraries you ship with. StackPulse turns noisy changelogs
            into scannable AI digests with breaking changes, deprecations, migration notes, and
            source links.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center gap-3 font-mono text-[13px]"
          >
            <Link
              href="/sign-in"
              className="group inline-flex items-center gap-2 rounded-md bg-lime px-4 py-2.5 font-semibold text-void hover:bg-lime/85 transition-colors"
            >
              <span className="text-void/60">$</span>
              <span>start tracking</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">↵</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-ruling bg-shade px-4 py-2.5 font-medium text-ink hover:border-edge hover:bg-lift transition-colors"
            >
              <span className="text-fade">--public</span>
              <span>browse feed</span>
            </Link>
            <a
              href="https://github.com/daniel-ctn/stack-pulse"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-ruling bg-shade px-4 py-2.5 font-medium text-ink hover:border-edge hover:bg-lift transition-colors"
            >
              <span className="text-fade">--source ↗</span>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11px] text-fade"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald">✓</span> source-linked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald">✓</span> breaking changes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald">✓</span> upgrade notes
            </span>
          </motion.div>
        </div>

        {/* Right: Editor + feed window */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative"
        >
          {/* Editor window */}
          <div className="frame shadow-[var(--hero-shadow)] relative overflow-hidden">
            <div className="frame-titlebar">
              <span className="win-dots">
                <span style={{ background: '#fb7185' }} />
                <span style={{ background: '#fbbf24' }} />
                <span style={{ background: '#34d399' }} />
              </span>
              <span className="text-dust">~/stack.config.ts</span>
              <span className="ml-auto text-mute">tsx</span>
            </div>
            <div className="px-4 py-4 font-mono text-[13px] leading-[1.7]">
              <div className="flex">
                <div className="gutter w-7 pr-3 shrink-0">
                  {Array.from({ length: stackLines.length + 4 }).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-fade">{'// the tools you actually ship with'}</div>
                  <div>
                    <span className="text-magenta">export const</span>{' '}
                    <span className="text-cyan">stack</span>
                    <span className="text-dust"> = </span>
                    <span className="text-dust">{'['}</span>
                  </div>
                  {stackLines.map((line, i) => (
                    <motion.div
                      key={line.name}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.08, duration: 0.3 }}
                      className="pl-4"
                    >
                      <span className="text-violet">{line.kw}</span>{' '}
                      <span className="text-cyan">&quot;{line.name}&quot;</span>
                      <span className="text-dust">@</span>
                      <span className="text-amber">{line.ver}</span>
                      <span className="text-dust">,</span>
                    </motion.div>
                  ))}
                  <div>
                    <span className="text-dust">{']'}</span>
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 }}
                      className="caret"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating feed card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="absolute -bottom-6 -left-4 right-6 sm:left-auto sm:-right-6 sm:bottom-6 sm:max-w-[280px]"
          >
            <div className="frame shadow-[var(--hero-shadow-strong)]">
              <div className="frame-titlebar">
                <span className="text-lime">●</span>
                <span className="text-dust">upgrade digest</span>
                <span className="ml-auto text-mute">{feedItems.length} new</span>
              </div>
              <div className="p-3 space-y-2.5">
                {feedItems.map((it, i) => (
                  <motion.div
                    key={it.tag}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1 + i * 0.12 }}
                    className="flex items-start gap-2 font-mono text-[11px]"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center rounded-[3px] border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase ${toneClasses[it.tone]}`}
                    >
                      {it.label}
                    </span>
                    <div className="min-w-0">
                      <div className="text-ink truncate">
                        <span className="text-cyan">{it.tag}</span>
                        <span className="text-dust">@</span>
                        <span className="text-amber">{it.ver}</span>
                      </div>
                      <div className="text-fade truncate">{it.msg}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
