# F2 independent implementation review

**Status:** current; read-only review; CHANGES REQUIRED

**Date:** 2026-10-10 (Asia/Saigon)

**Candidate:** uncommitted F2 changes against `8092056fcc64303972d716fa6f775bdff880eb96`.
Deployment of this candidate is not assumed.

Read AGENTS.md, CLAUDE.md, README, the documentation entry points, the cron investigation,
F1 final verification, the F2 implementation report, the entire eight-file F2 change,
all 89 tests, related callers/configuration/schema, and installed SDK transport/parser code.
Applied the Eastbase review overlay. Conclusions use actual control flow and additional
network-free probes; the implementation report and test names were not treated as proof.

Only this report was added. No application/test/configuration change, production API request,
credential access, database mutation, live cron invocation, deployment, commit or push.
Additional probes ran in memory with synthetic credentials and mocked services; native
fetch dispatch tests replaced the HTTP dispatcher, so they could not contact a real server.

## 1. Executive summary

**CHANGES REQUIRED. No P0 established; three confirmed P1 defects and two P2 improvements.**
The application owns at most three SDK attempts, default AI concurrency is one, shared
cooldown works in the inspected paths, and F1 preserves acknowledged inserts. However,
F2 does not bound the whole invocation, misses a documented nested provider error, and
can retry an aborted error-body read. The October 10 timeout is not proven fixed.

| Finding                                                          | Severity | Assessment                                                                                                                              |
| ---------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1: invocation deadline excludes discovery, DB and cleanup     | P1       | Confirmed control-flow gap; slow insert and late GitHub retry reproduced. Inherited limitation now material to the timeout requirement. |
| P1-2: choice-level HTTP-200 errors can become successful inserts | P1       | Confirmed with actual SDK, Zod, processor, finalizer and route.                                                                         |
| P1-3: cancelled error-body reads are retried as rate limits      | P1       | Confirmed with the installed SDK and an aborting response stream.                                                                       |
| P2-1: native redirects exceed the claimed HTTP attempt count     | P2       | Confirmed dispatch/count mismatch; no production redirect or credential leak established.                                               |
| P2-2: stage duration evidence is missing                         | P2       | Confirmed logging gap; incident stage attribution remains uncertain.                                                                    |

Fresh validation: **37/37 F2, 52/52 F1/F1.1, and 89/89 combined tests pass**;
typecheck, full ESLint, changed-file formatting and whitespace checks pass.
Production build exits 1 on Google Fonts network/DNS failures. Later build stages remain
unverified. The supplied suite does not cover the reproduced defects.

## 2. Retry correctness

[Per-attempt options](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:236>)
pass `maxRetries:0`; [the installed SDK](<C:/Work/Side Projects/stack-pulse/node_modules/openai/src/client.ts:709>)
uses that override instead of the shared client's default of one retry. The retry loop
checks its three-attempt cap at line 274. Workload-specific advice retains its old SDK retry;
it is outside the new summary loop. No whole-job retry was introduced.

