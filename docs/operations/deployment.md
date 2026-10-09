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
    { "path": "/api/cron/send-digest", "schedule": "0 14 * * 1" }
  ]
}
```

Release fetch runs at **00:00 and 12:00 UTC** daily; digest emails send **Mondays 14:00 UTC** (after the Monday fetch). Both authenticated with `CRON_SECRET` bearer header. Digest sending also needs `RESEND_API_KEY` + `DIGEST_FROM_EMAIL` (no-ops with a warning otherwise).

Release cron also requires a valid `GITHUB_TOKEN`. Manual `GET /api/cron/github-health`,
protected by the same `CRON_SECRET`, checks it with one read-only GitHub request and no
AI/database work. It is not scheduled. Follow the [F1 production verification checklist](../audits/F1-cron-recovery.md)
after an approved deployment; wait for scheduled ingestion instead of triggering live cron.

## Deploy checklist

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
