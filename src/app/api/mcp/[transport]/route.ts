import { createMcpHandler } from 'mcp-handler'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getPublicStackIndex, getPublicStackPage } from '@/lib/public-stacks'
import { getReleaseFeedPage } from '@/lib/release-feed'
import { getUpgradePlan } from '@/lib/upgrade-plan'

export const maxDuration = 60

const MAX_MCP_REQUESTS_PER_WINDOW = 120
const MCP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const MAX_MCP_RATE_LIMIT_KEYS = 5_000
const mcpAttempts = new Map<string, { count: number; resetAt: number }>()

function textResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_stacks',
      {
        title: 'List tracked stacks',
        description:
          'List every stack in the StackPulse registry with slug, category, GitHub repo, and release stats. Use the slug with the other tools.',
        inputSchema: z.object({}),
      },
      async () => {
        const index = await getPublicStackIndex()
        const stacks = index
          .filter((stack) => stack.category !== 'custom')
          .map((stack) => ({
            name: stack.name,
            slug: stack.slug,
            category: stack.category,
            repo: stack.githubRepoUrl,
            stored_releases: stack.releases,
            breaking_releases: stack.breaking,
            latest_release_at: stack.latestPublishedAt?.toISOString() ?? null,
          }))
        return textResult({ count: stacks.length, stacks })
      },
    )

    server.registerTool(
      'get_releases',
      {
        title: 'Get recent releases for a stack',
        description:
          'Recent releases for a stack slug with AI-distilled summaries: breaking changes, security notes, deprecations, migration steps, importance, and source links.',
        inputSchema: z.object({
          stack: z.string().min(1).max(100).describe('Stack slug, e.g. "nextjs" or "react"'),
          limit: z.number().int().min(1).max(20).default(10).describe('Max releases to return'),
        }),
      },
      async ({ stack, limit }) => {
        const data = await getPublicStackPage(stack.toLowerCase())
        if (!data) {
          return textResult({
            error: `unknown stack "${stack}" — call list_stacks for valid slugs`,
          })
        }
        return textResult({
          stack: { name: data.tech.name, slug: data.tech.slug, repo: data.tech.githubRepoUrl },
          stats: data.stats,
          releases: data.releases.slice(0, limit).map((release) => ({
            version: release.version,
            title: release.title,
            published_at: release.publishedAt?.toISOString() ?? null,
            importance: release.importanceLevel,
            prerelease: release.isPrerelease,
            summary: release.summary,
            breaking_changes: release.breakingChanges ?? [],
            security_notes: release.securityNotes ?? [],
            deprecations: release.deprecations ?? [],
            migration_steps: release.migrationSteps ?? [],
            new_features: release.newFeatures ?? [],
            source_url: release.rawReleaseUrl,
          })),
        })
      },
    )

    server.registerTool(
      'get_upgrade_plan',
      {
        title: 'Plan an upgrade between versions',
        description:
          'Aggregate every stored breaking change, security note, deprecation, and migration step for a stack between a current version and the latest release, in upgrade order.',
        inputSchema: z.object({
          stack: z.string().min(1).max(100).describe('Stack slug, e.g. "nextjs"'),
          from_version: z
            .string()
            .min(1)
            .max(80)
            .describe('The version currently in use, e.g. "14.2.0"'),
        }),
      },
      async ({ stack, from_version }) => {
        const plan = await getUpgradePlan(stack.toLowerCase(), from_version)
        if (!plan) {
          return textResult({
            error: `unknown stack "${stack}" — call list_stacks for valid slugs`,
          })
        }
        if (!plan.fromIsValid) {
          return textResult({
            error: `could not parse "${from_version}" as a version — use something like "14.2.0"`,
          })
        }
        return textResult({
          stack: plan.tech.name,
          from_version: plan.fromVersion,
          latest_version: plan.latest?.version ?? null,
          releases_in_range: plan.releasesInRange.map((release) => ({
            version: release.version,
            published_at: release.publishedAt?.toISOString() ?? null,
            importance: release.importanceLevel,
            prerelease: release.isPrerelease,
            source_url: release.rawReleaseUrl,
          })),
          breaking_changes: plan.breaking,
          security_notes: plan.security,
          deprecations: plan.deprecations,
          migration_checklist: plan.migrationSteps,
          coverage_note: `Based on ${plan.storedCount} stored releases (oldest: ${plan.oldestStored?.version ?? 'none'}). Releases published before StackPulse tracked this stack may be missing — verify against the source changelog.`,
        })
      },
    )

    server.registerTool(
      'search_releases',
      {
        title: 'Search releases',
        description:
          'Full-text search across stored release summaries, titles, versions, deprecations, and migration notes for every tracked stack.',
        inputSchema: z.object({
          query: z.string().min(2).max(200).describe('Search text, e.g. "app router" or "CVE"'),
          limit: z.number().int().min(1).max(30).default(10).describe('Max results'),
        }),
      },
      async ({ query, limit }) => {
        const page = await getReleaseFeedPage({
          scope: { type: 'public' },
          importance: 'all',
          read: 'all',
          signal: 'all',
          tech: 'all',
          search: query,
          limit,
        })
        return textResult({
          count: page.items.length,
          results: page.items.map((item) => ({
            stack: item.techName,
            version: item.version,
            title: item.title,
            published_at: item.publishedAt,
            importance: item.importanceLevel,
            signals: item.releaseSignals ?? [],
            summary: item.summary,
            source_url: item.rawReleaseUrl,
          })),
        })
      },
    )
  },
)

function isMcpRateLimited(ip: string): boolean {
  const now = Date.now()

  if (mcpAttempts.size >= MAX_MCP_RATE_LIMIT_KEYS) {
    for (const [key, attempt] of mcpAttempts) {
      if (attempt.resetAt <= now) mcpAttempts.delete(key)
    }
  }

  const current = mcpAttempts.get(ip)
  if (!current || current.resetAt <= now) {
    mcpAttempts.set(ip, { count: 1, resetAt: now + MCP_RATE_LIMIT_WINDOW_MS })
    return false
  }

  if (current.count >= MAX_MCP_REQUESTS_PER_WINDOW) return true

  current.count += 1
  return false
}

async function rateLimitedHandler(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  if (isMcpRateLimited(ip)) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'rate limit exceeded; try again later' },
        id: null,
      },
      { status: 429 },
    )
  }

  return handler(request)
}

export { rateLimitedHandler as GET, rateLimitedHandler as POST }
