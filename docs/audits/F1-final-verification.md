# F1.2 final verification

**Status:** current; read-only verification; READY AFTER BUILD VERIFICATION

**Date:** 2026-10-09 (Asia/Saigon)

**Scope:** the complete current F1/F1.1 working-tree implementation against HEAD
`071747044782885127c063b70d40d572139de88b`, including untracked health-handler/tests files.
This is verification of the candidate source, not a deployed revision.

Read AGENTS.md, CLAUDE.md, the independent review and F1.1 fixes report, the complete
implementation diff, related ingestion/operations docs, tests and callers. Inspected
authentication, transport, ingestion/finalization, schema, status rendering, AI and webhook
boundaries. Applied the Eastbase review and launch-check overlays within the F1 scope.
Prior verdicts were not used as proof that the fixes work.

Only this report was added. Existing application code, tests, configuration and other
working-tree changes were preserved. No production request, credential access, deployment,
database mutation, dependency installation, commit or push was performed. The build used
synthetic configuration with local environment files excluded.

## 1. Findings

**No new P0/P1 defect confirmed.** Both P1 findings from the independent review are closed
for their reproduced control-flow paths. The following conclusions come from source
inspection and freshly executed tests.

### P1-1: GitHub redirect safety — verified

[The request lifecycle](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:75>) checks the
shared authentication state immediately before **every fetch** (line 83), including manual
redirect follows and retries. `redirect: 'manual'` (line 88) prevents native fetch from
silently following a redirect outside that guard. A 401 sets the shared failure before
propagation (line 137). Typed auth/redirect errors bypass the network retry catch.

- Redirect targets must have origin exactly `https://api.github.com`, with no URL username
  or password (line 102). Missing/malformed locations, another origin, another port and
  HTTP downgrades are rejected before another request. The configured Bearer credential
  is therefore not forwarded to another origin by this helper.
- Repository GETs explicitly handle 301/302/303/307/308. Tests exercise a valid absolute
  301 and relative 307, preserving ingestion and the inserted notification ID. The other
  accepted statuses use the same inspected GET follow path.
- At most 20 redirects are followed per attempt; a loop stops on its 21st response without
  another follow or retry. Every request in a chain shares the original 8,000ms abort
  signal. The existing single network/5xx retry gets a fresh signal and rechecks auth.
- Already-dispatched requests settle normally; successful work is retained. Shared auth
  failure blocks further dispatches and subsequent cron chunks, rather than cancelling
  committed writes. [The cron waits for the started chunk](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:115>).
- [The health check](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:161>) uses `/user`
  with retries disabled. A redirect is rejected after the initial response: **at most one
  HTTP request**, or zero when the configured token is missing/blank or caller
  authentication is denied. An invalid configured token is checked with one request.

[Transport tests](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:35>) use
native Node fetch with a network-free dispatcher that counts actual dispatches, not just
stubbed fetch calls. The three overlapping-401 cases (line 685) release the delayed
redirect/5xx/network response only after the actual shared 401 assignment. Assertions show
six initial dispatches, **zero after confirmation**, six deferred repositories, four
retained inserts and a durable failed run with those four inserts. Health redirect denial
(line 665), unsafe targets (767), loops (785), retry signal identity (794) and native abort
(810) have meaningful assertions. The timeout test requests 8,000ms but accelerates abort
to 5ms; it proves abort propagation/retry count, not real elapsed-time accuracy.

### P1-2: durable progress — verified

[Entry validation and filtering](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:93>)
now execute inside the per-release result boundary. A later invalid entry produces a safe,
visible `PROCESSING` failure while earlier counters and IDs are returned. Non-array API
payloads are rejected before processing. Failed inserts contribute no successful count/ID;
only a successful insert returning an ID increments `inserted` (line 164).

[The post-commit regression](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:836>)
executes the actual processor with `[validRelease, null]`. It asserts one persisted mock
record, one inserted/processed release, one failed release, `partial_success`, complete
counters, a durable `completed_with_errors` row and the exact committed notification ID.
The reverse order, all-invalid and all-successful cases are also checked. A subsequent
invocation asserts no additional insertion, AI call or scheduled notification ID and
preserves the first audit row.

[Late insert-failure tests](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:897>)
retain the first committed record while excluding the failed second insert: SQLSTATE
23503 yields partial success; 08006 remains global and yields failed. Both retain matching
response/audit insert counts and the first record's ID. Lookup-before-AI and the unchanged
`(techId, version)` conflict target prevent additional insert/notification duplication in
the covered paths; F1.1 adds no replay or whole-job retry.

Counter interpretation remains consistent: attempted = succeeded + failed repositories;
planned = attempted + deferred. Discovered includes filtered entries; processed includes
eligible successful operations and deduplication/conflict no-ops. Failed releases count
processing failures, not unknown releases behind a failed fetch. Global auth/DB failure
can correctly coexist with nonzero successful counts. Ingestion is finalized before
delivery; ordinary webhook delivery results are reported separately.

