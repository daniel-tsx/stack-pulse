# AI engineering workflow

**Status:** current · setup inspected 2026-10-21

[AGENTS.md](../../AGENTS.md) owns shared rules and conditional routing. [CLAUDE.md](../../CLAUDE.md) imports it with `@AGENTS.md`; Cursor retains its existing project instructions and shell rule. [Verification](verification.md) owns check selection, commands and service isolation. This setup changes engineering infrastructure, not StackPulse application behavior.

## Work loop

1. Inspect Git status, [agent start here](../AGENT_START_HERE.md), relevant owning docs, code and callers. Preserve unrelated work.
2. Define the outcome, assumptions, affected boundaries and proportionate verification. Use Grilling only for consequential unresolved decisions; approved implementation does not need another interview.
3. Make the smallest complete change with existing patterns. Preserve auth/ownership, ingestion recovery, data and AI-cost safeguards.
4. Run relevant checks and review the complete affected flow. Ponytail Review supplies engineering review; the existing Eastbase overlay supplies product/data/AI-cost/UX review. Report findings before review fixes. Full audits and launch gates remain conditional.
5. Update owning docs for durable changes; report fresh PASS / FAIL / NOT RUN evidence, skips, limitations, cleanup and next steps. Installation, discovery and actual activation are separate claims.

## Pinned skill packages

