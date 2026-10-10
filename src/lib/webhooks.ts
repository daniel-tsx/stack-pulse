import { and, eq, gte, inArray } from 'drizzle-orm'

import { getDb } from '@/db'
import { ExecutionDeadlineError, type ExecutionBudget } from '@/lib/execution-budget'
import { releaseUpdates, technologies, userTechPreferences, userWebhooks } from '@/db/schema'

export type WebhookKind = 'slack' | 'discord'

const WEBHOOK_TIMEOUT_MS = 6_000
const MAX_RELEASES_PER_MESSAGE = 8
// Skip old releases so a stack's first-ever fetch (5 backfilled releases)
// never floods channels with stale news.
const NOTIFY_MAX_AGE_DAYS = 3
const DISPATCH_TIME_BUDGET_MS = 30_000

const importanceRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }

/** Strict host allowlist per kind — webhook URLs are user input and get fetched server-side. */
export function parseWebhookUrl(kind: WebhookKind, rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null

  if (kind === 'slack') {
    if (url.host !== 'hooks.slack.com' || !url.pathname.startsWith('/services/')) return null
  } else {
    const validHost = url.host === 'discord.com' || url.host === 'discordapp.com'
    if (!validHost || !url.pathname.startsWith('/api/webhooks/')) return null
  }

  return url.toString()
}

export type UserWebhook = {
  kind: string
  url: string
  minImportance: 'low' | 'medium' | 'high' | 'critical'
}

export async function getUserWebhook(userId: string): Promise<UserWebhook | null> {
  const [row] = await getDb()
    .select({
      kind: userWebhooks.kind,
      url: userWebhooks.url,
      minImportance: userWebhooks.minImportance,
    })
    .from(userWebhooks)
    .where(eq(userWebhooks.userId, userId))
    .limit(1)

  return row ?? null
}

type NotifiableRelease = {
  id: string
  techId: string
  techName: string
  version: string
  title: string | null
  summary: string | null
  importanceLevel: 'low' | 'medium' | 'high' | 'critical' | null
  breakingChanges: string[] | null
  rawReleaseUrl: string | null
}

function formatSlackPayload(releases: NotifiableRelease[], extraCount: number) {
  const lines = releases.map((release) => {
    const breaking = release.breakingChanges?.length
      ? ` — :warning: ${release.breakingChanges.length} breaking`
      : ''
    const label = `${release.techName} ${release.version} [${release.importanceLevel ?? 'medium'}]`
    const link = release.rawReleaseUrl ? `<${release.rawReleaseUrl}|${label}>` : label
    return `• ${link}${breaking}${release.summary ? `\n   ${release.summary.slice(0, 200)}` : ''}`
  })
  if (extraCount > 0) lines.push(`…and ${extraCount} more on your StackPulse feed`)

  return { text: `*New releases for your stack*\n${lines.join('\n')}` }
}

const discordColor: Record<string, number> = {
  critical: 0xfb7185,
  high: 0xfbbf24,
  medium: 0x67e8f9,
  low: 0x5a5a62,
}

function formatDiscordPayload(releases: NotifiableRelease[], extraCount: number) {
  return {
    content: extraCount > 0 ? `…and ${extraCount} more on your StackPulse feed` : undefined,
    embeds: releases.map((release) => ({
      title: `${release.techName} ${release.version}`.slice(0, 256),
      url: release.rawReleaseUrl ?? undefined,
      description: [
        release.summary?.slice(0, 300),
        release.breakingChanges?.length
          ? `⚠ ${release.breakingChanges.length} breaking change${release.breakingChanges.length === 1 ? '' : 's'}`
          : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      color: discordColor[release.importanceLevel ?? 'medium'] ?? discordColor.medium,
    })),
  }
}

export async function postWebhook(
  kind: WebhookKind,
  url: string,
  payload: unknown,
  execution?: ExecutionBudget,
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: execution?.requestSignal(WEBHOOK_TIMEOUT_MS) ?? AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  })
  await response.body?.cancel()

  // Slack returns 200 "ok"; Discord returns 204.
  if (!response.ok) {
    throw new Error(`${kind} webhook responded ${response.status}`)
  }
}

export function buildTestPayload(kind: WebhookKind) {
  const text = 'StackPulse test — release notifications for your followed stacks will arrive here.'
  return kind === 'slack' ? { text } : { content: text }
}

export type WebhookDispatchSummary = {
  webhooks: number
  sent: number
  errors: number
  deadlineReached?: boolean
  deferred?: number
}