## 2. Test results

Fresh F1.2 results, using Node 24.19.0 and the installed dependencies:

| Check                                                                          | Result                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `node --test tests/cron-recovery.test.mjs`                                     | **52/52 passed**, no skipped tests: 34 original tests plus 18 F1.1 regressions.                                                 |
| `node_modules\.bin\tsc.cmd --noEmit --incremental false`                       | Passed; TypeScript 7.                                                                                                           |
| `node_modules\.bin\eslint.cmd .`                                               | Passed for the full repository.                                                                                                 |
| Installed Prettier check of both helpers, both cron handlers and the test file | Passed.                                                                                                                         |
| `git diff --check`                                                             | Passed; only Git's existing LF/CRLF notices.                                                                                    |
| `pnpm --version`                                                               | Blocked: Corepack download of pnpm 11.1.3 failed with `ENOTFOUND registry.npmjs.org`. Installed script equivalents ran instead. |

The suite transpiles and invokes the actual handlers, GitHub helper, authenticator,
processor and finalizer. Crypto comparison is real. Next HTTP/cache integration, Drizzle,
database persistence, AI and webhook delivery are mocked. The strengthened DB fixture
models `running` defaults and checks the finalizer's requested run ID. Passing tests prove
the asserted source boundaries; they do not establish real PostgreSQL/driver behavior,
successful live delivery or deployed Next routing.

## 3. Build verification status

**A successful production build remains unverified.** The installed Next production CLI
was executed, equivalent to `pnpm build`, under isolated synthetic configuration. Local
`.env` files were excluded; DB configuration pointed only at loopback, service credentials
were disabled, and telemetry/Sentry were disabled. No fonts or application configuration
were changed to bypass the restriction.

The actual Next 16.3/Turbopack build exited **1** with these errors:

```text
Failed to fetch Geist from Google Fonts.
Failed to fetch Geist Mono from Google Fonts.
```

Independent DNS lookups returned `ENOTFOUND` for both `fonts.googleapis.com` and
`fonts.gstatic.com`. This is a confirmed environment/network blocker. No application
compile error was confirmed by this attempt. Complete compilation, the build's own
typecheck, prerendering and final output generation remain unverified; the standalone
typecheck does not replace those stages. An initial temporary build guard syntax error
was corrected before this actual CLI attempt; it was not an application error.

### Complete the verification with working network access

Use the complete candidate checkout, including the currently untracked new files, with
Node 20.9+ and the pinned pnpm 11.1.3. Permit DNS/HTTPS to the package registry and Google
Fonts hosts. Provide an isolated development DB with the repo's existing schema and
nonproduction configuration from `.env.example`. Production-mode auth validation requires
`BETTER_AUTH_SECRET`, an app/auth origin, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
([existing auth checks](<C:/Work/Side Projects/stack-pulse/src/lib/auth.ts:13>)). Use development
values; disable ingestion/AI/delivery credentials and avoid a production database.
Do not invoke a cron route or pull production secrets for this build.

Run from the repo root in Command Prompt:

```cmd
pnpm install --frozen-lockfile
pnpm test:cron
pnpm typecheck
pnpm lint
pnpm exec prettier --check src/lib/github.ts src/lib/release-ingestion.ts tests/cron-recovery.test.mjs src/app/api/cron/fetch-releases/route.ts src/app/api/cron/github-health/route.ts
pnpm build
```

Require exit code **0** from the complete build, including compilation, typechecking and
prerendering/output. Record the candidate SHA and build result. Diagnose any later errors
on their evidence; do not treat resolving font DNS as proof that the remaining stages pass.

## 4. Residual risks

### Confirmed deferred limitations

- **P2-R3:** [final audit update failure](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:181>)
  still returns failed with `runFinalized:false`, but an uncommitted update leaves the
  durable row `running` with initial counters. Committed release rows survive. `/status`
  displays DB values and excludes running rows from finished metrics; its five-minute
  cache also delays visibility. Accept this explicitly and reconcile stale runs after DB
  recovery; do not rerun ingestion solely to repair an audit row.
- **P2-R4:** [safe release errors](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:175>)
  still omit the affected version/release ID. This limits diagnosis, without undoing the
  P1 progress fix.
- **F2/F3/F4 remain deferred:** AI pacing/backoff, complete outage discovery/backfill,
  overlap/deadline/resumption and notification replay. Discovery still fetches the latest
  five releases; restoring authentication does not guarantee recovery of every missed
  release beyond that window.

### Hypothetical risks and verification limits

No new production occurrence was established. DB acknowledgement loss can make an insert
or audit update's commit outcome unknown. A catastrophic rejection outside the processor's
result boundary still takes the route's `releaseCountersComplete:false` fallback; the
durable schema stores no completeness flag. The reproduced malformed-entry path is fixed,
but arbitrary failures/overlapping invocations are not certified as exactly-once delivery.
The VM/native-transport tests also leave deployed Next fetch/cache behavior and real DB
constraints to framework/integration verification. These are limitations, not newly
demonstrated F1.1 defects.

