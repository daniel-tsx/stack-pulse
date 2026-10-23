# Cron scheduler P1 final focused verification

**Status:** current  
**Date:** October 23, 2026 (Asia/Saigon)  
**Verdict: READY AFTER BUILD VERIFICATION**

## Findings and scope

What this change does: a processor immediately publishes a classified global database
failure to its cron invocation. Cron stops admitting repositories while already-started
processors settle; their returned results still own counts and acknowledged insert IDs.

**No remaining P0/P1 issue was confirmed in the targeted fix.** The original P1 is closed
for the inspected control flow and reproduced interleavings. The benchmark reporting
follow-up also exposes cancellation and deferral without changing scheduling policy.
Complete production-build verification remains outstanding, for the database prerequisite
described below. This is not deployment authorization or a full-product readiness review.

Read AGENTS.md, CLAUDE.md, repository entry and verification guidance, the complete
[original focused review](cron-scheduler-focused-review.md), the
[implementation report](cron-scheduler-P1-fix.md), F1/F2 verification records, current diff,
tests and connected auth, GitHub, AI, execution-budget, persistence, custom-ingestion and
webhook code. Applied repository-local Ponytail Review and the Eastbase review overlay.
Earlier author-reported test counts and conclusions were not accepted as passing evidence.

**Independence limit:** this is a separate read-only verification turn in the same
conversation and agent identity as implementation. It does not claim a separate non-author
reviewer. Fresh source inspection, full regressions and an in-memory removal of the fix
provide the evidence below.

Baseline HEAD remains `fe9b7a71061d212f4bfb03a0eb2b5f9e2bda2897`. The candidate is
uncommitted. SHA-256, concatenating each path, NUL, exact bytes and NUL in this order:

```text
8849013498b30294797ebe42357db06f30833e12e991a82e81eb9f3dc13bcbe8

package.json
src/app/api/cron/fetch-releases/route.ts
src/lib/release-ingestion.ts
tests/cron-recovery.test.mjs
tests/cron-scheduling-db.test.mjs
docs/features/release-ingestion.md
docs/operations/verification.md
docs/audits/cron-throughput-2026-10-23.md
```

The original review fingerprint predates this fix and is not the current candidate hash.
Compared with the retained pre-P1 source snapshot, reversing only the optional fifth
argument, synchronous notification and cron callback exactly recovers both application
files. Earlier scheduler/rotation changes, tests/package script and unrelated untracked
`docs/architecture/portfolio/` work were preserved. No unrelated application change was
introduced by the targeted correction or this verification.

## Confirmed behavior

| Requirement                                                | Evidence and result                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synchronous global failure publication                     | **PASS.** Processor `recordFailure` pushes the classified failure, then immediately calls the optional callback only for `DATABASE/global`. There is no await before notification.                                                                                   |
| Concurrent completion cannot bypass admission shutdown     | **PASS.** The cron callback synchronously assigns its invocation-local `fatal` flag. Each worker checks `!fatal` before claiming `nextIndex++`; no await separates that guard from the claim. Ready promise continuations run after the current synchronous segment. |
| Release-specific SQL failures continue peers               | **PASS.** The existing SQLSTATE 22/23 classifier is unchanged. Both `23503` controls admit all 12 repositories and finish partial success.                                                                                                                           |
| Failure counted once                                       | **PASS.** The callback changes only admission state. Route aggregation later counts the returned failure once; durable finalization sums detail errors once. Both global timing cases require one response error and one durable error.                              |
| Accurate committed progress and notification IDs           | **PASS.** Repo 01 commits before the fault; Repo 00's held second insert later succeeds. Both acknowledged inserts survive, with exactly their IDs passed to notification dispatch. Failed/unacknowledged inserts receive no invented IDs.                           |
| Started processors settle safely                           | **PASS.** Cron awaits all workers. While the second insert is held, the tests require an unfinished run, no notification dispatch and one active DB operation. After release, active processors/DB operations are zero before delivery.                              |
| No admission or AI from new repositories after publication | **PASS.** Both global cases attempt six of 12 repositories and defer six. No started repository is marked after failure publication. Three mocked SDK requests belong to the already-started repositories; there are no later-repository requests.                   |
| F1/F2 and custom callers remain compatible                 | **PASS within tested boundaries.** GitHub 401 dispatch guards, redirects, retry/deadline races, AI retries/cooldown, scoped cancellation, finalization/delivery reserves and the optional custom-ingestion call all pass unchanged assertions.                       |
| New regressions detect the original defect                 | **PASS.** Disabling only the immediate callback in memory makes both global cases fail with 12 admissions instead of six, while both constraint controls pass. The unchanged candidate passes all four.                                                              |
| Scope and security                                         | **PASS within focused review.** No new endpoint, input, secret, module-global state, infrastructure, migration or dependency is added. Cron authentication remains before work; safe error reporting and the existing unique insert/conflict behavior remain intact. |

