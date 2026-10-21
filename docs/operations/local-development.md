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
| `test:agent-workflow` | Dependency-free skill synchronization regression tests |
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

For repository-local AI workflow setup, synchronization and discovery checks, see [AI workflow](ai-workflow.md). Run `node scripts/sync-agent-skills.mjs --check` without application dependencies. See [verification](verification.md#risk-based-verification) for real-service test boundaries and safety.

## Windows editor shell

Use Command Prompt (`cmd.exe`) for Windows commands. The existing `.vscode/settings.json` sets `terminal.integrated.automationProfile.windows` to the JSON path `"C:\\Windows\\System32\\cmd.exe"`; `.cursor/rules/windows-cmd-shell.mdc` reinforces the syntax.

For an operator configuring Cursor outside this task, the same automation profile can be placed in `%APPDATA%\Cursor\User\settings.json`; a default terminal profile alone may not control the agent shell. Older Cursor versions may need **Legacy Terminal Tool** in agent settings, a restart, and **Terminal: Kill All Terminals**. `cursor.useLegacyTerminalTool: true` is a forum-reported option, not an official guarantee. Cursor can still spawn PowerShell despite these preferences; explicitly select `cmd.exe` and retain cmd-compatible syntax. Do not change global/user editor settings during repository workflow adoption.

## Manual cron

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/fetch-releases"
```

Use an isolated development DB and valid `GITHUB_TOKEN`; ingestion can incur AI cost.
All registry stacks are scanned even without followers. For credential verification alone,
use protected `GET /api/cron/github-health`, which performs no AI/database work.