All seven complete packages were copied from [Fintech Lab at `95757b737fbbf3b88cdab2dc4fb16572555b0f31`](https://github.com/daniel-tsx/fintech/tree/95757b737fbbf3b88cdab2dc4fb16572555b0f31/.agents/skills), not from current upstream HEAD or personal installations. The reference's directory trees were checked against its manifest: 61 canonical files, including seven MIT licenses. PostgreSQL guidance is included because StackPulse uses Neon PostgreSQL; it does not imply Supabase infrastructure.

| Skills | Reviewed upstream source revision |
| --- | --- |
| `ponytail`, `ponytail-review`, `ponytail-audit` | [DietrichGebert/ponytail · `09c434ab73ca43761c5d8b0c5d341926c2fba710`](https://github.com/DietrichGebert/ponytail/tree/09c434ab73ca43761c5d8b0c5d341926c2fba710/skills) |
| `grill-me`, `grilling` | [mattpocock/skills · `5beb35b040e3de97e54fa9e386d7e42d15c295c2`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity) |
| `systematic-debugging` | [obra/superpowers · `bb92a77741419a4ab5f06e711a283343f1ada0c3`](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3/skills/systematic-debugging) |
| `supabase-postgres-best-practices` | [supabase/agent-skills · `c9be0e931b7930f7d02126d04774d904c381e7d7`](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) |

[`.agents/skill-sources.json`](../../.agents/skill-sources.json) preserves the reference's upstream revisions, tree IDs, attribution, adaptations and SHA-256 hashes (UTF-8 with LF line endings). Its `reference` records the migration source; `installedFrom` identifies the actual pinned reference copy. Upstream tree IDs describe upstream packages, not locally adapted trees. Skill licenses apply to those vendored packages; application licensing is unchanged.

Canonical sources are real files in `.agents/skills/`; `.claude/skills/` contains generated real copies. No junctions, symlinks, hooks, plugins, framework or global settings are installed. Preserve the reference's adaptations:

- Codex `grill-me` reads `../grilling/SKILL.md`; Claude's generated copy restores `Call the Skill tool with "grilling".` Its `disable-model-invocation: true` frontmatter and `agents/openai.yaml` policy retain explicit-only invocation. Grilling's confirmation gates remain intact.
- Systematic Debugging retains its investigation procedure and references, with narrower activation and references to repository testing rather than requiring extra Superpowers skills. Its optional `find-polluter.sh` needs Bash; it is not automatically executed on Windows.
- PostgreSQL discovery is narrowed; its body and references remain as reviewed. Load only relevant references.

## Maintenance

Run from the repository root; Node alone is sufficient:

```bat
node scripts/sync-agent-skills.mjs
node scripts/sync-agent-skills.mjs --check
node --test tests/agent-skills-sync.test.mjs
```

With application tooling installed, `pnpm test:agent-workflow` runs the same regression tests. The dependency-free synchronizer validates all managed packages and hashes before any target writes. It rejects unsafe paths, duplicate names, links, missing source resources and unexpected files inside a managed target package. It repairs missing/stale target copies, normalizes CRLF for comparison, and preserves unrelated custom skills and Claude settings. `--check` is read-only; neither mode fetches upstream or removes files. ESLint and Prettier exclude only the two vendored skill trees so upstream examples/content are not treated as application code or reformatted; their integrity gate remains the hash check.

For a deliberate source update, retrieve the approved revision from the official source, review the complete package/adaptations/license, and update only truthful provenance and computed hashes. Edit canonical files, never generated copies; then synchronize, run integrity/regression checks, validate YAML/frontmatter and review the diff. Do not automatically upgrade skills. A hash match proves recorded content, not safety or model behavior.

## Compatibility and duplicate names

[Codex discovers repository skills under `.agents/skills`](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills); duplicate names can appear together. [Claude Code resolves skills by scope](https://code.claude.com/docs/en/skills#resolve-skills-that-share-a-name), so a personal skill may win over a project skill. [Claude's `@path` import syntax](https://code.claude.com/docs/en/memory#import-additional-files) supports this shared `AGENTS.md` entry point. Hosts may cache discovery; use a fresh session after installation. These are documented capabilities, not evidence that this checkout's skills were activated.

On this machine, personal Codex and Claude skill directories both contain `ponytail`, `grilling`, `systematic-debugging` and `supabase-postgres-best-practices`. The session catalog also exposes plugin PostgreSQL variants. User/global settings remain unchanged. Explicitly read the repository-local path when a name collides; do not load multiple versions for one activity. The Eastbase review/launch/UI overlays and optional frontend/browser capabilities remain environment-provided, not vendored by this task.

In a fresh Codex session from this checkout, inspect the skill selector or app-server `skills/list` with `cwds` set to this repository and `forceReload: true`. Confirm seven repository paths and no loader errors. In Claude Code, inspect the `/` skill menu and resolved paths, then use `/memory` to confirm the imported `AGENTS.md`. The installed `claude --version` reports `2.1.114`; current docs may describe newer UI commands, so prefer the supported `/` menu and `/memory` checks. Do not change global configuration to hide duplicates as part of repository adoption.

## Read-only pilot prompts

Use fresh sessions and say: **"Read-only workflow check. Do not edit files, start services, call external providers or implement anything. Explain routing and the next required evidence."** Then append one case below. Inspect the actual skill path loaded; do not infer activation from the model merely naming a skill.

| Append this request | Expected behavior |
| --- | --- |
| "Plan durable retries for Skill Updates; lease expiry and unknown writes remain unresolved." | Inspect facts, then Grilling with recommendations and a confirmation gate before implementation. |
| "Describe how you would implement this agreed change: improve the offline fixture assertion; acceptance criteria are specified." | Ponytail; no redundant interview; focused checks and eventual review. |
| "Investigate an intermittent cron test failure whose cause is unknown." | Systematic Debugging: reproduce, gather evidence and test hypotheses before a fix. |
| "Review a PostgreSQL index and lock order for skill lease acquisition." | PostgreSQL skill, relevant references and real isolated SQL evidence; no Supabase assumptions. |
| "Review the workflow diff and affected callers." | Ponytail Review plus Eastbase review overlay; report findings without edits. |
| "Audit the full release-ingestion subsystem." | Ponytail Audit for the requested audit scope; report without fixes. |
| "Correct one spelling error in this documentation." | Proportionate direct work; no heavy interview, audit or Docker. |
| "Verify a changed vote button's browser behavior." | Relevant browser/frontend capabilities if available; isolated data and honest gaps. |
| "Verify a migration changing uniqueness and concurrent writes." | Real isolated PostgreSQL application tests; Docker only when suitable, or existing owned native setup. |
| "Docker is unavailable for the required integration check." | NOT RUN with missing evidence, no false PASS or safety bypass. |
| Explicit `$grill-me` in Codex or `/grill-me` in Claude | Local explicit entry point delegates to Grilling; preserve the interview's final confirmation gate. |

File/metadata validation and discovery are distinct from this interactive behavioral pilot. Do not run paid model sessions or a synthetic application change merely to claim compatibility.

## CI and intentional differences from the reference

There was no `.github/workflows/` CI configuration in this checkout. [The new workflow](../../.github/workflows/ci.yml) runs the skill integrity check and its regression tests on Windows and Linux using Node 24, before any application dependency installation (none is needed). It uses `contents: read` and disables checkout credential persistence. It does not deploy, access secrets, run migrations or claim application CI coverage. Hosted execution remains unverified until GitHub runs it.

Unlike Fintech Lab, StackPulse has no development Compose stack or generic integration runner. Existing Node SQL tests already enforce isolation, and the skill suites require a workspace-owned native cluster proof that container paths do not satisfy. This migration adds no Compose stack or runner and changes no test guards, application driver, dependency versions or deployment configuration. [Verification](verification.md#risk-based-verification) documents the real SQL/HTTP/hosted boundaries and the requirements for a future Docker runner.

## Setup verification · 2026-10-21

| Check | Evidence |
| --- | --- |
| `node scripts/sync-agent-skills.mjs` and `node scripts/sync-agent-skills.mjs --check` | PASS: seven packages, 61 files per host; canonical hashes match the pinned reference manifest. Claude differs only in the recorded Grill Me delegate. |
| `pnpm test:agent-workflow` / `node --test tests/agent-skills-sync.test.mjs` | PASS: nine tests, zero failed/skipped. Fresh sync, CRLF checkout, drift/missing-file repair, tampering, preflight before writes, unexpected-file preservation, custom settings/skills and unsafe paths/arguments are covered. Temporary fixtures are removed by test teardown. |
| `node --check scripts/sync-agent-skills.mjs` and `node --check tests/agent-skills-sync.test.mjs` | PASS: Node syntax checks. |
| `pnpm typecheck`, `pnpm lint`, `pnpm test:cron` | PASS: static checks plus 118 mocked cron tests, zero failed/skipped; no live provider or SQL claims. |
| `node node_modules/prettier/bin/prettier.cjs --check scripts/sync-agent-skills.mjs tests/agent-skills-sync.test.mjs .github/workflows/ci.yml package.json eslint.config.mjs` | PASS: authored script/test/CI configuration style. Vendored content is excluded, not rewritten. |
| `node node_modules/.cache/agent-workflow-inspect.mjs` and `node node_modules/.cache/agent-workflow-links.mjs` (one-off probes) | PASS: parsed 14 skill frontmatters and four host metadata files with the installed YAML parser, checked names/descriptions/explicit-only flags, and parsed CI YAML. Both Next.js blocks match the original; the Claude import is present. No skill links/junctions; statuses and 97 local links/anchors across eight edited instruction/docs files passed. Link rejection in the synchronizer is inspected, not tested by creating a symlink. |
| Codex discovery via `node node_modules/.cache/agent-workflow-inspect.mjs` (one-off probe) | PASS: desktop binary `0.163.0-alpha.10.2`, app-server initialization and `skills/list` with `forceReload: true` returned seven enabled repository paths and no loader errors, plus four user duplicates. No thread/model turn was started. |
| `node node_modules/.cache/agent-workflow-claude-discovery.mjs` (one-off probe) | PASS: Claude `2.1.114` streaming control initialization returned all seven `(project)` commands plus four user duplicates, including explicit `grill-me`. Hooks and MCP were disabled for that process; no model prompt was sent. |
| `git diff --check` and `node node_modules/.cache/agent-workflow-final-check.mjs` (one-off probe) | PASS for tracked edits and authored new files. Per-file `git -c core.autocrlf=false diff --no-index --check -- /dev/null <path>` inspected all 127 new files. Original trailing whitespace in `references/_contributing.md` is preserved in both vendored PostgreSQL packages to retain pinned hashes. The pre-existing untracked `docs/architecture/portfolio/` is preserved; no temporary test fixture directories remain. |
| Hosted CI, Claude `/memory`, actual conditional model activation | NOT RUN: loader/static checks do not establish an interactive imported context or model compliance. Run the read-only pilot prompts above in fresh sessions and inspect resolved paths. |
| `pnpm build`, SQL/Docker/hosted integration and live providers | NOT RUN: this change affects workflow files only. A build can read unverified `.env` data; no application/service boundary changed to justify those calls. No containers, database fixtures or cloud resources were created. |

The initial sandboxed pnpm bootstrap could not resolve the registry, and the Codex loader probe timed out. The requested pinned pnpm 11.1.3 was then bootstrapped into the ignored workspace cache with approved network access; pnpm checks used the process-local prefix `set COREPACK_HOME=node_modules\.cache\workflow-corepack&&`. Read-only host discovery passed with approved host access. Global settings and dependency versions are unchanged. Local CLI discovery and tests establish readiness for a **read-only workflow pilot**, not completed behavioral validation or product launch readiness.

The generated one-off probes above live only in ignored workspace cache; they are setup evidence, not portable maintained commands. Use the fresh-session discovery/pilot instructions for future host validation. Self-review with Ponytail Review and the Eastbase overlay found no remaining blocking findings after correcting CRLF fixture comparison and excluding immutable vendored examples from app lint/formatting. Review assumes one local sync invocation or a CI job per checkout. Follow-ups are the actual model-routing/import pilot and the first hosted CI run; no application auth, data, AI spend or deployment flow changed.
