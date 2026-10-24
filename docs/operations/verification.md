# Verification

**Status:** current

## Risk-based verification

Select checks for the actual changed boundary. [AGENTS.md](../../AGENTS.md) owns routing and completion rules; [AI workflow](ai-workflow.md) owns skill integrity/discovery and read-only pilot prompts.

| Change                                                                               | Required evidence                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Documentation or trivial styling                                                     | Edited links/statuses, whitespace and relevant static/visual checks; no Docker requirement.                                                                                                                                                            |
| Agent workflow tooling                                                               | `node scripts/sync-agent-skills.mjs --check`, `node scripts/check-engineering-workflow.mjs`, `pnpm test:agent-workflow`, YAML/frontmatter checks after skill edits, and applicable lint/type checks. Discovery and behavioral activation are separate. |
| Pure application logic                                                               | Focused unit tests plus applicable typecheck/lint/build checks; containers only when a real affected boundary needs them.                                                                                                                              |
| Migrations, SQL constraints/indexes, transactions, persistence, locks or concurrency | Relevant application integration/migration tests against real disposable PostgreSQL. Existing ownership-verified native PostgreSQL is suitable; Docker is an option, not a requirement to replace it. Mocks cannot prove SQL semantics.                |
| New service boundaries                                                               | Real isolated application-level integration across those boundaries; introduce infrastructure only when existing behavior justifies it. StackPulse currently has no Redis/broker/worker stack.                                                         |
| Neon HTTP, auth, live AI or notifications                                            | Separate provider-specific evidence in an explicitly approved isolated environment; local SQL does not verify hosted transport, OAuth, billing or delivery.                                                                                            |

Always report exact command, scope, **PASS / FAIL / NOT RUN**, executed/passed/failed/skipped counts when available, environment limits, cleanup and remaining unverified boundaries. Zero executed tests or unexpected skips do not establish an integration PASS. A green process with intentionally skipped SQL/HTTP cases is only evidence for the cases executed. Do not replace missing integration evidence with mock results or a healthy service/container.

If Docker or another required isolated environment cannot run, do not bypass restrictions: mark affected checks NOT RUN, explain missing evidence and continue unrelated safe work. Do not call unverified integration behavior production-ready. Builds can query `.env` through Next.js prerendering; inspect the target first and do not run database-backed builds/pages against unknown or production data without approval.

### Current PostgreSQL boundaries

- `pnpm test:cron` runs offline recovery/throughput contracts plus an optional scheduling-query test. The latter requires `SKILL_TEST_DATABASE_URL` and `SKILL_TEST_TARGET_FILE`, reuses the skill suite's cluster ownership checks and removes its random schema. Without that explicit target it skips; offline mocks alone are not SQL integration evidence.
- `pnpm test:votes` combines offline API/UI contracts, four guarded SQL integration tests and optional real HTTP cases. SQL accepts an explicit loopback test URL and uses random schemas; the caller must independently verify ownership before supplying it. HTTP requires a separately verified isolated app/database, not just a loopback app URL.
- `pnpm test:skills` mixes offline cases with SQL, local SDK/HTTP and migration-rehearsal cases guarded by both `SKILL_TEST_DATABASE_URL` and `SKILL_TEST_TARGET_FILE`. These verify workspace-owned data directory/PID/system identity before writes. Follow the [staging runbook](skill-staging-verification.md), not an unverified copied ownership proof.
- Production uses `@neondatabase/serverless` over HTTP with Drizzle neon-http. Vote/skill SQL tests use a local TCP-backed test client. Skill HTTP tests additionally exercise the actual SDK via a loopback HTTP bridge; this still does not prove hosted Neon behavior. Cloud-connected tests require explicit approval and dedicated disposable targets.

