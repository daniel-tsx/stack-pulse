# Cron scheduler focused review

**Status:** current  
**Date:** October 23, 2026 (Asia/Saigon)  
**Verdict: CHANGES REQUIRED**

## 1. Executive summary and reviewed baseline

The six-slot scheduler improves overlap without raising repository or AI concurrency.
Rotation makes progress across executions when usable history is finalized. The original
deadline, acknowledgement, deduplication and notification contracts remain substantially
intact. However, a reproduced **P1 regression allows new repositories and additional AI
requests after a processor has already classified a global database failure**. Deployment
must wait for that admission-stop defect and its regression test to be addressed.

There are no confirmed P0 findings. One P2 benchmark-reporting limitation is safe to defer.
The production build also remains unverified: the final isolated build failed to fetch
Geist and Geist Mono from Google Fonts. Passing unit tests and typecheck do not waive
either the P1 finding or successful complete build verification.

Baseline is current `HEAD`, **`fe9b7a71061d212f4bfb03a0eb2b5f9e2bda2897`**
(`chore: standardize AI engineering workflow`), not an assumed deployed revision.
The scheduler optimization is uncommitted. Scope consists of six modified files and two
new files: cron route, ingestion helper, package script, recovery tests, scheduling SQL
tests, release-ingestion/verification docs and the October 23 investigation. The unrelated
untracked `docs/architecture/portfolio/` directory is excluded and preserved.

SHA-256 of the eight candidate files, concatenating each repository-relative path, NUL,
its exact bytes and NUL in the order below:

```text
123dfa13d3226b35a5c42fc6315fa5fd740bea0f4b7eaf2035da8daa877e0089

package.json
src/app/api/cron/fetch-releases/route.ts
src/lib/release-ingestion.ts
tests/cron-recovery.test.mjs
tests/cron-scheduling-db.test.mjs
docs/features/release-ingestion.md
docs/operations/verification.md
docs/audits/cron-throughput-2026-10-23.md
```

Read AGENTS.md, CLAUDE.md, repository entry guidance, F1/F2 implementation and verification
records, the throughput investigation, complete scheduler diff and connected ingestion,
GitHub, AI, budget, persistence, webhook, custom-ingestion and status consumers. Applied
Ponytail Review with the Eastbase overlay. Earlier pass counts and self-review approval
were treated as claims; fresh checks and additional fault probes are reported below.

**Reviewer independence limit:** this is a separate read-only verification pass in the
same conversation that contains the implementation history. No isolated non-author
reviewer process was used; this report does not claim a separate reviewer
identity. The blocking reproduction compares actual baseline and candidate source and
does not rely on the implementation author's assessment.

Only this report was added. Probes evaluated existing test helpers and source in memory;
no application or test files were edited. No production services were queried during this
review, and no live cron, paid AI, production write, credential change, deployment, commit,
push or backfill occurred.

## 2. Scheduler correctness and confirmed findings

The shared `nextIndex++` and admission checks run synchronously before each processor's
first await. Six worker promises are created, and each awaits its processor before
claiming another index. This bounds active processors to six, avoids duplicate claims and
refills idle slots without a batch barrier. Results are assigned by admission index, not
completion order. Processor rejection is caught inside the worker, records an explicit
failure and releases that slot. The route awaits all workers before finalization.

Evidence: [worker lifecycle](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:152>),
the 12-repository held-peer test, rejection/partial-progress tests, 18-repository shared
cooldown test, and the instrumented 90-repository replay. The replay measured peak six
processors in both arms, and the checked-in test measured peak one AI request.
No duplicate admission, deadlock or unhandled rejection was observed in these checks.

### P1-1 — Global database failures stop admission only after the whole repository settles

**Sources:** [fatal guard](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:153>),
[await and delayed failure aggregation](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:170>),
[failure publication to the route](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:184>),
and [per-release database catch](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:236>).

**Cause:** the processor records `DATABASE/global` locally but continues its release loop.
The route's `fatal` flag is set only when that processor returns all its accumulated
failures. Meanwhile, other workers can complete and admit the rest of the repository list.
The old batch barrier incidentally prevented those later admissions until the failed
processor settled. Removing that barrier exposes the delayed global-failure notification.

