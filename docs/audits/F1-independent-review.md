# F1 independent implementation review

**Status:** current read-only review; changes required before deployment

**Reviewed:** 2026-10-09 (Asia/Saigon)

**Baseline:** `071747044782885127c063b70d40d572139de88b`; uncommitted F1 working-tree changes.

Reviewed AGENTS.md, CLAUDE.md, both prior audit reports, the complete tracked diff and
three new F1 files, all 34 tests, custom-repo callers, database schema, AI, webhook delivery,
status rendering, cron config and installed Next.js route-handler guidance. Applied the
Eastbase review overlay. The previous implementation verdict was not treated as evidence.
Only this report was added. Application code, tests, credentials and deployment were not changed.

The implemented diagnostic is **`/api/cron/github-health`**, not `/api/github-health`.
The latter has no route in this checkout.

## Findings by severity

### P0 — must fix before deployment

**None confirmed.** No caller-authentication bypass, configured credential disclosure,
rollback of successful inserts or misclassification of ordinary ingestion connection
errors was found. This does not establish live production recovery.

### P1-R1 — implicit redirects bypass the HTTP request limits

**References:** [GitHub fetch options](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:80>),
[per-attempt guard](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:77>),
[401 state assignment](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:115>),
[credential check](<C:/Work/Side Projects/stack-pulse/src/lib/github.ts:137>),
[existing fail-fast tests](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:308>).

- **Scenario:** an already-running repository fetch receives a redirect after a peer
  confirms 401. Fetch follows it internally, issuing another HTTP request without passing
  through the context guard. Separately, a redirect from `/user` makes the diagnostic issue
  more than its promised one request.
- **Evidence:** fetch options omit `redirect`, so native fetch follows redirects. The
  guard runs once before each application fetch attempt; the context is not an abort signal
  and does not control internal redirect dispatch. A native Node fetch probe using the
  installed Undici MockAgent, with real networking disabled, produced **six application
  fetch calls, seven HTTP dispatches, including one after confirmed 401**. Its health-check
  probe produced **one fetch call, two HTTP dispatches, HTTP 200**. Actual source modules
  were executed; only transport responses and external dependencies were mocked.
- **Production impact:** the application-level fail-fast works, but the stricter promise
  of no new GitHub HTTP requests after confirmation is not enforced. The diagnostic's
  one-request bound is also unenforced. Repository redirects are relevant to moved/renamed
  repositories; this exact timing and a `/user` redirect were **not observed in production**.
  No credential leak or data loss was demonstrated.
- **Minimal fix:** explicitly reject redirects for the credential-only check. For cron,
  stop still-fetching transports when the shared 401 state is set, using a per-run abort
  signal alongside the existing timeout; alternatively, handle bounded redirects manually
  with the context guard before each follow. Preserve legitimate repository redirect
  behavior during healthy runs and already-committed writes. Add tests that count transport
  dispatches, rather than only calls to a mocked fetch function.

**Classification:** confirmed control-flow gap under controlled responses; production
occurrence unverified. Should be fixed before deployment because it violates F1's explicit bounds.

### P1-R2 — rejected processors discard already-committed progress from the durable run

**References:** [publishability check outside the release catch](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:93>),
[successful insert accounting](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:153>),
[rejection handling](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:130>),
[durable aggregation](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:228>),
[status totals](<C:/Work/Side Projects/stack-pulse/src/app/status/page.tsx:47>),
[rejection test](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:489>).

- **Scenario:** a processor inserts a release, then encounters an unexpected error outside
  the per-release try/catch. Its promise rejects before returning accumulated counters/IDs.
- **Evidence:** an in-memory probe supplied `[validRelease, null]` through the real GitHub
  fetcher. The first release was summarized and inserted. `isPublishable(null)` then threw.
  The real route reported HTTP 500/`failed`, zero inserts, and `releaseCountersComplete:false`.
  It finalized the run with **zero stored inserts**, no stored completeness indicator, and
  passed **zero IDs** to webhook dispatch. A successful peer changed the outcome to partial
  but still left the durable insert total at zero. The current rejection test substitutes
  the entire processor with an immediate throw, so it cannot detect loss of accumulated work.
