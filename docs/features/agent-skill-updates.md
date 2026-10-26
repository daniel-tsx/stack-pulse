# Agent skill updates

**Status:** current (implemented Phase 1; production rollout not performed)

StackPulse observes ten curated agent skill directories and publishes revision-based change intelligence. It does not install skills, discover arbitrary sources, infer installed versions, subscribe users, send notifications, or execute downloaded content. Release ingestion and its model default remain independent.

## Registry and source verification

`src/lib/skill-catalog.ts` is the explicit allowlist and source of descriptions/slugs. Identity is lowercase repository + case-sensitive normalized directory, enforced uniquely in PostgreSQL. Seeding is idempotent and preserves operational state and disabled tracking.

The requested paths were checked against GitHub directory listings on 2026-10-21:

| Slug                             | Repository               | Directory                               |
| -------------------------------- | ------------------------ | --------------------------------------- |
| ponytail                         | DietrichGebert/ponytail  | skills/ponytail                         |
| ponytail-review                  | DietrichGebert/ponytail  | skills/ponytail-review                  |
| grilling                         | mattpocock/skills        | skills/productivity/grilling            |
| grill-me                         | mattpocock/skills        | skills/productivity/grill-me            |
| systematic-debugging             | obra/superpowers         | skills/systematic-debugging             |
| test-driven-development          | obra/superpowers         | skills/test-driven-development          |
| supabase-postgres-best-practices | supabase/agent-skills    | skills/supabase-postgres-best-practices |
| vercel-react-best-practices      | vercel-labs/agent-skills | skills/react-best-practices             |
| web-design-guidelines            | vercel-labs/agent-skills | skills/web-design-guidelines            |
| skill-creator                    | anthropics/skills        | skills/skill-creator                    |

