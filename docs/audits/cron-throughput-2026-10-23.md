# Cron throughput investigation — October 23, 2026

**Status:** current

## Assessment

Serialized AI request latency is the confirmed primary bottleneck. Fixed six-repository
batch barriers waste available overlap, and the observed fixed repository order repeatedly
defers the same tail. A small scheduling change is implemented and locally verified:
refill up to six repository slots, retain **one AI lane**, and rotate admission using
existing completed cron details. No schema, dependency, retry policy, schedule or duration
limit changes are required.

**GO for controlled verification of this change after an authorized release.** Production
improvement is **NOT RUN**. This does not establish that all releases can fit in every run
or that an older backlog has been recovered. No deployment, production mutation, live
ingestion, paid inference, commit or push was performed during this investigation.

## Evidence and scope

Inspected AGENTS.md, CLAUDE.md, README, agent start/verification guidance, the F1/F2 audits
and review fixes, current cron/ingestion/GitHub/AI resilience/budget/database/webhook code,
callers, configuration and recovery tests. Documentation claims were checked against code.

Read-only sources on October 23:

- Vercel production request logs for all **15** scheduled runs from October 16 00:00 UTC
  through October 23 00:00 UTC; each includes the completed stage metrics and AI counters.
  The connector returned 403; the authenticated CLI fallback succeeded with explicit
  project `prj_eSOmhOMsFDscTZhVmvxfxRkXuISi` and scope `team_yzTvlVGW2KYvgKGdZOb1VDOo`.
- Neon project `lively-wave-81266753`, confirmed production branch
  `br-purple-pine-aoutwizu`, database `neondb`: SELECTs of run metadata/details and
  repository coverage. No user records or credentials were exported. Selection of followed
  custom repositories used an existence predicate, not a user-data export.
- Both supplied screenshots corroborate cancellation near the work cutoff; individual
  external-API samples in them do not establish stage totals.

Raw logs and parsed measurements remain in ignored
`node_modules/.cache/cron-throughput-2026-10-23/`. Log text was parsed as data, not evaluated.
Durable measurements are recorded below so conclusions do not depend on that cache.

### October 23 run

Request `vhqls-1792713624623-263f45f6266d`, run
`d943d424-a25f-4524-8833-598076463fd4`, request start 00:00:24.623 UTC.

| Stage                    | Aggregate seconds | Operations | Interpretation                                                      |
| ------------------------ | ----------------: | ---------: | ------------------------------------------------------------------- |
| Repository selection     |             1.693 |          2 | Parallel setup reads                                                |
| GitHub discovery         |            25.872 |         84 | 308 ms average per repository                                       |
| Database lookup          |           124.937 |        417 | 300 ms average per release lookup                                   |
| Database write           |            18.184 |         28 | Run creation plus 27 acknowledged release inserts                   |
| AI queue                 |           203.140 |         29 | Waiting behind other callers; overlaps active AI and other work     |
| AI request               |       **230.298** |     **28** | 8.225 s average per attempted request, including final cancellation |
| AI retry wait            |                 0 |          0 | Zero retries and zero cooldowns                                     |
| Run finalization         |             0.242 |          1 | Completed before delivery preparation                               |
| Notification preparation |             0.909 |          2 | No destinations sent                                                |

Route elapsed time was **271.157 s**. The persisted run duration was **268.949 s**
(00:00:26.366–00:04:55.315), because the audit row starts after selection/setup.
This explains the reported 268–269 s durations without a platform kill.

AI requests occupied **84.9%** of route elapsed time with the single lane. This measures
the SDK/network/provider/response operation, not isolated provider compute time. No trace
breakdown establishes which upstream provider component is slow. Stage sums are operation
durations: concurrent GitHub/DB work and queue waits overlap and must **not** be added to
wall time. All tracked active counts were zero at completion.

Counters: 90 planned, 84 attempted, 81 successful and 3 failed repositories, 6 unattempted;
420 releases discovered = 415 processed + 2 failed + 3 deferred. The 415 processed include
**27 inserted** and existing/conflict no-ops. Two failures were cancelled; one AI request
was active at the deadline and another logical summary had not dispatched an HTTP attempt.
Five reported errors comprise two release cancellations, two repository deferrals and one
global budget deferral. The run finalized `completed_with_errors`, HTTP 200, with complete
confirmed release counters. HTTP 200 does not mean clean ingestion.

