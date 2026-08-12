# StackPulse documentation

**Status:** current

Index for humans and AI agents. Agents should start at [AGENT_START_HERE.md](./AGENT_START_HERE.md) every session.

---

## Folder guide

| Folder | Purpose |
|--------|---------|
| [AGENT_START_HERE.md](./AGENT_START_HERE.md) | Session entry point: read order, stack truth, drift, verification |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | **UI design system** (tokens, layout, copy) + architecture overview |
| [architecture/index.html](./architecture/index.html) | **Architecture docs (HTML)** — system, deployment, security, API, ADRs |
| [database-architecture.html](./database-architecture.html) | Database schema, indexes, data flows (HTML) |
| [features/](./features/) | How each product system works **today** |
| [operations/](./operations/) | Local setup, env, database, deployment, verification |
| [strategy/](./strategy/) | Roadmap and product direction (empty until added) |
| [archive/](./archive/) | Historical plans, reviews, superseded docs — **do not treat as current** |

---

## Current docs

### Features

| Doc | Topic |
|-----|-------|
| [overview.md](./features/overview.md) | Routes, API surface, app structure |
| [auth.md](./features/auth.md) | Better Auth + GitHub OAuth |
| [release-ingestion.md](./features/release-ingestion.md) | Cron, GitHub fetch, AI persist |
| [release-feed.md](./features/release-feed.md) | Dashboard feed, filters, read state |
| [ai-summarization.md](./features/ai-summarization.md) | OpenRouter summarisation + advice |
| [public-stacks.md](./features/public-stacks.md) | `/stacks` SEO pages |
| [digest-signup.md](./features/digest-signup.md) | Email capture (no sender yet) |
| [server-actions.md](./features/server-actions.md) | `src/lib/actions.ts` |

### Operations

| Doc | Topic |
|-----|-------|
| [local-development.md](./operations/local-development.md) | Install, dev server, scripts |
| [environment-variables.md](./operations/environment-variables.md) | Full env reference |
| [database.md](./operations/database.md) | Schema, migrations, seed |
| [deployment.md](./operations/deployment.md) | Vercel, cron, production checks |
| [verification.md](./operations/verification.md) | Typecheck, lint, build, manual checks |
| [typescript.md](./operations/typescript.md) | Why TypeScript 7 and 6 are both installed |
| [navigation-and-caching.md](./operations/navigation-and-caching.md) | Cache Components, Partial Prefetching, Suspense, and cache policy |

---

## Archived docs

Nothing archived yet. When a plan ships or a review goes stale, move it under:

- `archive/implementation/` — completed implementation plans
- `archive/reviews/` — audits and reviews
- `archive/ui/` — UI revamp / design docs superseded by shipped work

Mark archived files with `Status: historical` or `Status: superseded` in the header.

---

## Maintenance rules

1. **One current doc per feature** — no duplicate sources of truth.
2. **Status header** on every doc: `current`, `planned`, `shipped`, `historical`, or `superseded`.
3. **Trust code** — update docs when architecture, routes, env, schema, auth, cron, or user-visible behavior changes.
4. **Move, don't delete** — completed plans go to `archive/`.
5. **Link from AGENT_START_HERE** when adding a new feature or ops doc to the source-of-truth map.
6. **UI changes** must follow [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for tokens, frames, typography, and badges.
7. **Relative links** — use paths from the doc's location; run link checks after moves.

Root-level [README.md](../README.md) stays the public-facing quick start; deep detail lives here.