## 5. Required production environment checks

**Operator-only; not performed in this run.** Do not record secret values in the checklist.

- Confirm a valid, unexpired/unrevoked PAT is configured as **`GITHUB_TOKEN`** for the
  Production environment, with access to intended repositories and any required approval.
  This is separate from GitHub OAuth client credentials. Source uses this exact variable
  in the Bearer header; there is no anonymous cron fallback.
- Confirm `CRON_SECRET` remains configured for the production scheduler and protected
  health check. [The unchanged authenticator](<C:/Work/Side Projects/stack-pulse/src/lib/cron-auth.ts:12>)
  rejects missing/wrong caller credentials before work, checks lengths before
  `timingSafeEqual`, and fails closed when server configuration is missing.
- Apply restored environment values to a **new deployment**. Changing Vercel environment
  settings does not change existing deployments. [Vercel environment variables](https://vercel.com/docs/environment-variables).
- Confirm existing DB/auth/OAuth/AI configuration is available without unrelated changes;
  check external monitors against F1's structured cron response rather than the former
  top-level numeric fields. No in-repo consumer requiring those old fields was found.
- After separately approved deployment, make the protected **`GET /api/cron/github-health`**
  using a secure operator client without printing credentials. Expect authenticated
  success and `Cache-Control: no-store`. The handler has no DB/AI/delivery imports and
  returns no token/profile/upstream body. Wrong caller secrets, missing/blank tokens and
  invalid token responses are covered by tests.
- A successful `/user` check validates credential authentication, not access to every
  private repository. GitHub requires no additional fine-grained PAT permissions for
  that endpoint. Verify repository access through the scheduled ingestion results.
  [GitHub authenticated-user endpoint](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).
- Observe the next scheduled run and inspect its safe run-ID log, finalization flag,
  counters and durable audit/release rows. Confirm retained inserts match actual records;
  use DB evidence alongside `/status`. Do not manually trigger ingestion during this
  verification. Provider failures and missing older releases remain F2/F3 follow-ups.

## 6. Deployment and rollback checklist

### Static prerequisites verified

| Item                         | Assessment                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema migration             | **None required.** Schema/migrations are unchanged; run status is text and accepts `failed`. The existing release uniqueness constraint remains.                                          |
| Dependencies/configuration   | No dependency or lockfile change; package change adds only `test:cron`. Next configuration and `vercel.json` are unchanged. No new environment variable name is required.                 |
| Cron authentication/schedule | Existing `CRON_SECRET` authentication remains. Release cron is still `0 0,12 * * *` (00:00/12:00 UTC; 07:00/19:00 Asia/Saigon), with `maxDuration=300`. Health is manual and unscheduled. |
| Health security              | Auth before work; authenticated `GET /user`; at most one HTTP dispatch; fixed safe errors; no credential/profile response or DB/AI writes. Deployed integration remains unverified.       |
| Scope                        | F1 recovery/reporting and its two P1 corrections only; F2/F3/F4 deferred.                                                                                                                 |
| Source rollback              | Code-only rollback is schema-compatible and requires no reverse migration or release-row deletion. A live eligible deployment ID was not inspected.                                       |

Before rollout:

- [ ] Package/version the complete reviewed candidate; include the new health handler and
      tests, preserve unrelated work, and record its SHA.
- [ ] Complete the network-enabled build above and retain its successful output.
- [ ] Complete production environment/consumer checks and accept the deferred P2 risks.
- [ ] Record the last approved deployment ID/source SHA and verify operator rollback access.
- [ ] Obtain separate deployment approval; use the protected health check and next scheduled
      run for post-deployment evidence.

Rollback procedure, if subsequently authorized:

- Select the recorded approved deployment only after checking its environment and cron
  configuration. **Instant Rollback restores the old build/environment; it does not pick
  up newly edited secrets**, and restores that deployment's cron configuration.
  [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback).
- If that artifact contains the expired PAT, rebuild/redeploy the previous approved source
  with the current valid production environment instead. Verify that rollback build first.
  Do not assume rolling back code also repairs authentication.
- Preserve committed release rows and audit history; no schema reversal or data rollback
  is needed. Older code may restore less accurate reporting and lack the new health route.
- Confirm the selected schedule/environment and observe the next run. Live artifact
  eligibility and successful rollback remain operator checks, not claims from this run.

## 7. Final verdict

**READY AFTER BUILD VERIFICATION.** No additional code fix is required by the confirmed
F1.2 evidence. P1-1/P1-2 are verified and all 52 tests, standalone typecheck and lint pass.
A complete successful production build is still required; production environment checks,
explicit acceptance of deferred risks and separate deployment approval also remain.
This verdict covers F1/F1.1, not full-product launch readiness or confirmed outage recovery.
Stop after verification; no further implementation or deployment is authorized here.
