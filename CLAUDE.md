# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Additional Rules

- Always check the latest documentation when implementing new features and upgrade packages when newer versions are available.
- Prefer pnpm as the package manager for new projects.
- Always review existing implementations in the project to ensure consistent patterns across the app.
- Write clean code following best practices and optimize for performance.
- Don't use linear gradient background unless I tell you or it's a really necessary case
- Prefer to use color on project's design system over custom color

## Windows shell (Command Prompt)

**Prefer `cmd.exe` for all terminal commands on Windows** — not PowerShell.

| Do (cmd) | Don't (PowerShell) |
| --- | --- |
| `cmd /c "cd /d path && pnpm test"` | `cd path; pnpm test` |
| `set FOO=bar && command` | `$env:FOO = "bar"; command` |
| Chain with `&&` | Chain with `;` or pipelines when unnecessary |

Only use PowerShell when the user explicitly requests it.

**Important:** This file guides command *syntax*. Cursor may still spawn PowerShell for the agent shell on Windows. To change that, see **Cursor shell setup** below and `.vscode/settings.json` in this repo.

### Cursor shell setup (Windows)

1. **Workspace** — this repo includes `.vscode/settings.json` with `terminal.integrated.automationProfile.windows` → `cmd.exe`.
2. **User settings** — in `%APPDATA%\Cursor\User\settings.json`, add the same `automationProfile` (your `defaultProfile` alone does not control the agent):
   ```json
   "terminal.integrated.automationProfile.windows": {
     "path": "C:\\Windows\\System32\\cmd.exe"
   }
   ```
3. **Cursor Settings** — enable **Legacy Terminal Tool** (`Ctrl+Shift+J` → Agents; exact menu label varies by version), then restart Cursor and run **Terminal: Kill All Terminals**.
4. **Optional user setting** (forum-reported, not official docs): `"cursor.useLegacyTerminalTool": true`
5. **Project rule** — `.cursor/rules/windows-cmd-shell.mdc` reinforces cmd syntax every session.

If commands still run in PowerShell, that is a known Cursor Windows limitation; keep using cmd-compatible syntax anyway.

## Documentation as Working Memory

Use docs as durable project memory, but verify against code before acting.

- Before starting non-trivial work, read `README.md`, `docs/AGENT_START_HERE.md` if present, and any feature doc directly related to the task.
- For UI, pages, or styling changes, also read `docs/DESIGN_SYSTEM.md` for layout patterns and tokens.
- Treat docs as guidance, not absolute truth. If docs and code disagree, trust the code, surface the mismatch, and update the doc only if the task changes durable behavior.
- Update docs when changing architecture, routes/APIs, environment variables, database schema, billing/auth/security behavior, testing commands, or user-visible feature behavior.
- Do not update docs for incidental implementation details, temporary debugging, tiny refactors, or changes that are already obvious from code/tests.
- Every new or edited doc should make its status clear: `current`, `planned`, `shipped`, `historical`, or `superseded`.
- Prefer one current source-of-truth doc per feature. Move completed plans and stale reviews to `docs/archive/` instead of leaving them beside current operational docs.

## Reviewing changes

When reviewing a PR, diff, branch, or an agent's changes in this repo — and before
declaring any non-trivial change done — apply the `eastbase-review-pr` skill as an overlay
on your normal review: check Eastbase product, auth, billing, AI-cost, data-safety, and UX
risk, not just code cleanliness. Read it via the Skill tool. It is a review overlay only —
it does not change how you implement.

## Launch readiness

When preparing to launch, publish, announce, sell, or meaningfully update this product —
and before you call it ready to ship — apply the `eastbase-launch-check` skill as a pre-launch
readiness gate: check the core flow, auth, billing/entitlement, env/deploy, public claims,
and AI cost, and return a launch verdict with blockers vs follow-ups, not just a thumbs-up.
Read it via the Skill tool. It is a readiness gate, not a security or legal audit — run it
only when a launch / go-live check is wanted, not for ordinary implementation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
