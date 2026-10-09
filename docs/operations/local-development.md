# Local development

**Status:** current

## Prerequisites

- Node 20.9+ (the minimum supported by Next.js 16)
- pnpm 11 (`packageManager` in `package.json`)
- Neon Postgres database
- GitHub OAuth app (callback: `http://localhost:3000/api/auth/callback/github`)
- OpenRouter API key

## Setup

```bash
git clone https://github.com/daniel-ctn/stack-pulse.git
cd stack-pulse
pnpm install
cp .env.example .env
# fill .env — see environment-variables.md
pnpm db:push
pnpm db:seed
pnpm dev
```

App: http://localhost:3000

## Scripts (`package.json`)

| Script | Command |
|--------|---------|
| `dev` | Next dev server |
| `build` / `start` | Production build & serve |
| `lint` | ESLint (`eslint.config.mjs`) |
| `test:cron` | Node test runner with mocked cron/GitHub dependencies |
| `db:generate` | New Drizzle migration from schema |
| `db:migrate` | Apply migrations |
| `db:push` | Push schema (dev) |
| `db:seed` | Seed + sync the 90-stack registry |
| `db:studio` | Drizzle Studio |
| `releases:backfill` | Re-summarise releases |
| `icons` | Generate favicons |

## Pre-push checks (from README)

```bash
pnpm typecheck && pnpm lint
pnpm test:cron
```

Cron recovery tests use Node's built-in runner and the installed TypeScript compiler API.
No external APIs or production database are used.

## Manual cron

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/fetch-releases"
```

Use an isolated development DB and valid `GITHUB_TOKEN`; ingestion can incur AI cost.
All registry stacks are scanned even without followers. For credential verification alone,
use protected `GET /api/cron/github-health`, which performs no AI/database work.
