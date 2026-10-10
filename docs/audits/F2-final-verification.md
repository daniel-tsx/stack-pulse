# F2.2 — Final focused verification

**Status:** current; independent read-only verification of the F2/F2.1 candidate.
**Date:** 2026-10-10 (Asia/Saigon).
**Final verdict: READY AFTER BUILD VERIFICATION.**

No remaining confirmed P0/P1 defect was found in the inspected paths. The three prior P1
findings are resolved. Production build verification remains incomplete because Google
Fonts cannot be reached. This verdict does not certify full backlog capacity, hard-kill
recovery or the production environment, and does not authorize deployment.

## 1. Scope and evidence

Read AGENTS.md, CLAUDE.md, README, documentation entry points,
[F2 independent review](./F2-independent-review.md),
[F2.1 implementation record](./F2.1-review-fixes.md), current feature/operation docs,
the F2/F2.1 application diff and new helpers, all 118 tests, related custom ingestion,
status-page, schema, authentication and health-check callers. Inspected the installed
OpenAI 6.38.0 parser/transport and Neon 1.1.0/Drizzle 0.45.2 integration. Applied the
Eastbase review overlay and the focused deployment readiness gate.

Candidate: existing uncommitted changes against
`8092056fcc64303972d716fa6f775bdff880eb96` (F1/F1.1). No F2 deployment or candidate
commit is assumed. Only this report was added; application, tests, configuration and
existing reports were not edited. No production requests, credentials, DB inspection,
live cron, paid AI, deployment, commit or push were used. Additional probes ran in memory
with synthetic inputs and replaced external transports.

## 2. Findings and resolution of the three P1 issues

### P1-1 — Whole lifecycle deadline: verified, with cooperative limits

The [route clock](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:30>)
starts before authentication and setup. All phase cutoffs share that monotonic origin;
they are not fresh allowances added after processing.

| Phase                                 | Absolute cutoff from route entry                | Verified behavior                                                                                                           |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Selection, run creation and ingestion | 270s                                            | Shared work signal covers DB reads/writes, GitHub discovery/body reads, release processing, AI queue/requests/retry sleeps. |
| Run finalization                      | 285s                                            | Uses its own DB signal after all started processors settle; does not reuse the aborted work signal.                         |
| Webhook preparation and delivery      | 295s                                            | Both preparation queries and awaited sends use the cleanup signal; later destinations are deferred.                         |
| Response/logging                      | Before the configured 300s limit where possible | No further application network or DB await follows delivery settlement.                                                     |

Evidence:

- [Budget admission and cancellation](<C:/Work/Side Projects/stack-pulse/src/lib/execution-budget.ts:15>)
  combine an abort timer with monotonic checks. Repository/release, lookup, AI and insert
  admission require at least 1s remaining; checks also run before measured operations.
- [Selection settlement](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:114>)
  and [processor settlement](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:160>)
  use `Promise.allSettled`. No detached processor or timer race substitutes for cancellation.
- [GitHub dispatch guards](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:77>)
  precede retries and every manual redirect. Each attempt retains its 8s cap, constrained
  by remaining work time; response consumption carries the signal.
- [Scoped DB clients](<C:/Work/Side Projects/stack-pulse/src/db/index.ts:10>) pass the work
  or cleanup signal through Neon `fetchOptions`. The actual Neon/Drizzle regression checks
  signal identity and query rejection, not just a mocked `getDb` call.
- [AI admission and attempt signal](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:220>)
  constrain queueing, retry waits and complete body reads. Lanes release in `finally`;
  the default retry sleep removes its timer/listener on abort.
- [Insert accounting](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:198>)
  counts only acknowledged returning IDs. An acknowledgement at the cutoff remains a
  success. Cancelled/unacknowledged writes add no guessed count or notification ID and
  flag incomplete release counters; earlier acknowledged rows/IDs survive.
- [Finalization](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:219>)
  precedes [cleanup delivery](<C:/Work/Side Projects/stack-pulse/src/lib/webhooks.ts:145>).
  Finalization failure produces failed/HTTP 500 and `runFinalized:false`, retaining confirmed
  response counts. The route clears its progress interval and phase timers in `finally`.

