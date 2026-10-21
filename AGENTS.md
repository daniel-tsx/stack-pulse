# Agent guide — StackPulse

**Status:** current

## Start here and source of truth

1. Confirm the repository/working directory and inspect `git status`. Preserve unrelated work.
2. Read [README.md](README.md), [docs/AGENT_START_HERE.md](docs/AGENT_START_HERE.md), applicable nested `AGENTS.md`/`CLAUDE.md`, and the task's owning documents before non-trivial work.
3. Inspect existing implementations, callers, package scripts and configuration. Code/configuration establish current behavior; docs provide intent. Surface disagreements rather than silently trusting stale prose.
4. State assumptions and a short plan with verifiable outcomes for multi-step work. Discover facts independently; ask only about consequential unresolved decisions. Skip heavy planning for trivial, sufficiently specified tasks.

This file owns shared repository rules and skill routing. [AI workflow](docs/operations/ai-workflow.md) owns skill maintenance and compatibility checks; [verification](docs/operations/verification.md) owns commands and service isolation. `CLAUDE.md` imports this guide with `@AGENTS.md`. Cursor uses this guide and the existing `.cursor/rules/`; do not duplicate the whole workflow there.

## Project boundaries

- Next.js 16 App Router / React 19; pnpm is pinned in `package.json`. Use existing tooling and conventions.
- PostgreSQL on Neon through Drizzle's **neon-http** adapter. A local PostgreSQL URL does not make the production HTTP driver work over TCP. Local SQL tests use an explicit test transport; hosted Neon behavior is a separate boundary.
- GitHub-only Better Auth; preserve server-side sessions, ownership checks, origin validation and safe return paths. No billing: do not reintroduce removed Lemon Squeezy behavior without an explicit task.
- Release ingestion scans registry stacks plus followed custom repositories. Preserve deduplication, bounded retries, run finalization and recovery from unknown writes.
- OpenRouter inference can spend money; Resend and Slack/Discord can send real notifications. Do not start cron, seed/backfill, workers or live provider calls as a verification shortcut.
- Agent Skill Updates has separate ingestion/model settings and approval-gated hosted verification. Preserve lease fencing, durable checkpoints, [its staging gates](docs/operations/skill-staging-verification.md), disabled cron registration, budget limits and rollout sequence.
- Preserve the architecture, domain contracts and additive migration history. Do not replace reviewed migrations with schema push or regenerate old snapshots to fix a task.

## Engineering and autonomous execution

- Make the smallest complete, correct change. Every changed line should serve the request. No speculative features, abstractions, unrelated refactors, formatting or cleanup of pre-existing dead code.
- Reuse existing utilities, dependencies and platform capabilities. Match neighboring patterns. Remove imports/functions made unused by your own change; preserve validation, error handling, security, accessibility and meaningful edge cases.
- Check affected callers, integrations, fixtures and tests before editing shared behavior. For a bug, verify the cause and reproduce it where practical; use a focused regression for meaningful behavior.
- Inspect current official documentation when implementing new or unfamiliar APIs. Review relevant package upgrades when needed; do not upgrade unrelated dependencies as incidental cleanup. Prefer pnpm for new projects.
- Resolve routine reversible choices independently. Ask before implementing unresolved high-risk decisions; already-approved decisions do not need another interview.
- Never expose or commit secrets. No production data changes/migrations, cloud-connected tests, paid inference, real notifications, deployment, commit or push without explicit session authorization. Never use an unverified `.env` database as a test fallback.
- Use disposable, test-owned resources for destructive tests. Clean up only this run's resources. Do not change global/user agent settings, install lifecycle hooks/plugins, or create skill symlinks/junctions.
- Do not fabricate product claims, metrics, users or verification results. Distinguish implemented, inspected, tested and externally verified evidence.

## Conditional skill routing

Load the repository-local `.agents/skills/<name>/SKILL.md` in Codex or `.claude/skills/<name>/SKILL.md` in Claude Code. When same-name personal/plugin skills exist, explicitly read the local file; do not combine competing versions. Select skills by task relevance and explicit user requests. Upstream "always" or session-wide wording must not activate unrelated skills. Once selected, follow the relevant procedure and confirmation gates. Prefer one primary skill per activity and load supporting references only as needed.