**Concrete reproduction:** evaluated the existing harness in memory with actual route,
ingestion, F2 resilience, OpenAI SDK and Zod; only external transports/persistence were
synthetic. Compared current `HEAD` route/ingestion with the candidate:

1. Select 12 repositories, ordered `Repo 00` through `Repo 11`.
2. Repo 00 discovers two releases. Repos 01–05 have empty discovery results, held behind
   a gate. Repos 06–11 each have one unseen release.
3. Repo 00's first insert raises confirmed SQLSTATE `08006`. Wait until the actual
   processor logs `DATABASE/global`. Hold its second insert pending, with its second AI
   summary already finished, leaving the shared AI lane available.
4. Release the five empty peers. Observe new admissions and mocked SDK HTTP dispatches
   before allowing Repo 00's second insert to settle. Then release that insert and await
   finalization in both versions.

| Observation while failed processor remains pending           | HEAD batch scheduler | Candidate slot refill |
| ------------------------------------------------------------ | -------------------: | --------------------: |
| Repositories discovered/attempted                            |                    6 |                **12** |
| Mocked SDK HTTP requests                                     |                    2 |                 **8** |
| Additional SDK HTTP requests for newly admitted repositories |                    0 |                 **6** |
| Final attempted / deferred repositories                      |                6 / 6 |            **12 / 0** |
| Final outcome / finalized                                    |        failed / true |         failed / true |

These are local mock dispatch counts, not paid requests. The actual F2 context remained
at concurrency one; the extra work is caused by delayed fatal admission state, not a
test-only concurrency increase. The original two-repository, one-release database-fatal
test at [test line 652](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:652>)
cannot expose this interleaving.

**Expected:** once a global database failure is classified, stop admitting new repositories
while already-started work settles and confirmed progress remains reportable.
**Actual:** new repository discovery, AI and insertion attempts continue until the failed
processor's remaining releases finish or hit the deadline. Final status eventually fails
correctly, but that does not undo the extra requests.

**Production impact:** a connection failure followed by a slow subsequent operation can
allow much more than the original six-repository batch to run during a database incident,
consume additional AI spend and produce more uncertain writes. The existing global-error
admission guard is therefore weaker at the exact fault boundary it is meant to protect.

**Minimal recommended fix:** publish an invocation-local fatal admission flag immediately
when the processor classifies a global failure, for example through an optional callback
provided by cron. Keep failure aggregation/counting single-owned and avoid double-counting
the callback. Preserve acknowledgement reporting and await all already-started work; do not
replace settlement with `Promise.race` or turn the fault into an artificial time-budget
error. Add the held-second-insert, 12-repository scenario as a persistent regression, with
both global-connection and release-specific constraint-error controls. Custom callers must
remain compatible. No queue, schema or infrastructure change is needed.

GitHub has an additional shared `authFailure` guard before each native dispatch, so an
already-observed 401 blocks further actual GitHub requests even before route aggregation.
There is no equivalent early database-failure admission guard. Existing 401, redirect and
retry regressions pass; the reproduced P1 specifically concerns global database failures.

## 3. Fairness and starvation analysis

[Rotation](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:294>) sorts a copy
of eligible repositories by name and starts after the last attempted name in the latest
started cron row with non-null `finishedAt`. Failed/completed-with-errors rows can advance
the cursor. Unfinished rows, including stale RUNNING rows, and custom ingestion rows are
excluded. Missing, empty/malformed details or a missing/renamed cursor name fall back to
sorted order. Inputs are not mutated, and current additions/removals remain eligible.

With a stable eligible list, retained cursor name, successful history finalization and
continued admission progress, successive contiguous cyclic spans provide future admission
opportunities for every repository. This is **conditional admission fairness**, not a
durable guarantee of successful release processing. Empty failed runs, lost finalization,
changing names and overlapping invocations can reset/reuse the cursor. A removed cursor
resets priority but does not lose an entry. No cross-invocation lease was introduced.