There is no checked-in Compose stack or Docker integration runner. Do not invent `pnpm test:integration:docker` or treat these suites' default skips as Docker coverage. Containerizing the skill tests requires a reviewed ownership-proof design; do not weaken their native-cluster guard to make a container fit. Reuse existing application tests if a future task justifies a small runner, and test its isolation/failure/cleanup paths before enabling it. CI ([`ci.yml`](../../.github/workflows/ci.yml)) runs agent-workflow integrity, the migration-history and review-signal guards on PRs, and `pnpm lint`, `pnpm typecheck` and `pnpm test` with no database, provider or app URL configured, so SQL/HTTP cases skip. It provisions no database services and runs no build.

### Safe Docker execution

If a future task starts Docker services for integration verification:

1. Generate a unique Compose project/container identity. Use disposable run-owned volumes/networks and dynamically allocated ports bound to localhost. Verify ownership; never attach an existing developer/production database or unknown volume/network.
2. Validate the **effective** Compose configuration before startup. Reject external/shared resources, explicit shared names, unexpected host binds, host networking and unsafe dependencies. Use only intended test services and disposable fixture credentials. Do not pass production secrets.
3. Explicitly override inherited database URLs and unsafe test settings; prevent dotenv/ambient configuration from restoring live credentials. Do not start cron/workers/consumers that could call GitHub, OpenRouter, Resend or webhooks. A service health check is only readiness to run tests.
4. Run relevant application tests and inspect their counts/results. Reject zero execution or unexpected skips. Keep failures visible even if cleanup succeeds.
5. Attempt scoped cleanup after success, failure, partial startup and handled interruption. Remove only this run's resources; report cleanup failure and retain the run identity plus the exact scoped recovery command. Never run global `docker system prune` / `docker volume prune`, or developer-project `down --volumes`.

No Docker stack is required for this workflow migration, and no containers are started by the new workflow tests.

## Automated

```bash
node scripts/sync-agent-skills.mjs --check
node scripts/check-engineering-workflow.mjs
pnpm test:agent-workflow # Dependency-free sync and guard regression tests; no app/service calls
pnpm test             # Every tests/*.test.mjs file; SQL/HTTP cases skip without their explicit targets
pnpm typecheck        # TypeScript 7 (`tsc`)
pnpm typecheck:ts6    # TypeScript 6 (`tsc6`) — same tsconfig, for migration comparison
pnpm lint
pnpm test:cron        # Offline recovery/throughput; scheduling SQL requires the owned skill-test target
pnpm test:theme       # Theme initialization and Light token contrast
pnpm test:skills      # SQL tests require SKILL_TEST_DATABASE_URL plus SKILL_TEST_TARGET_FILE ownership proof
pnpm skills:eval      # Offline synthetic contracts; no paid model calls
pnpm test:votes       # Vote UI states, API/auth/redirect checks; DB cases skip without explicit isolated URL
pnpm build
```

### Isolated voting integration tests

Use a disposable local PostgreSQL database whose name contains `test`. Do not supply a Neon/production URL. The suite refuses non-loopback hosts, never loads `.env`/`DATABASE_URL`, creates a random schema, applies the versioned migrations there (redirecting explicit `public` FK targets into that schema), and drops only its own schema afterward. `pg` is a development-only dependency for these tests; the production application retains Neon HTTP.

Only set `VOTE_TEST_APP_URL` if the running app also uses a verified isolated development database. A loopback HTTP URL does not prevent that app from querying a remote production database. Leave it unset when the app's database is production or unknown.

In Command Prompt, after creating the isolated local database and configuring a separate local app to use isolated development data:

```bat
set VOTE_TEST_DATABASE_URL=postgresql://test_user@127.0.0.1:55439/stackpulse_vote_test
set VOTE_TEST_APP_URL=http://localhost:3000
pnpm test:votes
set VOTE_TEST_APP_URL=
set VOTE_TEST_DATABASE_URL=
```

