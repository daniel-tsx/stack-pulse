# Public stacks

**Status:** current

## Routes

- `/stacks` — index of seeded/ingested stacks with stats (`src/app/stacks/page.tsx`)
- `/stacks/[slug]` — up to 20 releases per stack (`PUBLIC_STACK_RELEASE_LIMIT` in `src/lib/public-stacks.ts`)
- `/stacks/[slug]/releases/[releaseId]` — a public, shareable release detail identified by the existing UUID; public stack cards and dashboard cards link here separately from their GitHub source links
- `/stacks/[slug]/rss.xml` — RSS 2.0 feed of the same releases (route handler, `Cache-Control: s-maxage=3600`); advertised via `alternates.types` metadata and an `rss` button on the stack page
- `/stacks/[slug]/upgrade` — public upgrade planner; `?from=<version>` filters stored releases above that version (`src/lib/upgrade-plan.ts`, loose version compare from `src/lib/version.ts`) and aggregates breaking changes, security notes, deprecations, and a migration checklist in upgrade order. Canonical always points at the param-less page; both stack page button and sitemap link it

## Data

`getPublicStackIndex()` and stack page loaders in `src/lib/public-stacks.ts` query `technologies` + `release_updates`.

`getPublicRelease()` in `src/lib/public-releases.ts` validates the slug/UUID and fetches one release joined to its technology, matching both identifiers. Invalid, missing, or mismatched resources call `notFound()` with noindex metadata. It does not search the 20-release collection or generate every release route at build time. Public cards and detail pages share `ReleaseNotes`; the virtualized feed only gains a navigation action.

Details expose stored summaries, signals, upgrade notes and code snippets when available; model/ingestion metadata stays out of the detail DTO. Opening the page never calls AI.

## SEO

- Public read helpers use Cache Components: one-hour `cacheLife` revalidation, one-day expiry
- JSON-LD (`CollectionPage`, `SoftwareSourceCode`) on index
- Metadata in page files; sitemap at `src/app/sitemap.ts`
- Release metadata derives title/description/canonical/Open Graph/Twitter from stored content. The UUID route is canonical; votes and user identity never enter metadata. Release discovery uses card links, without expanding the sitemap to every release.

## Release voting

Release voting requires migration `0009_release_votes.sql` before deploying this code. The StackPulse production migration was applied with explicit operator approval on 2026-10-17; its journal entry, constraints and indexes were verified. Other installations must apply it before deployment. Tests use isolated databases and do not migrate production.

`release_votes` stores one active `-1` or `1` per `(user_id, release_id)` composite primary key. A CHECK rejects other values, both FKs cascade on deletion, and `release_votes_release_idx` supports release-centric aggregation. `created_at` survives replacements; `updated_at` changes on upsert. Removing a vote deletes its row; a later new vote has new timestamps. No historical event ledger or denormalized counters are maintained.

### API contract

`/api/releases/[releaseId]/vote`:

| Method | Input/auth | Success |
| --- | --- | --- |
| GET | Public; optional Better Auth session | `{ score, upvotes, downvotes, myVote }` |
| PUT | Session cookie, same-origin `Origin`, `application/json`; strict `{ "value": -1 \| 0 \| 1 }` | The same authoritative state after the write |

`score = upvotes - downvotes`. `myVote` is `null` for anonymous visitors, `0` for an authenticated user with no active vote, otherwise `-1` or `1`. The server derives `user_id` from Better Auth, rejects extra body fields, and scopes deletion/upsert to that identity. Following the technology is not required to vote on a public release.

Errors are JSON `{ error: string }`: `400` invalid UUID/value/JSON/content type, `401` unauthenticated PUT, `403` missing/opaque/foreign Origin or cross-site PUT, `404` nonexistent release, `413` body over the small request limit, `500` safe generic failure. Success and error responses send `Cache-Control: private, no-store` and `Vary: Cookie`.

### Desired states and concurrency

The UI submits a final desired state: click the selected direction → `0`; choose the other direction → `-1` or `1`. The server never toggles. Repeating an identical request remains idempotent.

`setReleaseVote()` uses `INSERT … ON CONFLICT DO UPDATE` or an idempotent scoped DELETE, followed by aggregation in one Neon HTTP/Drizzle transaction batch. The second statement reads a fresh PostgreSQL READ COMMITTED snapshot and sees this transaction's write. A sibling data-modifying CTE aggregate would instead read the pre-write snapshot, so it is deliberately avoided. A failed statement rolls back the batch.

The primary key prevents duplicate active rows across tabs and simultaneous first votes. Overlapping different desired states follow PostgreSQL statement snapshots and row-lock scheduling, **not HTTP arrival order**. In particular a DELETE that sees no row may finish before an in-flight INSERT becomes visible; that INSERT can remain. This API does not promise last-request-arrival-wins or a global order. Every returned aggregate is a database snapshot, not a live subscription, and another tab can change it afterward. Refresh/on-focus reads reconcile state. No Redis, distributed locks, counters, comments, or trending logic are added.

