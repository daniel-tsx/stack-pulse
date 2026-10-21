# Claude entry point

**Status:** current

@AGENTS.md

Shared rules and skill routing live in `AGENTS.md`. Read [docs/AGENT_START_HERE.md](docs/AGENT_START_HERE.md) and the task's owning docs before non-trivial work. Use the repository-local `.claude/skills/` copies for the seven standard skills.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
