# App overview

**Status:** current

## Routes & pages

App Router route groups — see [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) for UI templates and layout widths.

| Path | File | Auth | Purpose |
|------|------|------|---------|
| `/` | `src/app/page.tsx` | optional | Landing |
| `/sign-in` | `src/app/(auth)/sign-in/page.tsx` | no | GitHub sign-in |
| `/sign-up` | `src/app/(auth)/sign-up/page.tsx` | no | Redirects → `/sign-in` |
| `/onboarding` | `src/app/(dashboard)/onboarding/page.tsx` | yes | Stack selection |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` | optional | Release feed (redirects to onboarding if signed in with no stacks) |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` | yes | Slack/Discord webhook notification settings |
| `/stacks` | `src/app/stacks/page.tsx` | no | Public stack index |
| `/skills` | `src/app/skills/page.tsx` | no | Curated skills and recent update events |
| `/skills/[slug]` | `src/app/skills/[slug]/page.tsx` | no | Skill source state and history |
| `/skills/[slug]/updates/[updateId]` | `src/app/skills/[slug]/updates/[updateId]/page.tsx` | no | Evidence and advisory impact report |
| `/api/cron/fetch-skill-updates` | `src/app/api/cron/fetch-skill-updates/route.ts` | `CRON_SECRET` | Independent twice-daily skill ingestion |
| `/stacks/[slug]` | `src/app/stacks/[slug]/page.tsx` | no | Public stack release page |
| `/stacks/[slug]/rss.xml` | `src/app/stacks/[slug]/rss.xml/route.ts` | no | RSS 2.0 feed per stack (CDN-cached 1h) |
| `/stacks/[slug]/upgrade` | `src/app/stacks/[slug]/upgrade/page.tsx` | no | Upgrade planner: `?from=<version>` aggregates stored breaking changes/deprecations/migration steps up to latest |
| `/status` | `src/app/status/page.tsx` | no | Ingestion status: recent fetch runs (revalidates 5min) |
| `/privacy`, `/terms` | `src/app/privacy/page.tsx`, `terms/page.tsx` | no | Legal |
| `/api/auth/[...all]` | `src/app/api/auth/[...all]/route.ts` | — | Better Auth handler |
| `/api/releases` | `src/app/api/releases/route.ts` | optional | Paginated feed JSON |
| `/api/release-advice` | `src/app/api/release-advice/route.ts` | yes | AI upgrade advice |
| `/api/mcp/[transport]` | `src/app/api/mcp/[transport]/route.ts` | no (rate-limited) | MCP server — see [mcp-server.md](./mcp-server.md) |
| `/api/cron/fetch-releases` | `src/app/api/cron/fetch-releases/route.ts` | `CRON_SECRET` | Scheduled ingestion |
| `/api/cron/send-digest` | `src/app/api/cron/send-digest/route.ts` | `CRON_SECRET` | Weekly digest emails |
| `/api/digest/unsubscribe` | `src/app/api/digest/unsubscribe/route.ts` | token | One-click unsubscribe (POST) |
| `/digest/unsubscribe` | `src/app/digest/unsubscribe/page.tsx` | token | Unsubscribe confirmation page |

## Key directories

```
src/app/          App Router pages and API routes
src/components/   UI (dashboard/, landing/, ui/)
src/db/           Drizzle schema, client, seed
src/lib/          auth, ai, github, release-feed, actions
drizzle/          SQL migrations
scripts/          backfill, icon generation
```

## Limits (from `src/lib/actions.ts`)

- 30 total followed stacks per user
- 5 custom GitHub repos per user (`category: 'custom'`)
- 5 releases fetched per tech per run (`RELEASES_PER_TECH` in `release-ingestion.ts`)
