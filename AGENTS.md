# Agent guide — StackPulse

**Status:** current

StackPulse tracks GitHub releases for developer stacks, summarises them with OpenRouter and shows a filterable feed. It is non-profit and has no billing. Classify the [task size](#task-size) first; T1/T2 tasks then use [docs/AGENT_START_HERE.md](docs/AGENT_START_HERE.md) before editing behavior.

## Start here

1. Work on a task branch in your own worktree (see [Git and PRs](#git-and-prs)); inspect `git status` there and preserve existing work. If the worktree's `AGENTS.md` or `CLAUDE.md` differs from the copy loaded at session start, the worktree copy wins.
2. Classify the task with [Task size](#task-size), state the size you chose, and read only what it requires. The size is the highest row that any changed file or behavior matches; reclassify upward as soon as the change reaches a T2 area.
3. Code and configuration establish current behavior; docs provide intent. Surface disagreements instead of trusting stale prose. State the intended change and its verification; keep the diff surgical.

## Task size

| Size             | What counts                                                                                                                                                                                                                                                                                                                                                       | Read                                                                                                                                                               | Skills                                                                                     | Verify                                                                                    | Review                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **T0 trivial**   | Copy, typo, label/style token, comment or doc wording; no behavior change                                                                                                                                                                                                                                                                                         | This file and the touched files                                                                                                                                    | None                                                                                       | Cheapest relevant check                                                                   | Re-read the diff                                           |
| **T1 standard**  | Bug fix, UI/page change, feed or filter behavior, public stack/skill pages, MCP read tools, read-only queries, small feature or refactor outside T2                                                                                                                                                                                                               | T0 + `package.json`, the code entry points of the [reading matrix](docs/AGENT_START_HERE.md#read-by-task) row, and the one document owning the behavior you change | `ponytail`; `systematic-debugging` when the cause is unknown                               | [Verification commands](#verification-commands) for the touched scope                     | `ponytail-review` of your own diff                         |
| **T2 high-risk** | Schema/migrations; auth, sessions, return paths, origin checks; user-owned writes (server actions, votes, webhooks); cron routes, cron auth and `vercel.json` schedules; release/skill ingestion, retries, leases and checkpoints; AI calls and budgets; digest/webhook sends and unsubscribe; scripts that write production data or call paid providers; secrets | T1 + `README.md`, every document in the matrix row and any [architecture decision](docs/architecture/decisions/index.html) whose invariant the change could affect | T1 skills, `grilling` for unresolved decisions, `supabase-postgres-best-practices` for SQL | T1 + real isolated PostgreSQL when SQL, transaction, lock or persistence behavior changes | Independent reviewer (see [Skill routing](#skill-routing)) |

Skill text saying "non-trivial" means T1 or T2. A bug with an unknown cause takes the size of the area it is in. `engineering-workflow` runs only when the user asks for it, normally for T2. `docs/README.md` is a navigation index, not required reading. Verification follows the boundary actually touched: a T2-area change that alters no SQL or persistence behavior (for example, message text only) still gets T2 reading and review, but not a database run.

## Verification commands

Run from the root of your worktree. [Verification](docs/operations/verification.md) owns setup, isolation and the detailed boundaries.

| Scope                                                             | Commands                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docs only                                                         | `git diff --check`; if links changed, confirm the relative links and anchors resolve                                                                                                                                                                  |
| Application code                                                  | `pnpm lint`, `pnpm typecheck`, and the touched suite: `pnpm test:cron`, `test:theme`, `test:votes` or `test:skills`                                                                                                                                   |
| SQL, migrations, persistence, locks                               | Above + the suite's database cases against a disposable local PostgreSQL: `VOTE_TEST_DATABASE_URL` for votes, `SKILL_TEST_DATABASE_URL` + `SKILL_TEST_TARGET_FILE` (owned native cluster) for skills and cron scheduling. Unavailable: report NOT RUN |
| Hosted Neon HTTP, GitHub OAuth, OpenRouter, Resend, Slack/Discord | No automated check: NOT RUN unless the user approves a run in an isolated environment                                                                                                                                                                 |
| Agent skills or workflow files                                    | `node scripts/sync-agent-skills.mjs --check`, `node scripts/check-engineering-workflow.mjs`, `pnpm test:agent-workflow`                                                                                                                               |
| Before opening a PR (T1/T2)                                       | `pnpm lint`, `pnpm typecheck`, `pnpm test`                                                                                                                                                                                                            |

`pnpm build` is not a default check: Next.js prerendering queries the database configured in `.env`. Run it only against a verified isolated database. Report each check as PASS, FAIL or NOT RUN with command, scope, counts (including skips) and reason. Zero executed tests or default-skipped SQL cases are not integration evidence. Local runs are not hosted CI.

## Project context

- Next.js 16 App Router, React 19, TypeScript 7 (`tsc`; TypeScript 6 stays as `tsc6` for typescript-eslint). pnpm is pinned in `packageManager`. Tests use `node:test`; there is no Vitest or Jest.
- PostgreSQL on Neon through Drizzle's **neon-http** adapter (`src/db/index.ts`); migrations in `drizzle/`. Database tests run the same adapter over a local test transport.
- GitHub-only Better Auth. Vercel hosts the app and its cron schedules (`vercel.json`). OpenRouter via `src/lib/ai.ts`; Resend for the digest; Slack/Discord user webhooks.
- No Redis, broker, worker or Docker stack. Isolated database tests need a local cluster; the skill suites additionally require a workspace-owned native cluster.

## Project invariants

- Production uses Drizzle neon-http. A local TCP PostgreSQL URL does not prove the hosted HTTP transport.
- Migrations are append-only, reviewed forward migrations. No `db:push` against shared databases; do not regenerate or edit old migrations or snapshots.
- Auth is GitHub-only Better Auth with server-side sessions; redirects go through `safeReturnPath` (`src/lib/auth-return-path.ts`).
- Cookie-authenticated mutations require a same-origin `Origin` header (the vote route); never trust forwarded host headers.
- Users read and write only their own preferences, custom repos, votes and webhook settings; derive identity from the session, never from input.
- Cron routes require the `CRON_SECRET` bearer token, compared in constant time (`src/lib/cron-auth.ts`).
- Release ingestion keeps deduplication (`release_updates_tech_version_unique`), bounded retries, run finalization and recovery from unknown writes.
- Skill Updates keeps lease-token fencing (`lease_until`), durable checkpoints and budget limits. Its cron stays unregistered in `vercel.json` until the [staging gates](docs/operations/skill-staging-verification.md) pass.
- Webhook targets are HTTPS Slack/Discord hosts only (`src/lib/webhooks.ts`).
- Billing stays removed: do not reintroduce Lemon Squeezy behavior without an explicit task.

## Scope and safety

- Never print or commit secrets or `.env` values. Never use an unverified `.env` database as a test fallback; test suites refuse non-loopback targets and must keep doing so.
- No production data changes or migrations, cloud-connected tests, deployment or remote push without explicit session authorization.
- OpenRouter spends money; Resend and Slack/Discord send real messages. Do not start cron, seed, backfill, `skills` scripts, workers or live provider calls as a verification shortcut.
- Use disposable, test-owned resources for destructive tests and clean up only this run's resources. No global Docker prune or shared volumes.
- Do not change global/user agent settings, install hooks or plugins, or create skill symlinks/junctions.
- Documentation claims must point to implementation or executed checks. Separate implemented, inspected, tested and externally verified. No fabricated users, metrics or readiness claims.

## Files and artifacts

Default to creating no new files. The deliverable is the code and tests the task needs; plans, reviews and evidence go in the chat, commit message or PR description.

- **Temporary files** live only in one ignored directory per task: `.tmp/<task-slug>/` (`engineering-workflow` uses `.tmp/agent-workflows/<task-slug>/`). Never write to the `.tmp/` root or to tracked paths. Keep at most `plan.md`, one `review-<n>.md` per review (plus its `review-brief.md` and `review-prompt.md`), a `pr.md` draft and one compact verification summary (commands, exit codes, pass/fail/skip counts, short failure excerpts). `engineering-workflow` keeps its own fixed set (its SKILL.md step 3). A task worktree (`.tmp/<task-slug>/worktree`, or `.claude/worktrees/<name>` when the host creates it) is a checkout, not an artifact: remove it only with `git worktree remove` after its branch is merged or abandoned. Do not save full runner output, duplicate logs, source snapshots or diff copies. Overwrite your own working files; reviewer reports stay immutable.
- **Cleanup:** a task's `.tmp` files are its resume source. Delete them only when the task is finalized (PR merged or rejected, or the human accepted or rejected the result) or the user abandons it. At the end of each session, list what remains and why. Never read or reuse another task's `.tmp` directory unless asked.
- **Permanent docs:** create a new Markdown file only when the user asks or a new subsystem has no owning document; otherwise edit the owning document. Every new or edited doc carries a status: `current`, `planned`, `shipped`, `historical` or `superseded`; move completed plans and stale reviews to `docs/archive/`. No per-round, per-review or per-checkpoint reports in `docs/`, and no run logs appended to `docs/operations/verification.md`. A durable architecture decision gets one short ADR in `docs/architecture/decisions/` (context, decision, consequences), linked from its index.
- **Size limits:** plan ≤200 lines; review = findings only, ≤150 lines; decision ≤1 page. Needing more is a signal to split the task.
- **Reading budget:** read what your task size requires, then only what the code leads you to. `docs/audits/` and `docs/archive/` are historical and opt-in; open one only when the task names it. Never read whole folders "for context".
- **Finish report** lists every file created, kept or deleted, including temporary ones.

## Skill routing

Use skills conditionally and in proportion to the task; this routing and explicit user requests decide activation, and upstream "always" or session-wide wording does not extend it. Load the repository copy from `.agents/skills/<name>/SKILL.md` in Codex or `.claude/skills/<name>/SKILL.md` in Claude Code; when same-name personal or plugin skills exist, read the local file explicitly and do not combine versions. Codex uses `$skill-name`; Claude Code uses `/skill-name`. Once selected, follow the skill's procedure and confirmation gates. Project invariants and safety rules take precedence over code-minimalism heuristics. Provenance and maintenance: [AI workflow](docs/operations/ai-workflow.md).

- **Orchestration (explicit requests only):** `engineering-workflow` coordinates planning, fresh independent review, verification, bounded corrections and human approval. Never auto-trigger it or let it commit, push or activate cron/providers.
- **Planning:** inspect first. For T2, or T1 with unresolved product decisions, use `grilling` for consequential open choices: focused questions with recommendations, approval before implementing. When the user asks for a single approval, list open decisions with recommendations instead of interviewing round by round. Skip it for trivial or well-specified work.
- **Implementation:** `ponytail` for T1/T2 code: reuse existing patterns, smallest complete change, check affected callers, focused tests for meaningful logic.
- **Debugging:** `systematic-debugging` for non-trivial, recurring or unexplained failures: reproduce, gather evidence, test hypotheses, verify with a regression. Skip it when the cause is established.
- **PostgreSQL:** `supabase-postgres-best-practices` for schema, migrations, queries, indexes, transactions, locks, connections or performance. Read only relevant references; never assume Supabase infrastructure. Neon and the invariants above take precedence.
- **Review:** T1/T2 changes get `ponytail-review` of the complete affected flow. T2 and CI or guard changes also need an independent reviewer: run `codex-review` (Codex, read-only, against `origin/main`; it covers designs too and falls back to a fresh read-only subagent). Give the reviewer the brief, acceptance criteria and diff, not your conclusions. Changes touching auth, user ownership, cron auth or secrets also get Claude Code's `/security-review`. Report findings before fixing them; a review changes no code.
- **Audit:** `ponytail-audit` only for explicit whole-repository or major-subsystem audits.

## Frontend skills

- Read [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) before UI, page or styling work and use its tokens, frames, typography and copy voice. No linear-gradient backgrounds unless requested or necessary.
- `frontend-design` sets visual direction when building new UI or reshaping existing UI; skip it for small fixes. Its output stays within `DESIGN_SYSTEM.md` conventions.
- `vercel-react-best-practices` for T1/T2 React/Next.js behavior, data fetching, rendering or performance work; read only the `rules/` files the task needs. Skip it for copy or styling-only changes. Next.js 16 APIs may differ from training data: check `node_modules/next/dist/docs/`.
- Browser verification: when the host has a browser tool (`agent-browser` or the desktop app's built-in browser), check user-facing interaction or layout against `pnpm dev` on localhost with isolated data. Otherwise report browser verification as NOT RUN. Never run browser mutations against production.

## Windows shell (Command Prompt)

Use `cmd.exe` for terminal commands on Windows. Chain commands with `&&`; set environment variables with `set VAR=value`. Use PowerShell only when explicitly requested. Preserve `.cursor/rules/windows-cmd-shell.mdc` and `.vscode/settings.json`, including the `cmd.exe` automation profile; see [local development](docs/operations/local-development.md#windows-editor-shell). Commands in skills are written to run in both Command Prompt and a POSIX shell.

## Git and PRs

- One branch per task from freshly fetched `origin/main`, without upstream tracking so a bare `git push` cannot target `main`: `git fetch origin`, then `git worktree add --no-track -b <type>/<slug> .tmp/<slug>/worktree origin/main` (or use a worktree the host creates in `.claude/worktrees/`). Types: `feat/`, `fix/`, `chore/`, `docs/`; the slug does not repeat the type. If the branch or worktree already exists, choose a new slug unless resuming that task. Never commit to `main`.
- Commit locally on the task branch when a checkpoint passes its checks, using Conventional Commits. A user instruction not to commit overrides this, and `engineering-workflow` runs keep their own no-automatic-commit rule.
- Prepare and open PRs with the local `ship-pr` skill. Push, PR creation and merge need explicit user authorization in the session. Merging is always the human's decision: squash merge after required checks pass.
- Fill the PR description from the [template](.github/pull_request_template.md), including the **review guide** (what to read carefully, what is mechanical, where you are least confident, any removed or weakened tests). Evidence lives there, not in `docs/`.
- CI's _Review signals_ job labels PRs touching T2 paths `t2-area` (the label wins over a smaller claimed size) and PRs changing CI, guard scripts or the test-database ownership guard `guard-change` (independent review, no T2 reading). It fails when a changed test file contains a focused, skipped or todo test other than the `skip: !<condition> && '<reason>'` env gate or a `// allow-skip: <reason>` comment; every newly allowed skip is listed for human approval. Never weaken a test to make a check pass.
- Hosted CI counts only for the exact head SHA, read from the run (for example `gh pr checks`); before a push it is NOT RUN.
- Existing migrations are append-only: CI (`scripts/check-migration-history.mjs`) rejects PRs that modify, rename or delete an existing SQL migration or snapshot in `drizzle/`, or change, remove or reorder an existing journal entry. Generate a new migration only after rebasing onto the latest `main`; its journal entry needs a `when` greater than every existing entry (the drizzle migrator silently skips older ones; CI checks this). Rebase again if another PR adds a migration first.

## Finish

Run the checks your task size requires. Assess whether architecture, routes/APIs, env vars, schema, auth, cron, operations or user-visible behavior changed; update the owning document and its index when needed, and skip churn for incidental details. Report changed files, exact commands with PASS / FAIL / NOT RUN and counts, unverified boundaries, temporary files, assumptions and next steps. Commit, push and PRs follow [Git and PRs](#git-and-prs).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
