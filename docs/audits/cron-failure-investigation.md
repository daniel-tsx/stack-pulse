# StackPulse — production cron failure investigation

**Status:** current diagnostic; fixes proposed, not implemented

**Investigated:** 2026-10-09 (Asia/Saigon, UTC+7)

**Source commit:** `071747044782885127c063b70d40d572139de88b`

Scope: read-only investigation of `GET /api/cron/fetch-releases`. Inspected project guidance, feature/operations docs, ingestion/auth/AI/database/webhook/status code, migrations, Git history, installed OpenAI SDK, and bounded production logs through the Vercel CLI. Only this report was added to the repository. No application changes, deployment, production writes, credential-value inspection, or real AI requests were performed.

## 1. Executive summary

- **GitHub 401:** Daniel confirmed that the fine-grained PAT `stackpulse-cron` expired. The code sends `GITHUB_TOKEN` as a Bearer credential, consistent with that failure. Matching the expired PAT to the previous deployment's secret remains a human verification; values were not decrypted.
- **429 source confirmed:** OpenRouter forwarded rate limits from **StreamLake** and **DeepInfra** serving `deepseek/deepseek-chat`. Metadata says `upstream_provider_shared_pool`; DeepInfra also reports `engine_overloaded`. These are independent of GitHub authentication.
- **Recovery is incomplete:** restoring authentication allows missing releases to be processed only while they remain in the first five GitHub results. Older gaps require explicit catch-up.
- **Success reporting is misleading:** eight invocations on October 6–9 each logged 90 GitHub 401 failures and returned HTTP 200. The route always returns `success: true` after handled failures.

The failing deployment `stack-pulse-jff9xowbn-daniel-tsx.vercel.app` (`dpl_EFy79SL3PkfuL4t76Djhw13N4WBy`) matches the source commit above. Metadata shows `GITHUB_TOKEN` was updated **October 9 at 20:21:51 UTC+7** and a replacement production deployment became ready at **20:23:00**, using the same commit. These externally observed changes do not prove recovery. Next scheduled invocation: **October 10 at 07:00 UTC+7**.

## 2. Current cron execution flow

| Stage | Implementation and behavior |
|---|---|
| Invocation/auth | `vercel.json:3` schedules 00:00/12:00 UTC (07:00/19:00 UTC+7). `src/lib/cron-auth.ts:12–25` compares `CRON_SECRET` with the incoming Bearer credential using timing-safe comparison; missing secret returns 500, incorrect credential 401. The observed GitHub errors occur after this check. |
| Repository selection | `src/app/api/cron/fetch-releases/route.ts:23–39` reads `technologies` and followers, selects all registry stacks plus followed custom repos, then creates a fetch-run row. URLs come from database configuration; `src/db/seed.ts:14–49` defines registry examples. |
| Discovery | `src/lib/github.ts:24–65` requests `/repos/{owner}/{repo}/releases?per_page=5`, with an 8-second timeout per attempt. No pagination or stored discovery cursor. |
| Filtering/deduplication | `src/lib/release-ingestion.ts:17–18,39–52` skips drafts, missing publication dates/tags, and already-stored `(techId, tag)` pairs. Prereleases are eligible and count toward the five results. |
| AI | `src/lib/release-ingestion.ts:54–62` calls `summarizeRelease` before storing anything. `src/lib/ai.ts:12–28,185–225` sends a non-streaming, strict JSON-schema request to OpenRouter, then parses and validates it with Zod. |
| Persistence | `src/lib/release-ingestion.ts:64–95` inserts the summary and raw release together. Unique `(tech_id, version)` plus `onConflictDoNothing` prevents duplicate rows; no update of existing tags. |
| Failure isolation | GitHub failure returns one counted error for that repository (`release-ingestion.ts:32–36`). Lookup, AI, validation and insertion share a catch labeled `insert failed` (`:42–100`); later releases continue. Six repositories run concurrently; unexpected rejected processors are logged but omitted from results (`route.ts:48–56`). |
| Finish/response | `release-ingestion.ts:143–166` stores `completed` or `completed_with_errors`. `route.ts:60–63` dispatches webhooks, then returns HTTP 200 with `success: true`, counters and results. Top-level DB failures can escape and fail the request. |

## 3. GitHub 401 — root cause analysis

