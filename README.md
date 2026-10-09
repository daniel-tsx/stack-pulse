# StackPulse

> **Every release. One feed.**
> Daily AI-distilled summaries of the latest framework and library releases. Follow the tools you ship with, never miss a breaking change.

StackPulse is a non-profit, open-source service for developers. It watches a list of GitHub repositories you care about, fetches their releases on a schedule, and summarises each one — what's new, what's broken, the code you actually need to read.

---

## Features

- **GitHub-only auth** via Better Auth. No email, no password, no spam.
- **A registry of 90+ stacks** (React, Next.js, Vue, Tailwind, Drizzle, Astro, Bun, Svelte, Playwright, Electron, the AI SDKs, …) plus an "add any GitHub repo" escape hatch.
- **package.json import** — paste your file, StackPulse resolves every dependency to its GitHub repo and follows your whole stack in one click.
- **AI-distilled release notes** through OpenRouter (default: `deepseek/deepseek-chat`, configurable).
- **A git-log-style feed** with diff-style breaking changes / new features, importance badges, and source links.
- **Read/unread workflow** with stack, importance, status, and text filters.
- **Weekly email digest** via Resend — stack-scoped or cross-stack, with one-click unsubscribe.
- **Slack/Discord notifications** — new releases for your stacks pushed to a channel, with an importance threshold.
- **Public status page** (`/status`) with fetch run history for ingestion health.
- **MCP server** — ask Claude Code, Claude Desktop, or Cursor what's new in your stack:
  ```bash
  claude mcp add --transport http stackpulse https://<your-domain>/api/mcp/mcp
  ```
  Tools: `list_stacks`, `get_releases`, `get_upgrade_plan`, `search_releases`.
- **Self-hostable** on Vercel + Neon free tier.

## Tech stack

|           |                                      |
| --------- | ------------------------------------ |
| Framework | Next.js 16 (App Router)              |
| Auth      | Better Auth (GitHub OAuth)           |
| DB        | Postgres on Neon, Drizzle ORM        |
| AI        | OpenRouter (OpenAI SDK)              |
| Hosting   | Vercel + Vercel Cron                 |
| UI        | Tailwind v4, hugeicons-react, motion |

## Running locally

### Prerequisites

- Node 20.9+
- pnpm (`npm i -g pnpm`)
- A Neon Postgres database (free tier is fine)
- A GitHub OAuth app — callback URL `http://localhost:3000/api/auth/callback/github`
- An OpenRouter API key

### Setup

```bash
git clone https://github.com/daniel-ctn/stack-pulse.git
cd stack-pulse
pnpm install
cp .env.example .env
# fill in the values — see the file for what's required vs optional
```

### Database

```bash
pnpm db:push      # apply schema to your Neon DB
pnpm db:seed      # seed the registry of supported stacks
```

For schema changes after the initial setup, use migrations instead:

```bash
pnpm db:generate  # generate a new migration after editing src/db/schema.ts
pnpm db:migrate   # apply pending migrations
```

### Dev server

```bash
pnpm dev
# http://localhost:3000
```

### Triggering the cron manually

The release fetcher is a single endpoint authed by `CRON_SECRET`:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "http://localhost:3000/api/cron/fetch-releases"
```

## Documentation

Detailed docs for contributors and AI agents live in [`docs/`](docs/). Start at [`docs/AGENT_START_HERE.md`](docs/AGENT_START_HERE.md). For UI conventions and architecture, see [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## Deploying

The project ships with a [`vercel.json`](vercel.json) that schedules the release fetcher **twice daily** (00:00 and 12:00 UTC) and the digest sender **weekly** (Mondays 14:00 UTC). To deploy:

1. Push to GitHub.
2. Import the repo into Vercel.
3. Set all environment variables from `.env.example` in the Vercel project settings.
4. Point your GitHub OAuth callback at `https://<your-domain>/api/auth/callback/github`.
5. Push to `main`. The cron picks up automatically.

## Environment variables

See [`.env.example`](.env.example) and [`docs/operations/environment-variables.md`](docs/operations/environment-variables.md). Required for any deploy:

- `DATABASE_URL` — Neon connection string
- `BETTER_AUTH_SECRET` — `openssl rand -hex 32`
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — your public origin
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — OAuth app credentials
- `OPENROUTER_API_KEY` — for release summarisation
- `CRON_SECRET` — `openssl rand -hex 32`
- `GITHUB_TOKEN` — valid GitHub PAT for the release cron and protected credential check

Optional but recommended:

- `RESEND_API_KEY` / `DIGEST_FROM_EMAIL` — enables the weekly digest emails (the digest cron no-ops without them)

## Project structure

```
src/
  app/
    (auth)/         sign-in (sign-up redirects here)
    (dashboard)/    dashboard, onboarding
    api/
      auth/         Better Auth catch-all
      cron/         release fetcher
    privacy/        legal pages
    terms/
  components/
    dashboard/      user menu
    landing/        legal shell
    ui/             primitives
  db/               schema, drizzle client, seed
  lib/              auth, github, ai, server actions
drizzle/            versioned migrations
```

## Contributing

This is a side project. Issues and PRs are welcome — particularly for new stacks to add to the seed registry, summarisation improvements, or accessibility fixes.

Keep changes small and focused. Run `pnpm typecheck && pnpm lint` and `pnpm test:cron` before pushing.

## Licence

MIT — see [`LICENSE`](LICENSE).