Key source boundaries:
[classifier and publication](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:56>),
[worker admission and callback](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:152>),
[single aggregation path](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:192>),
[worker settlement](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:210>),
[acknowledged insert IDs](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:234>),
[custom caller](<C:/Work/Side Projects/stack-pulse/src/lib/actions.ts:387>).

The application still has six repository slots and one default AI lane. F2 retains at
most three application attempts, zero SDK retries for summary attempts, 25 s request caps,
shared cooldown and the 270/285/295 s phase deadlines under `maxDuration=300`. The callback
does not abort these budgets or change processing of already-admitted releases. It does
not replace a real database fault with a cancellation error.

## Regression evidence

The four permanent cases at
[the P1 fixture](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:677>)
combine global `08006` / release-specific `23503` with peer completion after the held
insert starts / synchronously at classification logging. Six initial processors are
active among 12 repositories. Five peer results are released together while the failed
processor remains pending. This keeps the original defect's required interleaving open.
The publication-log hook follows the synchronous callback; it does not set cron's flag.

The fixture runs actual route/ingestion/F2/OpenAI SDK/Zod modules with synthetic transport
and persistence boundaries. Its wrapper forwards all processor arguments, including the
new callback. Later repositories each have unseen releases, so mistaken admission produces
observable AI requests rather than an empty-work false pass. Bounded event-loop draining
allows those mocked responses to settle. Gates are released and the invocation awaited
in `finally`, including on assertion failure.

For the independent negative control, a process-only Node preload intercepted source reads
for `src/lib/release-ingestion.ts` and replaced exactly:

```ts
if (failure.category === 'DATABASE' && failure.scope === 'global') onGlobalDatabaseFailure?.()
```

with `void onGlobalDatabaseFailure` in memory. No disk source/test file changed. The four
checked-in P1 tests then produced two expected failures (`12 !== 6` at test line 762) and
two passing SQL-scope controls. A subsequent normal focused run passed four of four.
This tests the necessity of early publication against the refilled scheduler, without
substituting the old batch scheduler or trusting the author's historical reproduction.

| Final assertion                                    | Global `08006`, both timings | Constraint `23503`, both timings |
| -------------------------------------------------- | ---------------------------: | -------------------------------: |
| Attempted / deferred repositories                  |                        6 / 6 |                           12 / 0 |
| Successful / failed repositories                   |                        5 / 1 |                           11 / 1 |
| Discovered releases                                |                            3 |                                9 |
| Processed / failed releases                        |                        2 / 1 |                            8 / 1 |
| Confirmed inserts / matching notification ID count |                        2 / 2 |                            8 / 8 |
| SDK attempts / retries / cooldowns                 |                    3 / 0 / 0 |                        9 / 0 / 0 |
| Response errors / durable errors                   |                        1 / 1 |                            1 / 1 |
| Final HTTP / durable status                        |                 500 / failed |      200 / completed_with_errors |
| Finalized / counters complete                      |                 true / false |                      true / true |
| Deferred / skipped / cancelled releases            |                    0 / 0 / 0 |                        0 / 0 / 0 |
| Peak processors / final active processors          |                        6 / 0 |                            6 / 0 |