- **Production impact:** the committed row survives, but the audit and `/status` show an
  apparently exact lower count. Logs/response acknowledge incomplete counters; the durable
  record does not. Successful notification IDs are also lost. With no successful peer, the
  run reports total failure despite a completed release operation. The malformed upstream
  payload is a **synthetic trigger**, not a production incident established by this review.
- **Minimal fix:** keep unexpected processing/validation errors inside the processor's
  result boundary and return accumulated counters and inserted IDs with a safe `PROCESSING`
  failure. Validate the response's basic array/entry shape before processing, preserving
  existing draft/date/tag filters. If some counts truly remain unknown, persist that
  uncertainty rather than recording an unqualified zero. No additional API call or broad
  pipeline refactor is needed for the reproduced case.

**Classification:** confirmed conditional accounting defect. Should be fixed before
deployment because durable counters and retained successful work are central F1 requirements.

### P2-R3 — finalization failure can leave a failed invocation recorded as running

**References:** [run defaults](<C:/Work/Side Projects/stack-pulse/src/db/schema.ts:100>),
[finalization catch](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/fetch-releases/route.ts:181>),
[status-page run classification](<C:/Work/Side Projects/stack-pulse/src/app/status/page.tsx:45>),
[finalization test](<C:/Work/Side Projects/stack-pulse/tests/cron-recovery.test.mjs:477>).

- **Scenario/evidence:** after an insert succeeds, the final audit update fails. The route
  correctly returns 500/`failed`, preserves the confirmed insert count and sets
  `runFinalized:false`. The schema's original row remains `running`, with initial counters
  and no finish time, if the write never reached the DB. The controlled probe confirmed a
  retained insert and no completed audit update. An acknowledgement failure may instead
  mean the update committed; the response cannot determine that.
- **Production impact:** `/status` cannot infer the failed invocation from an unfinished row
  and excludes it from finished-run metrics. This is a **documented, pre-existing limitation**,
  not a new rollback or incorrect repository classification.
- **Minimal follow-up:** retain the current failed response and safe run-ID log; add stale
  run detection/manual reconciliation when the database is available in F4. Do not retry
  the entire ingestion job to repair an audit row. Strengthen the mock's initial run defaults
  and assert the durable state when finalization fails.

**Classification:** confirmed limitation; can be deferred with explicit operational acceptance.

### P2-R4 — release errors no longer identify the failing version

**Reference:** [per-release failure fields](<C:/Work/Side Projects/stack-pulse/src/lib/release-ingestion.ts:164>).

- **Scenario/evidence:** two of a repository's five releases fail AI generation. Both error
  entries contain the same repository/category/message/status, with no release ID or tag.
  Before F1, the ingestion catch logged the repository and tag. F1 removes that identity
  along with the unsafe raw exception.
- **Production impact:** an operator can distinguish AI 429 from GitHub failures, but cannot
  identify which versions failed from the new safe errors alone. This weakens diagnosis and
  later recovery inventory without helping secrecy of the configured credentials.
- **Minimal fix:** include a bounded version/tag or numeric release ID in release-scoped
  errors. Keep upstream bodies, headers and raw exception objects excluded. Add an assertion
  that a mixed successful/failed release result identifies the failed release.

**Classification:** confirmed observability regression; can be deferred. Provider routing,
retry/backoff and full recovery inventory remain F2/F3 work.

## Controls verified and counter interpretation

