# Deployment

**Status:** current

## Platform

**Vercel** — import GitHub repo, set env vars from [environment-variables.md](./environment-variables.md).

## Cron

[`vercel.json`](../../vercel.json):

```json
{
  "crons": [
    { "path": "/api/cron/fetch-releases", "schedule": "0 0,12 * * *" },
    { "path": "/api/cron/send-digest", "schedule": "0 14 * * 1" },
    { "path": "/api/cron/fetch-skill-updates", "schedule": "30 0,12 * * *" }
  ]
}
```

Release fetch runs at **00:00 and 12:00 UTC** daily; digest emails send **Mondays 14:00 UTC** (after the Monday fetch). Both authenticated with `CRON_SECRET` bearer header. Digest sending also needs `RESEND_API_KEY` + `DIGEST_FROM_EMAIL` (no-ops with a warning otherwise).

Skill Updates is configured for **00:30 and 12:30 UTC** daily (**07:30 and 19:30 Asia/Ho_Chi_Minh**) using the same cron authentication. D1 initialized ten production baselines without AI requests; the operator separately approved adding this D2 schedule. Vercel registers it only when this configuration is deployed to Production; pushing a task branch alone does not activate it. Verify the effective production registration and subsequent runs using the [Skill Updates staging runbook](skill-staging-verification.md).

Release cron also requires a valid `GITHUB_TOKEN`. Manual `GET /api/cron/github-health`,
protected by the same `CRON_SECRET`, checks it with one read-only GitHub request and no
AI/database work. It is not scheduled. Follow the [F1 production verification checklist](../audits/F1-cron-recovery.md)
after an approved deployment; wait for scheduled ingestion instead of triggering live cron.

## Deploy checklist

For updates to an existing production installation, apply reviewed pending migrations **before pushing/merging the application change to `main`**, which triggers the GitHub-linked Vercel deployment. Release voting specifically requires `0009_release_votes.sql` first; follow the [migration and deployment order](../features/public-stacks.md#migration-and-deployment-order). Do not seed, change production credentials, or trigger live cron for this update. Retain the additive vote table if rolling back the app.

Initial installation checklist:

1. Push to GitHub
2. Import repo in Vercel
3. Set all production env vars
4. Run migrations against production DB: `pnpm db:migrate` (CI or local with prod `DATABASE_URL`)
5. Seed registry if empty: `pnpm db:seed`
6. GitHub OAuth callback: `https://<domain>/api/auth/callback/github`
7. Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to production origin

## Analytics

`@vercel/analytics` included in `src/app/layout.tsx` — no extra env vars.

## Self-hosting

README describes Vercel + Neon free tier. Other Node hosts work if cron can hit `/api/cron/fetch-releases` on schedule with correct auth.
