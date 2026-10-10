# F2 AI rate-limit resilience

**Status:** current; implemented and locally verified; independent review/build verification pending

**Date:** 2026-10-09 (Asia/Saigon)

## 1. Previous AI request lifecycle

Baseline: `8092056` (F1/F1.1 source; deployment is not assumed). The cron selects registry
and followed custom repositories, fetching six repositories concurrently. Each repository
processes up to five releases sequentially, filtering/deduplicating before calling
`summarizeRelease`. Consequently up to six logical summary requests can overlap.

`src/lib/ai.ts` lazily shares one OpenAI SDK 6.38.0 client, pointed at OpenRouter, with a
25-second request timeout and one SDK retry. The installed SDK retries 429/network/5xx,
honors retry headers, and otherwise starts at about 375–500ms jittered backoff. There is
no application retry or execution-scoped cooldown. Provider-requested sleeps are not
bounded by the cron's remaining time. Strict structured output is parsed and validated
with Zod, then the summary/raw release are inserted together. F1 retains confirmed IDs
and progress and finalizes ingestion before notification delivery.

The model is `OPENROUTER_MODEL` or `deepseek/deepseek-chat`; `require_parameters:true`
preserves schema-compatible routing. There is no application-selected alternate model
or provider. The same client serves upgrade advice, which has its own route limits.
Custom-repository ingestion and the existing-row intelligence script also call the
summarizer. They have no shared cron context today.

## 2. Root causes and observed risks

The prior investigation records OpenRouter 429 metadata naming StreamLake/DeepInfra,
including `upstream_provider_shared_pool` and `engine_overloaded`. These historical
observations were not rechecked through live production or paid requests. Current source
confirms the provider/model path and the six-request burst opportunity; it does not prove
that concurrency caused the historical overload. F1 protects persistence/reporting but
does not coordinate AI pressure, check AI waits against the deadline, or guard malformed
AI success envelopes before indexing choices.

