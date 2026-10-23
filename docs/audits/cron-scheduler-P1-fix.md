# Cron scheduler P1 targeted fix

**Status:** current  
**Date:** October 23, 2026 (Asia/Saigon)  
**Assessment:** implemented and locally validated; awaiting focused verification. Deployment is not approved.

## 1. Root cause

The processor classified a global database failure immediately but returned that failure
to cron only after finishing its remaining releases. The scheduler's `fatal` flag was
therefore still false while other repository workers completed and refilled their slots.
A slow subsequent operation in the failed processor could permit the rest of the list to
be admitted, including additional AI requests, before final aggregation stopped admission.

This is the confirmed P1 in the
[focused review](./cron-scheduler-focused-review.md). The original review and investigation
are preserved unchanged; their historical assertions are not rewritten as approval.

Work began on the existing uncommitted scheduler optimization against HEAD
`fe9b7a71061d212f4bfb03a0eb2b5f9e2bda2897`. The P1 fix does not include unrelated
untracked portfolio documents or claim that any candidate revision is deployed.

## 2. Files changed in this targeted fix

| File                                       | Targeted change                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/lib/release-ingestion.ts`             | Optional synchronous global-database-failure notification at classification                             |
| `src/app/api/cron/fetch-releases/route.ts` | Supplies a callback that sets the existing invocation-local fatal flag                                  |
| `tests/cron-recovery.test.mjs`             | Four held-insert/timing regressions; a test-only log hook; fuller benchmark counters and reconciliation |
| `docs/features/release-ingestion.md`       | Documents immediate admission shutdown and settlement/counting behavior                                 |
| `docs/audits/cron-scheduler-P1-fix.md`     | This implementation and validation record                                                               |

The earlier scheduler changes, SQL test file and package-script change remain part of the
working tree. No dependency, migration, schema, model setting, concurrency setting, retry
rule, duration limit, font or application configuration was changed by this correction.

## 3. Exact failure propagation mechanism

[processTechReleases](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts>)
accepts an optional fifth argument, `onGlobalDatabaseFailure?: () => void`.
Its existing `recordFailure` function:

1. Retains the already-classified failure in the processor's result.
2. Calls the notification synchronously only for `category === 'DATABASE'` and
   `scope === 'global'`, before returning control to other promise continuations.
3. Keeps the existing safe error log and final result/counting path.

[Cron](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts>)
passes a callback whose only action is `fatal = true`. The existing worker admission
condition checks that same flag before claiming another repository index. Publication and
the flag assignment contain no await, so a ready peer continuation cannot admit another
repository after publication and before the flag is set.

The notification does **not** call route `recordFailure`, increment errors/counters, abort
the execution budget, throw, finalize a run, or detach work. Final settled processor results
remain responsible for aggregation exactly once. Repeated notifications simply set the
same flag again; they do not introduce additional error counts.

The existing database classifier remains authoritative: SQLSTATE classes 22/23, including
the tested `23503` constraint failure, are release-specific and do not notify admission
shutdown. The global `08006` connection failure does. Deadline-cancelled operations retain
their existing TIME_BUDGET classification and cancellation signal behavior. Confirmed SQL
errors keep their existing precedence when a deadline races the failure.

Custom repository ingestion still calls the existing optional-argument signature without
the new callback. Its return shape, processing, local AI budget and finalization behavior
are unchanged. GitHub's shared authentication guard and 401 fail-fast path are unchanged.

## 4. Permanent regression reproduction: before and after

Four cases execute the actual cron route, ingestion, F2 context, OpenAI SDK and Zod with
synthetic GitHub/AI/database transports. No external provider or application database is used.
They cross `08006` versus `23503` with two peer-completion timings:

- Release all five peer processors after the failed processor starts its pending second insert.
- Release all five peer processors synchronously when classification is logged, exercising
  simultaneous completion continuations at the failure-publication boundary.

The fixture selects 12 repositories and starts six workers. Repo 00 has two releases; its
first insert fails and its second insert is held. Repo 01 commits a release before that
failure is allowed, so the test checks preservation of progress that predates the failure.
Repos 02–05 have empty results. All five initial peers settle together through the gate.
Repos 06–11 each have an unseen release that would generate AI work if wrongly admitted.

Before changing application code, both new `08006` regressions failed with
**12 admitted repositories instead of 6**. Both `23503` controls passed. The first test
development attempt exhausted a microtask-only wait before the multi-request SDK fixture
settled; that harness wait was corrected before recording the reproducible admission failure.

After the fix, all four cases pass with these exact final outcomes:

| Counter                                        | Global connection failure (`08006`) | Release-specific SQL error (`23503`) |
| ---------------------------------------------- | ----------------------------------: | -----------------------------------: |
| Planned repositories                           |                                  12 |                                   12 |
| Attempted / deferred repositories              |                           **6 / 6** |                           **12 / 0** |
| Successful / failed repositories               |                               5 / 1 |                               11 / 1 |
| Mocked SDK HTTP requests / retries / cooldowns |                       **3 / 0 / 0** |                            9 / 0 / 0 |
| Discovered releases                            |                                   3 |                                    9 |
| Processed / failed releases                    |                               2 / 1 |                                8 / 1 |
| Deferred / skipped / cancelled releases        |                           0 / 0 / 0 |                            0 / 0 / 0 |
| Confirmed inserts                              |                               **2** |                                    8 |
| Total reported errors / durable run errors     |                           **1 / 1** |                                1 / 1 |
| Final HTTP / response status                   |                    **500 / failed** |                200 / partial_success |
| Durable status                                 |                          **failed** |                completed_with_errors |
| Run finalized                                  |                                true |                                 true |
| Release counters complete                      |                               false |                                 true |
| Peak active repository processors              |                                   6 |                                    6 |

The global case's three SDK requests all originate from the already-admitted Repo 00 and
Repo 01. No later repository is admitted or sends an AI request. The count is one request
higher than the review's original two-request reproduction because this permanent fixture
adds Repo 01's earlier committed release.

While the second insert is held, tests require no finalization or notification dispatch
and exactly one active database operation. After releasing it, they require all processors
and database operations settled, exact durable counters, no duplicate repository claim,
and notification IDs matching only acknowledged inserted records. Failure is counted once
despite early publication. Existing GitHub 401 and custom-caller regressions also pass.

### Benchmark reporting follow-up

The same synthetic comparison now emits attempted/deferred repositories,
discovered/processed/failed/skipped/deferred/cancelled releases and confirmed inserts.
Both arms assert repository and release partitions, cancelled-as-a-subset-of-failed, and
agreement between confirmed insert totals and actual mock rows. The fixture, latencies,
AI concurrency, application retry policy and deadlines remain identical to the previous
comparison. The legacy arm still uses a reference batch loop with current ingestion.

| Counter                                        | Fixed batches | Refilled slots |
| ---------------------------------------------- | ------------: | -------------: |
| Attempted / deferred repositories              |       42 / 48 |        67 / 23 |
| Discovered releases                            |           210 |            335 |
| Processed / failed releases                    |       200 / 1 |        307 / 6 |
| Deferred discovered releases                   |             9 |             22 |
| Cancelled release operations, subset of failed |         **1** |          **6** |
| Skipped releases                               |             0 |              0 |
| Confirmed inserts                              |            30 |             32 |
| AI SDK attempts                                |            31 |             33 |
| Peak AI requests                               |             1 |              1 |
| Elapsed including finalization                 |     270.300 s |      270.300 s |

Reconciliation: `210 = 200 + 1 + 0 + 9`; `335 = 307 + 6 + 0 + 22`.
More work is admitted and more inserts are acknowledged, while more operations are pending
at cutoff. The expanded reporting exposes that trade-off; neither arm demonstrates clean
completion or a production completion-rate improvement. Scheduler behavior was not changed
to improve these numbers. This addresses the review's P2 benchmark-reporting gap locally.

## 5. Committed progress and lifecycle guarantees

The fix controls **new repository admission**. It deliberately does not interrupt or
rewrite already-started processors' existing release loops. Their operations remain awaited
under the existing 270 s work budget, with separate 285 s finalization and 295 s webhook
reserves and the unchanged 300 s route limit.

An earlier acknowledged insert remains counted and eligible for notification. The held
second insert may complete after notification of the first failure and is also counted if
acknowledged. Finalization waits for that settlement. No failed AI or unacknowledged write
is fabricated as an insert. Unique `(tech_id, version)` deduplication, conflict no-ops and
admission-ordered results/notification IDs remain unchanged.

A connection failure during insert can have an unknown remote commit outcome. Therefore
the global regression expects `releaseCountersComplete:false` even though this mock did
not commit the failed insert. The two acknowledged IDs remain exact; no guessed ID is
added for the failed operation. The confirmed constraint-error control retains complete
counters. This is the existing F1/F2 distinction, not a new rollback guarantee.

## 6. Fresh validation results and cleanup

| Command/check                                                                | Result                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `node --test --test-name-pattern=P1 tests/cron-recovery.test.mjs` before fix | **FAIL as expected:** two global cases admitted 12 instead of 6; two constraint controls passed           |
| Same focused command after fix                                               | **PASS: 4**, no failures/cancellations/skips                                                              |
| `node --test tests/cron-recovery.test.mjs`                                   | **PASS: 128**, no failures/cancellations/skips, including original F1/F2, scheduler and four new P1 cases |
| `node --test tests/cron-scheduling-db.test.mjs` with owned target            | **PASS: 5** Node results (parent plus four SQL subtests), no failures/cancellations/skips                 |
| Total fresh runner results across the two suites                             | **133 passed**, not a claim of one combined invocation                                                    |
| `pnpm typecheck`                                                             | **PASS**, exit 0                                                                                          |
| `pnpm lint`                                                                  | **PASS**, exit 0                                                                                          |
| Prettier checks on changed source/tests/docs and existing SQL test           | **PASS**                                                                                                  |
| `git diff --check`                                                           | **PASS**, exit 0; normal LF/CRLF notices only                                                             |
| Default production build in isolated copy                                    | **FAIL — environmental Google Fonts fetch failure**, exit 1                                               |
| Hosted Neon, production cron, live AI and real notification checks           | **NOT RUN**; no new authorization or live-service calls                                                   |

Owned SQL invocation in Command Prompt:

```bat
set SKILL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test
set SKILL_TEST_TARGET_FILE=.env.skill-test-target.json
node --test tests/cron-scheduling-db.test.mjs
```

The existing cluster was initially stopped. Before restart, its workspace-owned data
directory and system identifier `7698908168512842628` matched the recorded target.
The helper then verified live database, role, directory and identity before writes. Tests
created only their random namespace, executed actual Drizzle neon-http generated SQL
through the existing local TCP transport, dropped it and verified removal. The cluster
was stopped again after tests, restoring its initial state. There was no `.env` or
application DATABASE_URL fallback and no production/developer data target.

Build command used the installed Next 16.3.0/Turbopack with an isolated source copy:

```text
node C:/Work/Side Projects/stack-pulse/node_modules/next/dist/bin/next build C:/Work/Side Projects/stack-pulse/build/cron-scheduler-P1-build-jczScz
```

No `.env` files were copied. Only synthetic process-local auth/origin and an inert loopback
test DB URL were supplied; inference, notification, Sentry and telemetry credentials were
disabled. Application source, fonts and Next configuration were copied unchanged. The build
reported exactly two errors: failure to fetch Geist and Geist Mono from Google Fonts.
No application compile defect was established, but complete compilation/prerender/output
remains unverified. The temporary build directory was removed after verifying its resolved
path stayed inside this run's owned build location. Existing dev/build output was preserved.

Ponytail Review with the Eastbase overlay traced classification, synchronous callback,
worker admission, aggregation, custom callers and settlement. No further blocking issue
was found in this self-review. It is not the requested subsequent focused verification or
an independent approval. The prior review's findings and verdict remain intact as evidence.

## 7. Remaining limitations

- Notifications stop new admissions only after classification. Already-admitted repository
  work may continue under its original deadline and may incur further AI/DB operations.
- Callback state is invocation-local. There is no cross-invocation lease, rate limiter or
  coordination, and concurrent invocations can still perform duplicate AI before insertion.
- Cooperative cancellation cannot prove that a lost HTTP acknowledgement means no remote
  commit or delivery occurred. Abrupt termination and blocked event loops remain limits.
- Rotation still depends on usable finalized history; name changes/empty history can reset
  ordering. Latest-five discovery does not recover older gaps. No F3 backfill is introduced.
- The benchmark is synthetic. Its extra cancellation/deferred counts and identical cutoff
  are now explicit; it does not prove production throughput, provider headroom or cost.
- Local PostgreSQL and mocked SDK fault tests do not certify hosted Neon cancellation,
  real provider billing or a Vercel invocation's final response margin.

## 8. Deployment readiness assessment

**READY FOR FOCUSED VERIFICATION; NO-GO FOR DEPLOYMENT AT THIS CHECKPOINT.**

The targeted P1 behavior is corrected and its permanent regressions pass, with SQL error
scope controls and existing F1/F2 assertions intact. The benchmark follow-up is implemented
without changing scheduling policy. No model/concurrency setting, new infrastructure or
migration is needed.

Before deployment, obtain focused verification of the synchronous admission-stop mechanism,
committed counters and concurrent-completion tests. Require a complete successful default
production build in a network-enabled isolated environment with Google Fonts access and
approved test data. Record the reviewed/built revision and obtain separate deployment
authorization. After an authorized release, observe naturally scheduled runs across a full
rotation cycle; do not manually invoke production cron as a verification shortcut.

Implementation and local validation stop here. No production write, live cron, paid AI,
deployment, commit or push was performed.