`src/lib/github.ts:32–34` attaches exactly `Authorization: Bearer ${process.env.GITHUB_TOKEN}`. Development and production use the same logic. GitHub OAuth `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and users' OAuth tokens are not used for cron fetching.

A missing/empty token omits authentication; a present expired, revoked or invalid token is still sent. There is no refresh, expiry check, or fallback after a 401. Bearer syntax is correct; invalid credentials produce 401 according to [GitHub authentication documentation](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api). The token attachment has been unchanged since the initial May 10 implementation; repository history does not support a recent header regression.

Eight invocations from October 6 07:00 through October 9 19:00 UTC+7 each have **90 logged GitHub 401 failures** on the same deployment. This supports a shared credential failure. Request `9h9xh-1791244825234-8d7b39a2ca22` matches the supplied screenshot.

The catch at `github.ts:64–65` retries every thrown HTTP error, including 401/403/404/429, immediately. Thus the comment promising network/5xx-only retries is inaccurate. The response body and GitHub request ID are discarded; every 403 is labeled a rate limit without checking whether it is a permission error.

**Recommendation:** classify 401 separately, do not retry it, stop starting further chunks, and finalize with an operational `github_auth_failed` error. Preserve safe status/stage/repository/request-ID fields. An upstream GitHub 401 should not become the route's own 401, which means invalid `CRON_SECRET`.

## 4. HTTP 429 — root cause analysis

The logs identify the actual providers; Mongoose and Ollama are the repositories being summarized, not inference providers.

| Invocation, UTC+7 | Release | Final provider in error metadata | Evidence |
|---|---|---|---|
| Oct 3, 07:00 | Ollama `v0.35.1` | StreamLake | 429, `upstream_provider_shared_pool`, `is_byok: false` |
| Oct 3, 19:00 | pnpm `v12.9.0` / Mongoose `9.10.4` | StreamLake / DeepInfra | Same limit source; DeepInfra `engine_overloaded` |
| Oct 5, 07:00 | Ollama `v0.40.0-rc3` | DeepInfra | Same limit source and overload code |
| Oct 5, 19:00 | Mongoose `8.24.5` | StreamLake | Same limit source |

The last row belongs to request `7v5zd-1791201625226-154aa7805182`, generation `gen-1791201670-UcuZixagNrLNv5MMYMpo`. Every sampled 429 names `deepseek/deepseek-chat`; none has a captured `Retry-After` header. Earlier gateway attempts cannot be reconstructed because `previous_errors` is logged as `[Array]`. These samples identify upstream limits, not database or account-credit failures.

The client uses `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` or default `deepseek/deepseek-chat`, a 25-second timeout and **one SDK retry** (`ai.ts:19–28,186`). `require_parameters: true` restricts routing to schema-compatible providers; no provider or alternate model is configured in code. Advice/backfill share the AI integration.

Installed OpenAI SDK **6.38.0**, `node_modules/openai/src/client.ts:975–1047`, retries 429 once unless `x-should-retry` says otherwise. It honors `retry-after-ms`/`Retry-After`; absent those, its first retry waits roughly **375–500 ms** with jitter. An exponential formula exists, but one configured retry gives only its first step. In this installed version, server-requested waits are not capped by the cron deadline.

Six AI calls can be active per invocation: up to 30 logical calls per chunk, or 60 HTTP attempts with retries, before gateway attempts. No shared pacing/cooldown limits pressure on the overloaded pool; overlap and advice add demand. [OpenRouter's limits documentation](https://openrouter.ai/docs/api_reference/limits) distinguishes gateway and provider limits; the captured metadata identifies provider limits.

**Recommendation:** reuse the bounded SDK retry, add shared AI pacing/cooldown, and defer when retry waits exceed the run budget. Review schema-compatible routing before changing providers or model cost.

## 5. HTTP 200 / partial failure behavior

Failure isolation intentionally preserves successful work. However, **all repositories failing still produces `success: true`**, with DB status `completed_with_errors`: incorrect reporting for a total outage.

Additionally, rejected processors disappear from error totals; a budget break can mark a subset as `completed`. Both were reproduced locally. `/status` displays run counters (`src/app/status/page.tsx:41–46,134–156`), but cannot expose errors absent from those counters. The ingestion doc's claim that there is no status UI is stale.

Proposed contract: clean completion → 200/`success: true`; partial/deferred → explicit status, `success: false` and expected/scanned/deferred/error counts; blocked/total upstream failure → non-2xx, for example 502. A partial 200 needs outcome monitoring. [Vercel does not automatically retry failed cron invocations](https://vercel.com/docs/cron-jobs/manage-cron-jobs); HTTP status changes alone do not recover data.

## 6. Production data impact and recovery risks

- **Missing discovery:** only the first five releases are requested. An outage release outside that window will never be rediscovered by current cron logic. Increasing the window helps but does not guarantee recovery. A mocked two-run scenario confirmed an AI-failed release disappearing when a newer release displaced it.
- **Missing persistence:** GitHub errors perform no AI call or release insert. AI errors occur before both summary and raw notes are saved; there is no durable pending record. Actual missing versions/counts require comparing paginated GitHub releases with production `release_updates`; no production DB query was run here.
- **Retry scope:** eligible repositories are retried next run, but only their current five results. Unfollowed custom repos remain excluded. The existing `scripts/backfill-release-intelligence.ts:43–67` only re-summarizes existing rows; it cannot recover absent rows.
- **Consistency/idempotency:** successful inserts survive later failures. Schema `src/db/schema.ts:52–85` and migration `drizzle/0000_fuzzy_calypso.sql:33` define the unique pair; production constraint presence was not queried. Overlapping runs can both pay for AI before one insert loses the conflict. Existing tags are skipped even if upstream release notes change.
- **Deadline:** the 270-second budget is checked only before a chunk, after initial DB work. A chunk can include five sequential 25-second AI attempts plus retries per repository, followed by finalization and webhook work. There is no shared deadline cancellation; timeouts can leave a `running` row with already-inserted releases. Repository selection is unordered and has no saved resume position, so repeated slow runs do not guarantee fair catch-up.
- **Delivery:** webhook dispatch only receives newly inserted IDs (`route.ts:37,53,61`); failures/timeouts have no durable delivery retry. `src/lib/webhooks.ts:12–13,162–164,209–234` excludes prereleases and releases older than three days. Historical recovery therefore does not guarantee historical notifications. Do not replay notifications indiscriminately.

## 7. Findings ranked by severity

No Critical finding was established. Each reference is a repository-relative path and current line number.

| ID / severity | Evidence and root cause | Confidence | Minimal recommended fix |
|---|---|---|---|
| F1 **High** — shared GitHub credential failure | Confirmed PAT expiry; eight runs × 90 logged 401s. `src/lib/github.ts:32–65` sends the shared token and retries 401 without classification. Mapping the historical value to that PAT remains unverified. | High; mapping needs human confirmation | Verify replacement Production token, stop retrying 401, fail the run clearly and alert on shared authentication failure. |
| F2 **High** — gaps do not reliably recover | `src/lib/release-ingestion.ts:13,33,54–86`; `src/lib/github.ts:36,63`: five-result window, AI before persistence, no pagination/pending identity. Window-loss reproduced. | Confirmed design risk; actual gap size unknown | Bounded, paginated outage catch-up with dry-run comparison; retain retry identities for failed summaries. |
| F3 **High** — total outage reported successful | `src/app/api/cron/fetch-releases/route.ts:49–63`; `src/lib/release-ingestion.ts:150–165`. Production 200s and synthetic all-failure/rejection cases. | Confirmed | Explicit failed/partial outcomes; non-2xx for blocked/total failure; count rejected and deferred work. |
| F4 **Medium** — AI shared-pool overload | Production 429 metadata names StreamLake/DeepInfra. `src/lib/ai.ts:19–28,189–216`; cron `route.ts:14,49` permits six concurrent calls without cooldown. | Provider/source confirmed; concurrency contribution plausible | Reduce shared AI pressure; honor cooldown within deadline; inspect compatible routing before changing it. |
| F5 **Medium** — deadline/coverage reporting gaps | `route.ts:23–45,60–61`; `release-ingestion.ts:39–100`; `src/db/schema.ts:100`. Budget only guards chunk starts; no resume state; interrupted runs stay running. | Confirmed code behavior; incident timeout not observed | Apply deadline checks to release/attempt boundaries, reserve finalization time, record deferred work and reconcile abandoned runs. |
| F6 **Medium** — duplicate AI spend on overlapping runs | `release-ingestion.ts:44–55,88–90`; no claim before AI. Unique row protection happens after generation. Twelve-hour schedule makes normal adjacent-run overlap unlikely; duplicate/manual events can still overlap. | Confirmed race opportunity; actual overlap unknown | Add a bounded run lease or per-release claim if overlap is enabled; keep the unique constraint. |
| F7 **Medium** — AI errors lose their source | `src/lib/ai.ts:218,294` assumes `choices` exists. Production TypeErrors for pnpm/Mongoose; HTTP-200 error-envelope TypeError reproduced. Actual response bodies behind those TypeErrors are unavailable. Catch label `release-ingestion.ts:99` also mislabels AI errors as insertion failures. | TypeError confirmed; upstream payload explanation plausible | Check error envelopes/choices before indexing; distinguish GitHub, AI, validation and DB stages; log allowlisted metadata instead of entire error/header objects. |
| F8 **Medium** — notifications have no guaranteed replay | `src/lib/webhooks.ts:140,162–164,209–234`; cron `route.ts:53,61`: only new IDs, age filter, no delivery ledger. | Confirmed design risk; actual lost deliveries unknown | Document recovery exclusions; consider a small delivery retry ledger only if delivery guarantees are required. |

## 8. Recommended fixes in priority order

1. Verify the restored Production token and active deployment, then confirm ingestion recovery.
2. Classify 401, remove its retry, and correct failed/partial/deferred outcomes without undoing successful inserts.
3. Inventory and recover outage gaps through bounded pagination and DB comparison, with dry-run default. Continue past duplicates because gaps can lie between stored tags.
4. Guard AI envelopes and add shared pacing/cooldown; reuse SDK retries and review compatible routing.
5. Address deadline/resumption and abandoned runs, then overlap protection and notification guarantees as needed. No broad refactor or package upgrade is needed.

## 9. Verification checklist

Completed:

- [x] Deployment commit matches local source; GitHub header/history and AI provider path inspected.
- [x] Production log evidence retrieved for October 3–9; final 429 providers identified.
- [x] Environment **names, target scopes and timestamps only** checked. `GITHUB_TOKEN`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CRON_SECRET` exist for Production/Preview. Sensitive values are omitted by Vercel; omission does not mean missing/empty at runtime.
- [x] **16 safe diagnostic cases passed** using transpiled source, synthetic credentials, mock fetch and in-memory DB operations. Covered cron auth, token headers, erroneous 4xx retry, failure isolation, existing-tag skips, window loss, 200 reporting, rejected/deferred work, malformed AI response and the installed SDK's single 429 retry. No live service calls during these cases.
- [x] Installed TypeScript 7 check passed: `node_modules\.bin\tsc.cmd --noEmit --incremental false`.
- [x] Installed ESLint check passed: `node_modules\.bin\eslint.cmd .`.
- [x] Application diff remains empty; existing untracked `docs/architecture/portfolio/` untouched.
- [x] Source line references and all ten report sections verified; report whitespace check passed after removing two Markdown hard-break spaces.