| Area | Assessment from actual control flow |
|------|-------------------------------------|
| 401 at application attempt boundaries | `GithubApiError` sets shared auth state before throwing. Guard precedes every fetch/retry. Fulfilled global auth errors set `fatal`; subsequent chunks stop. No anonymous fallback. Redirect exception: R1. |
| In-flight work | `Promise.allSettled` waits for the current chunk. Normal successful results contribute committed IDs/counters even when a peer fails. No rollback or transaction over the batch. Unexpected rejection exception: R2. |
| Database errors | Setup/finalization catches are global. Ingestion connection/unknown DB errors are global; SQLSTATE 22/23 data/constraint errors are release-specific. A probe with SQLSTATE 08006 after a successful insert returned 500/failed and retained one inserted count in both response and audit. |
| Repository counts | For settled ordinary results, attempted = succeeded + failed; planned = attempted + deferred. Attempted counts repository processors, not HTTP requests/retries. Auth/budget stops report later repositories as deferred. |
| Release counts | Discovered includes all fetched entries. Processed includes eligible successful operations, duplicates and conflict no-ops. Inserted counts confirmed returned insert IDs. Failed counts failed release operations, not unknown releases behind a fetch failure. Filters explain why discovered need not equal inserted + failed. R2 affects rejected processors. |
| Empty/partial/failed outcomes | Empty results, all filtered releases and duplicates succeed. A successful repository/release operation plus nonfatal errors yields partial. Global auth/DB failure overrides successful work and yields failed; that is consistent with nonzero success counters. All operational failures without success yield failed. |
| Finalization and delivery | Audit is finalized before delivery, as before. Delivery error counts are explicitly separate from ingestion status. The synthetic dispatcher-throw test intentionally yields partial response after a completed audit row; the actual dispatcher catches its ordinary errors internally. This distinction should remain explicit. |
| Status page | New failed badge matches the text status stored by cron; no migration is required. Its five-minute cache is expected. It displays DB values rather than reconstructing completeness or delivery state; R2/R3 limit accuracy. The footer also omits DB/setup/budget error categories, a minor copy limitation. |

## Health endpoint security and compatibility

[The health handler](<C:/Work/Side Projects/stack-pulse/src/app/api/cron/github-health/route.ts:9>)
calls the unchanged [cron authenticator](<C:/Work/Side Projects/stack-pulse/src/lib/cron-auth.ts:12>)
before doing work. Wrong/missing caller credentials cannot reach GitHub; missing server
`CRON_SECRET` returns 500. Buffer comparison handles length first and uses real
`timingSafeEqual` for equal lengths. Request-header access keeps the authenticated route
dynamic under the installed Next.js Cache Components behavior; no cached success bypass was found.

The handler imports no DB, AI or dispatcher module. It requires nonblank `GITHUB_TOKEN`,
uses the common Bearer-header code, requests authenticated `GET /user`, discards the body
and returns no profile/token. Invalid token produces 502 with a fixed safe auth message;
missing/blank token makes zero GitHub requests. Network/rate/permission failures remain
distinct. Successful responses and fetches are uncached. R1 prevents accepting the literal
one-HTTP-request claim as currently implemented.

GitHub confirms `/user` authenticates the token owner and fine-grained PATs need no additional
permissions for this endpoint. It therefore validates the configured PAT's authentication,
not access to every private repository. [GitHub authenticated-user documentation](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).

Normal discovery remains `per_page=5`; draft/date/tag filters, prereleases, AI inputs/model,
stored release fields, lookup-before-AI and the `(techId, version)` conflict target are
unchanged. No added normal ingestion GitHub/AI call was found. Cron schedule and caller
authentication are unchanged. Custom-repo ingestion still calls the helper without a cron
context and uses the optional finalizer arguments' legacy defaults; a mocked direct caller
probe confirmed successful unauthenticated public fetching and insertion.

The HTTP response schema intentionally changes: old top-level numeric `errors` and
`releasesInserted` are replaced by structured errors/summary. No in-repository consumer of
those cron response fields was found. External monitors are unknown and must be checked
before rollout; compatibility with them is not proven.

F1's error construction emits allowlisted fields and fixed messages, not credential/header/
body/stack objects. Synthetic credential leak assertions pass. Existing webhook and
custom-action raw-exception logging is unchanged and outside those tests, so this review
does not certify every application log path as redacted. No live secret was read or printed.

## Complexity and size

Measured against HEAD, including the new F1 files and excluding the older diagnostic,
portfolio docs and this review:

| Category | Files | Added lines | Deleted lines |
|----------|------:|------------:|--------------:|
| Application code | 5 | 431 | 73 |
| Tests and package test script | 2 | 604 | 0 |
| Documentation and environment template | 9 | 225 | 15 |
| Total | 16 | 1,260 | 88 |

