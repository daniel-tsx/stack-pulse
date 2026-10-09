# F1 — GitHub recovery and cron health

**Status:** implemented locally; awaiting review and deployment approval

**Date:** 2026-10-09 (Asia/Saigon)

## Root cause and scope

Daniel confirmed that the fine-grained PAT `stackpulse-cron` expired. The fetcher sends
`GITHUB_TOKEN` as a Bearer credential, consistent with the recurring GitHub 401s in the
[diagnostic report](./cron-failure-investigation.md). It previously retried 4xx errors and
returned HTTP 200 with `success: true` even when every repository failed. Historical secret
values were not inspected. The reportedly refreshed token and replacement deployment have
not been proven healthy.

Inspected project instructions, the complete diagnostic report, GitHub/cron/ingestion/auth/
AI/database/webhook/status code, caller usage, config, installed Next.js route-handler
guidance, and current operations docs. No application diagnostic already offered a safe
credential-only check.

## Changes and files

- `src/lib/github.ts`: typed safe errors, accurate 403 classification, network/5xx-only
  retry, per-invocation 401 state, and a single-request credential check.
- `src/lib/release-ingestion.ts`: expose real discovery/processing/failure counters and
  safe stage errors; allow explicit failed run finalization. The custom-repo caller remains
  compatible and retains its default completion behavior.
- `src/app/api/cron/fetch-releases/route.ts`: stop new chunks after global auth/database
  failures, count rejected/deferred work, bound reported errors, finalize real outcomes,
  and log a safe completion summary.
- New `src/app/api/cron/github-health/route.ts`: protected read-only manual check.
- `src/app/status/page.tsx`: existing rose badge for failed runs; correct the claim that
  every missed release retries automatically.
- New `tests/cron-recovery.test.mjs` and `package.json` `test:cron`: focused Node tests,
  using installed TypeScript to execute actual source against strict mocked imports.
- `.env.example`, `README.md`, `docs/AGENT_START_HERE.md`,
  `docs/features/release-ingestion.md`, and operations `environment-variables.md`,
  `verification.md`, `local-development.md`, `deployment.md`: current contract/setup.
- This report. Existing untracked portfolio docs and the prior diagnostic were untouched.

No schema migration, dependency/lockfile change, AI retry change, pagination, credential
change, deployment, production write, live cron invocation, push or commit was performed.

## Classification and execution contract

| Failure | Category / scope | Behavior |
|---------|------------------|----------|
| Missing/blank token | `GITHUB_TOKEN_MISSING` / global | Cron fails before repository attempts; health check makes zero requests. |
| GitHub 401 | `GITHUB_AUTH` / global | No retry or anonymous fallback. Shared invocation context blocks every new request, including retries. |
| GitHub 403 permission | `GITHUB_PERMISSION` / repository | Does not stop other repositories. |
| GitHub 403 rate limit / 429 | `GITHUB_RATE_LIMIT` / repository | Uses remaining=0, Retry-After, or secondary-limit message classification; no immediate retry. |
| GitHub 404 | `GITHUB_NOT_FOUND` / repository | May mean absent or inaccessible repository; no global stop. |
| Network/timeout / 5xx | `GITHUB_NETWORK` / `GITHUB_UPSTREAM`, repository | At most one existing retry, blocked if another request confirmed 401. |
| Invalid repository request | `GITHUB_REPOSITORY` / repository | Safe error without echoing the URL. |
| AI failure | `AI` / release | Safe stage and numeric upstream status, including 429; existing AI behavior unchanged. |
| Database failure | `DATABASE` / global or release | SQLSTATE classes 22/23 are release-specific; unknown/connection failures are conservatively global. |

Messages are fixed safe strings. F1 errors never emit raw upstream bodies, exception
objects, stack traces, credential values or Authorization headers. A 403 message is read
only for classification. Existing delivery logging is outside this change.

| Outcome | HTTP | Stored ingestion status |
|---------|------|-------------------------|
| `success` | 200 | `completed` |
| `partial_success` | 200 | `completed_with_errors` |
| `failed` | 500 for internal/config/database failures; otherwise 502 | `failed` |

Clean empty results, filtered releases, existing tags and insert-conflict no-ops succeed.
Partial requires confirmed successful repository or eligible release work plus errors or
budget deferral. Global auth/database failure always fails, even after successful inserts.
All operational failures with no successful work fail. Upstream 401 is never the route's
caller-auth 401; `requireCronAuth` is unchanged.

`summary` records planned/attempted/succeeded/failed/deferred repositories and discovered/
processed/inserted/failed releases. Discovered includes all returned releases; processed
includes eligible successful operations and dedup no-ops. Fetch errors do not invent
release failures. `errors` is capped at 20 while `errorCount` and stored totals count all
failures. `runFinalized` identifies audit-write failure. Scheduled runs emit
`release cron completed` with safe counters and bounded errors.
Unexpected processor rejection sets `releaseCountersComplete: false`; totals include only
confirmed results, since that processor might have committed inserts before throwing.

Up to six requests already started can settle after a 401; successful inserts and webhook
IDs survive. No subsequent chunk or fetch retry starts with the rejected credential.
State resets next invocation. Discovery remains five releases, with the same filters,
prerelease eligibility, AI generation, values and unique insert target. No extra GitHub or
AI calls occur in normal ingestion.

Delivery remains after ingestion finalization with separate `webhooks` counters. An
unexpected dispatcher exception is reported safely in the response/log; the already
finalized row still describes ingestion before delivery.

## Local verification