Fresh SQL subtests verify no-history fallback, latest-started finished cron selection over
custom/running/later-finishing older rows, malformed details, missing names and wraparound.
The route's two-invocation test also covers a rejected last-admitted processor, deadline
deferral and advancing to the previously unattempted repository.

An additional in-memory route probe used all 90 names from the retained historical
coverage snapshot and seeded the October 23 prefix of 84 attempted names. It allowed only
six admissions per invocation, finalized each run, and permanently rejected the Mastra
processor. Across **15 executions: 90 admissions, 90 unique names**, no duplicate within
an invocation, six outcomes and 84 deferred each time. Initial admissions were Vite,
Vitest, Vue, XState, Yarn and Zod because rollout changes physical order to name order.

| Previously starved repository |     First opportunity in this constrained probe |
| ----------------------------- | ----------------------------------------------: |
| Anthropic SDK                 |                                           Run 3 |
| Auth.js                       |                                           Run 4 |
| LangChain.js                  |                                           Run 8 |
| Mastra                        | Run 8, rejected without blocking later rotation |
| Ollama                        |                                          Run 10 |
| OpenAI Node                   |                                          Run 10 |

Removing the last cursor repository and adding a new repository then produced the
documented sorted fallback, with the new entry eligible immediately. These are synthetic
admission opportunities, not predicted production scan counts or verified successful
processing of those six repositories. Observation should cover a full actual rotation
cycle, not assume four runs always suffice.

A failed repository occupies at most one slot and processes at most five latest releases;
it does not exclusively block all six slots. An unresponsive operation still depends on
cooperative cancellation. Latest-first release order, AI-before-insert and latest-five
discovery are unchanged, so release-level starvation/out-of-window gaps remain possible.

**Coverage gap:** the 15-execution/add-remove/permanent-rejection probe is not a checked-in
test. Existing persistent coverage has one rollover and direct SQL edge cases. Preserve a
compact multi-execution regression in a future implementation pass; this review adds no
test files and found no separate reproducible fairness defect under the stated conditions.

## 4. Deadline and cancellation safety

| Phase                                                  | Absolute deadline from route entry | Review result                                        |
| ------------------------------------------------------ | ---------------------------------: | ---------------------------------------------------- |
| Selection, history read, run creation, repository work |                              270 s | Admission and signals preserved                      |
| Audit finalization                                     |                              285 s | Separate reserve preserved                           |
| Webhook preparation/delivery                           |                              295 s | Separate reserve preserved                           |
| Vercel invocation                                      |                   300 s configured | Unchanged; actual platform enforcement not exercised |

Slot refill checks remaining work time and the work signal before claiming an index.
There is no await between that guard and the processor call. GitHub, release processing,
AI dispatch, lookup and insert perform their own checks. A finishing peer at cancellation
cannot refill merely because its promise resolved. One global budget-deferral error is
recorded when unstarted repositories remain; cancelled/discovered work retains its own
specific errors. All-admitted runs can still be partial through per-release failures.

[Budget measurement](<C:/Work/Side Projects/stack-pulse/src/lib/execution-budget.ts:15>)
awaits the actual operation. Scoped Neon clients receive phase signals. AI queue/waits and
requests share the work deadline; lane release occurs in `finally`. Worker processor
rejections are caught, so the inspected supported paths reach `Promise.all` settlement
without detached ingestion promises. Finalization follows worker settlement, and delivery
follows the finalization attempt. Progress and phase timers are disposed in route `finally`.

Fresh tests cover discovery cancellation, history-read cancellation before run creation,
deadline/retry races, active and queued AI, aborted error bodies, stalled inserts,
acknowledgement at cutoff, finalization cancellation and both webhook preparation/delivery
reserves. No active tracked ingestion operation remained at delivery in these tests.
No post-finalization application release insert was observed. Delivery is allowed to read
the database afterward using its own signal; that is intended behavior.

The 270 s limit is an admission/cancellation cutoff, not guaranteed settlement at exactly
270 s. Remote SQL/provider work can continue after client cancellation. Blocked event loops,
uncooperative transports and abrupt termination still defeat a hard cleanup guarantee.
The global database admission race in P1-1 is separate from deadline cancellation: its
work signal need not be aborted when the global database failure is recorded.