### UI, auth and cache boundary

Only the release detail mounts `ReleaseVote`, a TanStack Query client island. After resolving the client session, it performs an uncached GET keyed by release and user identity, refetches on mount/focus, and accepts authoritative PUT results without refreshing the page. Vote reads and writes time out after 15 seconds. The controls lock immediately while a local mutation is pending. There is no optimistic score change; after an ambiguous write failure it reloads the authoritative state before allowing another toggle. If that read fails too, the previous totals are labeled stale and authenticated mutation controls stay disabled until a successful reload. Initial failures show a dash instead of invented totals. Error-disabled buttons use an unavailable cursor; a wait cursor is reserved for pending requests, and enabled buttons use a pointer. Hovering does not initiate a vote request.

Anonymous visitors can see public totals, both vote controls, and a persistent “Sign in with GitHub to vote” action. Clicking either direction opens sign-in even if the vote API is unavailable. The header also shows “Sign in” for anonymous visitors or the existing `UserMenu` for an authenticated session, alongside `ThemeSwitcher`. These client session reads do not personalize the cached release content. Both sign-in entry points pass the release path through `safeReturnPath()`, which rejects unsafe targets and defaults to `/dashboard`. OAuth returns to the release, where the visitor must choose a vote again. No pending vote is stored or submitted automatically. Existing normal sign-in/onboarding behavior remains in place.

Release content stays server-rendered and publicly cached for one hour, using a cached public lookup. The route retains the shared loading/partial-prefetch shell. A narrowly matched `src/proxy.ts` checks only release/technology identity before normal requests can stream, rewriting missing resources to the existing branded 404 with HTTP status 404. It skips prefetch requests, which still resolve `notFound()` inside the page. This adds one small indexed existence query per actual detail request; it avoids a soft 404 caused by Next.js metadata/loading streaming. It does not fetch release content or votes in proxy and does not enumerate release routes at build time. Votes/session reads never enter that cache. The virtualized dashboard has no per-card voting requests and keeps its existing query/filter/read/pagination logic.

The existence check also runs for matching non-prefetch RSC requests; it is not limited to full HTML loads. A cache miss can therefore require both the existence query and the content query, while a cache hit still needs the existence query. Database unavailability can prevent a cached detail response because the existence check must complete first. The simpler alternative is to remove proxy and accept streamed `200` responses with `noindex` for missing releases; that does not meet the strict HTTP 404 requirement. See the Next.js [streaming status-code guidance](https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes).

### Migration and deployment order

1. Review `drizzle/0009_release_votes.sql`, its snapshot/journal, and the application diff. It only creates the vote table, constraints and index. Test on an isolated database first.
2. Through the existing operator-controlled release process, verify the intended production database and recovery/backup point without printing credentials. Keep the current application deployed while migrating. The foreign keys can briefly lock the referenced `users` and `release_updates` tables; use the normal migration window and stop on lock/errors rather than forcing the migration. The new table is empty, so its index needs no concurrent build or existing-data backfill.
3. In the approved release environment, with its existing database credentials configured, run `pnpm install --frozen-lockfile`, then **`pnpm db:migrate`**. Do not use `db:push`, seed, or re-generate migrations for deployment. Confirm migration `0009` and the new table/constraints/index completed successfully. Stop if migration fails.
4. Only after migration succeeds, run the normal `pnpm build`, then merge/push the approved application revision to `main` to trigger the existing GitHub-linked Vercel deployment. Wait for that deployment to succeed. The old app tolerates the additive table during the migration window. Deploying this app before migrating causes vote requests to fail.
5. Smoke-test an anonymous release URL, metadata/source links, and the [exact GitHub OAuth and voting flow](./auth.md#release-voting-oauth-smoke-test). Use operator-owned test accounts; do not alter existing users' votes.
6. If application rollback is necessary, roll back the app and retain the additive table/data and migration journal entry. Do not drop votes or restore the whole database as part of an application-only rollback; the old deployed application tolerates this extra table. If migration fails, stop the deployment and inspect its transaction/journal state before any retry.

No new production environment variables are required. Automated tests accept only the separately supplied loopback `VOTE_TEST_DATABASE_URL`; see [verification](../operations/verification.md).

## Digest signup

`DigestSignupForm` on landing, stacks index, and stack detail pages — see [digest-signup.md](./digest-signup.md).

## Registry seed

90 default stacks in `src/db/seed.ts` across 15 categories (frameworks, libraries, ui, state, data, orm, testing, mobile, desktop, ai, auth, …). The seed syncs existing rows by slug; `scripts/check-seed-releases.mjs` audits that every repo publishes GitHub releases. Custom user repos use `category: 'custom'` and appear in DB but are not part of the public index unless ingested and surfaced by queries.
