# Environment variables

**Status:** current

Canonical template: [`.env.example`](../../.env.example)

## Required for production deploy

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | Session/crypto secret (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | Public app URL for auth (e.g. `https://stackpulse.example.com`) |
| `NEXT_PUBLIC_APP_URL` | Same origin for client + OpenRouter referer header |
| `GITHUB_CLIENT_ID` | GitHub OAuth |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `OPENROUTER_API_KEY` | AI summarisation (ingestion fails without it) |
| `CRON_SECRET` | Bearer token for cron endpoint |
| `GITHUB_TOKEN` | Valid GitHub PAT required by release cron and protected GitHub health check |

## Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat` | OpenRouter model id |
| `BETTER_AUTH_API_KEY` | — | Better Auth Dash at dash.better-auth.com |
| `RESEND_API_KEY` | — | Weekly digest emails (digest cron no-ops without it) |
| `DIGEST_FROM_EMAIL` | — | Verified Resend sender, e.g. `StackPulse <digest@domain.com>` |
| `SENTRY_DSN` | — | Server/edge error monitoring (SDK fully disabled without it) |
| `NEXT_PUBLIC_SENTRY_DSN` | — | Browser error monitoring |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | — | Only for source map upload in CI |

## Local dev minimum

For basic local run:

- `DATABASE_URL`
- `OPENROUTER_API_KEY` (if testing ingestion/summaries)
- `CRON_SECRET` (if testing cron manually)
- `GITHUB_TOKEN` (if testing cron or the GitHub health check)
- Auth vars optional in dev unless testing sign-in

The standalone public-repository helper still supports unauthenticated reads without
`GITHUB_TOKEN`. A configured token rejected with 401 never falls back to anonymous access.
See [release ingestion](../features/release-ingestion.md) for the runtime contract.

## Not used (historical)

Do not add unless implementing new features:

- Lemon Squeezy / Stripe (removed in migration `0002`)
- `DATABASE_URL` is Neon — not PlanetScale/Supabase client SDKs