| Activity | Routing |
| --- | --- |
| Planning | Use `grilling` for consequential unresolved requirements, architecture trade-offs or high-risk design choices. Inspect first, discover facts independently, separate approved choices from open ones, ask focused questions with recommendations, and respect its confirmation gate before implementation. Skip it for trivial or well-specified work. `grill-me` is explicit-only and delegates to `grilling`. |
| Implementation | Apply `ponytail` to meaningful code changes: reuse existing patterns and deliver the smallest complete solution, preserving project/domain safety and affected integrations. |
| Debugging | Use `systematic-debugging` for non-trivial bugs, recurring/intermittent failures and unexplained tests: evidence, hypotheses, root cause and regression verification. Skip the full process for isolated fixes with an established cause. |
| PostgreSQL | Use `supabase-postgres-best-practices` for schema/migrations, queries/indexes, transactions/locks/concurrency, connections, performance or database security. Read relevant references only. Do not assume Supabase infrastructure; Neon architecture and project safety take precedence. |
| Review | For non-trivial changes, apply `ponytail-review` with the existing `eastbase-review-pr` overlay. Trace affected callers/integrations, correctness, regressions, concurrency, security, tests, performance and unnecessary complexity. Prefer an independent or isolated context when available. Report findings before applying fixes; a review itself changes no code. Avoid redundant passes. |
| Audit | Use `ponytail-audit` for explicit whole-codebase or major subsystem audits, never automatically for each feature. |

Retain specialized environment-provided skills when available: `eastbase-premium-ui` before user-facing UI work, `eastbase-review-pr` for product/auth/AI-cost/data/UX risk, and `eastbase-launch-check` only when a launch/go-live check is wanted. Launch checks return a verdict with blockers and follow-ups; ordinary implementation does not trigger them. These overlays complement general engineering skills. If a required specialized skill is unavailable, report the gap and inspect relevant owning docs; do not claim the gate passed.

For React/Next.js behavior, data fetching, rendering, refactoring and performance work, conditionally use available `vercel-react-best-practices`. Use available `agent-browser` when actual browser interaction provides meaningful UI evidence, with isolated data. Do not automatically install/vendor either optional capability. Skip browser work for irrelevant backend/documentation tasks and report material verification gaps.

## Windows shell (Command Prompt)

Use `cmd.exe` for terminal commands on Windows. Chain necessary commands with `&&`; use `set VAR=value` for environment variables. Only use PowerShell when explicitly requested. Preserve `.cursor/rules/windows-cmd-shell.mdc` and `.vscode/settings.json`, including the `cmd.exe` automation profile. Editor shell setup and known Cursor limitations are documented in [local development](docs/operations/local-development.md#windows-editor-shell).

## UI and documentation

- For UI/pages/styling, read [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md), follow project tokens/layout patterns, and prefer design-system colors. No linear-gradient background unless requested or necessary.
- Treat documentation as working memory, verified against implementation. Update owning docs for durable changes to architecture, routes/APIs, env vars, schema/migrations, auth/security, operations/testing/deployment or user-visible behavior.
- Avoid documentation churn for tiny refactors, incidental implementation details or temporary debugging. Prefer one current source of truth per topic and preserve architecture records/navigation indexes.
- Every new/edited doc needs a status: `current`, `planned`, `shipped`, `historical` or `superseded`. Move completed plans/stale reviews to `docs/archive/`. Record valuable lessons in existing owning docs; do not create a parallel casebook by default.

## Risk-based verification and Definition of Done

Select checks by affected risk using [verification](docs/operations/verification.md#risk-based-verification). Documentation, styling and pure logic need proportionate static/unit/browser checks, not containers. Migrations, PostgreSQL constraints/locking/persistence/concurrency and infrastructure boundaries need application-level tests against real isolated services; use Docker where suitable or the existing verified native cluster. Mocks and a healthy container do not prove integration.

If Docker or another required isolated environment is unavailable, mark affected checks **NOT RUN**, explain the missing evidence, and continue safe unrelated work. Do not bypass restrictions or declare unverified integration production-ready. No global Docker prune, unknown/shared volumes, production secrets, developer-project teardown or live provider consumers. Follow the detailed [Docker safety policy](docs/operations/verification.md#safe-docker-execution).

Before declaring meaningful work done:

- Requirements and domain/safety invariants hold; affected callers/integrations were reviewed.
- Relevant checks ran with fresh evidence; real-service gaps and skipped/zero tests are explicit. For meaningful changes, run relevant tests plus `pnpm typecheck` and `pnpm lint`, or explain omissions.
- Blocking review findings are resolved; `eastbase-review-pr` complements `ponytail-review` before completion.
- Documentation impact was assessed, owning docs/indexes updated when needed, and edited links/statuses checked.
- Temporary resources were safely cleaned up, or cleanup failure and exact run identity reported.
- Completion reports changes, exact commands, **PASS / FAIL / NOT RUN**, counts where available, environment/cleanup limits, unresolved assumptions/risks and next steps. A CI configuration or previous-session result is not fresh passing evidence; installation/discovery is not proof of model activation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
