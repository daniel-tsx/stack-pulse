# Authentication

**Status:** current

## Provider

- **Better Auth** with GitHub OAuth only (`src/lib/auth.ts`)
- Drizzle adapter maps to `users`, `accounts`, `sessions`, `verifications` in `src/db/schema.ts`
- API route: `src/app/api/auth/[...all]/route.ts` via `toNextJsHandler`

## Environment

Production **requires**:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL` or `NEXT_PUBLIC_APP_URL` (trusted origins)
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

In development, GitHub provider is omitted if client ID/secret are unset (auth still initializes).

## Optional

- `BETTER_AUTH_API_KEY` — enables `@better-auth/infra` dash plugin

## Client

- `src/lib/auth-client.ts` — browser client for sign-in/out

## Callback URL

`{BETTER_AUTH_URL}/api/auth/callback/github`

The sign-in page accepts optional `?returnTo=/local/path`. `safeReturnPath()` rejects external/protocol-relative paths, backslashes, controls, invalid encoding, ambiguous double encoding and normalized protocol-relative paths; invalid/missing input falls back to `/dashboard`. Release voting uses this to return to the original public release after GitHub OAuth. Voting still requires a fresh user action after sign-in. Dashboard redirects for empty stack preferences remain unchanged.

## Release voting OAuth smoke test

**Manual verification required:** local return-path tests and real local Better Auth session tests do not complete GitHub OAuth. Run this only after the operator approves migration `0009` and deployment, using operator-owned accounts.

1. Confirm the production origin in `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL`, the registered GitHub callback (`https://<production-domain>/api/auth/callback/github`), and the presence of the production auth secret and GitHub credentials. Do not print their values.
2. Open an existing public release URL in a signed-out/incognito browser. Confirm vote GET succeeds with `myVote: null`. Click a vote and follow the GitHub invitation; the sign-in URL must carry that release's local path in `returnTo`.
3. Complete real GitHub OAuth. Confirm the browser returns to the exact release path, not the dashboard, and no vote PUT happens automatically. The authenticated GET must show the account's existing vote, or `0` for an account without one.
4. Record the account's initial vote. Click upvote, click it again to remove, downvote, then upvote to replace it; refresh after each operation and verify the persisted state and totals. A second operator-owned account must have an independent vote. Restore only those accounts' initial votes afterward.
5. Check ordinary `/sign-in` without `returnTo` still follows the existing dashboard/onboarding flow. Check external, protocol-relative and encoded unsafe targets (for example `https://example.com`, `//example.com`, `/%2fexample.com`, `/%5cexample.com`) fall back to the local dashboard flow after OAuth. Confirm no navigation leaves the application for the supplied target.
6. Cancel or deny GitHub authorization and confirm the user can retry sign-in; no vote should have been written.

## Account deletion

`deleteAccountAction` in `src/lib/actions.ts` removes user data (cascade via FK).
This includes `release_votes` after migration `0009`.