## 5. Durable counters and persistence

Verified the following unchanged contracts in source and fresh tests:

- Planned = attempted + deferred repositories; once workers settle, attempted = successful
  - failed repository results. Unstarted repositories are not counted successful.
- There is no separate `repositoriesCancelled` field. Cancelled processor/release work
  contributes to failed repositories; `releasesCancelled` is a subset of failed releases.
- For complete settled results, discovered = processed + failed + skipped + deferred.
  Existing-tag and conflict no-ops are processed, not new inserts.
- Only acknowledged insert-returning IDs increment confirmed inserts and reach notification
  delivery. Earlier commits survive later invalid entries, AI/database failures and cutoff.
- A cancelled/globally failed insert may have committed remotely and marks counters
  incomplete; a rejected processor contributes no guessed release counts/IDs.
- The unique `(tech_id, version)` constraint, lookup and conflict-do-nothing remain in place.
  Invalid/failed summaries do not produce success rows.
- Details and notification IDs retain admission order despite out-of-order completion.
  Fatal outcomes remain failed; partial work/deadline errors cannot become clean success.
- Finalization stores confirmed details/counts and aggregate ingestion errors. Completeness,
  cancellation partitions, timings and notification outcomes are not new durable columns.

The custom-repository path at
[actions.ts:387](<C:/Work/Side Projects/stack-pulse/src/lib/actions.ts:387>) still calls the
existing processor/finalizer signatures and bypasses cron ordering. Its compatibility test
passes. The status page still consumes the unchanged run-row shape. An aborted finalization
can still leave RUNNING history, and unknown original notification outcomes are not replayed.
These are documented pre-existing boundaries, not newly repaired by scheduling.

The P1 probe's eventual failed status and finalized row are accurate; its problem is work
admitted before that status can be aggregated, not a fabricated clean result.

## 6. Performance evidence and synthetic benchmark assessment

Recomputed the ratio from all 15 retained raw request-log completion messages, not the
author's parsed summary:

```text
route elapsed sum: 3,746,085 ms
aiRequest sum:    3,187,397.843598 ms
ratio:           85.0861057% -> 85.1%
aiQueue sum:     2,580,346.161384 ms
aiRetryWait sum:    28,049.445499 ms
```

`aiRequest` wraps the whole summary operation: prompt/request preparation, SDK transport,
upstream/provider routing and latency, response/body handling, JSON parsing, Zod validation
and normalization. It excludes separately measured AI lane waiting and cooldown/backoff.
Error classification and other route/DB work are outside that request measurement.
With one AI lane, requests in this invocation do not overlap each other; queue waits and
other stage sums do overlap wall time. Thus 85.1% supports **AI request-operation occupancy**,
not 85.1% spent exclusively computing tokens at the upstream model. No trace isolates
provider compute from network or SDK/application overhead. There was no new production
log fetch or SQL read during this review; the retained October 16–23 snapshot was used.

The checked-in synthetic test reproduced the reported numbers. Its deterministic inventory
and latency constants are identical between arms; both include the history read, 270 s
work cutoff and 285 s finalization reserve. The legacy arm is a reference batch loop using
current ingestion, not the complete old route. Fault probes separately used actual HEAD.
No retry policy, strict output contract or deadline was weakened to obtain the throughput.

### P2-1 — Benchmark output omits the increased cancellation/deferred-work trade-off

**Sources:** [reported replay counters](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:1893>)
and [comparison assertions](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:1900>).
This is a validation/reporting gap, **not a second confirmed application defect**.

**Evidence/reproduction:** re-executed the existing benchmark callback with an in-memory
observer collecting each actual processor result and active processor count. No fixture,
clock, transport or application behavior was changed. Counts were:

