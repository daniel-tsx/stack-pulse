# Database

**Status:** current

## Stack

- **Postgres** on Neon (`@neondatabase/serverless`)
- **Drizzle ORM** — schema `src/db/schema.ts`, client `src/db/index.ts`
- Config: `drizzle.config.ts`, migrations in `drizzle/`

## Core tables

| Table | Purpose |
|-------|---------|
| `users`, `accounts`, `sessions`, `verifications` | Better Auth |
| `technologies` | Registry + custom repos |
| `user_tech_preferences` | User ↔ stack follows |
| `release_updates` | Ingested + AI-summarised releases |
| `agent_skills`, `agent_skill_updates` | Curated skill checkpoints/leases and durable source transitions + impact reports (migration `0010`) |
| `user_read_releases` | Read/unread per user |
| `release_votes` | One ±1 vote per user/release; cascading FKs, value check, release aggregation index, creation/update timestamps |
| `release_fetch_runs` | Ingestion run audit log |
| `digest_subscribers` | Email signups (no sender) |

## Migrations

```bash
pnpm db:generate   # after editing schema.ts
pnpm db:migrate    # apply
```

Initial/dev shortcut:

Never use this shortcut against production; review and apply versioned migrations there.

```bash
pnpm db:push
```

### Release voting (`0009`)

`0009_release_votes.sql` is additive: table + composite primary key + CHECK + cascading foreign keys + `release_id` index. Apply it **before** deploying code that reads/writes votes. It does not change release IDs or ingestion records. The exact operator migration/deployment and rollback sequence is maintained in [public stacks](../features/public-stacks.md#migration-and-deployment-order). Do not apply production migrations automatically during implementation.

## Seed

Agent skills use a separate manual `pnpm skills --seed` after migration `0010`. Review the [skill rollout and recovery checklist](../features/agent-skill-updates.md) before applying it to a target database.

For staging verification, use the [ownership-guarded skill test and rollout procedure](skill-staging-verification.md). Local tests require an explicit disposable-cluster identity proof; hosted Neon tests require a new empty database and approved resource manifest. The checkout's `.env` is not an approved test target. Skill cron registration stays disabled until the separate rollout gates pass.

```bash
pnpm db:seed
```

Seeds the 90-stack registry from `src/db/seed.ts` (idempotent — inserts missing slugs, updates name/description/category/repo URL on existing ones).

## Historical note

Migration `0002_military_galactus.sql` dropped Lemon Squeezy billing columns from `users`. Old snapshots in `drizzle/meta/0000_snapshot.json` and `0001_snapshot.json` still reference them — ignore for current schema.

## Studio

```bash
pnpm db:studio
```