/** Notifies followers' webhooks about freshly inserted releases. Errors never propagate. */
export async function dispatchReleaseWebhooks(
  insertedReleaseIds: string[],
  execution?: ExecutionBudget,
): Promise<WebhookDispatchSummary> {
  const summary: WebhookDispatchSummary = { webhooks: 0, sent: 0, errors: 0 }
  if (insertedReleaseIds.length === 0) return summary
  const measure = <T>(stage: string, operation: () => PromiseLike<T>) =>
    execution ? execution.measure(stage, operation) : Promise.resolve(operation())

  try {
    execution?.check(1000)
    const db = getDb(execution?.signal)
    const cutoff = new Date(Date.now() - NOTIFY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000)

    const releases: NotifiableRelease[] = await measure('notificationPreparation', () =>
      db
        .select({
          id: releaseUpdates.id,
          techId: releaseUpdates.techId,
          techName: technologies.name,
          version: releaseUpdates.version,
          title: releaseUpdates.title,
          summary: releaseUpdates.summary,
          importanceLevel: releaseUpdates.importanceLevel,
          breakingChanges: releaseUpdates.breakingChanges,
          rawReleaseUrl: releaseUpdates.rawReleaseUrl,
        })
        .from(releaseUpdates)
        .innerJoin(technologies, eq(releaseUpdates.techId, technologies.id))
        .where(
          and(
            inArray(releaseUpdates.id, insertedReleaseIds.slice(0, 500)),
            eq(releaseUpdates.isPrerelease, false),
            gte(releaseUpdates.publishedAt, cutoff),
          ),
        ),
    )

    if (releases.length === 0) return summary

    const techIds = Array.from(new Set(releases.map((release) => release.techId)))
    const subscriptions = await measure('notificationPreparation', () =>
      db
        .select({
          webhookId: userWebhooks.id,
          kind: userWebhooks.kind,
          url: userWebhooks.url,
          minImportance: userWebhooks.minImportance,
          techId: userTechPreferences.techId,
        })
        .from(userWebhooks)
        .innerJoin(userTechPreferences, eq(userTechPreferences.userId, userWebhooks.userId))
        .where(inArray(userTechPreferences.techId, techIds)),
    )

    const byWebhook = new Map<
      string,
      { kind: WebhookKind; url: string; minImportance: string; releases: NotifiableRelease[] }
    >()

    for (const subscription of subscriptions) {
      execution?.check()
      if (subscription.kind !== 'slack' && subscription.kind !== 'discord') continue
      const entry = byWebhook.get(subscription.webhookId) ?? {
        kind: subscription.kind,
        url: subscription.url,
        minImportance: subscription.minImportance,
        releases: [],
      }
      for (const release of releases) {
        if (release.techId !== subscription.techId) continue
        const rank = importanceRank[release.importanceLevel ?? 'medium'] ?? 1
        if (rank < (importanceRank[entry.minImportance] ?? 2)) continue
        if (!entry.releases.some((existing) => existing.id === release.id)) {
          entry.releases.push(release)
        }
      }
      byWebhook.set(subscription.webhookId, entry)
    }

    const startedAt = performance.now()
    const entries = [...byWebhook.values()].filter((entry) => entry.releases.length > 0)

    for (const [index, entry] of entries.entries()) {
      if (execution && (execution.signal.aborted || execution.remainingMs() < 1000)) {
        summary.deadlineReached = true
        summary.deferred = entries.length - index
        break
      }
      if (performance.now() - startedAt > DISPATCH_TIME_BUDGET_MS) {
        summary.deferred = entries.length - index
        console.warn('webhook dispatch time budget reached')
        break
      }

      summary.webhooks += 1
      const shown = entry.releases.slice(0, MAX_RELEASES_PER_MESSAGE)
      const extra = entry.releases.length - shown.length
      const payload =
        entry.kind === 'slack'
          ? formatSlackPayload(shown, extra)
          : formatDiscordPayload(shown, extra)

      try {
        await measure('notificationDelivery', () =>
          postWebhook(entry.kind, entry.url, payload, execution),
        )
        summary.sent += 1
      } catch (err) {
        summary.errors += 1
        if (execution?.signal.aborted || err instanceof ExecutionDeadlineError)
          summary.deadlineReached = true
        console.error('webhook dispatch failed', {
          category: summary.deadlineReached ? 'TIME_BUDGET' : 'WEBHOOK',
        })
      }
    }
  } catch (err) {
    summary.errors += 1
    if (execution?.signal.aborted || err instanceof ExecutionDeadlineError)
      summary.deadlineReached = true
    console.error('webhook preparation failed', {
      category: summary.deadlineReached ? 'TIME_BUDGET' : 'WEBHOOK',
    })
  }

  return summary
}