| Counter                                        | Fixed batches | Refilled slots |
| ---------------------------------------------- | ------------: | -------------: |
| Attempted repositories                         |            42 |             67 |
| Unattempted repositories                       |            48 |             23 |
| Discovered releases                            |           210 |            335 |
| Processed releases, including duplicates       |           200 |            307 |
| Failed release operations                      |         **1** |          **6** |
| Cancelled release operations, subset of failed |         **1** |          **6** |
| Deferred discovered releases                   |             9 |             22 |
| Skipped releases                               |             0 |              0 |
| Acknowledged inserts / actual mock rows        |       30 / 30 |        32 / 32 |
| AI SDK attempts                                |            31 |             33 |
| Failed logical AI operations                   |             1 |              6 |
| Peak repository processors / AI requests       |         6 / 1 |          6 / 1 |
| Elapsed including finalization                 |     270.300 s |      270.300 s |

Both partitions reconcile: 210 = 200 + 1 + 9 and 335 = 307 + 6 + 22.
No failed or deferred release was secretly accepted as processed/inserted. Additional
queued logical summaries can fail without another HTTP attempt at the deadline.

**Expected:** a throughput comparison intended to assess deadline exhaustion should expose
failed/cancelled/deferred work alongside scans and inserts, and assert reconciliation.
**Actual:** the checked-in diagnostic emits only scans, inserts, attempts and elapsed time;
it asserts improved scan/insert totals and settlement, not these partitions.
**Production impact:** a reader could mistake additional admissions for more cleanly
completed work. The investigation already disclaims a production forecast, so this is
safe to defer and does not independently block deployment.
**Minimal recommended fix:** include these counts and partition assertions in the existing
replay and report them together. No benchmark framework or production instrumentation is
required. Do not change cancellation semantics merely to improve a benchmark result.

The benchmark demonstrates useful overlap under one deliberately uneven synthetic workload.
It does not establish production completion rate, provider tail latency/rate limits, actual
spend, upstream capacity, arrival rate, historical backlog recovery or the effects of failure
types absent from that fixture. Rotation correctness is assessed separately. Both arms
still exhaust the same work budget.

## 7. Fresh regression results

| Exact check                                                                                  | Result                                                                                         |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `node --test tests/cron-recovery.test.mjs`                                                   | **PASS: 124**, 0 failed/cancelled/skipped; original 118 plus six new cases                     |
| `node --test tests/cron-scheduling-db.test.mjs` with explicit owned target                   | **PASS: 5** Node results, comprising parent plus four SQL subtests; 0 failed/cancelled/skipped |
| Combined fresh runner counts from those two commands                                         | **129 passed**, not a claim that the two commands were one invocation                          |
| `pnpm typecheck`                                                                             | **PASS**, exit 0                                                                               |
| `pnpm lint`                                                                                  | **PASS**, exit 0                                                                               |
| `git diff --check`                                                                           | **PASS**, exit 0; ordinary LF/CRLF notices                                                     |
| Prettier `--check` for changed source/tests/package, release-ingestion doc and investigation | **PASS**                                                                                       |
| Global database-failure interleaving probe, baseline versus candidate                        | **FAIL: candidate violates fatal admission stop**, P1-1                                        |
| 15-execution fairness/add-remove/permanent-rejection probe                                   | **PASS within the documented conditions**, not a durable-service guarantee                     |
| Instrumented synthetic replay and counter reconciliation                                     | **PASS**, with cancellation trade-off described above                                          |
| Hosted Neon transport/unknown remote commit, production rollout, paid AI and real webhooks   | **NOT RUN**                                                                                    |

The SQL command used process-local settings only:

```bat
set SKILL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test
set SKILL_TEST_TARGET_FILE=.env.skill-test-target.json
node --test tests/cron-scheduling-db.test.mjs
```

The existing cluster was initially stopped. Before restart, the workspace data directory
and recorded system identifier `7698908168512842628` were checked. The test helper then
verified live database/role/data directory/system identity before writes. It created,
dropped and verified removal of only its random namespace, using actual Drizzle neon-http
generated SQL through the existing local TCP transport. The cluster was stopped again
afterward. No `.env`/DATABASE_URL fallback, developer database or hosted Neon test was used.

Persistent coverage still lacks the P1 interleaving and full multi-execution fairness probe.
The original recovery tests pass because they do not contain the reproduced P1 timing.
Test success therefore does not overturn that finding.