### Fifteen-run comparison

Times below are UTC. All runs planned 90 repositories and finalized `completed_with_errors`.
AI seconds are aggregate request time; queue seconds are overlapping caller wait time.

| Start     | Route seconds | Repos attempted | Inserts | AI attempts / retries / cooldowns | AI seconds | Queue seconds |
| --------- | ------------: | --------------: | ------: | --------------------------------- | ---------: | ------------: |
| Oct 16 00 |       271.588 |              48 |       9 | 16 / 0 / 0                        |    252.126 |       151.518 |
| Oct 16 12 |       269.912 |              84 |      25 | 25 / 0 / 0                        |    225.873 |        63.508 |
| Oct 17 00 |       271.136 |              72 |      17 | 19 / 0 / 0                        |    229.970 |        24.976 |
| Oct 17 12 |       271.583 |              90 |      33 | 34 / 0 / 0                        |    243.211 |       686.295 |
| Oct 18 00 |       271.608 |              90 |      18 | 20 / 0 / 0                        |    228.885 |       178.026 |
| Oct 18 12 |       233.186 |              90 |       9 | 13 / 0 / 0                        |    204.016 |       311.712 |
| Oct 19 00 |       151.046 |              90 |       7 | 8 / 0 / 0                         |    119.509 |        57.970 |
| Oct 19 12 |       108.493 |              90 |       3 | 9 / 4 / 5                         |     68.627 |        23.432 |
| Oct 20 00 |       270.685 |              78 |      20 | 22 / 0 / 0                        |    236.432 |        82.456 |
| Oct 20 12 |       270.714 |              90 |      25 | 27 / 0 / 0                        |    238.698 |       233.333 |
| Oct 21 00 |       271.170 |              90 |      25 | 27 / 0 / 0                        |    234.954 |       132.569 |
| Oct 21 12 |       271.537 |              84 |      11 | 17 / 2 / 3                        |    228.741 |       142.092 |
| Oct 22 00 |       270.708 |              84 |      25 | 26 / 0 / 0                        |    232.434 |       278.915 |
| Oct 22 12 |       271.562 |              72 |      19 | 28 / 5 / 7                        |    213.624 |        10.404 |
| Oct 23 00 |       271.157 |              84 |      27 | 28 / 0 / 0                        |    230.298 |       203.140 |

Twelve runs reached the work admission/deadline boundary. Across all 15, AI request time
was **3,187.398 s / 3,746.085 s elapsed = 85.1%**, with 273 inserts, 319 attempts,
11 retries and 15 cooldowns. Retries occurred in only three runs; four logical summaries
exhausted rate-limit retries. Timeouts also occur without retries. Retry waits contribute
on affected runs, but neither retries nor GitHub discovery explain the recurring pattern.
Database round trips are a meaningful secondary cost, largely overlapped across processors;
these measurements do not show lock contention or server-side SQL execution as the main cause.

## Order, rediscovery and backlog

Persisted detail ordinality showed the same repository positions throughout the sample:

| Historical positions | Attempts per repository across 15 runs |
| -------------------- | -------------------------------------: |
| 1–48                 |                                     15 |
| 49–72                |                                     14 |
| 73–78                |                                     12 |
| 79–84                |                                     11 |
| **85–90**            |                                  **7** |

Positions 85–90 were OpenAI Node, Anthropic SDK, LangChain.js, Ollama, Mastra and Auth.js.
All six were absent from the last **four consecutive** run details; their last attempt was
October 21 00:00 UTC, roughly 48 hours before the latest run. The unordered database
selection happened to produce a stable physical order; there was no fairness mechanism.

Repeated rediscovery is confirmed: Mastra release **412419902** failed in six separate
invocations (October 17 12, October 18 00/12, October 19 00/12 and October 20 12).
Release **411510264** failed in two. AI runs before insertion, so a failed unseen tag can
consume time again on a later invocation while it remains among the latest five.
Already-persisted tags skip AI through the existing lookup and unique constraint.

There were 114 unattempted repository occurrences and 48 failed release operations across
the sample; these are **not distinct backlog counts**. The three early-finishing runs
disprove that every run necessarily exhausts its budget. A monotonically growing backlog
is **not established**: there is no persisted pending-release inventory, and this inspection
did not crawl GitHub or measure arrivals outside the latest-five window. Missing older
releases can fall out of that window. F3/backfill remains outside this change.