Limitations/check failures: `pnpm typecheck` and `pnpm lint` could not start because Corepack tried downloading pnpm 11.1.3 and sandbox DNS returned `ENOTFOUND registry.npmjs.org`; direct installed-tool equivalents above passed. Vercel connector access returned 403, and the sandboxed CLI first failed DNS; authorized CLI network access succeeded. Build was not run for this documentation-only investigation. There is no existing automated test suite. Temporary diagnostic harness setup issues were corrected before the final 16-case pass; no test file was added to the app.

Human/external verification still required:

- [ ] Confirm the previous Production `GITHUB_TOKEN` corresponded to expired `stackpulse-cron`, and the replacement has valid expiry, revocation/approval status and suitable access. For private resources, fine-grained list-releases access requires Contents read; public release listing can be unauthenticated per [GitHub's release API documentation](https://docs.github.com/en/rest/releases/releases#list-releases). Do not paste credentials into the report/chat.
- [ ] Confirm the replacement token works through a safe read-only GitHub check and is present in the **active** production deployment. Environment changes apply to new deployments per [Vercel's environment guidance](https://vercel.com/docs/environment-variables); the observed redeploy is evidence of rollout, not credential validity.
- [ ] Check the next scheduled run's GitHub failures, inserts and completion status. Do not trigger production cron solely for this diagnostic: it writes data and generates billable AI requests.
- [ ] Verify Production `OPENROUTER_MODEL`/routing settings against the logged model; review StreamLake/DeepInfra errors, key/account limits and existing BYOK configuration without generating inference requests.
- [ ] Read `release_fetch_runs` and compare paginated GitHub releases with stored versions to quantify gaps, verify the unique constraint and detect abandoned/overlapping runs. No production schema or data changes are authorized here.

## 10. Proposed implementation plan

**Await approval before implementation.** Keep three focused changes independently reviewable:

1. **Auth + run reporting:** patch `github.ts`, `release-ingestion.ts`, cron route and status handling only as needed. Verify 401 causes one attempt per in-flight request, prevents further chunks and produces a failed operational outcome; verify mixed success, rejection and deferral accounting.
2. **Outage catch-up:** add a separate bounded, paginated recovery command with date/repository limits and dry-run default; reuse the existing summarizer and unique insert. Verify six-plus missing releases, holes among stored versions, prereleases, reruns and resumable limits against mocks. Production execution needs separate authorization after reviewing the inventory and AI cost bound.
3. **AI response + pacing:** guard error envelopes and allowlist provider/status/request-ID fields; cap shared concurrency and respect cooldown within remaining time. Verify 429, absent/long retry headers, malformed HTTP-200 responses, deadline expiry and no compounded retry loop. Then assess a small lease/retry-state addition against remaining coverage and cost risks.

Eastbase review overlay: **Approve with follow-ups for this diagnostic report**; it preserves scope and separates confirmed incidents from unverified recovery impact. The current cron still has the High risks above. This is not a launch-readiness verdict. No commit was created.