OpenRouter documents provider error envelopes, including failures delivered inside HTTP
200 responses. Its error types distinguish limits, overload and authentication/payment
failures. [OpenRouter error reference](https://openrouter.ai/docs/api_reference/errors-and-debugging).

## 3. Concurrency strategy

[The execution context](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts>) defaults
to **one active logical summary**, holding its FIFO lane through retries. It supports an
internal `concurrency:2` option for reviewed tuning; any other runtime value falls back
to one. Cron uses the default. No environment variable, dependency or infrastructure is
needed. GitHub still starts six repository processors concurrently; filtering, discovery
and uniqueness checks are unchanged. Independent successful releases still persist.

Two bounded FIFO lanes are sufficient for the supported tuning option; there is no general
queue framework. Concurrency reduction can increase partial/deferred runs during a backlog.
This is a deliberate throughput tradeoff, not a claim that all releases now fit one run.
Do not increase it blindly to make a backlog disappear.

## 4. Retry and backoff design

**Application code owns summary retries.** Each summary SDK request passes `maxRetries:0`;
at most **three total OpenRouter HTTP requests** (initial + two retries) are allowed for
one operation. The shared client's existing `maxRetries:1` remains for upgrade advice,
which is outside the new loop. There is no whole-job retry or duplicate retry layer.

Recoverable rate-limit, overload and unavailable-provider/network errors use bounded
backoff. Valid `Retry-After` seconds, HTTP dates and `retry-after-ms` are honored. If both
headers provide valid delays, the later time wins. Missing/malformed/negative values use
`1000 * 2^(attempt-1)` milliseconds with a 0.75–1.25 jitter multiplier. **Maximum accepted
wait is 10 seconds**. A longer valid provider instruction fails explicitly; it is never
shortened into an early retry. `x-should-retry:false` suppresses retries of that operation.

Validation, authentication, credit exhaustion, unknown errors and timeout/cancellation
are not retried. Timeouts can have an unknown billing outcome; retrying them could pay
twice. Three gateway requests is not a bound on OpenRouter's own internal routing/provider
attempts. Existing `require_parameters:true`, model, token limit and routing remain intact;
F2 introduces no alternate provider/model or automatic switching policy.

## 5. Shared cooldown design

Every transient limit/provider failure advances the context's `cooldownUntil`. All lanes
check it before each HTTP attempt; queued operations also respect it after another operation
exhausts retries or receives a non-retry instruction. Already-dispatched requests settle.
Cooldown delays over 10s fail queued operations without sending another request; shorter
delays are awaited only when the execution deadline permits them.

Authentication/exhausted-credit failures block further AI dispatch within that context,
including retries from another active lane. This avoids repeating requests with the same
unusable key/account. The next execution gets fresh queue/cooldown/block state; only the
SDK client is reused. This provides **no cross-instance/global rate limiting**, overlap
lock, persistent retry record or isolation from concurrent advice requests.

## 6. Execution budget handling

Cron still declares `maxDuration=300` and checks the original 270s chunk budget. Its AI
context expires at invocation start + 270s. Before each send/wait it requires at least 1s
for a request. Request timeout and abort signal use `min(25000, remainingMs)`. The signal
also aborts a stalled response body; SDK/network work is awaited, never detached through
an uncancelled `Promise.race`. Waits are bounded and rechecked after waking.

Standalone summary calls receive a 90s local context; custom-repository processing shares
one such context across that repository. The existing-row script gets the default context
per summary. All existing call signatures remain usable; F3 can explicitly share a context
and deadline. There is no assumption about deployed Vercel limits for those other callers.

Queued releases rejected by budget/cooldown are explicit AI failures. Later unstarted cron
repositories remain deferred under F1. The nominal 30s remainder is not a guarantee that
DB finalization/webhooks finish: their existing unbounded/independent deadlines, platform
termination and stale-running-run reconciliation remain F4 limitations.

## 7. Error classification and reporting

[Summary parsing](<C:/Work/Side Projects/stack-pulse/src/lib/ai.ts>) checks error envelopes
before choices, then parses JSON, validates Zod and preserves normalization. Invalid or
absent content is never a fabricated successful summary.

| Category                    | Evidence/handling                                                                |
| --------------------------- | -------------------------------------------------------------------------------- |
| `RATE_LIMITED`              | 429 or typed rate limit; recoverable within bounds.                              |
| `PROVIDER_OVERLOADED`       | Typed overload or observed `engine_overloaded` provider code; recoverable.       |
| `PROVIDER_UNAVAILABLE`      | 5xx (except timeout), typed unavailability or SDK connection error; recoverable. |
| `AUTHENTICATION_ERROR`      | 401, typed authentication or missing configured key; no retries; shared block.   |
| `QUOTA_OR_CREDIT_EXHAUSTED` | 402/typed exhausted quota/credits; no retries; shared block.                     |
| `TIMEOUT`                   | SDK timeout/abort classes, native abort, 408/504; no retries.                    |
| `INVALID_RESPONSE`          | Missing content, malformed JSON or failed summary validation; no retries.        |
| `UNKNOWN_ERROR`             | Other errors, including unsupported requests/permissions; no retries.            |
| `EXECUTION_BUDGET_EXCEEDED` | Insufficient time before dispatch; explicit failure with no new request.         |

OpenRouter explicitly distinguishes 402 `openrouter_in_flight_budget` from depleted credits.
Only that identified case **with a usable retry header** is treated as a recoverable limit;
ordinary 402/key/balance exhaustion is not. [OpenRouter credit/limit guidance](https://openrouter.ai/docs/api_reference/limits).

Safe AI detail contains gateway/model, allowlisted StreamLake/DeepInfra name when present,
actual HTTP status, distinct numeric upstream code when an HTTP-200 error envelope supplies
one, attempt/retry count and a fixed final reason (`RETRY_EXHAUSTED`, execution deadline,
excessive wait, nonretryable or shared block). Provider bodies/headers, API keys and prompts
are never returned/logged by these paths. Unknown provider names are omitted. Retry and
terminal-attempt logs include DB repository ID/numeric GitHub release ID; successful
first attempts add no per-request success log. Recovered attempts log one recovery event.

[Ingestion](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts>) retains F1's
`category:AI`, release scope and failed-release count, adding optional `ai` detail and safe
`releaseId`. Errors remain bounded in the response. Cron adds `summary.aiOperationsFailed`
and `ai:{succeeded,failed,attempts,retries,cooldowns}` to its response/completion log.
These count **logical summary outcomes/application attempts**, including config/queued
failures with zero HTTP requests; they are not provider-billing metrics. AI success followed
by a failed insert is an AI success but zero committed inserts. No schema field is added.

## 8. Changes and files modified

| File                                         | Change                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/lib/ai-resilience.ts`                   | Small bounded scheduler, cooldown, safe error classification and attempt budget.           |
| `src/lib/ai.ts`                              | Optional execution context; summary retry ownership; guarded envelope/JSON/Zod validation. |
| `src/lib/release-ingestion.ts`               | Pass shared context and safe IDs; add AI error details without changing persistence.       |
| `src/app/api/cron/fetch-releases/route.ts`   | Create run-scoped AI context; add AI counts.                                               |
| `tests/cron-recovery.test.mjs`               | Real SDK mocked HTTP fixture, injected clock and 37 F2 regressions.                        |
| `docs/features/ai-summarization.md`          | Current request/retry/cooldown/caller contract.                                            |
| `docs/features/release-ingestion.md`         | Current AI budget and additive cron reporting.                                             |
| `docs/audits/F2-ai-rate-limit-resilience.md` | This implementation/verification record.                                                   |

No dependency/lockfile, schema/migration, environment/configuration, GitHub auth/transport,
health handler, cron schedule, notification dispatcher, custom action or pagination change.
Unrelated untracked portfolio documents are preserved. No commit or push was made in F2.

## 9. Tests and results

- **89/89 full suite passed:** all 52 F1/F1.1 tests plus 37 F2 tests. Existing
  `pnpm test:cron` remains the test entry point.
- Tests execute actual summarization/Zod, SDK 6.38.0 retry/cancellation, scheduling,
  processor, finalizer and cron handler. The SDK receives a mocked fetch function;
  credentials are synthetic, DB/Next/delivery are mocked, and time/waits are injected.
  Exact HTTP counts prove application retries do not stack on SDK retries.
- Coverage includes clean success, 429 recovery/exhaustion, both standard retry formats,
  malformed/missing/negative/zero/millisecond hints, jitter, overload, unavailable/network,
  credential/credit blocks, transient in-flight 402, multiple processors/lanes, shared
  cooldown after exhaustion/nonretry instructions, fresh invocation state, deadline
  suppression/reduced timeout, cancellation before and after headers, invalid responses
  and HTTP-200 envelopes. Persistence assertions cover success, failed/uncommitted inserts,
  late AI failure after a commit, durable partial/failed status, dedup and exact notification IDs.
- Installed TypeScript 7 (`tsc.cmd --noEmit --incremental false`), full ESLint, edited-file
  Prettier and `git diff --check` pass. Corepack/pnpm startup remains blocked by
  `ENOTFOUND registry.npmjs.org`; installed script equivalents were used.
- Test development exposed a default-import fixture interop error, which was corrected,
  and SDK abort classes whose `name` stays `Error`, which required actual class checks.
  Final checks use the corrected source/fixture; initial failures are not counted as passes.

**Production build attempted; failed.** Installed Next 16.3/Turbopack ran with synthetic
auth configuration, disabled service keys/telemetry, loopback-only dummy DB configuration
and local `.env` files excluded. It failed to fetch Geist/Geist Mono from Google Fonts;
the network/DNS limitation persists. Fonts and Next configuration were not changed.
No application compile defect was established by that failure. Complete compilation,
build typecheck, prerender/output and deployed integration remain unverified.

## 10. Known limitations

AI still occurs **before persistence**. A failed/over-budget summary leaves no durable
pending release and can drop out of the latest-five window before a later run. F2 does not
recover historical gaps or implement resumable retry identities. Serial throughput may
reduce coverage per run; ordering/fairness and backlog size must be assessed in F3/F4.

Retries can be billable and provider-side routing attempts are opaque. No cross-instance
limiter or overlap/delivery replay guarantee exists. Audit finalization can still leave
`running` rows, and unknown DB acknowledgement outcomes need reconciliation. AI error
details/cooldown stats are not persisted as new audit columns. Real DB/constraint behavior,
deployed routing, active credential/model and live recovery were not verified.

## 11. Production verification checklist

Human/operator checks after independent review and separate deployment approval:

- [ ] Verify the complete F1/F1.1/F2 candidate and obtain review approval; do not assume F1
      is deployed just because it was pushed.
- [ ] Obtain a successful full build in a network-enabled isolated development/CI environment.
      Use Node 20.9+, pnpm 11.1.3, `pnpm install --frozen-lockfile`, `pnpm test:cron`,
      `pnpm typecheck`, `pnpm lint`, then `pnpm build`, with nonproduction auth/OAuth and DB
      configuration. Permit the package registry/Google Fonts; require complete exit code 0.
- [ ] Verify existing Production key/model/account credit limits through operator metadata,
      without inference, printing credentials or changing providers. No new variable/migration
      is required. Preserve `CRON_SECRET`, `GITHUB_TOKEN`, schedule and validated F1 controls.
- [ ] Verify external monitoring understands additive AI fields and F1 partial/failed outcomes.
      Record an approved code/deployment rollback target with valid environment settings.
- [ ] After approved deployment, use F1's protected health check and observe the next
      scheduled ingestion. Avoid a manual cron solely to test F2, because it writes/bills.
- [ ] Inspect run ID, AI attempt/cooldown/failure totals, safe provider reasons, elapsed time,
      deferred repositories, durable status/counts and committed records. Inspect retained
      notification IDs; delivery errors remain separate. Check spend and coverage before any
      reviewed concurrency tuning. Do not claim zero rate limits or complete recovery.

## 12. Recommended next steps and readiness

**Ready for independent review, not deployment approval.** Local regressions pass; full
network-enabled build verification and operator checks remain. Eastbase self-review
covered auth preservation, bounded AI cost, safe payload/error boundaries, committed-data
accounting and honest failure/status reporting; no additional confirmed blocker was found
in the tested F2 paths. Mocked checks cannot certify production behavior.

F3 can reuse the explicit summary context/deadline, bounded attempts and safe failure
reasons during a separately approved inventory/backfill. It still needs bounded discovery,
dry-run cost/coverage estimates and durable recovery/resumption decisions; increasing retry
count will not recover releases absent from discovery. Leave persistent pending summaries,
leases, stale-run repair and notification replay to the appropriate architecture/F4 work.

No deployment, production credential/env change, paid inference or production database
mutation was performed. Stop after local implementation/validation and await independent
review and approval.