429, typed overload, connection errors and supported 5xx failures retry within bounds.
Authentication, ordinary 402/credit exhaustion, invalid summaries, unknown errors and
ordinary timeout/abort errors do not. The special identified in-flight-budget 402 with a
valid retry hint is handled separately, consistent with
[OpenRouter's limit guidance](https://openrouter.ai/docs/api_reference/limits).

[Retry parsing](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:52>) rejects negative,
malformed and nonfinite numeric hints; accepts seconds/HTTP dates; uses the later of valid
second/date and millisecond hints. An excessive valid delay fails rather than being shortened.
Cooldown and backoff share one timestamp: there are not two consecutive sleeps for one retry.
Each accepted wait is at most 10s and must leave at least 1s before the deadline.
OpenRouter's internal routing remains outside the application attempt/billing bound.

### P1-3 — cancellation can be swallowed while reading an error response

- **References:** [summary SDK await](<C:/Work/Side Projects/stack-pulse/src/lib/ai.ts:201>),
  [retry catch](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:241>),
  [SDK error-body catch](<C:/Work/Side Projects/stack-pulse/node_modules/openai/src/client.ts:856>).
- **Reproduction:** return HTTP 429 headers immediately, then stall the error body until
  the request signal aborts. The probe used a real SDK and a stream errored on its propagated
  abort signal, accelerating the requested timeout to 5ms.
- **Evidence/actual:** the SDK catches `response.text()` rejection and constructs a 429
  APIError anyway. The scheduler classifies that as RATE_LIMITED without checking whether
  its own signal aborted. **Three HTTP attempts**, RATE_LIMITED/RETRY_EXHAUSTED resulted.
- **Expected:** cancellation/timeout terminates the logical operation once, as the stated
  F2 policy requires. No retry or cooldown should conceal the cancellation.
- **Impact:** a stalled error body can consume multiple 25s attempts plus retry waits,
  reducing serial capacity and obscuring the actual timeout. It still respects the AI
  deadline; this is not an unbounded retry or proof of duplicate billing.
- **Minimal fix:** retain the per-attempt signal in the scheduler and check its aborted
  state before classifying a caught SDK error. Propagate a fixed TIMEOUT/cancellation error,
  release the lane, and add 429/5xx stalled-error-body regressions alongside the existing
  successful-body cancellation test. Do not change the SDK's retry default for advice.

### P2-1 — three SDK attempts do not necessarily mean three HTTP dispatches

- **References:** [SDK call options](<C:/Work/Side Projects/stack-pulse/src/lib/ai.ts:235>),
  [request-options type](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:168>),
  [SDK native fetch](<C:/Work/Side Projects/stack-pulse/node_modules/openai/src/client.ts:955>),
  [current request-count fixture](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:186>).
- **Reproduction/evidence:** a native fetch dispatcher returned same-origin 307 to a second
  path, which returned 429. The actual SDK/application made three attempts but native fetch
  dispatched **six POSTs**. Redirects happen inside fetch before the scheduler sees a response.
- **Expected vs actual:** the implementation report claims at most three OpenRouter HTTP
  requests; the enforced bound is three SDK calls. Existing F2 tests count the injected fetch
  callback and cannot detect dispatches inside native fetch.
- **Impact:** request metrics and the transport bound are overstated. An already-running
  fetch could also follow a redirect outside the scheduler's shared block check. No redirect
  was observed in production, no infinite loop demonstrated, and no credential disclosure
  established; this is a bounded transport gap, not a demonstrated cost disaster.
- **Minimal fix:** for the canonical summary endpoint, use the installed SDK's per-request
  `fetchOptions` to reject automatic redirects and classify them as a fixed nonretryable
  error. Add native-dispatch assertions. If redirects are explicitly required, handle them
  with origin/hop/deadline guards and count every dispatch. Keep advice behavior scoped.

## 3. Concurrency and cooldown correctness

[The execution context](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:183>)
creates one lane by default and exactly two only for the internal value 2. Cron uses one.
Lane promises resolve in `finally`; actual operation/SDK errors, budget rejections and shared
blocks release queued work. State is created per invocation; only the SDK client is reused.

Cooldown extension is synchronous and uses `Math.max` at line 268, preventing a shorter
concurrent hint from moving the timestamp backwards. After sleeping, a task rechecks the
shared timestamp and auth/credit block. Already-dispatched calls settle; queued work never
bypasses a known block on an application attempt. No deadlock or unresolved lane promise
was found in these normal internal-call paths. P1-1 concerns uncancelled external awaits.

Default FIFO is fair among calls already queued. A repository completing an insert submits
its next release behind waiting peers, so it cannot continuously jump ahead within the
six-processor chunk. Retries deliberately hold a lane: a slow operation can delay its peers
by up to roughly 95s before the common cutoff. That is bounded head-of-line delay rather
than an infinite starvation loop. Later chunks remain behind the current chunk, and repeated
runs have no durable resume position; coverage across runs is not guaranteed.

Two round-robin lanes are not a work-stealing pool: an idle lane cannot take a task queued
behind the slower lane. No production fairness defect at the default of one was established.
The concurrency-two test proves a peak of two and basic shared delay, but uses equal,
immediate fake waits; add an asymmetric delayed-response test before tuning production.
**Do not increase concurrency to hide the timeout without latency/capacity evidence.**

[Custom ingestion](<C:/Work/Side Projects/stack-pulse/src/lib/actions.ts:387>) keeps its call
signature and receives a fresh 90s context shared across that repository. This intentionally
changes its maximum AI budget, so five slow summaries may now yield partial ingestion.
The existing-row script gets a fresh context per summary. Neither shares cron state.
The legacy custom-caller test mocks AI; it does not validate this new real-SDK timing boundary.

## 4. Execution budget safety

### P1-1 — the AI cutoff is not an invocation deadline

- **References:** [AI context creation](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:49>),
  [setup awaits](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:80>),
  [chunk check/settlement](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:105>),
  [release loop/lookup](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:101>),
  [insert](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:147>),
  [finalization/delivery](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:170>),
  [DB client](<C:/Work/Side Projects/stack-pulse/src/db/index.ts:15>),
  [GitHub retry](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:75>),
  [webhook budget](<C:/Work/Side Projects/stack-pulse/src/lib/webhooks.ts:207>).
- **Reproduction:** let AI finish at t=269s; its acknowledged insert takes 32s. The actual
  processor then starts another lookup at t=301s and the route starts finalization at t=301s.
  In another probe a held insert remained pending with its run `running` after the fake
  clock advanced beyond 300s. A 5xx discovery response after t=270s also started a second
  GitHub request; zero AI requests followed.
- **Evidence/actual:** only AI receives the 270s deadline. There is no common deadline
  check at lookup/insert boundaries, cancellation signal for DB work, or remaining-time
  cap for cleanup. `Promise.allSettled` waits for all started processors. Finalization can
  wait indefinitely; webhook DB queries are unbounded and its separate 30s budget begins
  only after those queries, allowing a final 6s send to extend that budget.
- **Expected:** stop new ingestion operations at the work cutoff; cancel supported pending
  transport work, settle started processors, and reserve bounded cleanup/response time
  before the 300s platform limit. Cleanup itself may run after the ingestion cutoff.
- **Impact:** Vercel can still terminate F2 without a structured response; a durable run
  can remain running despite committed releases. The reproduction proves the gap, not the
  cause of the particular production incident. The implementation report already calls
  this F4 work; the additional timeout requirement makes this minimum protection a
  predeployment condition.
- **Minimal fix:** pass one execution deadline/cancellation context through discovery and
  per-release processing; check before each lookup, AI operation and insert; cap GitHub
  attempts and DB transport/query waits to the remaining work budget. Give finalization
  and optional delivery a separate bounded cleanup allowance below 300s (with response
  margin); skip/defer delivery when it cannot fit. The installed Neon API supports
  `fetchOptions`, including cancellation; verify the Drizzle integration before choosing
  the smallest execution-scoped adapter. Do not race uncancelled writes against a timer.
  Preserve acknowledged IDs; mark unknown write outcomes/counters honestly and await
  cancellation settlement. No queue service, schema redesign or automatic replay is needed.

For AI alone, the scheduler checks the deadline before waits and sends, caps timeout to
`min(25s, remaining)`, and propagates a signal through the SDK to body consumption.
Queued AI work rejected by the deadline is a counted failure, never an insertion.
The route awaits the chunk before finalizing, so it does not intentionally detach AI
retries after finalization. P1-3 qualifies cancellation classification. These controls
cannot cancel provider-side computation already accepted by a remote service.

### October 10 Production Cron Timeout

#### Confirmed evidence and its limits

The user reports the October 10 scheduled `GET /api/cron/fetch-releases` started around
07:00:24 UTC+7 and ended with HTTP 504, FUNCTION_INVOCATION_TIMEOUT and a Vercel Runtime
Timeout Error at **300s / 300s**. Some GitHub calls returned 200. This is user-supplied
production evidence; the raw invocation trace, deployed SHA, DB rows and stage durations
were not independently accessed during this read-only review.

The event predates confirmation of F2 deployment. It cannot be attributed to the F2
candidate or used as proof of its behavior. GitHub 200 establishes some successful
discovery, not complete token/repository-access verification or completed ingestion.

#### Actual awaited lifecycle and likely bottlenecks

| Stage                | Current/baseline bound and evidence                                                                                                                                                                       | Incident attribution                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup/run creation   | Two DB reads and run insert before chunks; no explicit query deadline.                                                                                                                                    | Possible; successful GitHub calls suggest processing progressed beyond setup if these are this invocation's traces.                                                                      |
| GitHub discovery     | Six processors start together; each fetch has an 8s signal and up to one network/5xx retry, including response-body protection. No invocation deadline in this helper.                                    | Some calls succeeded; later discovery/retries can still contribute. No evidence it consumed 300s.                                                                                        |
| Filtering/dedup      | Small synchronous filters, then a DB lookup for each publishable result.                                                                                                                                  | Pure filtering unlikely to dominate; DB lookup latency is unknown.                                                                                                                       |
| AI before F2         | Six possible concurrent logical summaries; up to five serial releases per repository. Client has 25s timeout, one retry and server-specified retry waits without run budget. SDK timeout ends at headers. | **Leading hypothesis, medium confidence:** cumulative generation/body waits and/or retry delays. Prior 429s and the exposed lifecycle support plausibility, not incident-specific proof. |
| AI with F2           | One logical summary at a time, at most three attempts, shared waits, body abort signal and common AI cutoff.                                                                                              | Improves pressure/body bounds, but serializes cumulative demand and cannot prove normal capacity without measurements.                                                                   |
| Inserts/finalization | Writes after AI, aggregate audit update after the entire chunk/run; no explicit query timeout.                                                                                                            | Credible alternative, low confidence in this incident; actual DB duration is unavailable.                                                                                                |
| Delivery             | Finalization precedes webhooks; two DB queries, then a separate 30s loop with 6s sends.                                                                                                                   | Credible late-stage alternative, low confidence. If audit already finished, timeout may be delivery-only. No audit row was inspected.                                                    |

A controlled baseline probe loaded `HEAD:src/lib/ai.ts` and the actual SDK, with the client
timeout accelerated to 5ms. Headers arrived immediately; at 30ms the response-body await
was still pending and its signal un-aborted. Releasing the body then completed the summary.
[The SDK clears its timer after fetch returns headers](<C:/Work/Side Projects/stack-pulse/node_modules/openai/src/client.ts:967>)
and [parses JSON later](<C:/Work/Side Projects/stack-pulse/node_modules/openai/src/internal/parse.ts:66>).
Therefore baseline “25s per AI request” is not a complete generation/body-read bound.
This is a confirmed code property, not proof of a stalled body in the October 10 invocation.

#### Worst-case execution and capacity

- **Baseline:** even assuming each complete attempt finishes within 25s, one repository
  with five new releases and one retry each needs approximately
  `5 × (2 × 25s + retry wait)`, about 252.5s with 0.5s waits.
  Six such processors overlap, so one chunk is approximately that longest repository,
  plus discovery, DB and other overhead. A second chunk can still start just below 270s.
  Larger Retry-After values, stalled bodies and DB waits remove any reliable overall bound.
- **F2 clean work:** one chunk can contain **30 new summaries**. At 5s, 10s or 25s average
  AI service time, serial AI demand alone is **150s, 300s or 750s**. Only the first fits
  270s before discovery/DB overhead; those latencies are examples, not production measurements.
- **F2 retries:** a logical operation can approach `3 × 25s + 2 × 10s = 95s` before
  stopping/recovering. A final transient failure can impose up to another 10s cooldown on
  its successor. Thirty recovered operations at that bound demand 2,850s; F2 cuts off AI
  at 270s rather than actually waiting that long.
- For `M` new summaries, a necessary serial capacity condition is approximately
  `sum(AI service + retry waits) + nonoverlapped discovery/DB overhead < 270s`.
  Thirty summaries need under 9s average logical service time **before** other overhead;
  90 need under 3s. Existing/draft/unpublished releases reduce M. Actual M, latency
  distribution and backlog are unknown; completing normal workloads cannot be certified.
- The nominal 30s reserve is not adequate as a guaranteed cleanup budget: unbounded DB
  awaits and a webhook loop that can itself exceed 30s can exhaust it. P1-1 remains.

#### F2 impact and timeout recovery

F2 addresses burst pressure, SDK retry stacking and successful-body hangs. It does **not**
prevent this category of hard timeout across the entire invocation. P1-1 is the required
minimum fix; capacity evidence is required before tuning. Historical gap recovery,
durable pending summaries and leases remain separately scoped F3/F4 work.

If Vercel kills processing before audit finalization, the run can remain `running` with
initial counters while previously acknowledged release rows remain committed. Current
processors' counters/IDs exist in memory until the chunk settles, so durable counters can
be incomplete. A kill during finalization leaves its acknowledgement/commit uncertain.
No normal catch/finally can guarantee cleanup after platform termination.

Later runs deduplicate stored `(techId, version)` pairs and can retry absent releases still
in the latest-five window. They do not repair the old audit row or rediscover older gaps.
An in-flight write may have committed without acknowledgement; inspect DB state rather
than inventing its outcome. Unique constraints protect records, but overlapping invocations
can still spend on duplicate AI work before the insert conflict.

If the kill precedes notification dispatch, committed rows may never notify: later runs
skip them and only newly inserted IDs are delivered. If it occurs during dispatch, some
recipients may have been notified and others not; no delivery ledger proves which.
F2 adds no duplicate notification path in a normal rerun, but any future manual replay
without a ledger could duplicate sends. Do not replay blindly.

#### Production verification plan

Operator work after targeted fixes, successful isolated build, review and separate deployment
authorization; **not performed here**:

1. Record the incident invocation/deployment SHA and obtain its existing trace/audit row.
   Determine whether finalization ran and correlate safe stage timings/provider responses;
   GitHub HTTP 200 alone cannot locate the bottleneck.
2. Reproduce slow discovery, error-body reads, DB writes and cleanup locally with cancellable
   mocks. Require settlement and structured partial/failed output before the cleanup deadline,
   retained acknowledged IDs and no later dispatch.
3. Add the minimal duration fields in P2-2; verify them locally. Record actual new-summary
   count, service/queue/retry latency and per-run deferred work. Keep concurrency one until
   the capacity evidence supports a reviewed change.
4. Observe the next scheduled run after an approved rollout. Compare response/completion log,
   DB audit/release rows, elapsed time, safe AI failure totals and notification evidence.
   Do not trigger live ingestion merely to test it.
5. Inventory stale runs/gaps and delivery ambiguity read-only; obtain separate authorization
   for reconciliation/backfill/replay. A successful HTTP response is not complete recovery.

## 5. Ingestion and data consistency

### P1-2 — choice-level provider errors bypass the HTTP-200 guard

- **References:** [envelope guard and content parse](<C:/Work/Side Projects/stack-pulse/src/lib/ai.ts:239>),
  [success accounting](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:241>),
  [insert/dedup](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:126>).
- **Scenario:** HTTP 200 contains `choices[0].error` with code 429 or 502,
  `finish_reason:"error"`, and partial content. This non-streaming shape is documented in
  [OpenRouter's Chat Completions error reference](https://openrouter.ai/docs/api_reference/errors-and-debugging).
- **Evidence/actual:** only top-level `response.error` is checked. A network-free actual-SDK
  probe with parseable, schema-valid content plus a choice error produced **success,
  ai.succeeded=1, ai.failed=0, one committed mock insert, a completed audit and its notification
  ID**. The next invocation deduplicated it without another AI request. With non-JSON partial
  content, the same nested overload became INVALID_RESPONSE and was not retried.
- **Expected:** reject/classify the provider failure before parsing any content, regardless
  of whether partial output happens to satisfy the schema. Error must remain visible and
  only eligible transient errors retry.
- **Impact:** a known failed generation can be persisted/notified and permanently skipped as
  already processed; otherwise a retryable provider failure loses its classification.
  No occurrence in production was established.
- **Minimal fix:** inspect the selected choice's error and error finish reason alongside
  the top-level envelope before reading content. Feed a supplied nested error through the
  existing sanitizer with HTTP status/headers; a bare error finish reason must fail safely.
  Add valid-content, invalid-content and nested-auth/credit cases. Preserve Zod normalization
  and persistence behavior for clean responses.

Outside P1-2, F1 counting remains intact: only an acknowledged insert returning an ID increments
inserted/notification IDs; conflict/dedup counts processed but not inserted; failed AI counts
a failed release without a DB insert. A successful AI followed by a DB failure counts AI
success and release failure, which is consistent.

Post-commit 429 exhaustion retains the previous record, its ID and `completed_with_errors`;
a rerun neither inserts nor schedules that ID again. Global DB failures remain global and
override partial success. Failed audit finalization returns `runFinalized:false`, but its
durable row can stay running. These are tested in memory; real DB acknowledgement loss and
hard termination remain the limitations described above.

## 6. Error classification

[Classification](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:65>) reads actual SDK
`status`, `error` and Headers properties. SDK abort/timeout class checks are necessary because
their Error name is not the class name. Top-level HTTP-200 numeric error codes are distinguished
from the actual HTTP status, so HTTP 200 and upstreamCode 429 can coexist accurately.

Logs/response use fixed messages, safe model/IDs and allowlisted StreamLake/DeepInfra names.
Raw error objects, response headers, credentials, prompts and raw provider messages are not
emitted by the F2 paths. The tests check synthetic secrets across both response and logs.
Model routing, schema requirement and max_tokens remain unchanged.

Limits of classification, separate from confirmed bugs:

- Bare 429 does not prove account quota versus provider overload; missing/truncated/ambiguous
  metadata cannot reconstruct the provider's cause.
- Generic upstream quota/auth codes do not always prove the shared OpenRouter account is
  exhausted/invalid; the classifier conservatively blocks on its recognized markers.
  Unknown provider names are deliberately omitted. Do not claim all provider errors are
  perfectly classified without representative sanitized metadata.
- A transient in-flight-budget 402 without a valid retry header currently falls into
  exhausted credits/shared block. This is fail-closed behavior for an incomplete response,
  not a proven production defect.
- Actual billing/provider-internal attempt counts are unavailable from these application
  counters. P1-2/P1-3 and P2-1 are concrete exceptions to the otherwise verified path.

## 7. Regression test coverage

The suite invokes actual route handlers, authenticator, GitHub helper, processor/finalizer,
resilience code, actual OpenAI SDK 6.38.0 and Zod. DB, Next integration, external services and
delivery are mocked. The 37 new F2 tests have meaningful request/counter/ID/audit assertions;
they are not merely classifier-unit tests.

Strong coverage includes retry hints/exhaustion, SDK retry override, credential/credit blocks,
shared cooldown after exhaustion/nonretry instructions, fresh contexts, reduced remaining
timeout, successful-body abort, malformed summaries, top-level HTTP-200 errors, post-commit
AI failure, insert failure, dedup and two-lane auth blocking. F1 tests preserve auth security,
manual GitHub redirect bounds, failure scope and durable progress.

Missing targeted regressions:

1. Choice-level HTTP-200 errors with valid and invalid content; nested 401/402 must not retry.
2. Abort while reading a non-2xx error body; no extra SDK/HTTP attempt or stale category.
3. Native AI redirects counted at dispatcher level; reject follow-up dispatches outside policy.
4. Global deadline during initial reads, GitHub retries, dedup lookups, inserts, finalizer and
   webhook DB/send work. Include acknowledged and unknown write outcomes and no work after
   settlement/finalization; never fake cancellation with an uncancelled Promise.race.
5. Six repositories with five releases each and realistic queue latency. Use controlled
   unresolved waits/asymmetric 429 hints (e.g. 1s and 8s), extending cooldown while another lane
   sleeps; prove no early request or lost update. Current immediate fake sleeps cannot prove
   every real timer interleaving.
6. Real summarizer through standalone/custom-repo processing under its shared 90s budget;
   existing custom coverage mocks AI. Test independent contexts and dedup on a later attempt.
7. Abrupt-termination recovery expectations in a stateful local fixture: preserved commits,
   incomplete running audit, dedup on retry and omitted prior notification IDs.

Additional probes confirmed current behavior without adding/changing tests. Assertions
observe failures as implemented; they do not certify production routing or real SQL commits.

## 8. Validation results

| Check                                                             | Fresh result                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `node --test --test-name-pattern=F2 tests/cron-recovery.test.mjs` | 37/37 pass.                                                                                  |
| `node --test --test-skip-pattern=F2 tests/cron-recovery.test.mjs` | 52/52 F1/F1.1 pass.                                                                          |
| `node --test --test-reporter=dot tests/cron-recovery.test.mjs`    | All 89 pass, exit 0.                                                                         |
| `node_modules\\.bin\\tsc.cmd --noEmit --incremental false`        | Pass, TypeScript 7.                                                                          |
| `node_modules\\.bin\\eslint.cmd .`                                | Pass, full repository.                                                                       |
| Installed Prettier check of the eight F2 files                    | Pass.                                                                                        |
| `git diff --check`                                                | Pass; existing LF/CRLF notices only.                                                         |
| `pnpm --version`                                                  | Blocked by Corepack download: ENOTFOUND registry.npmjs.org. Installed tool equivalents used. |
| Installed Next 16.3/Turbopack production build                    | Exit 1: cannot fetch Geist/Geist Mono from Google Fonts.                                     |
| DNS checks                                                        | fonts.googleapis.com and fonts.gstatic.com both ENOTFOUND.                                   |

Build used synthetic auth/OAuth values, disabled service credentials/telemetry, loopback-only
dummy DB configuration and a temporary preload guard excluding local .env files. The guard
was removed on completion. No fonts/application configuration was altered. **No application
compile defect was established.** Complete compilation, build typecheck, prerendering/output
and deployed integration remain unverified; standalone typecheck does not substitute for them.

To finish build verification in an isolated development/CI checkout with working DNS/HTTPS
for the registry and Google Fonts: use Node 20.9+, pinned pnpm 11.1.3, an isolated development
DB and nonproduction auth/OAuth origins/secrets. Disable AI/GitHub/delivery service keys.
Include all new F2 files; do not pull production secrets or invoke cron. From Command Prompt:

```cmd
pnpm install --frozen-lockfile
pnpm test:cron
pnpm typecheck
pnpm lint
pnpm exec prettier --check src/lib/ai-resilience.ts src/lib/ai.ts src/lib/release-ingestion.ts src/app/api/cron/fetch-releases/route.ts tests/cron-recovery.test.mjs docs/features/ai-summarization.md docs/features/release-ingestion.md docs/audits/F2-ai-rate-limit-resilience.md docs/audits/F2-independent-review.md
pnpm build
```

Require complete build exit 0 and record the complete candidate SHA and output. Resolving
font DNS alone is not evidence that later stages pass.

## 9. Deferred improvements

### P2-2 — no structured duration breakdown to attribute a timeout

- **References:** [completion log](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:225>),
  [scheduler wait/send](<C:/Work/Side Projects/stack-pulse/src/lib/ai-resilience.ts:200>),
  [processor awaits](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:88>),
  [finalizer](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:263>).
- **Scenario/evidence:** an invocation is killed before the final completion log. Success
  paths emit no stage duration; attempt logs include retryDelayMs but not actual service,
  queue or persistence duration. Counters cannot locate the 300s bottleneck.
- **Expected vs actual:** safe stage timing should permit attribution even when completion
  never runs; current counters/retry warnings cannot do so. Platform request traces may
  add evidence, but those traces were not supplied/read here.
- **Impact:** slow AI, queued work, DB and finalization cannot be separated reliably, making
  concurrency/capacity tuning speculative.
- **Minimal fix:** add safe start/end stage events or incremental duration aggregates keyed
  by runId, repositoryId, numeric releaseId and attempt: githubMs (including body),
  aiRequestMs (including body), dbLookupMs, dbWriteMs, queueWaitMs, retryWaitMs and
  finalizationMs. Include elapsedMs and remainingMs at key stage boundaries; emit a start
  event so an unmatched stage remains visible after a kill. Do not log prompts, headers,
  payloads or credentials. Summed parallel-stage times are not invocation wall time.
  No new monitoring dependency is required. Defer broad tracing; obtain this minimal
  evidence before capacity tuning or claiming the incident resolved.

**Size/complexity:** before this report, tracked F2 files add 689 lines/remove 59. New helper
adds 311 newline-terminated lines and implementation audit adds 243: **1,243 added / 59 removed
across eight files**. Additions comprise **415 application**, **524 tests**, **304 documentation**
lines (approximately two thirds tests/docs). Counts include whitespace and wrapping.

One execution context is justified by shared queue/cooldown/deadline state across processors.
The injected runtime makes deterministic tests possible; the optional two-lane setting is
contained and creates no environment/configuration burden. The classifier owns sanitization,
and F1 maps it to ingestion scope. No broad rewrite or style-only refactor is recommended.
P1-3 is duplicated timeout handling with a concrete semantic gap, not merely a naming issue.

Inherited deferred limitations: latest-five discovery and no durable pending releases (F3),
cross-invocation overlap/AI spend, stale-run repair, acknowledgement reconciliation and durable
notification replay (F4). They are not silently solved by F2. The minimal invocation bound in
P1-1 is required now; full recovery architecture can remain separately scoped.

## 10. Deployment readiness

**Final verdict: CHANGES REQUIRED.**

Before deployment:

1. Fix P1-1, P1-2 and P1-3 surgically and add the targeted regressions. Reverify all 89
   existing tests plus the new cases and complete build verification.
2. Correct the HTTP dispatch claim or implement P2-1's small redirect policy. Add minimal
   stage timing before tuning/claiming normal capacity or resolution of the timeout.
3. No schema migration, new dependency or new environment variable is required by current
   F2. GitHub transport/health, CRON_SECRET auth, GITHUB_TOKEN name, cron schedule,
   configuration and successful insert uniqueness are unchanged. Operator credential,
   credit/routing and active-deployment checks remain unperformed.
4. Obtain separate deployment approval and retain an approved deployment/source rollback
   target with valid current environment settings. A code rollback to F1/F1.1 is
   schema-compatible and preserves committed release/audit rows; old deployment secrets
   may be stale, and rolling back F2 reintroduces weaker AI bounds. Do not delete records.
5. Observe scheduled-run stage timings, durable counters and coverage after approved rollout;
   a clean response alone does not establish complete historical or notification recovery.

No fixes were implemented. Stop after review and await approval.