## Changes and before/after analysis

- Replace fixed batch barriers with six bounded repository workers. Each settled slot
  admits the next repository while slow peers continue. All started work is awaited.
- Sort eligible repositories by name and rotate after the last admitted repository in
  the latest started, finished cron row. Persist results and notification IDs in admission
  order, including rejected processors, so completion order cannot corrupt the cursor.
- Reuse the existing `details` column and `release_fetch_runs_started_idx`; add one
  cancellation-scoped history read per nonempty run. Unfinished/custom runs are excluded.
  Missing/invalid history or a removed cursor name falls back to name order. The first
  rollout transitions from the historical physical order to the new stable order.
- Keep AI concurrency **1**, shared cooldown, maximum three application attempts, 25 s
  request timeout, 270/285/295 s work/finalization/delivery deadlines and 300 s platform
  limit. Three rate-limited runs at concurrency one provide no evidence for safely raising it.

Regression replay executes actual ingestion, AI resilience and the SDK against synthetic
transports and a virtual clock. It compares a reference of the previous batch algorithm
with the new route using identical inventories/latencies: 90 repositories, five tags each,
five unseen tags in every sixth repository; other tags already stored. GitHub takes 308 ms,
each DB operation 300 ms and each AI request 8,225 ms. Both arms include the history read
to isolate scheduling effects. Rotation is checked separately across two route invocations.

| Controlled replay              | Fixed batches | Refilled slots |
| ------------------------------ | ------------: | -------------: |
| Repositories attempted         |            42 |         **67** |
| Acknowledged release inserts   |            30 |         **32** |
| AI HTTP attempts               |            31 |             33 |
| Peak simultaneous AI requests  |             1 |              1 |
| Elapsed including finalization |     270.300 s |      270.300 s |

This fixture improves discovery coverage by 59.5% and confirmed inserts by 6.7%, using
otherwise idle overlap; it still reaches the same cutoff. These are reproducible synthetic
results, **not a replay of the historical inventory or a promised production improvement**.
Neither finer per-operation latency distributions nor all unseen tail releases were captured.
Actual production after-change completion rate remains **NOT RUN**.

## Verification and cleanup

The two new scheduling regressions failed before the implementation: next invocation
restarted at Repo 1 instead of deferred Repo 7, and a held first processor prevented later
discovery despite free slots. They pass after the change, including rejection of the last
admitted processor and persistence of admission order when completion order differs.

| Check                                                    | Result      | Evidence                                                                                   |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| Historical bottleneck/coverage                           | **PASS**    | 15 completed request metrics correlated with persisted rows/details                        |
| Offline recovery and throughput                          | **PASS**    | 124 tests; preserves original 118 recovery tests                                           |
| Real isolated SQL query                                  | **PASS**    | Parent plus four subtests; generated Drizzle neon-http SQL executed on local PostgreSQL 18 |
| Combined `pnpm test:cron` with explicit owned target     | **PASS**    | 129 passed, 0 failed/cancelled/skipped                                                     |
| Typecheck / lint                                         | **PASS**    | `pnpm typecheck`, `pnpm lint`                                                              |
| Hosted Neon behavior / production after-change / live AI | **NOT RUN** | No cloud-connected test, live inference or ingestion trigger                               |
| App build / browser                                      | **NOT RUN** | Backend scheduling only; no application/environment-backed rendering needed                |

Windows Command Prompt, after independently verifying the owned target:

```bat
set SKILL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test
set SKILL_TEST_TARGET_FILE=.env.skill-test-target.json
pnpm test:cron
pnpm typecheck
pnpm lint
git diff --check
```

The ownership helper checks the explicit target file, workspace data directory, PID/port,
database, role and live `pg_control_system()` identifier before any fixture write. The test
creates only `skill_test_<random UUID>`, applies the existing run-table/index DDL there,
uses actual Drizzle generated SQL through the existing local TCP test transport, then drops
and verifies removal of that namespace. It never loads `.env` or falls back to DATABASE_URL.
Local PostgreSQL is not evidence for hosted Neon HTTP cancellation.

