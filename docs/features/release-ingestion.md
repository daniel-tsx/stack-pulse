# Release ingestion

**Status:** current

## Flow

1. Resolve techs to fetch: **all registry stacks** (`category != 'custom'`) plus custom repos followed by ≥1 user (`user_tech_preferences`)
2. For each tech, fetch up to 5 latest GitHub releases (`src/lib/github.ts`)
3. Skip drafts and duplicates (`techId` + `version` unique)
4. Summarise via OpenRouter (`summarizeRelease` in `src/lib/ai.ts`)
5. Insert into `release_updates`

Registry stacks fetch regardless of followers so public `/stacks/[slug]` pages stay fresh and a first follow never lands on an empty feed.

## Triggers

| Trigger | Entry point | `release_fetch_runs.trigger` |
|---------|-------------|-------------------------------|
| Vercel Cron | `GET /api/cron/fetch-releases` | `cron` |
| Custom repo add | `addCustomTech` in `actions.ts` | `custom_repo` |

Cron auth: `Authorization: Bearer {CRON_SECRET}` (timing-safe compare).

Processing runs in chunks of 6 techs in parallel (`CHUNK_SIZE` in cron route). `maxDuration = 300` with a 270s internal budget checked before chunks. Remaining repositories are reported as deferred. Later runs still see only the latest five releases: older gaps are not guaranteed to recover.

## Cron outcomes

| JSON `status` | HTTP | Stored run status | Meaning |
|---------------|------|-------------------|---------|
| `success` | 200 | `completed` | Every attempted repository completed without ingestion errors; empty results and duplicates are successful work. |
| `partial_success` | 200 | `completed_with_errors` | Some repository/release work succeeded, but errors or budget deferral occurred. |
| `failed` | 500/502 | `failed` | Global GitHub auth/database failure, or operational errors with no successful work. |

`success` is true only for a clean outcome. `summary` includes selected/attempted/succeeded/failed/deferred repository counts and discovered/processed/inserted/failed release counts. `releasesDiscovered` includes all returned releases; `releasesProcessed` counts eligible successful operations, including existing tags and conflict no-ops. Fetch failures do not invent release failures. `errors` contains at most 20 safe classifications; `errorCount` retains the full count. Rejected processors are counted. `runFinalized: false` means the audit row could not be finished (or created).

`release cron completed` logs the outcome and counters for scheduled-run inspection. These report execution health, not freshness or complete outage recovery. SQL data/constraint failures are release-specific; unknown database failures are conservatively global. Existing caller auth still returns 401 for an invalid `CRON_SECRET`, 500 when that secret is missing.

Release validation and processing failures return accumulated committed counters and notification IDs, even when a later entry fails. Invalid entries count as release failures; valid later entries still process. Non-array GitHub payloads fail before release processing. If a processor still rejects outside this result boundary, `releaseCountersComplete: false` marks its release counts as unknown. Returned totals then include only confirmed processor results; inspect actual DB rows rather than assuming zero inserts for that rejected processor.

Webhook delivery counts remain separate in `webhooks`. Ingestion is finalized before dispatch, as before; an unexpected dispatch exception is safely reported in the response/log, but the stored row describes ingestion before delivery. Delivery retries and deadline guarantees are deferred.

## Schedule (code truth)

`vercel.json`:

```json
{ "path": "/api/cron/fetch-releases", "schedule": "0 0,12 * * *" }
```

Twice daily at **00:00 and 12:00 UTC** — not every 4 hours (marketing copy may be wrong).

## Fetch run logging

`release_fetch_runs` stores run metadata and per-tech `{ tech, inserted, errors }` in `details` JSON. `/status` displays run status/counters and revalidates every five minutes. No schema migration is required for the new `failed` text status.

## GitHub API

- `GITHUB_TOKEN` is required by cron and the protected health check. Standalone public-repository fetching remains optional-auth.
- 8s timeout, at most one retry on network/5xx; no automatic retry of 4xx or the whole cron.
- Repository redirects are followed explicitly, with the auth guard before each HTTP dispatch and a limit of 20 follows. Only credential-free URLs on `https://api.github.com` are accepted. The same 8s timeout covers the whole redirect chain; a retry gets a fresh timeout.
- 401 is global authentication failure: the per-invocation context blocks all new GitHub requests, including retries. Already-running requests settle; committed inserts survive. No anonymous fallback or cross-invocation lock.
- 403 is permission failure unless rate-limit headers/message identify primary/secondary limiting; 429 is rate limiting. 404 remains repository-specific and can also conceal inaccessible private resources. Upstream bodies and credentials are not emitted by the new classifications.
- `GET /api/cron/github-health` requires `CRON_SECRET` and performs at most one uncached `/user` request, without redirect follows, retries, AI, DB or profile output. It is manual only; success validates authentication, not every repository permission. See [F1 recovery report](../audits/F1-cron-recovery.md) for exact production verification.

## Backfill

`pnpm releases:backfill` — re-summarise existing rows missing intelligence (`scripts/backfill-release-intelligence.ts`).
