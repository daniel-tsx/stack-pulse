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

| Trigger         | Entry point                     | `release_fetch_runs.trigger` |
| --------------- | ------------------------------- | ---------------------------- |
| Vercel Cron     | `GET /api/cron/fetch-releases`  | `cron`                       |
| Custom repo add | `addCustomTech` in `actions.ts` | `custom_repo`                |

Cron auth: `Authorization: Bearer {CRON_SECRET}` (timing-safe compare).

Processing runs in chunks of 6 techs in parallel (`CHUNK_SIZE` in cron route).
`maxDuration = 300`. F2.1 starts a monotonic execution clock on route entry, with a
cooperative work cutoff at 270s covering selection, GitHub discovery, filtering, AI,
lookups and inserts. A separate reserve permits finalization until 285s and webhook
preparation/delivery until 295s, leaving 5s response margin. New repository/release work
needs at least 1s remaining. GitHub, AI and Neon HTTP requests receive cancellation
signals; cleanup awaits started work rather than racing outstanding writes.
Later runs still see only the latest five releases: older gaps are not guaranteed to recover.

AI summary requests within those processors share one execution-scoped queue: one active
summary, at most three application attempts, coordinated bounded cooldown and the same
270s work cutoff. This does not serialize GitHub discovery. Queued AI work that cannot fit
the budget fails explicitly; unstarted repository chunks and remaining discovered entries
are deferred. See [AI summarization](./ai-summarization.md) for retry rules. Cancellation
is cooperative: process termination, blocked event loops and remote commits after a lost
HTTP response can still prevent complete cleanup. Durable reconciliation remains deferred.

## Cron outcomes

| JSON `status`     | HTTP    | Stored run status       | Meaning                                                                                                          |
| ----------------- | ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `success`         | 200     | `completed`             | Every attempted repository completed without ingestion errors; empty results and duplicates are successful work. |
| `partial_success` | 200     | `completed_with_errors` | Some repository/release work succeeded, but errors or budget deferral occurred.                                  |
| `failed`          | 500/502 | `failed`                | Global GitHub auth/database failure, or operational errors with no successful work.                              |

`success` is true only for a clean outcome. `summary` includes selected/attempted/succeeded/failed/deferred repository counts and discovered/processed/inserted/failed release counts. `releasesDiscovered` includes all returned releases; `releasesProcessed` counts eligible successful operations, including existing tags and conflict no-ops. Fetch failures do not invent release failures. `errors` contains at most 20 safe classifications; `errorCount` retains the full count. Rejected processors are counted. `runFinalized: false` means the audit row could not be finished (or created).

F2.1 adds `releasesSkipped` (filtered drafts/unpublished/empty tags), `releasesDeferred`
(returned entries whose processing never began), and `releasesCancelled` (a subset of
failed release operations interrupted by the work cutoff). For settled processor results,
discovered = processed + failed + skipped + deferred. Deferred entries have not yet been
filtered, so they may include drafts. Cancelled discovery does not invent release counts.

`release cron completed` logs the outcome and counters for scheduled-run inspection. These report execution health, not freshness or complete outage recovery. SQL data/constraint failures are release-specific; unknown database failures are conservatively global. Existing caller auth still returns 401 for an invalid `CRON_SECRET`, 500 when that secret is missing.

F2 adds `summary.aiOperationsFailed` and an `ai` object with logical summary
`succeeded`/`failed`, application `attempts`/`retries` and cooldown activation counts.
Failures include budget/cooldown rejections with zero HTTP attempts; successful AI followed
by a failed insert remains an AI success and a failed release with zero committed inserts.
AI errors normally keep the F1 `category:AI`/release scope and add safe `ai` details and a numeric
`releaseId` when available. These fields are response/log metadata, not new audit columns.
Global deadline cancellation uses `category:TIME_BUDGET`, retaining AI details where available.

Release validation and processing failures return accumulated committed counters and notification IDs, even when a later entry fails. Invalid entries count as release failures; valid later entries still process. Non-array GitHub payloads fail before release processing. If a processor still rejects outside this result boundary, `releaseCountersComplete: false` marks its release counts as unknown. Returned totals then include only confirmed processor results; inspect actual DB rows rather than assuming zero inserts for that rejected processor.

An insert acknowledged at the cutoff still counts. A cancelled or globally failed insert
can have an uncertain remote commit; it receives no guessed success count/notification ID
and sets `releaseCountersComplete:false`. Confirmed prior IDs remain eligible for delivery.
The audit row stores confirmed counts only and does not persist that completeness flag.

Webhook delivery counts remain separate in `webhooks`. Ingestion is finalized before
dispatch; the stored row describes ingestion before delivery. Cleanup cancellation reports
`webhooks.deadlineReached`; known unsent destinations report `deferred`. An uncertain send
counts as a delivery error, not a confirmed send. Automatic delivery replay remains deferred.

`release cron progress` logs run ID, monotonic elapsed/remaining work time, aggregated
stage durations and active-operation counts every 30s. `release cron completed` and the
response include `elapsedMs` and `timings`. Stage durations sum operation time (overlapping
work can exceed elapsed time); active operations accrue duration when they settle.
No raw provider bodies, webhook URLs, prompts or credentials are included in these logs.
See [F2.1 recovery assessment](../audits/F2.1-review-fixes.md) for stale-running rows and
notification uncertainty after hard termination. Existing rows are never repaired automatically.

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