Initial sandbox attempts could not fetch pinned pnpm or reach the loopback SQL service.
Approved execution obtained pnpm **11.1.3** and ran the checks. The existing test cluster
was stopped; its recorded system identifier `7698908168512842628` and data directory were
verified before restart. The temporary cluster restart is returned to its initially stopped
state after checks. No persistent application schema, cloud resource or dependency was added.
The unrelated `docs/architecture/portfolio/` directory is preserved.

## Review and residual risks

Ponytail Review with the Eastbase overlay found no blocking issue in the final change;
this is a self-review, not a new independent-review approval. Traced custom-repository
ingestion, status/audit consumers, confirmed notification IDs, deduplication, fatal errors,
cooldown, deadline and unknown-commit behavior. The custom ingestion path does not use the
cron rotation helper. Regression tests retain the prior boundary assertions.

The schedule improves overlap and fairness; it cannot eliminate model latency or promise
complete runs when arrivals exceed serial capacity. Faster admission may increase completed
work and spend per invocation even with one active AI request. The replay makes 33 rather
than 31 attempts. Existing bounded retries, output limits and deadline remain the cost
controls; no actual provider token/cost measurements were acquired for these production runs.
Do not infer dollars from request durations.

Fairness depends on successfully finalized history. Overlapping invocations can read the
same cursor and repeat AI before unique insertion deduplicates; no distributed lease is
introduced. Finalization failure, name changes and invalid/missing history can reuse/reset
the cursor. A single slow/failing repository still has up to five latest releases to process.
Latest-first release processing and gaps outside five are unchanged. Cooperative cancellation
still cannot guarantee a remote write did not commit after its response was lost.

## Production verification plan — not executed

1. Obtain release authorization and record the reviewed revision. No migrations or new
   environment variables are needed. Keep cron frequency, provider model, AI concurrency
   and duration limits unchanged. Roll out only the scheduling change; no manual cron replay.
2. Observe at least four normal scheduled runs (two days), extending to 15 comparable runs
   for completion-rate evidence. Check run finalization and request logs, not HTTP 200 alone.
3. Compare repository admission order against the previous finished cron's last detail in
   stable name order. In particular, confirm the previously starved six receive attempts
   across the cycle. Track consecutive missed invocations per repository, not just total scanned.
4. Compare AI request occupancy, attempts, retries/cooldowns, RATE_LIMITED failures,
   discovered/processed/deferred/cancelled counts, committed inserts, finalization time and
   `releaseCountersComplete`. Normalize throughput by actual unseen releases and provider
   latency; raw insert counts differ with arrivals. Check provider usage/spend separately
   with approved account access; more useful work can cost more without higher concurrency.
5. Require all work to settle before finalization/delivery, no increase in AI parallelism,
   accurate error reporting, and no new unfinalized runs or dedup regressions. If 429s,
   uncertain writes, cleanup failures or spend materially increase, revert the scheduling
   revision through the normal authorized release procedure. No schema rollback is needed.
6. If fairness improves but budget exhaustion remains high, document a separate decision
   using measured provider latency/capacity and distinct pending-release arrivals. Do not
   automatically raise concurrency, extend maxDuration or add queues/backfill.

Read-only log export (authenticated CLI, explicit production project/scope; adjust the
window after rollout, maximum 50 requests per export):

```bat
vercel logs --scope team_yzTvlVGW2KYvgKGdZOb1VDOo --project prj_eSOmhOMsFDscTZhVmvxfxRkXuISi --environment production --no-branch --since 2026-10-16T00:00:00Z --until 2026-10-23T08:00:00Z --query=requestPath:/api/cron/fetch-releases --limit 50 --json --non-interactive
```

Inspect only the confirmed production branch/database with a read-only SQL transaction:

```sql
BEGIN READ ONLY;
SELECT id, trigger, status, started_at, finished_at, technologies_scanned,
       releases_inserted, errors, details
FROM release_fetch_runs
WHERE trigger = 'cron'
ORDER BY started_at DESC
LIMIT 15;
COMMIT;
```

Expected outcome: each subsequent run advances from the previous admission cursor; a slow
repository no longer prevents free slots discovering later repositories. No particular
insert total or clean completion is guaranteed. No verification step should invoke the cron
endpoint, mutate audit rows, send notifications or use production credentials in local tests.