## 8. Build status

**FAIL — environment-blocked; successful production build remains unverified.**

Built a temporary isolated copy in ignored
`build/cron-scheduler-review-build-E1sDni`, using installed Next **16.3.0 / Turbopack**
and the unchanged application/font/configuration source. Exact inner command:

```text
node C:/Work/Side Projects/stack-pulse/node_modules/next/dist/bin/next build C:/Work/Side Projects/stack-pulse/build/cron-scheduler-review-build-E1sDni
```

No `.env` files were copied. The child received synthetic nonproduction auth/origin,
an inert loopback test DB URL, disabled telemetry and blank inference, notification and
Sentry credentials. No source configuration or stored credentials were edited. The copy
resolved the existing installed dependencies; no install or new dependency was introduced.

The final attempt exited **1** with exactly two reported build errors: failure to fetch
Geist and Geist Mono from `fonts.googleapis.com`. No scheduler compile error was established.
Full compilation, prerendering and final output are not certified by this partial build.

Earlier isolation attempts hit a Turbopack internal error under `node_modules/.cache` and
then exposed two Sentry root files omitted from the copy setup. Those were review-harness
issues, not application findings. The final copy included both unchanged Sentry config
files and reached the Google Fonts failure without those module errors. All three
temporary build directories were removed using checks restricting cleanup to this run's
resolved build paths. Fonts, styling and Next configuration were not changed to bypass
the network failure. The workspace's existing application build/dev outputs were preserved.

## 9. Residual risks

- Serial AI capacity remains finite; increased admission does not promise clean completion
  when new-release demand exceeds it. Increased useful work can also increase actual spend.
- No global limiter/lease prevents overlapping invocations sharing a cursor or performing
  duplicate AI before unique insertion resolves persistence. This predates the optimization.
- Name changes, empty history and failed finalization can reset/reuse ordering. Admission
  fairness is not successful-summary fairness or recovery beyond the latest five releases.
- Remote commit/notification acceptance after lost acknowledgement, process termination,
  stalled event loops and hard 300 s enforcement remain outside local proof.
- Safe errors/counters are not complete provider billing telemetry. AI request-operation
  durations must not be presented as isolated upstream model compute time or dollar cost.
- The original native OpenRouter redirect-attempt accounting limitation remains deferred;
  three application attempts need not mean three underlying native redirect dispatches.
- Production model/environment, actual after-change scheduling, full cycle coverage and
  final runtime headroom were not newly verified. These limits are not fabricated blockers
  requiring a broad redesign.

## 10. Deployment-readiness verdict and exact conditions

**CHANGES REQUIRED.** P1-1 blocks deployment even if the network build subsequently passes.
This review stops without implementing its recommendations.

Required before deployment:

1. Correct immediate global-failure admission notification and add the persistent
   12-repository/held-second-insert regression, retaining exact committed counters and
   finalization. Verify release-specific SQL failures do not incorrectly stop peers.
2. Re-run the entire cron recovery and owned SQL suites, typecheck, lint, formatting and
   whitespace checks on the corrected revision. Obtain a focused re-review of the P1 fix;
   a separate non-author context should supply an independent approval.
3. Complete the default production build in a network-enabled isolated checkout with
   working Google Fonts access and no production-connected build data or paid consumers.
   Record the exact reviewed/built revision and require exit 0 through final output.
4. Before any separately authorized release, verify deployment environment references,
   unchanged AI concurrency/retries/deadlines, and existing cron schedule. No migration,
   new database schema, queue, Redis, concurrency increase or duration increase is needed.
5. Retain an eligible previous deployment for rollback. After an authorized release, observe
   naturally scheduled runs over a full rotation cycle: admitted and successful repository
   coverage, cancelled/deferred releases, AI attempts/429s/spend, confirmed inserts,
   completeness, finalized status and actual time remaining before 300 s. HTTP 200 and
   a higher scan count alone are insufficient. Preserve all committed data on rollback.

P2-1 can be deferred with the benchmark's limitations retained. No production trigger,
deployment, environment change, backfill, commit or push is authorized by this verdict.