The global case's incomplete-counter flag correctly preserves the existing unknown-commit
contract for connection failure during an insert. It does not negate the two acknowledged
inserts or imply that a remote unacknowledged insert was rolled back.

Fresh benchmark diagnostics retain the same workload/concurrency/deadline in both arms:
42/48 versus 67/23 attempted/deferred repositories; 200/1/9 versus 307/6/22
processed/failed/deferred releases; one versus six cancelled operations; 30 versus 32
confirmed inserts; 270.300 s including finalization in both. Partition and mock-row
reconciliation assertions pass. Increased admission still does not establish clean
production completion, provider headroom or dollar savings.

## Fresh validation and cleanup

Runtime: Node **24.22.1**, pinned pnpm **11.1.3**, installed dependencies; no application
dependency or configuration changes. Commands ran in Command Prompt from the repository.

| Exact command/check                                                                                                                                                                                                                                                                              | Result                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `node --test tests/cron-recovery.test.mjs`                                                                                                                                                                                                                                                       | **PASS: 128**, zero failed/cancelled/skipped; includes all F1/F2/scheduler cases and the four new regressions |
| `node --test --test-name-pattern=P1 tests/cron-recovery.test.mjs`                                                                                                                                                                                                                                | **PASS: 4**, zero failed/cancelled/skipped; a repeat of included cases, not four extra distinct tests         |
| Same P1 filter with in-memory callback removal                                                                                                                                                                                                                                                   | **Expected negative control:** two global failures, two constraint passes; exit 1                             |
| `node --test tests/cron-scheduling-db.test.mjs` with explicit owned settings below                                                                                                                                                                                                               | **PASS: 5** Node results, parent plus four SQL subtests; zero failed/cancelled/skipped                        |
| Full offline plus SQL suite totals                                                                                                                                                                                                                                                               | **133 passed** across two commands; focused rerun and mutation results excluded                               |
| `pnpm typecheck`                                                                                                                                                                                                                                                                                 | **PASS**, exit 0                                                                                              |
| `pnpm lint`                                                                                                                                                                                                                                                                                      | **PASS**, exit 0                                                                                              |
| `pnpm exec prettier --check src/lib/release-ingestion.ts src/app/api/cron/fetch-releases/route.ts tests/cron-recovery.test.mjs tests/cron-scheduling-db.test.mjs package.json docs/features/release-ingestion.md docs/audits/cron-throughput-2026-10-23.md docs/audits/cron-scheduler-P1-fix.md` | **PASS**                                                                                                      |
| Formatting of this report; `git diff --check`; document links                                                                                                                                                                                                                                    | **PASS**; ordinary LF/CRLF notices only                                                                       |
| Complete default production build                                                                                                                                                                                                                                                                | **FAIL — isolated database prerequisite**, detailed below                                                     |
| Hosted Neon faults, live providers/notifications, production cron/runtime                                                                                                                                                                                                                        | **NOT RUN**, outside authorization                                                                            |

SQL process-local settings:

```bat
set SKILL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test
set SKILL_TEST_TARGET_FILE=.env.skill-test-target.json
node --test tests/cron-scheduling-db.test.mjs
```

Before starting the initially stopped cluster, checked the workspace-owned data directory
and `pg_controldata` system identifier **7698908168512842628** against its recorded proof.
The helper rechecked live database, user, directory, PID/port and system identifier before
DDL. Only its random schema was created, populated and dropped, with removal verified.
Actual Drizzle neon-http generated SQL ran over the existing explicit local TCP transport.
The test verifies persisted rotation/history selection; it does not certify hosted Neon
HTTP or actual remote commit-loss behavior. The cluster was stopped again with
`pg_ctl -D node_modules\.cache\skill-test-pg-isolated -m fast -w stop`.
No `.env` or application DATABASE_URL fallback was used for SQL tests.

