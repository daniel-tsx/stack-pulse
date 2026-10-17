'use client'

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { AiChat02Icon, Link01Icon, SentIcon } from 'hugeicons-react'
import Link from 'next/link'
import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from 'react'

import { markReleaseUnread, markReleasesRead } from '@/lib/actions'
import type { ReleaseAdvice } from '@/lib/ai'
import {
  importanceFilters,
  readFilters,
  signalFilters,
  type ImportanceFilter,
  type ReadFilter,
  type ReleaseFeedItem,
  type ReleaseFeedPage,
  type ReleaseFeedTechOption,
  type SignalFilter,
} from '@/lib/release-feed-types'
import { cn } from '@/lib/utils'

function sha(id: string) {
  return id.replace(/-/g, '').slice(0, 7)
}

const importanceTone: Record<string, { label: string; pill: string; dot: string }> = {
  critical: {
    label: 'CRITICAL',
    pill: 'bg-rose/10 text-rose border-rose/30',
    dot: 'bg-rose',
  },
  high: {
    label: 'HIGH',
    pill: 'bg-amber/10 text-amber border-amber/30',
    dot: 'bg-amber',
  },
  medium: {
    label: 'MEDIUM',
    pill: 'bg-cyan/10 text-cyan border-cyan/30',
    dot: 'bg-cyan',
  },
  low: {
    label: 'LOW',
    pill: 'bg-dust/10 text-fade border-fade/20',
    dot: 'bg-mute',
  },
}

const filterLabels: Record<ImportanceFilter, string> = {
  all: 'all',
  medium: 'medium+',
  high: 'high+',
  critical: 'critical',
}

const signalLabels: Record<SignalFilter, string> = {
  all: 'all',
  breaking: 'breaking',
  deprecation: 'deprecated',
  migration: 'migration',
  feature: 'features',
  security: 'security',
}

const signalTone: Record<string, string> = {
  breaking: 'border-rose/30 bg-rose/10 text-rose',
  deprecation: 'border-amber/30 bg-amber/10 text-amber',
  migration: 'border-cyan/30 bg-cyan/10 text-cyan',
  feature: 'border-emerald/30 bg-emerald/10 text-emerald',
  security: 'border-rose/30 bg-rose/10 text-rose',
}

const suggestedAdviceQuestions = [
  'Is this upgrade worth doing now?',
  'What hidden blockers should I check first?',
  'Could this affect my project?',
]