**829 added lines (65.8%) are tests/setup/documentation.** The test file itself is 603 lines.
The shared auth context and typed errors are needed for consistent per-run behavior. The
extra processor fields expose formerly swallowed outcomes. `fatal`, `internalFailure`,
error totals and audit-only additional errors represent different decisions; no unused
state or infrastructure abstraction was found. Report-shape duplication in the two callers
is small and does not justify a new generic framework. A smaller diff obtained by removing
tests/docs would reduce assurance. Fix R1/R2 surgically; no broad refactor is recommended.

## Validation and missing coverage

- Re-ran **all 34 tests: pass**. They transpile and invoke the actual cron/health handlers,
  fetcher, authenticator and ingestion/finalization source. Real crypto comparison is used.
  Next request/response behavior, schema, Drizzle operations, AI and delivery are mocked.
  Assertions meaningfully cover ordinary propagation, scopes, retained inserts, persisted
  statuses, no-ops, auth denial, bounded error lists and no synthetic credential disclosure.
- Additional read-only, in-memory probes confirmed R1/R2, controlled late-5xx suppression
  after 401, DB failure after a successful insert, finalization failure, blank-token denial
  and direct custom-caller compatibility. Redirect probes used native Node fetch and the
  installed Undici 7.29.0 MockAgent with `disableNetConnect`; no API traffic occurred.
- TypeScript 7 check passed: `node_modules\.bin\tsc.cmd --noEmit --incremental false`.
  Full installed ESLint passed: `node_modules\.bin\eslint.cmd .`.
  `git diff --check` passed.
- Attempted the full production build via installed Next CLI, with synthetic configuration,
  loopback-only DB configuration, service keys disabled and telemetry/Sentry disabled.
  **Build failed:** Turbopack could not fetch **Geist** and **Geist Mono** from Google Fonts.
  This is an environment/network failure, not proof of an F1 compile defect. Full build,
  subsequent prerendering and deployed route behavior remain unverified. An initial
  loopback transport probe was also blocked by `EACCES`; the network-free MockAgent probes
  supplied the redirect evidence instead. No production endpoint was invoked.

Missing permanent test coverage:

1. Redirect follow after shared 401 and diagnostic redirect rejection (R1). Current tests
   count calls to stubbed fetch, which cannot see native redirect dispatches.
2. Real processor rejection **after** a successful insert, preserving counters/IDs and
   durable completeness (R2); malformed/non-array payloads. Existing rejection test replaces
   the processor and throws before work.
3. SQL connection/unknown errors at lookup and after an earlier successful insert, plus
   later-chunk suppression. The existing DB scope test always fails insertion and has only
   two repositories. The unused lookup-failure fixture does not establish coverage.
4. DB-like run defaults and row-ID selection in the mock. Creation does not model
   `running`/zero counters; update mutates the latest mock row without checking its WHERE ID.
   Finalization-failure tests do not assert the retained durable defaults.
5. Equal-length incorrect Bearer secrets, empty headers/tokens, health request Authorization
   and method assertions, and mixed-result counter invariants. Wrong-secret tests currently
   take the length-mismatch branch. Blank-token behavior was checked in the review probe.
6. Actual custom server-action integration, real ORM/constraint behavior and Next HTTP
   routing/cache behavior. Static caller inspection and VM tests establish compatibility
   only at the covered source boundaries; build failure leaves framework integration open.

## Final assessment

1. **Overall assessment:** F1 substantially improves auth handling and ordinary ingestion
   reporting. Its main context, classification, safe errors and no-op handling are sound.
2. **Confirmed findings:** no P0 issue; **two P1 defects** under controlled triggers (implicit
   redirect dispatch and loss of post-insert progress), plus two P2 limitations/regressions.
   Neither P1 trigger was established as a production incident by this read-only review.
3. **Missing test coverage:** add transport-level redirect and post-insert rejection cases
   first; strengthen durable state and auth assertions. Passing 34 tests does not cover
   these gaps.
4. **Production deployment readiness:** **not ready for approval yet**. Fix R1/R2 and verify
   their regressions locally; obtain a successful production build in a suitable environment.
   Then use the documented protected check and next scheduled-run/read-only persistence
   verification. Current token/recovery health remains unverified. F2/F3/F4 work remains
   deferred and should not be folded into a broad F1 rewrite.
5. **Verdict: Changes required.** No fixes or deployment were performed. Await approval for
   the two focused corrections and subsequent verification.