Verification sources: [Ponytail](https://github.com/DietrichGebert/ponytail/tree/main/skills), [Matt Pocock](https://github.com/mattpocock/skills/tree/main/skills/productivity), [Superpowers](https://github.com/obra/superpowers/tree/main/skills), [Supabase](https://github.com/supabase/agent-skills/tree/main/skills), [Vercel](https://github.com/vercel-labs/agent-skills/tree/main/skills), [Anthropic](https://github.com/anthropics/skills/tree/main/skills/skill-creator). Runtime checks resolve the current default branch; these main-branch links are verification references, not tracking checkpoints.

## Domain and ingestion

Additive migration `0010_tired_doctor_strange.sql` creates `agent_skills` (identity, baseline, last observed commit/tree, check state and lease) and `agent_skill_updates` (immutable before/after commit/tree references, evidence, pending analysis, validated report, telemetry). No existing tables or migration history are changed.

`GET /api/cron/fetch-skill-updates` requires the existing `CRON_SECRET`. Its planned schedule is 00:30 and 12:30 UTC, with a separate 270-second cooperative budget inside a 300-second function. Skill cron registration is currently absent from `vercel.json` until staging, migration and cron-enable approvals are complete. The endpoint never invokes the release cron or notification code. It returns sanitized counters and AI attempt statistics; Vercel logs record completion and categorized failures. There is no separate run-history table or addition to `/status` in Phase 1.

For each skill, an atomic six-minute database lease coordinates overlapping invocations. Mutable repository metadata and branch HEAD are fetched afresh **after acquiring that skill's lease**; a HEAD observed for an earlier skill cannot supply a later lease's checkpoint. This prevents an older invocation from replaying cached A after a newer invocation records B. A fresh GitHub observation may legitimately move B back to A after a branch rewrite/force-push; commit ancestry is not used as a freshness fence. All event/checkpoint writes and analysis writes check lease ownership. A SQL CTE locks the skill, inserts the transition, and advances the checkpoint in the same statement. A retried/uncertain response cannot silently advance past an absent event. Transition uniqueness is `(skill_id, previous_revision, new_revision)`. A new owner fences stale writers, including an HTTP response held beyond lease expiry; leases are not renewed and exceed the function's maximum lifetime. The fix adds no lock, lease extension or database round trip.

The first available directory containing a regular `SKILL.md` establishes a baseline and creates no update. Missing initial paths remain unbaselined. Later directory disappearance creates a deletion transition; reappearance creates another transition. Renaming a tracked directory does not silently retarget the allowlist. Check failures retain the last successful revision. UI distinguishes not checked, unchanged, change detected, missing path, failed check, pending/failed analysis, and complete analysis.

GitHub requests use the shared authentication, eight-second request timeout, one network/5xx retry, redirect guard and error classification. Only immutable SHA-addressed trees and blobs are memoized per invocation for shared repositories; repository metadata and branch HEAD responses are never reused between observations. Non-recursive ancestor trees resolve the exact subtree; unchanged hashes skip evidence and AI work. Changed skill trees are listed recursively, comparing immutable blob hashes and modes directly. Unrelated repository files are not fetched. Exact-blob moves are labeled renames; edited moves remain added/deleted pairs. Force-push comparisons do not depend on a merge base.

Tree JSON is capped at 2 MB/15,000 entries; truncated listings fail explicitly. Missing historical trees fail evidence collection and remain recoverable work. Evidence lists at most 100 changed files, prioritizing `SKILL.md`, then scripts for content. Text blobs over 16 KB, binary content, symlinks, and submodules are not read as instructions. Samples are capped at 4,000 characters per side and 24,000 source characters in total. Omitted content marks coverage incomplete. Immutable file links, modes and blob hashes are preserved where collected. A repository comparison link is provided as additional context and may include unrelated files or use a merge base.

References: [GitHub tree API and truncation](https://docs.github.com/en/rest/git/trees#get-a-tree).

Repository metadata uses the canonical `/repos/{owner}/{repo}` endpoint without a trailing slash. GitHub returns 404 for the slash-suffixed form even for an accessible public repository. The bounded JSON transport accepts the repository root as well as repository subresources; external URL rejection is preserved. A regression exercises observation through the actual transport with the slash-suffixed response rejected.

## Structured analyzer and trust

Phase B benchmark hardening preserves the existing report shape and ingestion/persistence contracts. Complete comparative source facts are separate from untested runtime implications: a contradictory model `insufficient_evidence` with verified complete source facts becomes conservative manual review, never an automatic update candidate. Missing/incomplete evidence or no verified facts still yields insufficient evidence. Isolated insertions/removals long enough for a quotation must cite their changed span; replacements and very short edits retain necessary context. Strict JSON Schema, Zod and human inference review remain required.

Skill telemetry may additionally contain bounded sanitized diagnostics (HTTP status, typed error code, parsed retry delay, request/generation identifiers, provider, routing attempt count and BYOK flag). Raw provider errors, request bodies and arbitrary metadata are excluded. SDK conversion may discard top-level error routing metadata; the evaluation fetch guard captures it before conversion. Retry counts, execution budgets, leases/checkpoints and stored report shape are unchanged. See [benchmark readiness](../audits/skill-phase-b-benchmark-readiness.md); no model/provider has been selected for production by offline verification.

`skill-analysis.ts` supplies a separate system prompt, strict JSON Schema and strict Zod contract. GitHub content is serialized only in the untrusted user message; no tools are exposed. Nothing is downloaded for installation or execution. UI renders text/quotes through React escaping, never source HTML or model-generated links.

Reports contain a summary; verified source changes; potential capability, behavior and security/operational findings; impact; recommendation; confidence; justification; and limitations. The model's `verifiedChanges` contract is now `{ path, change, beforeQuote, afterQuote }`, with nullable quotes and change categories `added`, `removed`, `modified`, `renamed`, `mode_changed`. Added/removed text must occur in the cited complete side and be absent from the opposite complete side; a modified text claim needs distinct before/after quotes satisfying both tests. Unchanged approval instructions or surrounding context cannot prove a removal, even if a typo elsewhere changed the file. Missing/omitted sides do not prove absence. Incomplete text samples cannot produce verified text findings. Rename and mode facts must match collected file metadata.

The server derives the displayed verified statements (for example, "Source text removed.") and public summary from validated source facts, instead of accepting model-written behavioral conclusions as verified changes. It derives public justification from the final recommendation policy. Free-form model summary/justification therefore cannot bypass citation checks in feed cards, metadata or the report. Stored reports keep the existing display fields and add comparative quote metadata; JSONB storage needs no migration. Model-written capability/behavior/security findings remain separate inferences. Each must cite a verified changed file and text absent from the opposite revision, or be anchored to an actual rename/mode change. This permits indirect implications from a changed trigger or script while rejecting unchanged context as sole evidence. Any inferred finding caps confidence at medium and requires `review_before_update`, regardless of which model-selected category contains it. Missing/incomplete comparative coverage or no verified findings forces `insufficient_evidence`, unknown impact and low confidence. A contradictory model insufficient assessment with complete verified source facts instead requires conservative review; it never becomes an automatic update candidate.

Mandatory script review examines **both** `path` and `previousPath`, plus both executable modes. A non-executable `scripts/check.sh` renamed into `references/check.sh` still requires review, as do moves into scripts, script additions/deletions, and executable-mode changes. Incomplete coverage remains an insufficient assessment rather than a low-risk recommendation.

These are conservative substring comparisons, not a semantic instruction interpreter or general-purpose diff engine. Ambiguous duplicated/moved text may be rejected rather than guessed. Comparative citations establish source changes, not the correctness of inferred behavior; a hypothesis citing a changed typo may still be semantically wrong, but cannot become a verified fact or an automatic low-risk recommendation. Human review remains necessary. Reports are advisory and do not claim environment testing or host compatibility without source evidence. Completed reports generated under the earlier validator are not rewritten automatically; use fresh staging data or review/reanalyze those reports separately before rollout.

`SKILL_UPDATES_MODEL` defaults to `deepseek/deepseek-v4-flash-0731`. `OPENROUTER_MODEL` stays `deepseek/deepseek-chat`. Requests retain `strict: true` and `provider.require_parameters: true`; unsupported routing fails instead of downgrading to free-form JSON. Output is capped at 3,000 tokens. Flash sends `reasoning.enabled: false`; Luna sends `reasoning.effort: none`. Both omit temperature. The shared AI execution context bounds retries to three SDK attempts, serializes requests, honors capped cooldowns and blocks authentication/credit failures. There is no expensive-model escalation.

Current endpoint metadata advertises structured outputs for [DeepSeek V4 Flash 0731](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints) and [GPT-6 Luna](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints); this is not a successful live schema benchmark. Routing checks remain enforced at request time. See [OpenRouter structured output requirements](https://openrouter.ai/docs/guides/features/structured-outputs).

Telemetry retains the requested model, latest returned model/provider, known input/output/reasoning tokens, known reported cost, unreported attempt count, duration and attempt count. Known billable responses are summed within a run; automatic cron attempts are retained in `telemetry.runs` (latest three). `partial_reported`/`unknown` cost is not a complete bill. Explicit manual resets can start another bounded retry cycle; use OpenRouter usage for complete lifetime billing, including requests terminated before persistence. No historical prices are hardcoded into application billing estimates.

## Recovery, preview and local operation

Use a verified isolated development database when running locally. Commands intentionally load `.env`; inspect its database target before any write. Never point verification commands at production by default.

```bat
pnpm db:generate
pnpm db:migrate
pnpm skills --seed
pnpm skills --preview
pnpm skills --ingest
pnpm skills --retry-failed
```

`--preview` and the authenticated endpoint's `?dryRun=1` read stored checkpoints and GitHub without leases, writes or AI calls. Preview does not seed the database. `--ingest` writes observations and analyzes at most four events, one per skill, per invocation. Source discovery still proceeds when this AI limit is reached. Oldest checked skills are visited first. A skill with pending historical work can still record a newer durable event.

Failures retain events and collected evidence. At most three cron analysis jobs per event run automatically, each with at most three SDK attempts; exhausted events stop spending until operator reset. After a hard interruption, the next acquired lease marks stale `analyzing` events failed, including exhausted final attempts. `--retry-failed` resets failed/stale analyzing work only when no active lease exists, locking eligible skill rows before reset. Fix the source/model/configuration cause before retrying; re-collect evidence manually only if the stored evidence itself is invalid. Historical content that remains inaccessible cannot be reconstructed.

Check the cron JSON/logs (`checked`, `baselines`, `detected`, `unchanged`, `analyzed`, `failed`, `skipped`, `deferred`, AI attempts/retries, elapsed time). Inspect failed rows by error category and pending age in the database. Do not log provider response bodies, source content, secrets or raw database exceptions.

## Public routes and cache

Signed-out users can read `/skills`, `/skills/[slug]` and `/skills/[slug]/updates/[updateId]`. Helpers use Cache Components with 60-second client staleness, five-minute revalidation and one-hour expiry. Pages include canonical metadata, shared theme controls, loading shells and source attribution. The existing proxy has narrowly scoped skill matchers: unknown slugs and mismatched/missing update IDs return the branded HTTP 404 before streaming starts. Prefetch skips this probe; HTML update requests add one indexed existence query. A table/query failure reaches the application's error boundary rather than masquerading as no updates. Histories and the recent feed show the latest 30 events; full historical pagination is outside Phase 1.

## Evaluation and cost controls

```bat
pnpm test:skills
pnpm skills:eval
set SKILL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test
set SKILL_TEST_TARGET_FILE=.env.skill-test-target.json
pnpm test:skills
set SKILL_TEST_TARGET_FILE=
set SKILL_TEST_DATABASE_URL=
```

The SQL suite requires a workspace-owned disposable loopback cluster whose filesystem and live server identity match an explicit ownership proof, creates a random schema, applies the actual migration, and drops only that schema. It does not load `.env` or fall back to `DATABASE_URL`. Tests cover identity constraints, deterministic seed, baseline, unchanged hashes, transition uniqueness, overlapping leases, transaction rollback, deletion/reappearance, stale fencing and interrupted-final-attempt recovery. Actual Neon SDK tests through a local HTTP bridge exercise cancellation and unknown-commit recovery; these are not hosted Neon results. A Drizzle journal rehearsal verifies the upgrade through `0010`, legacy fixture preservation and migration rerun. Offline tests cover file classes, shared requests, missing/truncated history, limits, injection boundaries, schema/citation rejection and public labels.

`skills:eval` runs six synthetic instruction/reference/script/metadata/deletion/insufficient-evidence contract fixtures without credentials or model calls. These results test the contract and conservative policy, not model quality. `pnpm skills:eval --plan-live` prints a zero-request budget. Live evaluation is approval-gated to one configured/reviewed model, six serial calls, one SDK attempt per fixture, 180 seconds and a fresh dedicated OpenRouter key with a $0.25 lifetime cap. It stops on the first failure or missing billing information. Exact prerequisites, token/price limits, commands and cleanup are maintained in the [staging verification runbook](../operations/skill-staging-verification.md).

```bat
pnpm skills:eval --plan-live
pnpm skills:verify:neon
```

The two benchmark candidates are `deepseek/deepseek-v4-flash-0731` on DigitalOcean and `openai/gpt-6-luna` on OpenAI standard tier, each requiring separate approval for six fixtures. Logs retain raw and normalized reports/recommendation diagnostics, the same four-item quality rubric, safe provider diagnostics, actual usage/cost and latency. Manually score behavior identification, false positives, unsupported assertions, evidence relevance and recommendation usefulness before accepting a report. Compute cost per accepted report as total known reported cost across successful and failed calls divided by human-accepted reports; flag unknown charges separately. No paid benchmark was performed during implementation and no release-model migration is recommended from offline contract tests alone.

With ten skills across six repositories, an unchanged poll uses roughly 43 GitHub calls before retries (20 fresh metadata/HEAD requests plus shared immutable directory/skill trees); two runs/day are roughly 86 calls/day. The freshness fix costs eight extra requests/poll compared with unsafe mutable caching across skills, while preserving all immutable-content sharing and unchanged-tree AI skips. Changes add up to two recursive subtree listings and bounded blob reads; identical blobs are memoized. Worst-case samples can require up to 200 blob requests per event, although the 24,000-character budget usually stops much earlier. Four jobs/run and three attempts/job cap AI dispatch at 12 attempts/run (24/day), with a 3,000-token output ceiling per attempt. GitHub and execution limits may defer work before those ceilings. Initial baselines and unchanged directories incur zero model cost.

Budget using current provider prices: `input_tokens × current_input_price + output_tokens × current_output_price`, adding retries and failed calls. For an illustrative 8,000 input / 3,000 output report, use `8000p + 3000q` USD at the selected endpoint; do not treat cached-token discounts as guaranteed. Storage is two small operational tables plus sampled evidence/reports per detected transition. Actual model quality, latency, acceptance rate and monthly spend remain unmeasured until opt-in evaluation/observation.

## Deployment checklist and limitations

1. Review additive migration `0010`, generated snapshot and journal; run the isolated SQL suite.
2. Operator applies `pnpm db:migrate` to the intended database, then `pnpm skills --seed`; confirm exactly ten identities. Do not use schema push.
3. Configure `SKILL_UPDATES_MODEL`, valid existing GitHub/OpenRouter credentials and `CRON_SECRET`; confirm the hosting plan supports the 300-second maximum. Inspect provider support and set account spending controls.
4. Follow the [staging and production sequence](../operations/skill-staging-verification.md): deploy code with the skill schedule absent, run an authenticated dry-run and controlled baseline ingestion, then enable the independent twice-daily schedule only after separate approval. Confirm baselines create zero reports and no notifications.
5. Observe failures, pending age, API consumption and billed model usage before expanding. Perform a source-backed report review before calling the product production-ready.

Rollback: disable only the new cron and tracking, and roll back application code. Leave the additive tables and pending events intact. No destructive rollback migration is supplied.

To add a skill later, manually review its repository/path, add one explicit catalog entry, seed, test, and baseline it. Phase 1's acceptance registry remains exactly ten; expansion requires a separate reviewed change. Shared files outside a tracked directory, edited rename heuristics, every intermediate commit, user installation state, notifications and automatic upgrades are not monitored. Prompt injection resistance is structural but cannot prove that every model interpretation is correct.

## Initial MVP verification record · 2026-10-21 (historical)

| Check                                                        | Actual outcome                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`, `pnpm typecheck`                                | Passed                                                                                                                                                                                                         |
| `pnpm test:skills`, isolated `SKILL_TEST_DATABASE_URL` set   | 23 passed, including six real PostgreSQL integration tests                                                                                                                                                     |
| `pnpm test:cron`                                             | 118 passed                                                                                                                                                                                                     |
| `pnpm test:theme`                                            | 10 passed                                                                                                                                                                                                      |
| `pnpm test:votes`, isolated `VOTE_TEST_DATABASE_URL` set     | 19 passed; one optional pre-existing HTTP test skipped                                                                                                                                                         |
| `pnpm skills:eval`                                           | Six offline contract fixtures passed; no live model quality measurement                                                                                                                                        |
| `pnpm db:generate` after final schema                        | No additional schema changes; snapshot matches migration                                                                                                                                                       |
| Actual `next build` through ignored isolated runtime harness | Passed, all 44 pages generated; configured remote database was blocked                                                                                                                                         |
| Next.js `/_next/mcp` compilation/error probes                | No compilation, configuration or browser/session errors                                                                                                                                                        |
| Browser + HTTP smoke                                         | Public index/history/report access, canonical metadata, pending/failed/complete states, escaped injection text, revision-correct rename URL, unknown/mismatched HTTP 404 and unauthenticated cron 401 verified |
| Mobile theme/accessibility                                   | 390px Dark and Light directory inspected; Light report has no horizontal overflow and axe reports zero WCAG A/AA violations after fixing an inline-link underline                                              |
| `git diff --check`                                           | Passed                                                                                                                                                                                                         |

All SQL and runtime data verification used a disposable loopback PostgreSQL 18 database. Runtime tests used a test-only Neon HTTP transport shim; this is not a live Neon service test. The first empty-database build required adding an existing stack fixture for its `generateStaticParams`, then passed. Real OAuth, deployed Vercel Cron behavior, paid OpenRouter responses and production migrations were not exercised.

Two independent review passes covered ingestion/data integrity and public/operations risk. Resolved findings: exhausted interrupted analysis recovery; locking manual resets against concurrent lease acquisition; retry cost retention; rename citation links; failed-evaluation telemetry. Runtime checks additionally fixed streamed soft-404s and color-only inline evidence links. No blocking findings remained in targeted rereviews.

Changed areas: the two-table schema and `0010` SQL/snapshot/journal; `skill-catalog`, `skill-github`, `skill-store`, `skill-ingestion`, `skill-analysis`, `skill-types` and public query helpers; dedicated cron route/schedule; public skill pages/shared UI, navigation/sitemap and scoped proxy; CLI/evaluation scripts and fixtures/tests; env, README and existing doc indexes. Shared release changes are limited to exporting the existing OpenRouter client and adding a bounded GitHub JSON helper. No new runtime dependency, production write, deployment, commit or push was performed.

## Review-fix verification record · 2026-10-21 (current)

A subsequent independent review identified three defects that the initial tests missed. All three were reproduced with failing deterministic regressions before correction:

| Finding                          | Root cause                                                                                   | Correction                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 stale snapshot reversal       | Repository metadata/HEAD were cached across different per-skill leases within one invocation | Fetch both mutable values after each skill's lease acquisition; retain SHA tree/blob caching and existing atomic/token-checked persistence           |
| P2 unsupported verified behavior | A quote's presence in one revision was treated as proof of a change                          | Comparative, complete-side text checks; server-derived verified facts, summary and justification; inferred claims remain separate and require review |
| P2 renamed script bypass         | Mandatory script review inspected only the current path                                      | Inspect both current/previous paths and executable modes; preserve conservative addition/deletion handling                                           |

The actual ingestion + GitHub transport/detector path is tested with deterministic HTTP responses, first using in-memory persistence and then the production Drizzle store against isolated PostgreSQL. An older run observes A on its first skill and pauses before leasing a second skill; a newer run checkpoints B; resuming the older run must leave B intact with exactly two real A → B transitions and no false B → A. A fresh default-branch rewrite to A is separately accepted. Another SQL scenario holds an A HEAD response beyond lease expiration, lets the new owner persist B, then resumes the obsolete owner and confirms B survives. Existing interruption, lost-owner, atomic rollback and retry tests remain in the suite.

Evidence regressions cover typo-only changes with unchanged approvals, genuine approval removal, added/modified triggers, unchanged surrounding context, missing/truncated evidence, schema-valid fabricated AI conclusions, both script rename directions, script additions/deletions and executable modes. The fresh reviewer also found two alternative routes around the initial correction: free-form summary/justification and moving an inference into a different category. Both are now covered by regressions and fixed by server-derived public prose and category-independent manual review.

| Verification                                                                                                 | Outcome                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                                                  | PASS                                                                                                                                   |
| `pnpm typecheck`                                                                                             | PASS                                                                                                                                   |
| `pnpm test:skills` with isolated `SKILL_TEST_DATABASE_URL`                                                   | PASS: 38 tests, including eight actual PostgreSQL integration tests; no skips                                                          |
| `pnpm test:cron`                                                                                             | PASS: 118 release-ingestion tests                                                                                                      |
| `pnpm skills:eval`                                                                                           | PASS: six offline fixtures after adapting them to comparative evidence; no model calls                                                 |
| Actual `next build` via existing ignored local runtime harness                                               | PASS: all 44 pages generated with remote Neon blocked                                                                                  |
| `git diff --check`                                                                                           | PASS                                                                                                                                   |
| Fresh independent read-only re-review                                                                        | APPROVE: 30 offline tests, six evaluation fixtures and adversarial probes rerun independently; no remaining actionable scoped findings |
| Live Neon HTTP concurrency/cancellation, deployed cron, paid provider contract/quality evaluation, hosted CI | NOT RUN                                                                                                                                |

Fix scope: `src/lib/skill-github.ts`, `src/lib/skill-ingestion.ts`, `src/lib/skill-analysis.ts`, `scripts/evaluate-skill-updates.ts`, `tests/skill-core.test.mjs`, `tests/skill-db.test.mjs`, new `tests/skill-review.test.mjs` and `tests/skill-snapshot-helpers.mjs`, and this existing feature document. No schema migration, dependency, catalog expansion, release-ingestion behavior change or release-model default change was needed.

### Remaining rollout gates and next safe staging verification

Local SQL tests use the actual store/SQL with a local PostgreSQL transport; the build uses a test-only Neon HTTP shim. They do **not** prove how the hosted Neon HTTP service handles remote commits after HTTP cancellation or an unknown response. The freshness guarantee prevents application-cached mutable observations from crossing leases; it assumes GitHub's fresh response is its authoritative current snapshot and does not establish upstream linearizability. Inferred behavioral meaning remains untested and requires human review.

Before production rollout, an operator should:

1. Obtain approval for a disposable staging Neon branch and preview deployment; apply only the existing `0010` migration and seed the unchanged ten-skill registry there. Use fresh report data, or separately review/reanalyze reports accepted under the earlier validator. Nothing in this fix rewrites completed reports or production data.
2. With a separately approved staging harness, test real Neon HTTP cancellation/timeout/unknown-commit outcomes at lease acquisition, event/checkpoint persistence and analysis save. Verify the newer owner's token and checkpoint survive and pending events remain recoverable. The normal SQL test suite deliberately rejects remote database URLs; do not bypass that guard or substitute production credentials.
3. Verify fresh repository metadata/default-branch requests occur after lease acquisition, immutable requests remain shared, and the roughly 43-call unchanged-poll budget fits the invocation limit. Controlled force-push and overlap scenarios should use test transport fixtures, never alter upstream curated repositories.
4. Only with explicit paid-call authorization, run the bounded model evaluation using the new comparative schema and manually inspect approved/rejected findings, conservative recommendations, returned usage and cost. Provider strict-parameter support and latency remain unmeasured for this revised contract.
5. Run the deployment/cron checks above and observe the staged baseline/first change before enabling an approved production schedule. Keep production writes, deployment, commits and pushes outside the implementation task.
