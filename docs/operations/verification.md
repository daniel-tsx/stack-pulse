# Verification

**Status:** current

## Automated

```bash
pnpm typecheck        # TypeScript 7 (`tsc`)
pnpm typecheck:ts6    # TypeScript 6 (`tsc6`) — same tsconfig, for migration comparison
pnpm lint
pnpm test:cron        # Node test runner; mocked GitHub, AI, DB and webhook dependencies
pnpm build
```

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

Search active docs for broken relative paths; ensure `docs/AGENT_START_HERE.md` map matches new files. UI work should match `docs/DESIGN_SYSTEM.md`.

## Provider drift audit

When touching auth/billing/AI/DB docs, grep codebase for:

- `better-auth`, `drizzle`, `neon`, `openrouter` (current)
- `prisma`, `clerk`, `supabase`, `stripe`, `lemonsqueezy`, `posthog`, `sentry` (should not appear in app code except seed stack names or lockfile peer deps)