Candidate/source fingerprints and preserved audit documents were checked unchanged after
verification. Only this report was added. Ignored compiler artifacts may be refreshed by
normal checks. The isolated build directory was removed after a resolved-path ownership
check; existing development/build outputs and unrelated work were retained.

## Production build status

**A complete successful production build is not verified.** The latest attempt improves
on the historical Google Fonts blocker but does not waive the remaining build stages.

Default installed Next **16.3.0 / Turbopack** command, in a temporary source copy:

```text
node C:/Work/Side Projects/stack-pulse/node_modules/next/dist/bin/next build C:/Work/Side Projects/stack-pulse/build/cron-scheduler-P1-final-build-Wi5y9U
```

The copy contained unchanged source/public files, package/TypeScript/Next/PostCSS settings
and both Sentry root configuration files. No `.env` files were copied. The child received
only allowlisted system environment variables plus synthetic nonproduction auth/origin,
an inert loopback database target and disabled inference, delivery, Sentry and telemetry
credentials. No production credentials were accessed or supplied.

Observed outcomes:

- **PASS:** DNS lookups for both Google Fonts hosts; font retrieval no longer blocked
  compilation. No font, source or application configuration workaround was applied.
- **PASS:** optimized compilation, reported 33.0 s.
- **PASS:** build-integrated TypeScript, reported 13.4 s.
- **FAIL:** collecting page data for `/stacks/[slug]`. `getPublicStackSlugs()` issued
  `select "slug", "name" from "technologies" order by "technologies"."slug"` through
  production Neon HTTP. The deliberately inert local PostgreSQL URL cannot serve that
  transport; the driver rejected its derived HTTP endpoint. Build exited 1.
- **NOT VERIFIED:** completion of page-data collection, prerendering and final build output.

This failure establishes a missing isolated build database prerequisite, not a scheduler
compile defect or evidence about production connectivity. A loopback TCP cluster cannot
be substituted for the production Neon HTTP driver. The existing local HTTP bridge is
scoped to VM-based skill tests, not a build-ready application database fixture. No new
bridge, transport override, hosted resource or application change was introduced to obtain
a green build. The temporary copy was removed successfully.

## Remaining limitations and deployment verdict

**READY AFTER BUILD VERIFICATION.** No further application change is requested by this
focused review. The original P1's delayed publication is corrected, scoped SQL failures
continue correctly, and fresh regression/SQL/static checks pass.

Before deployment, complete the unchanged default build with a separately approved,
isolated **Neon-compatible HTTP database** containing the existing schema and synthetic
build data. Keep production `.env` files and paid/delivery credentials excluded. Require
exit 0 through prerendering/final output, and record the complete candidate fingerprint or
subsequent commit plus built revision. No migration, concurrency increase, model change,
duration increase, queue or backfill is required by this fix. Provisioning cloud resources,
using hosted credentials and deployment each require appropriate separate authorization.

Residual limits are unchanged: active processors may continue release/AI/DB work after
publication; cancellation and remote acknowledgement loss do not prove rollback; no
cross-invocation lease prevents duplicate AI; rotation depends on finalized history and
retained cursor names; latest-five discovery leaves older gaps; event-loop stalls or hard
termination can defeat cleanup reserves. Full rotation coverage, actual provider spending,
hosted fault behavior and production runtime headroom remain unverified.

After a separately authorized rollout, observe naturally scheduled runs over a full
rotation cycle and retain a known eligible rollback deployment. Do not treat higher scan
counts, HTTP 200 or this source review as proof of clean production completion.

Verification stops here. No application/test code edit, production access/write, live cron,
paid AI, real notification, deployment, commit or push was performed.