**Timing guarantee boundary:** 270s is the ingestion cancellation/admission cutoff, not
a guarantee that every pending promise has already rejected at exactly 270s. Cleanup is
intentionally allowed afterward. Abort-aware transports and an available event loop are
required for prompt settlement. If settlement consumes a reserve, the next phase receives
only its remaining absolute time; an expired phase rejects before dispatch.

**Worst-case latency and the five-second margin:** work-phase DB queries have no shorter
per-query cap than their shared remaining budget, so one slow query can consume the work
window. Finalization started near 270s has approximately 15s; after that, delivery has
approximately 10s. GitHub attempts cap at 8s, AI attempts at 25s, and webhook sends at 6s,
each shortened by its phase's remaining time. Remote SQL or provider computation can
continue after a client abort; this is not a detached application promise or proof that
the write rolled back.

The combined exhaustion probe returned at simulated **295s**, with no active measured
operations or phase timers and no additional dispatch/write after return. Five seconds
was sufficient in these cooperative paths, but is **not a guaranteed worst-case margin**:
abort settlement, synchronous work/logging/serialization, cold-start/import work before
route entry or a blocked event loop can consume it. No local test measures those production
tails. This is a documented residual risk, not a reproduced remaining P1 defect. Retain
the cutoffs for this patch and validate actual headroom during scheduled production runs.
The route's `maxDuration=300` is the relevant configured limit; platform maxima can vary.
[Vercel duration documentation](https://vercel.com/docs/functions/configuring-functions/duration).

### P1-2 — HTTP 200 provider errors: verified

[The envelope guard](<C:/Work/Side Projects/stack-pulse/src/lib/ai.ts:240>) checks top-level
`error`, the selected `choices[0].error`, and `finish_reason:'error'` **before** parsing
summary content. The request uses a single default completion choice. Numeric error codes
must be integers from 400 through 599; missing/malformed details fail as INVALID_RESPONSE.
Known envelopes pass HTTP status, headers and upstream code to the existing sanitized
classifier. Schema-valid partial content accompanying an error cannot reach persistence.

These shapes match the current Chat Completions contract: OpenRouter documents HTTP-200
error-only bodies and selected-choice errors accompanying partial output. Other API skins
are outside this caller. [OpenRouter errors reference](https://openrouter.ai/docs/api_reference/errors-and-debugging).
The installed [SDK JSON parser](<C:/Work/Side Projects/stack-pulse/node_modules/openai/internal/parse.mjs:26>)
returns successful HTTP JSON without enforcing these envelopes, so this application check
is necessary. The summary Zod schema, prompt, structured-output request and normalization
remain unchanged. Valid summaries and ordinary extra `error` fields inside summary JSON
retain their existing behavior.

Tests exercise actual SDK responses through the route, processor and finalizer: valid
content plus choice-level 429 retries and persists only the subsequent clean summary;
choice-level overload/authentication, top-level errors and malformed envelopes never insert
or notify. Existing invalid JSON/schema tests also remain green.

### P1-3 — Cancelled error-body reads: verified

The installed [SDK error path](<C:/Work/Side Projects/stack-pulse/node_modules/openai/client.mjs:435>)
catches a failed body read and can retain HTTP 429/5xx. The
[scheduler catch](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:272>) now checks
the actual attempt signal and remaining budget before transient classification. An aborted
read becomes a terminal TIMEOUT with retained HTTP status; it creates neither retry nor
cooldown. Global cancellation also terminates shared cooldown sleep and queued work.

The actual-SDK 429/503 stalled-stream tests assert one attempt, zero retries/cooldowns,
zero inserts and finalized failure. An additional independent two-lane probe cancelled
simultaneous 429/503 bodies with a third queued peer: two dispatches total, three logical
failures, zero retries/cooldowns, no active stages and a finalized run. Existing shared
cooldown extension and authentication-block behavior remain intact. A request-local abort
is terminal for that operation; it does not incorrectly cancel unrelated peers.

## 3. October 10 production timeout and consistency

**Supplied evidence:** HTTP 504 / FUNCTION_INVOCATION_TIMEOUT at 300s; run record left
`running`; 44 release rows created during the execution window; final counters not
persisted. This review did not independently query production. A creation-time window does
not uniquely attribute every row to one run, and successful GitHub responses do not locate
the stage that stalled. Vercel documents this error as exceeding the allowed invocation
time. [Timeout reference](https://vercel.com/docs/errors/function_invocation_timeout).

The observed DB state is consistent with incremental release commits followed by an audit
update only at finalization. F2.1 now cancels the previously uncovered waits and attempts
bounded cleanup, so a similar **abort-aware** slow request should return partial/failed
before the hard timeout. It does not establish the incident's root cause or guarantee that
every invocation escapes platform termination.

| Category                                         | Assessment                                                                                                                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guaranteed by inspected application control flow | No admitted ingestion operation after cancellation; started processors are awaited before finalization; acknowledged inserts remain counted; uncertain writes get no invented IDs; no new duplicate-record/replay path.             |
| Best effort                                      | Timely abort settlement, final audit persistence and structured response before 300s; webhook delivery within its remaining reserve.                                                                                                |
| Remaining hard-termination risk                  | Kill, blocked event loop, ignored abort or lost acknowledgement can leave a run `running` with incomplete counters despite committed rows. Finalization cancellation itself can leave that state while returning an honest failure. |

The independent combined-phase probe retained one acknowledged insert, cancelled a second
write at 270s, cancelled finalization at 285s and delivery at 295s. It returned HTTP 500,
`runFinalized:false`, `releaseCountersComplete:false`, one confirmed insert, an unchanged
`running` audit row and one deferred destination. Advancing the clock past return produced
no further application operations. This demonstrates honest cooperative failure handling,
**not stale-run repair**.

Counters remain consistent: attempted repositories partition into succeeded/failed, planned
minus attempted are deferred; settled discovered releases partition into processed, failed,
skipped and deferred. Inserted is a subset of processed; cancelled is a subset of failed.
Existing tags/conflict no-ops count processed without another inserted ID. AI success before
a failed insert is separately an AI success and ingestion failure. Confirmed global SQLSTATE
errors and GitHub 401 still override partial success. Uncertain/rejected processor results
mark release counts incomplete. Stored audit fields contain confirmed totals only; the new
completeness flag and timing metadata are not durable columns.

The unchanged [unique key](<C:/Work/Side Projects/stack-pulse/src/db/schema.ts:82>), lookup
and conflict no-op preserve deduplication on later runs. Only newly acknowledged IDs are
notified. A committed row whose original notification was interrupted is not automatically
notified on the next run; an unacknowledged send can also have reached its recipient.
No durable receipt/outbox or automatic replay was added. The status page continues to show
stored audit state with five-minute revalidation, not reconstructed release totals or
notification health ([page](<C:/Work/Side Projects/stack-pulse/src/app/status/page.tsx:38>)).
**Stale-running recovery, older-gap discovery/backfill and notification reconciliation remain
deferred F3/F4 work.**

Default AI concurrency one bounds pressure, not completion capacity. Six repositories with
five new releases require up to 30 serial summaries: AI alone needs 150s at 5s average,
300s at 10s, or 750s at 25s. A logical operation with three 25s attempts and two 10s waits
can approach 95s, constrained by the common cutoff. Thirty such operations would demand
2,850s without that cutoff. F2.1 cancels/defers rather than promising this workload fits.
Deduplication reduces actual demand, but production latency and backlog size remain unmeasured.

## 4. Regression results and coverage limits

| Check run in this verification                           | Result                                                                                                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `node --test tests/cron-recovery.test.mjs`               | **118/118 passed**, no failures/cancellations: 52 F1/F1.1, 37 F2, 29 F2.1.                                                          |
| `node_modules\.bin\tsc.cmd --noEmit --incremental false` | Passed.                                                                                                                             |
| `node_modules\.bin\eslint.cmd .`                         | Passed across the repository.                                                                                                       |
| Installed Prettier `--check`                             | Passed for all 14 existing F2/F2.1 source, test and documentation files; this new report checked separately.                        |
| `git diff --check`                                       | Passed; routine LF/CRLF notices only.                                                                                               |
| Five additional in-memory scenarios                      | Passed: stalled lookup, run creation, both setup reads, concurrent error-body/queued cancellation, combined three-phase exhaustion. |
| Installed Next 16.3 production build                     | Exit 1: Geist and Geist Mono fetch failures from Google Fonts.                                                                      |
| Public-host DNS checks                                   | `ENOTFOUND` for fonts.googleapis.com, fonts.gstatic.com and registry.npmjs.org.                                                     |

Tests load actual route/auth/GitHub/ingestion/budget/AI modules, real OpenAI SDK and Zod,
plus a real Neon/Drizzle cancellation test and actual webhook handler tests. Assertions
cover final audit state, exact IDs/counters, no dispatch after guards, disposal and committed
progress. External transports and most DB persistence are mocked; these are not real SQL
commit, Next server, Vercel runtime or production capacity tests. No unhandled rejection
was observed, and inspected paths await actual work rather than leaving timer-raced promises.

Remaining coverage limits, not reproduced blockers:

- The additional lookup/setup/run-creation and combined two-lane/phase scenarios were
  independent probes, not added to the committed regression file during this read-only task.
- No real 300s Vercel invocation, event-loop stall or abrupt process-kill test can certify
  the five-second tail margin or cleanup after termination.
- Actual Neon acknowledgement loss/remote commit and uncertain notification acceptance
  remain operational reconciliation cases, rather than simulated rollback guarantees.
- Realistic thirty-summary capacity, asymmetric two-lane cooldown latency and complete
  custom-ingestion SDK timing remain unverified; production still uses concurrency one.
- Native OpenRouter redirect dispatch counts remain the existing deferred P2-1. Three SDK
  attempts are not necessarily three HTTP dispatches. F1 GitHub redirects remain manually
  guarded and their native transport regressions pass.

Minimal stage instrumentation now exists for discovery, AI, lookups/writes, queue/retry
waits, finalization and notifications, with duration/operation/active counts and 30s progress
logs. It addresses the minimum P2-2 observability gap. Concurrent duration totals overlap;
they must not be summed into wall time. Chunk totals appear after settlement. Historical
incident attribution and production latency measurements remain unavailable.

## 5. Build verification status and exact completion steps

The build used installed dependencies, synthetic auth/OAuth settings, disabled external
service credentials/telemetry, a loopback dummy DB URL and a temporary preload guard
excluding real `.env` files. No production secrets were loaded, and fonts/styling/application
configuration were unchanged. Installed binaries were used because Corepack cannot reach
the registry for pinned pnpm here.

**Confirmed environmental failure:** Next/Turbopack could not fetch Geist or Geist Mono;
fresh DNS checks independently failed for both Google Fonts hosts.
**Confirmed application build errors:** none established.
**Unverified:** successful complete compilation, build-integrated checks, prerendering and
final output generation. Standalone typecheck passing does not prove these stages pass.

In an isolated network-enabled checkout containing the complete candidate, use the locked
dependencies, pinned pnpm and a compatible Node runtime (this run used Node 24.19.0).
Ensure registry and Google Fonts DNS/HTTPS work. Keep production `.env` files out of the
checkout; supply nonproduction auth/OAuth origin/settings and an isolated test DB if a build
stage requires it. Disable paid AI and delivery credentials. From Command Prompt:

```cmd
cd /d "C:\Work\Side Projects\stack-pulse"
pnpm install --frozen-lockfile
pnpm test:cron
pnpm typecheck
pnpm lint
pnpm exec prettier --check src/app/api/cron/fetch-releases/route.ts src/db/index.ts src/lib/ai.ts src/lib/ai-resilience.ts src/lib/execution-budget.ts src/lib/github.ts src/lib/release-ingestion.ts src/lib/webhooks.ts tests/cron-recovery.test.mjs docs/features/ai-summarization.md docs/features/release-ingestion.md docs/audits/F2-ai-rate-limit-resilience.md docs/audits/F2-independent-review.md docs/audits/F2.1-review-fixes.md docs/audits/F2-final-verification.md
git diff --check
pnpm build
```

Require exit code zero and completion of all stages; record the complete candidate SHA,
runtime and build output. Diagnose any later error on its own evidence. Do not substitute
a font/configuration change or disabled build stage for successful verification.

## 6. Deployment and rollback checklist

Locally verified:

- No schema/migration, dependency/lockfile, Next configuration or environment-variable
  contract changes. No migration, seed or DB push is required for this patch.
- `CRON_SECRET` timing-safe bearer validation still denies unauthorized requests before
  DB/AI/GitHub work. Missing secret remains HTTP 500; invalid auth remains HTTP 401.
- `GITHUB_TOKEN` remains the GitHub credential. Global 401 fail-fast, same-origin manual
  redirect safety and eight-second request caps remain intact.
- Protected `/api/cron/github-health` still performs at most one read-only `/user` request,
  with no retries/redirect follows, DB/AI work or returned profile/credentials.
- Release schedule remains `0 0,12 * * *` (00:00/12:00 UTC); digest schedule is unchanged.
- Filtering, valid summarization, deduplication, successful inserts/IDs and legacy custom
  helper signatures remain compatible. Custom/standalone callers retain their F2 local
  context; the new whole-invocation reserves apply to the scheduled cron.
- Existing P2 redirect/operational limitations are documented. No F3/F4 schema, backfill,
  stale-run repair, durable delivery or cross-invocation coordination was introduced.

Required operator checks and later actions; **not performed or authorized by this run**:

1. Complete the production build above. Package both new helpers and the tested F2/F2.1
   changes; record the candidate commit so the deployed artifact matches verification.
   Keep the unrelated portfolio documentation outside this patch.
2. Before an approved deployment, verify production environment references without
   exposing values: valid/nonexpired `GITHUB_TOKEN` and repository access, `CRON_SECRET`,
   `DATABASE_URL`, `OPENROUTER_API_KEY`, configured model/routing and credit availability.
   Verify the built function has `maxDuration=300` and the intended cron schedule.
3. Record the previous eligible production deployment ID and its source SHA before
   promotion. Source checkpoint `8092056` is schema-compatible, but its deployment
   availability and captured environment have not been checked. Obtain separate deployment
   authorization; no deployment or live cron is triggered here.
4. After approved rollout, use an authorized protected GitHub health check and observe the
   next naturally scheduled ingestion. Compare platform duration with route elapsed time,
   cancellation settlement, active stage counts, finalization, deferrals, AI attempts and
   durable audit counts. Require practical headroom before 300s; HTTP 200 alone does not
   establish clean ingestion, complete coverage or delivery. Investigate any timeout,
   `runFinalized:false`, incomplete counters or persistently deferred later repositories.
5. If rollback is needed, an authorized operator can select the retained deployment via
   Vercel Instant Rollback. Check its captured secrets/configuration first: rollback does
   not refresh old environment values and also restores its cron configuration.
   If those values are stale, rebuild the approved previous source with current valid
   settings instead. [Vercel rollback instructions](https://vercel.com/docs/instant-rollback).
6. Preserve all committed release/audit rows during rollback; no reverse migration or data
   deletion is necessary. Rolling back to F1/F1.1 restores weaker AI/deadline bounds.
   Reconcile the October 10 stale audit, gaps and uncertain deliveries only through a
   separately authorized operation; rollback does not repair them.

## 7. Final assessment

**READY AFTER BUILD VERIFICATION.** All three targeted P1 corrections withstand code review,
the 118-test regression suite and the additional cancellation probes. No confirmed P0/P1
blocker remains in these paths. The outstanding gate is a complete successful production
build in an environment with working network access, followed by the explicit operator
checks and separately authorized rollout. Cancellation and the five-second tail remain
best effort; no claim of stale-running repair, complete backfill or guaranteed timeout
elimination is made.

Verification stops here. No additional fixes, deployment, commit or push were performed.