- **34 focused tests passed:** missing token/public-helper compatibility, all GitHub error
  classes, bounded retries, concurrent 401 blocking/retry suppression, retained inserts,
  invocation isolation, mixed/all-failed/no-op outcomes, repository selection, filters,
  prereleases, dedup/conflicts, AI and DB failures, processor rejection, budget deferral,
  caller authentication, safe logs/responses and one-request diagnostic isolation.
- Installed TypeScript 7 check passed:
  `node_modules\.bin\tsc.cmd --noEmit --incremental false`.
- Installed ESLint check passed: `node_modules\.bin\eslint.cmd .`.
- Focused test command: `node --test tests/cron-recovery.test.mjs`.
- `git diff --check` passed; code formatting follows the repository Prettier config.

`pnpm test:cron`, `pnpm typecheck`, and `pnpm lint` could not start: Corepack tried to
download pnpm 11.1.3 and sandbox DNS returned `ENOTFOUND registry.npmjs.org`. The installed
equivalents above ran successfully. Initial test harness response-stub and lint naming
issues were corrected before the passing checks. All external services were mocked;
these tests do not prove a live token, real DB constraint deployment or production recovery.
No full production build or browser smoke test was run.

## Exact manual production verification after approved deployment

1. In **Vercel → Daniel / stack-pulse → Settings → Environment Variables**, confirm the
   `GITHUB_TOKEN` name targets **Production**, and its change predates the active deployment.
   Inspect names/scope/timestamps, without revealing or exporting its value. The operator
   should separately check the PAT's expiry/revocation/approval and selected repositories
   in GitHub settings. Also confirm `CRON_SECRET` is configured.
2. In **Deployments**, open the active Production deployment and verify its Git source SHA
   is the reviewed F1 commit and status is Ready. Record SHA, deployment URL and deployment
   time. A deployment made before this uncommitted F1 work does not contain it. Environment
   updates require a new deployment; do not claim rollout solely from project settings.
3. Use a trusted API client with a **sensitive local variable** holding the existing
   `CRON_SECRET`. Send **GET `https://<active-production-origin>/api/cron/github-health`**
   with **`Authorization: Bearer {{CRON_SECRET}}`**. Disable verbose/header logging and
   shared/exported request history. Send one request; do not call `fetch-releases`.
4. Expect HTTP **200**, `{"status":"success","githubAuthenticated":true}`, and
   `Cache-Control: no-store`. 502/`GITHUB_AUTH` means the credential is rejected;
   500/`GITHUB_TOKEN_MISSING` means runtime configuration is missing; caller 401 means the
   supplied cron secret is wrong. Network/rate/permission errors are distinct. This check
   validates token authentication, not access to every private release repository. It
   makes at most one GitHub `/user` request and no AI/database requests. GitHub documents
   that this authenticated-user endpoint requires no fine-grained token permissions:
   [authenticated user API](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).
5. Wait for the **next scheduled fetch at 00:00 or 12:00 UTC (07:00/19:00 UTC+7)** after
   rollout. In Vercel Logs filter `requestPath:/api/cron/fetch-releases` for that invocation
   and active deployment. Inspect `release cron completed`: outcome, HTTP code, `runId`,
   `runFinalized`, counters, `errorCount` and safe error categories. Confirm no
   `GITHUB_AUTH`/upstreamStatus 401 appears. A partial 200 still needs investigation.
6. Read the matching `release_fetch_runs` row in the production DB console (read-only):
   compare status, scanned/inserted/error totals, details and finished time with the log.
   Compare actual `release_updates` rows for expected repository/version pairs and count
   inserts for the run's time window; do not infer persistence from HTTP 200 alone.
   `/status` is a convenient summary with up to five minutes of cache delay. Zero inserts
   can be healthy if the latest eligible releases already exist; this is not a full gap inventory.
7. Separately inspect **`AI` / upstreamStatus 429** failures and release-failure counters.
   Prior evidence identifies OpenRouter's StreamLake/DeepInfra shared-pool limits. A healthy
   GitHub check does not resolve them. No inference call is needed just to inspect logs.

Record the diagnostic result, F1 SHA, scheduled run ID/outcome and read-only persistence
comparison. Recovery remains unverified until these checks are completed by the operator.

## Limits, deferred work and rollback

- **F2:** AI response guards, provider metadata and shared pacing/backoff; 429s remain
  independent. F1 identifies the AI stage without dumping the provider's raw error.
- **F3:** pagination/outage inventory/backfill. Missing releases outside the latest five
  remain unrecoverable through ordinary polling; no pending summary record is introduced.
- **F4:** deadlines/resumption, abandoned runs, overlap/cost claims and delivery replay.
  The existing 300s maximum and 270s chunk-start budget remain; a slow in-flight chunk can
  still exceed the budget. No lock, hard deadline or whole-invocation retry was added.
  Finalization failure can leave a `running` row despite committed inserts. Unknown DB
  errors fail conservatively. Structured F1 errors omit raw provider troubleshooting data.

Rollback: after approval, roll back application code to the previously approved deployment
or revert this scoped change and redeploy. Preserve the valid current `GITHUB_TOKEN` and
`CRON_SECRET`; never restore the expired PAT. No database rollback/migration is necessary;
old text-status readers accept existing `failed` rows. Rolling back removes accurate auth/
outcome handling and the protected diagnostic, so the earlier misleading 200 behavior returns.

**Eastbase review verdict:** Approve with follow-ups for this scoped F1 implementation;
no identified merge blocker after local checks. Production recovery, F2/F3 and existing F4
risks remain open. This is not a launch-readiness verdict or deployment authorization.