The suite runs the production Drizzle neon-http query/batch adapter with a local PostgreSQL transport. It verifies migration constraints/index/timestamps, FK cascades, all desired states, user isolation, aggregation, duplicate/concurrent first votes, replacements, removal and mixed overlapping writes. It also exercises the real detail lookup with matching/mismatched identifiers. Optional `VOTE_TEST_APP_URL` adds read-only real HTTP detail/404/metadata checks against a running local app with an indexed Next.js release. Without it those HTTP cases skip. API tests replace only the session/data boundary and cover identity derivation, origin checks, validation, safe failures and cache headers; they do not complete live GitHub OAuth.

Browser smoke: follow both card detail links, refresh a direct release URL, check missing/mismatched resources and metadata, test the anonymous header sign-in, persistent voting sign-in action, and both anonymous vote buttons with the release return URL. Confirm the authenticated header reuses the user menu, then test upvote → remove → downvote → replace, pending lock, keyboard, failed-write reconciliation, both themes and mobile overflow. Check pointer cursors before/after requests and that hovering sends no vote requests. Check real API failure/recovery, empty totals without fabrication, labeled stale totals, and a stalled request ending after the 15-second timeout. Anonymous sign-in controls must remain actionable when vote reads fail. Keep controlled vote/auth responses clearly distinguished from live OAuth checks. Never run browser vote mutations against production as part of implementation. The exact operator-run [production GitHub OAuth smoke test](../features/auth.md#release-voting-oauth-smoke-test) requires separate approval.

### Investigating unavailable vote totals

“Vote totals are unavailable” means the vote GET failed; it does not identify the cause. The API deliberately returns a generic `500`, and its catch blocks currently discard the underlying exception, so browser output and the existing server logs cannot distinguish a missing table, database connectivity, or session initialization failure.

First classify the configured database without printing credentials. Do not request database-backed pages/APIs or run a build against a production-connected checkout without authorization. The application uses Neon HTTP; the tests' local SQL transport does not make an ordinary local PostgreSQL URL work in the application automatically.

On an isolated local database, the real API with valid auth configuration returned `500` / PostgreSQL `42P01` before migration `0009`, then `200` after applying that exact migration. Missing required production-mode auth configuration also returned `500`, before any SQL. Development mode permits missing GitHub credentials, so their absence alone does not explain a development-mode vote GET failure. The production schema/configuration still needs operator verification; the local reproduction is not evidence that production is missing the table.

If the error persists after an approved migration, the operator should distinguish schema state (`release_votes` and the migration journal), database connectivity, and Better Auth configuration. A follow-up should record only a sanitized operation/error classification (such as SQLSTATE) server-side; do not log database URLs, session tokens, SQL parameters or raw exceptions containing secrets.

## Skill Updates staging gates

The [Skill Updates staging runbook](skill-staging-verification.md) records current evidence, exact ownership guards, zero-spend plans, approval-gated Neon/OpenRouter commands, budgets, cleanup and migration/cron sequencing. It distinguishes local PostgreSQL and actual SDK fault tests from unrun hosted verification. No test may use the checkout's remote `.env` as a fallback.

## Git hygiene

```bash
git diff --check
```

## Manual smoke tests

1. **Landing** — `/` loads
2. **Auth** — GitHub sign-in → `/onboarding` or `/dashboard`
3. **Onboarding** — save stack preferences
4. **Feed** — `/dashboard` shows releases after ingestion
5. **Cron** — use [F1 recovery verification](../audits/F1-cron-recovery.md) for production; local ingestion tests require an isolated development DB and may incur AI cost
6. **Public** — `/stacks`, `/stacks/react` (or any seeded slug)
7. **Advice** — signed-in user asks question on a release in feed

## Link checks after doc moves

Search active docs for broken relative paths; ensure the `docs/AGENT_START_HERE.md` reading matrix matches new files. UI work should match `docs/DESIGN_SYSTEM.md`.

## Provider drift audit

When touching auth/billing/AI/DB docs, grep codebase for:

- `better-auth`, `drizzle`, `neon`, `openrouter` (current)
- `prisma`, `clerk`, `supabase`, `stripe`, `lemonsqueezy`, `posthog`, `sentry` (should not appear in app code except seed stack names or lockfile peer deps)
