<!-- Agents and humans: fill every section. Write "n/a" rather than deleting one. -->

## What and why

<!-- One or two sentences. Link the issue or decision if there is one. -->

## Review guide

<!-- Where the human reviewer should spend attention:
- Read carefully: files/functions that carry the risk, and why.
- Skim: mechanical changes (renames, formatting, generated code, fixtures).
- Least confident about: …
- Tests removed, weakened or skipped: list each with the reason, or "none". -->

## Task size

<!-- T0 / T1 / T2 (see AGENTS.md#task-size). For T2, name each AGENTS.md invariant touched and its transaction, lease or provider boundary. -->

## Checks

<!-- One line per planned check: PASS / FAIL / NOT RUN, the command, scope and counts. Local runs are not hosted CI. -->

| Result | Command | Scope / notes |
| ------ | ------- | ------------- |
|        |         |               |

## Unverified boundaries

<!-- What this change could affect that no executed check covers (e.g. hosted Neon HTTP, GitHub OAuth, OpenRouter, Resend/webhook delivery, browser). -->

## Review

<!-- T1: self-review with ponytail-review. T2 or CI/guard change: independent reviewer (codex-review or its fallback, reviewed SHA) and a summary of findings and their disposition; /security-review for auth, ownership, cron auth or secrets. engineering-workflow runs: task slug and final verdict. -->

## Docs and temporary files

<!-- Owning documents updated, or why none needed. What remains under .tmp/<task-slug>/ (kept until merge or rejection), or "none". Architecture decision records consulted (T2), or "none applies". -->