export function ReleaseFeed({
  initialImportance,
  initialRead,
  initialSignal,
  initialTech,
  initialSearch,
  initialPage,
  techOptions,
  canManageReadState,
}: {
  initialImportance: ImportanceFilter
  initialRead: ReadFilter
  initialSignal: SignalFilter
  initialTech: string
  initialSearch: string
  initialPage: ReleaseFeedPage
  techOptions: ReleaseFeedTechOption[]
  canManageReadState: boolean
}) {
  const queryClient = useQueryClient()
  const [isMarking, startMarking] = useTransition()
  const [importance, setImportance] = useQueryState(
    'importance',
    parseAsStringLiteral(importanceFilters).withDefault('all'),
  )
  const [read, setRead] = useQueryState(
    'read',
    parseAsStringLiteral(readFilters).withDefault('all'),
  )
  const [signal, setSignal] = useQueryState(
    'signal',
    parseAsStringLiteral(signalFilters).withDefault('all'),
  )
  const [tech, setTech] = useQueryState('tech')
  const [search, setSearch] = useQueryState('q')
  const techFilter = tech || 'all'
  const searchFilter = search || ''
  const effectiveRead = canManageReadState ? read : 'all'

  const query = useInfiniteQuery({
    queryKey: ['release-feed', importance, effectiveRead, signal, techFilter, searchFilter],
    queryFn: ({ pageParam }) =>
      fetchReleasePage({
        importance,
        read: effectiveRead,
        signal,
        tech: techFilter,
        search: searchFilter,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData:
      importance === initialImportance &&
      effectiveRead === initialRead &&
      signal === initialSignal &&
      techFilter === initialTech &&
      searchFilter === initialSearch
        ? {
            pages: [initialPage],
            pageParams: [null],
          }
        : undefined,
  })

  const releases = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const rowCount = query.hasNextPage ? releases.length + 1 : releases.length
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 460,
    overscan: 4,
    getItemKey: (index) => releases[index]?.id ?? `loader-${importance}-${signal}`,
  })
  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems[virtualItems.length - 1]

  useEffect(() => {
    if (
      lastVirtualItem &&
      lastVirtualItem.index >= releases.length - 1 &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      query.fetchNextPage()
    }
  }, [lastVirtualItem, releases.length, query])

  const breakingCount = releases.filter(
    (release) =>
      hasReleaseSignal(release, 'breaking') ||
      release.importanceLevel === 'critical' ||
      release.importanceLevel === 'high',
  ).length
  const deprecationCount = releases.filter((release) =>
    hasReleaseSignal(release, 'deprecation'),
  ).length
  const unreadCount = releases.filter((release) => !release.isRead).length
  const techCount = new Set(releases.map((release) => release.techSlug)).size

  const refreshFeed = () => queryClient.invalidateQueries({ queryKey: ['release-feed'] })

  // Selection resets implicitly when filters change because the stored key no longer matches.
  const filterKey = [importance, effectiveRead, signal, techFilter, searchFilter].join('|')
  const [selection, setSelection] = useState({ key: '', index: -1 })
  const selectedIndex = selection.key === filterKey ? selection.index : -1

  const handleMarkVisibleRead = () => {
    const unreadIds = releases.filter((release) => !release.isRead).map((release) => release.id)
    if (unreadIds.length === 0) return

    startMarking(async () => {
      const result = await markReleasesRead(unreadIds)
      if (result.ok) refreshFeed()
    })
  }

  const handleToggleRead = (release: ReleaseFeedItem) => {
    startMarking(async () => {
      const result = release.isRead
        ? await markReleaseUnread(release.id)
        : await markReleasesRead([release.id])
      if (result.ok) refreshFeed()
    })
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (releases.length === 0) return

      if (event.key === 'j' || event.key === 'k') {
        const next =
          event.key === 'j'
            ? Math.min(selectedIndex + 1, releases.length - 1)
            : Math.max(selectedIndex - 1, 0)
        setSelection({ key: filterKey, index: next })
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-index="${next}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        })
      } else if (event.key === 'r' && canManageReadState) {
        const release = releases[selectedIndex]
        if (release) handleToggleRead(release)
      } else if (event.key === 'o') {
        const release = releases[selectedIndex]
        if (release?.rawReleaseUrl) {
          window.open(release.rawReleaseUrl, '_blank', 'noopener,noreferrer')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border border-line rounded-md overflow-hidden">
        <Stat label="loaded" value={String(releases.length)} tone="ink" />
        <Stat
          label={canManageReadState ? 'unread' : 'stacks'}
          value={String(canManageReadState ? unreadCount : techCount)}
          tone="cyan"
        />
        <Stat label="deprecated" value={String(deprecationCount)} tone="amber" />
        <Stat label="breaking" value={String(breakingCount)} tone="rose" />
      </div>

      <div className="mt-4 frame p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="text-fade tracking-[0.16em] uppercase">importance</span>
            <Segmented>
              {importanceFilters.map((filter) => (
                <SegmentButton
                  key={filter}
                  active={importance === filter}
                  onClick={() => setImportance(filter)}
                >
                  {filterLabels[filter]}
                </SegmentButton>
              ))}
            </Segmented>

            <span className="ml-0 text-fade tracking-[0.16em] uppercase sm:ml-2">signal</span>
            <Segmented>
              {signalFilters.map((filter) => (
                <SegmentButton
                  key={filter}
                  active={signal === filter}
                  onClick={() => setSignal(filter)}
                >
                  {signalLabels[filter]}
                </SegmentButton>
              ))}
            </Segmented>

            {canManageReadState && (
              <>
                <span className="ml-0 text-fade tracking-[0.16em] uppercase sm:ml-2">status</span>
                <Segmented>
                  {readFilters.map((filter) => (
                    <SegmentButton
                      key={filter}
                      active={read === filter}
                      onClick={() => setRead(filter)}
                    >
                      {filter}
                    </SegmentButton>
                  ))}
                </Segmented>
              </>
            )}
          </div>

          {canManageReadState && (
            <button
              type="button"
              onClick={handleMarkVisibleRead}
              disabled={isMarking || unreadCount === 0}
              className="justify-self-start rounded-md border border-ruling bg-shade px-3 py-1.5 font-mono text-[11px] text-dust transition-colors hover:border-lime hover:text-lime disabled:opacity-50 lg:justify-self-end"
            >
              mark visible read
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[190px_1fr]">
          <select
            value={techFilter}
            onChange={(e) => setTech(e.target.value === 'all' ? null : e.target.value)}
            className="h-9 rounded-md border border-line bg-void px-3 font-mono text-[12px] text-dust"
          >
            <option value="all">all stacks</option>
            {techOptions.map((option) => (
              <option key={option.id} value={option.slug}>
                {option.slug}
              </option>
            ))}
          </select>
          <input
            value={searchFilter}
            onChange={(e) => setSearch(e.target.value || null)}
            placeholder="search releases, versions, summaries..."
            className="h-9 rounded-md border border-line bg-void px-3 font-mono text-[12px] text-dust placeholder:text-fade"
          />
        </div>

        <div className="mt-2.5 hidden font-mono text-[10px] text-fade lg:block">
          {'// '}j/k navigate · o open source{canManageReadState ? ' · r toggle read' : ''}
        </div>
      </div>

      {query.isLoading ? (
        <FeedStatus label="loading feed..." />
      ) : query.isError ? (
        <FeedStatus label="could not load releases" tone="rose" />
      ) : releases.length === 0 ? (
        <EmptyFilteredFeed importance={importance} />
      ) : (
        <div className="mt-10 relative">
          <div
            className="absolute left-[7px] top-2 w-px bg-line"
            style={{ height: rowVirtualizer.getTotalSize() }}
            aria-hidden
          />

          <div
            className="relative"
            style={{
              height: rowVirtualizer.getTotalSize(),
            }}
          >
            {virtualItems.map((virtualItem) => {
              const release = releases[virtualItem.index]

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full scroll-mt-20 pb-6"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  {release ? (
                    <ReleaseCard
                      release={release}
                      index={virtualItem.index}
                      isSelected={virtualItem.index === selectedIndex}
                      onToggleRead={handleToggleRead}
                      isMarking={isMarking}
                      canManageReadState={canManageReadState}
                    />
                  ) : (
                    <FeedStatus label="loading more..." compact />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

async function fetchReleasePage({
  importance,
  read,
  signal,
  tech,
  search,
  cursor,
}: {
  importance: ImportanceFilter
  read: ReadFilter
  signal: SignalFilter
  tech: string
  search: string
  cursor: string | null
}) {
  const params = new URLSearchParams()
  params.set('importance', importance)
  params.set('read', read)
  params.set('signal', signal)
  params.set('tech', tech)
  if (search) params.set('q', search)
  if (cursor) params.set('cursor', cursor)

  const response = await fetch(`/api/releases?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to load releases')

  return (await response.json()) as ReleaseFeedPage
}

function hasReleaseSignal(release: ReleaseFeedItem, signal: Exclude<SignalFilter, 'all'>) {
  return Array.isArray(release.releaseSignals) && release.releaseSignals.includes(signal)
}

function ReleaseCard({
  release,
  index,
  isSelected,
  onToggleRead,
  isMarking,
  canManageReadState,
}: {
  release: ReleaseFeedItem
  index: number
  isSelected: boolean
  onToggleRead: (release: ReleaseFeedItem) => void
  isMarking: boolean
  canManageReadState: boolean
}) {
  const tone = importanceTone[release.importanceLevel || 'medium'] || importanceTone.medium
  const hasBreaking =
    release.breakingChanges &&
    Array.isArray(release.breakingChanges) &&
    release.breakingChanges.length > 0
  const hasSecurityNotes =
    release.securityNotes &&
    Array.isArray(release.securityNotes) &&
    release.securityNotes.length > 0
  const hasNewFeatures =
    release.newFeatures && Array.isArray(release.newFeatures) && release.newFeatures.length > 0
  const hasDeprecations =
    release.deprecations && Array.isArray(release.deprecations) && release.deprecations.length > 0
  const hasMigrationSteps =
    release.migrationSteps &&
    Array.isArray(release.migrationSteps) &&
    release.migrationSteps.length > 0
  const visibleSignals = (release.releaseSignals ?? []).filter((signal) => signal in signalTone)
  const [isAdviceOpen, setIsAdviceOpen] = useState(false)

  return (
    <article className={`relative pl-10 animate-fade-up stagger-${Math.min(index + 1, 10)}`}>
      <span
        className={`absolute left-0 top-[18px] w-3.5 h-3.5 rounded-full border-2 border-void ${tone.dot} ring-1 ring-line`}
        aria-hidden
      />

      <div className={cn('frame overflow-hidden', isSelected && 'ring-1 ring-lime/50')}>
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${tone.dot}`} />
          <span className="text-fade">{sha(release.id)}</span>
          <span className="text-cyan">{release.techName.toLowerCase()}</span>
          <span className="text-dust">@</span>
          <span className="text-amber">{release.version}</span>
          <span
            className={`ml-1 inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[9px] font-bold tracking-widest ${tone.pill}`}
          >
            {tone.label}
          </span>
          {visibleSignals.map((signal) => (
            <span
              key={signal}
              className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase ${signalTone[signal]}`}
            >
              {signal}
            </span>
          ))}
          {release.publishedAt && (
            <span className="ml-auto text-fade">
              {new Date(release.publishedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          )}
        </div>

        <div className="px-5 py-5">
          <h2 className="font-mono text-[18px] font-semibold tracking-tight text-ink">
            {release.title || release.version}
          </h2>

          {release.summary && (
            <p className="mt-2.5 text-[14px] text-dust leading-relaxed">{release.summary}</p>
          )}

          {(release.impactSummary || release.recommendedAction) && (
            <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
              <div className="px-3 py-2 border-b border-line font-mono text-[10px] text-fade">
                impact
              </div>
              <div className="divide-y divide-line">
                {release.impactSummary && (
                  <div className="px-3 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
                      affected
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-dust">
                      {release.impactSummary}
                    </p>
                  </div>
                )}
                {release.recommendedAction && (
                  <div className="px-3 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">
                      action
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-dust">
                      {release.recommendedAction}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(release.isPrerelease || release.summaryModel || release.summarizedAt) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] text-fade">
              {release.isPrerelease && (
                <span className="rounded-[3px] border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-violet">
                  prerelease
                </span>
              )}
              {release.summaryModel && <span>model: {release.summaryModel}</span>}
              {release.summarizedAt && (
                <span>
                  summarized{' '}
                  {new Date(release.summarizedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
          )}

          {(hasSecurityNotes || hasBreaking || hasDeprecations || hasNewFeatures) && (
            <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
              <div className="px-3 py-2 border-b border-line flex items-center justify-between font-mono text-[10px] text-fade">
                <span>diff</span>
                <span>
                  {(hasBreaking ? release.breakingChanges!.length : 0) +
                    (hasSecurityNotes ? release.securityNotes!.length : 0) +
                    (hasDeprecations ? release.deprecations!.length : 0) +
                    (hasNewFeatures ? release.newFeatures!.length : 0)}{' '}
                  changes
                </span>
              </div>
              <div className="font-mono text-[12.5px] leading-[1.7]">
                {hasBreaking &&
                  release.breakingChanges!.map((change, j) => (
                    <div
                      key={`b-${j}`}
                      className="px-3 py-1 bg-rose/[0.04] border-l-2 border-rose flex gap-3"
                    >
                      <span className="text-rose select-none shrink-0">-</span>
                      <span className="text-ink">{change}</span>
                    </div>
                  ))}
                {hasSecurityNotes &&
                  release.securityNotes!.map((note, j) => (
                    <div
                      key={`s-${j}`}
                      className="px-3 py-1 bg-rose/[0.04] border-l-2 border-rose flex gap-3"
                    >
                      <span className="text-rose select-none shrink-0">!</span>
                      <span className="text-ink">{note}</span>
                    </div>
                  ))}
                {hasDeprecations &&
                  release.deprecations!.map((deprecation, j) => (
                    <div
                      key={`d-${j}`}
                      className="px-3 py-1 bg-amber/[0.04] border-l-2 border-amber flex gap-3"
                    >
                      <span className="text-amber select-none shrink-0">!</span>
                      <span className="text-ink">{deprecation}</span>
                    </div>
                  ))}
                {hasNewFeatures &&
                  release.newFeatures!.map((feature, j) => (
                    <div
                      key={`n-${j}`}
                      className="px-3 py-1 bg-emerald/[0.04] border-l-2 border-emerald flex gap-3"
                    >
                      <span className="text-emerald select-none shrink-0">+</span>
                      <span className="text-ink">{feature}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {hasMigrationSteps && (
            <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
              <div className="px-3 py-2 border-b border-line flex items-center justify-between font-mono text-[10px] text-fade">
                <span>migration_steps</span>
                <span>{release.migrationSteps!.length} steps</span>
              </div>
              <ol className="font-mono text-[12.5px] leading-[1.7]">
                {release.migrationSteps!.map((step, j) => (
                  <li key={`m-${j}`} className="flex gap-3 px-3 py-1.5">
                    <span className="select-none text-cyan">{String(j + 1).padStart(2, '0')}</span>
                    <span className="text-ink">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {release.codeSnippet && (
            <div className="mt-5 rounded-md border border-line bg-void overflow-hidden">
              <div className="px-3 py-2 border-b border-line flex items-center justify-between font-mono text-[10px] text-fade">
                <span>snippet.ts</span>
                <span className="text-mute">readonly</span>
              </div>
              <pre className="!m-0 !border-0 !rounded-none !bg-void px-4 py-3 text-[12.5px]">
                <code>{release.codeSnippet}</code>
              </pre>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/stacks/${release.techSlug}/releases/${release.id}`}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] text-lime hover:underline"
              >
                view details <span aria-hidden="true">→</span>
              </Link>
              {release.rawReleaseUrl && (
                <a
                  href={release.rawReleaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fade hover:text-lime transition-colors"
                >
                  <Link01Icon className="w-3 h-3" />
                  view source on github
                  <span className="text-mute">↗</span>
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageReadState ? (
                <AskReleaseAdvice
                  isOpen={isAdviceOpen}
                  onToggle={() => setIsAdviceOpen((value) => !value)}
                />
              ) : (
                <SignInAdviceHint />
              )}
              {canManageReadState && (
                <button
                  type="button"
                  onClick={() => onToggleRead(release)}
                  disabled={isMarking}
                  className={cn(
                    'rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-50',
                    release.isRead
                      ? 'border-ruling text-fade hover:border-cyan hover:text-cyan'
                      : 'border-lime/30 bg-lime-dim text-lime hover:bg-lime/15',
                  )}
                >
                  {release.isRead ? 'mark unread' : 'mark read'}
                </button>
              )}
            </div>
          </div>

          {canManageReadState && <ReleaseAdvicePanel release={release} isOpen={isAdviceOpen} />}
        </div>
      </div>
    </article>
  )
}

function AskReleaseAdvice({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors',
        isOpen
          ? 'border-cyan/40 bg-cyan/15 text-cyan'
          : 'border-cyan/30 bg-cyan/10 text-cyan hover:bg-cyan/15',
      )}
    >
      <AiChat02Icon className="h-3.5 w-3.5" />
      ask ai
    </button>
  )
}

function SignInAdviceHint() {
  return (
    <a
      href="/sign-in"
      className="inline-flex items-center gap-1.5 rounded-md border border-ruling bg-shade px-2.5 py-1.5 font-mono text-[11px] text-fade transition-colors hover:border-cyan/30 hover:text-cyan"
    >
      <AiChat02Icon className="h-3.5 w-3.5" />
      sign in to ask more about this update
    </a>
  )
}

function ReleaseAdvicePanel({ release, isOpen }: { release: ReleaseFeedItem; isOpen: boolean }) {
  const [question, setQuestion] = useState(suggestedAdviceQuestions[0])
  const [currentVersion, setCurrentVersion] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [advice, setAdvice] = useState<ReleaseAdvice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!isOpen) return null

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch('/api/release-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            releaseId: release.id,
            question,
            currentVersion,
            projectContext,
          }),
        })
        const body = response.headers.get('content-type')?.includes('application/json')
          ? ((await response.json()) as { advice?: ReleaseAdvice; error?: string })
          : null

        if (!response.ok || !body?.advice) {
          setAdvice(null)
          setError(body?.error || 'could not generate advice')
          return
        }

        setAdvice(body.advice)
      } catch {
        setAdvice(null)
        setError('could not reach ai reviewer')
      }
    })
  }

  return (
    <div className="mt-5 rounded-md border border-cyan/25 bg-void overflow-hidden">
      <div className="px-3 py-2 border-b border-line flex items-center gap-2 font-mono text-[10px] text-cyan">
        <AiChat02Icon className="h-3.5 w-3.5" />
        <span>ai_upgrade_review</span>
        <span className="ml-auto text-fade">
          {release.techSlug}@{release.version}
        </span>
      </div>

      <form onSubmit={submitQuestion} className="p-3">
        <div className="flex flex-wrap gap-2">
          {suggestedAdviceQuestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuestion(item)}
              className={cn(
                'rounded-[3px] border px-2 py-1 font-mono text-[10px] transition-colors',
                question === item
                  ? 'border-cyan/40 bg-cyan/10 text-cyan'
                  : 'border-ruling text-fade hover:border-cyan/30 hover:text-cyan',
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]">
          <input
            value={currentVersion}
            onChange={(event) => setCurrentVersion(event.target.value)}
            aria-label="Current version"
            placeholder="using version..."
            className="h-9 rounded-md border border-line bg-shade px-3 font-mono text-[12px] text-dust placeholder:text-fade"
          />
          <input
            value={projectContext}
            onChange={(event) => setProjectContext(event.target.value)}
            aria-label="Project context"
            placeholder="project context, e.g. monorepo, next app, package manager..."
            className="h-9 rounded-md border border-line bg-shade px-3 font-mono text-[12px] text-dust placeholder:text-fade"
          />
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-fade">
          Do not paste secrets or private code. Project context is sent to the AI provider.
        </p>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Question for AI"
            maxLength={1000}
            rows={3}
            className="min-h-20 resize-y rounded-md border border-line bg-shade px-3 py-2 font-mono text-[12px] leading-relaxed text-dust"
          />
          <button
            type="submit"
            disabled={isPending || question.trim().length < 4}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-lime/30 bg-lime-dim px-3 font-mono text-[11px] text-lime transition-colors hover:bg-lime/15 disabled:opacity-50 sm:self-end"
          >
            <SentIcon className="h-3.5 w-3.5" />
            {isPending ? 'asking...' : 'ask'}
          </button>
        </div>
      </form>

      {error && (
        <div className="border-t border-line px-3 py-3 font-mono text-[12px] text-rose">
          {error}
        </div>
      )}

      {advice && (
        <div className="border-t border-line p-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fade">
            <span>risk</span>
            <span
              className={cn(
                'rounded-[3px] border px-1.5 py-0.5',
                adviceRiskTone(advice.risk_level),
              )}
            >
              {advice.risk_level}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-ink">{advice.answer}</p>

          {advice.coverage_note && (
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-fade">
              {advice.coverage_note}
            </p>
          )}

          {advice.project_impact && (
            <div className="mt-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan">
                project impact
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-dust">{advice.project_impact}</p>
            </div>
          )}

          {advice.blockers.length > 0 && (
            <AdviceList title="blockers" items={advice.blockers} tone="rose" />
          )}

          {advice.next_steps.length > 0 && (
            <AdviceList title="next steps" items={advice.next_steps} tone="lime" />
          )}
        </div>
      )}
    </div>
  )
}

function AdviceList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'lime' | 'rose'
}) {
  return (
    <div className="mt-3">
      <div
        className={cn(
          'font-mono text-[10px] uppercase tracking-[0.18em]',
          tone === 'rose' ? 'text-rose' : 'text-lime',
        )}
      >
        {title}
      </div>
      <ul className="mt-1 space-y-1 font-mono text-[12.5px] leading-relaxed">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2 text-dust">
            <span className={tone === 'rose' ? 'text-rose' : 'text-lime'}>
              {tone === 'rose' ? '!' : '>'}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function adviceRiskTone(risk: ReleaseAdvice['risk_level']) {
  if (risk === 'high') return 'border-rose/30 bg-rose/10 text-rose'
  if (risk === 'medium') return 'border-amber/30 bg-amber/10 text-amber'
  if (risk === 'low') return 'border-emerald/30 bg-emerald/10 text-emerald'
  return 'border-ruling bg-shade text-fade'
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ink' | 'lime' | 'rose' | 'cyan' | 'amber'
}) {
  const toneClass =
    tone === 'lime'
      ? 'text-lime'
      : tone === 'rose'
        ? 'text-rose'
        : tone === 'cyan'
          ? 'text-cyan'
          : tone === 'amber'
            ? 'text-amber'
            : 'text-ink'
  return (
    <div className="bg-shade px-4 py-3">
      <div className="font-mono text-[10px] text-fade tracking-[0.2em] uppercase">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  )
}

function Segmented({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-void p-1">
      {children}
    </div>
  )
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-[3px] px-2.5 py-1 text-fade transition-colors hover:text-ink',
        active && 'bg-lift text-lime shadow-[inset_0_0_0_1px_var(--line)]',
      )}
    >
      {children}
    </button>
  )
}

function EmptyFilteredFeed({ importance }: { importance: ImportanceFilter }) {
  return (
    <div className="mt-12 frame">
      <div className="frame-titlebar">
        <span className="text-dust">~/feed/{filterLabels[importance]}</span>
        <span className="ml-auto text-mute">empty</span>
      </div>
      <div className="px-6 py-16 text-center">
        <p className="font-mono text-[13px] text-dust">no releases match this filter.</p>
        <p className="font-mono text-[11px] text-fade mt-1">try widening importance.</p>
      </div>
    </div>
  )
}

function FeedStatus({
  label,
  tone = 'lime',
  compact = false,
}: {
  label: string
  tone?: 'lime' | 'rose'
  compact?: boolean
}) {
  return (
    <div className={cn('font-mono text-[12px]', compact ? 'pl-10 py-4' : 'mt-12 frame p-6')}>
      <span className={tone === 'rose' ? 'text-rose' : 'text-lime'}>$ </span>
      <span className="text-dust">{label}</span>
    </div>
  )
}
