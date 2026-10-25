# Skill Updates Phase B benchmark readiness

**Status:** current · 2026-10-25 · implementation/offline verification only

**Verdict:** prepared for separately approved live benchmarks; production remains **NO-GO**. No paid inference, database access, deployment, seed or cron activation occurred. Neither candidate is recommended as the production model yet.

## Evidence and scope

The [earlier partial evaluation](skill-openrouter-live-evaluation.md) produced two reports before DeepInfra returned HTTP429. Independent quality review accepted instructions with limitations and rejected references: complete evidence established an added instruction, but the model chose insufficient evidence and quoted unchanged surrounding guidance. JSON Schema/Zod validity did not establish usefulness. The latest failure analysis separately identified lost response diagnostics and an evaluator label that can disagree with the server's mandatory-review policy. Earlier reports and their findings are preserved, not rewritten as passing results.

The task branch starts from refreshed `origin/main` (`558d223299c0cafc94965ec5d9b066eb58b0c72c`) and includes the three existing local Phase B documentation commits so the original audit remains available. Application changes below are new to this task. The repository-local ponytail, ponytail-review and codex-review procedures apply; engineering-workflow was not requested.

## Exact implementation changes

| Files                                                                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/skill-analysis.ts`                                                                | Defines advisory recommendation semantics in the common prompt/schema; distinguishes verified source facts from untested runtime impact. Complete source facts plus a contradictory model insufficient-evidence recommendation become conservative manual review, never forced update_candidate. Incomplete/mismatched coverage or no verified facts still yield insufficient evidence. Isolated insertions/removals with enough changed text must quote that span in verified facts and inferred findings. Luna sends reasoning.effort:none; Flash retains reasoning.enabled:false. Requests opt into routing metadata and capture sanitized response/failure diagnostics before wrapping. |
| `src/lib/skill-diagnostics.ts`                                                             | Small shared pure sanitizer: HTTP status, approved typed error/provider codes, parsed retry delay, bounded request/generation IDs, provider identity, routing attempt count and BYOK flag. Messages, raw errors, arbitrary metadata/pipelines, headers and request bodies are excluded. Unsafe/unrecognized values become null.                                                                                                                                                                                                                                                                                                                                                             |
| `src/lib/skill-types.ts`                                                                   | Adds an optional diagnostics list to existing JSON telemetry. Existing reports and telemetry without that member remain compatible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `scripts/skill-eval-budget.ts`                                                             | Two reviewed evaluation profiles, common rubric, tighter evaluation-only price limits, fixed standard tier/provider, no provider/model fallback, usage/routing metadata, final serialized byte ceiling, safe audit records and stop on unexpected BYOK. Captures top-level error metadata before SDK conversion discards it.                                                                                                                                                                                                                                                                                                                                                                |
| `scripts/evaluate-skill-updates.ts`                                                        | Model-specific explicit campaign approval token, zero-network plans with costs/rubric, separate raw and normalized reports and recommendation diagnostics, human acceptance pending, failure-charge/unknown-charge accounting. Exactly the same six fixture records and evidence construction remain shared.                                                                                                                                                                                                                                                                                                                                                                                |
| `tests/skill-review.test.mjs`, `tests/skill-staging.test.mjs`, `tests/skill-core.test.mjs` | Focused semantic/precision/coverage/SDK/diagnostic/transport regressions; existing tests retain their assertions except the intentionally tighter evaluation price expectation. Existing loader stubs include the real pure diagnostics module.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Feature/runbook/index documents                                                            | Describe the new semantics, two separate campaign procedures, unchanged financial approval gates and remaining verification boundaries.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

No changes to the fixture file, SQL/schema/migrations, skill store, ingestion state machine, leases/checkpoints, shared AI execution context, release analyzer, environment files or `vercel.json`. Existing application retry/deadline behavior remains intact. Diagnostics use the existing telemetry JSON field, not a new persistence operation or schema migration.

## Semantic acceptance

Confirmed source additions/removals/replacements are facts; runtime consequences remain untested inferences. A report may keep unknown impact and low confidence while recommending manual review of verified source changes. Missing comparative evidence must still result in insufficient evidence. The server never upgrades missing evidence into an update candidate.

Raw model recommendations remain visible alongside normalized reports. Server correction does **not** make a poor model answer acceptable. The original references answer remains rejected: its broad quote now fails the isolated-span check. With a precise quote but the same false insufficient-evidence recommendation, server policy would require conservative review; the raw semantic failure still needs to be scored by humans.

The precision guard uses the exact common-prefix/suffix span for isolated insertion/removal edits. Very short edits need quotation context to satisfy the minimum eight-character quote length; replacements and multi-span edits retain contextual quotation checks. This is not a general minimal-diff proof. Existing comparative-presence checks, inference anchoring and human relevance review remain necessary; no unsupported behavioral conclusion becomes a verified fact.

## Actual request compatibility findings

Installed OpenAI SDK **6.38.0** was exercised with synthetic fetch responses, and its final serialized requests were inspected after the evaluation guard:

| Parameter                | DeepSeek V4 Flash                  | GPT-6 Luna                         |
| ------------------------ | ---------------------------------- | ---------------------------------- |
| Exact model              | deepseek/deepseek-v4-flash-0731    | openai/gpt-6-luna                  |
| Evaluation provider      | digitalocean                       | openai                             |
| Service tier             | default                            | default                            |
| Temperature              | omitted                            | omitted                            |
| Reasoning                | enabled:false                      | effort:none                        |
| Output ceiling           | max_tokens:3000                    | max_tokens:3000                    |
| Response                 | same strict production JSON Schema | same strict production JSON Schema |
| Required parameters      | true                               | true                               |
| Model/provider fallback  | none / false                       | none / false                       |
| Usage / routing metadata | requested / enabled                | requested / enabled                |
| SDK/application attempts | one / one                          | one / one                          |

Tests confirm identical messages, synthetic evidence and serialized schema across candidates, explicit provider allowlists/order, no alternate model list, and SDK retry-count zero. Standard-tier selection prevents workspace preferences from choosing flex/priority capacity for the benchmark.

Current public endpoint metadata advertises the relevant request parameters for [Flash/DigitalOcean](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints) and [Luna/OpenAI](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints). [OpenRouter service-tier](https://openrouter.ai/docs/guides/features/service-tiers) and [routing-metadata](https://openrouter.ai/docs/guides/features/router-metadata) contracts informed the gateway parameters. **Serialization is verified offline; actual provider acceptance, exact-schema compatibility, latency and quality remain NOT RUN for these configurations.** Advertised support is not live proof.

## Shared quality rubric and thresholds

`SKILL_EVAL_RUBRIC` is common to both plans. Freeze the code revision, fixture file, prompt/schema, rubric and provider profiles before the first approved call. Every human-accepted report must pass **all four** criteria:

1. Strict JSON Schema and Zod validity, accurate comparative facts and precise relevant changed-text citations.
2. Correct separation of source completeness, recommendation evidence and untested runtime effects; no false insufficient-evidence assertion for established source facts.
3. No unsupported claims, invented tests, vulnerabilities, compatibility or execution guarantees. Empty inference arrays are acceptable when evidence supports no inference.
4. Useful advisory recommendation consistent with coverage and the server's mandatory-review policy, with a written rationale for any deviation from the fixture's expected label.

Record PASS/FAIL per criterion for raw and normalized output separately; do not replace the raw score with the server score. The fixed recommendation match remains a diagnostic, not acceptance. A legitimate cited inference can require review_before_update even where the source-only fixture expects update_candidate. This does not permit accepting false missing-evidence claims or unrelated citations. Apply exactly the same standard to both candidates; human sign-off remains required.

For benchmark completion, require six completed contract-valid outputs and human review of all six for each candidate. Report quality acceptance counts, failures, latency and costs separately. Any provider/contract/billing error stops that campaign; absent outputs are NOT RUN/no report, never synthesized. A single six-case sample is a small configuration comparison, not proof of intrinsic model superiority or production reliability.

## Proposed live procedure — NOT EXECUTED

Follow [runbook gate B](../operations/skill-staging-verification.md#approval-gate-b-six-paid-synthetic-model-evaluations). Separate explicit approval is required for each campaign, with maximum twelve inference dispatches across the two approved runs. Do not automatically run the second campaign, retry failed fixtures or substitute providers/models.

1. Review/freeze both zero-network plans and the rubric; verify current model/provider parameters and pricing again before approval. Resolve the earlier failed request's billing uncertainty before new inference. Compare the six fixtures unchanged: instructions, references, scripts, metadata, deletion, insufficient.
2. For each separately approved campaign use a fresh dedicated evaluation key in SKILL_EVAL_OPENROUTER_API_KEY, no reset, BYOK spend included, sufficient remaining allowance, approved model restrictions and no eligible external BYOK credentials. Recommend a $0.03 lifetime cap per key. The earlier shared-key/BYOK exceptions were one-time only and are not standing approval or implemented bypasses.
3. Approve Flash/DigitalOcean first using `SKILL_EVAL_APPROVED=skill-benchmark:deepseek/deepseek-v4-flash-0731:six-fixtures`; later approve Luna/OpenAI with `SKILL_EVAL_APPROVED=skill-benchmark:openai/gpt-6-luna:six-fixtures`. Use the runbook's explicit model command and separate ignored JSONL output per run; do not load an application `.env` or database/GitHub credentials. Each campaign is serial, max six dispatches plus one key preflight, 25 seconds/request and 180 seconds including preflight/processing. SDK/application retries and provider/model fallback are disabled. A timeout still consumes a dispatch and can carry an unknown charge.
4. Save every actual schema-valid raw model output and normalized report, the rubric scores, token/cost usage, safe HTTP/routing diagnostics and generation IDs. On invalid JSON/schema, do not dump raw provider bodies. Retain failed response charges in the audit, including charges unavailable to analyzer telemetry. Stop on unknown accounting, token/price excess or unexpected BYOK. No paid probes are added outside the six fixtures.
5. Reconcile every captured generation ID with OpenRouter activity/metadata, including is_byok and failed requests. Unknown charges remain unresolved, not zero. Record human acceptance independently and divide all attributable charges, including failures, by accepted count; undefined when none accepted. Revoke only each approved dedicated campaign key after reconciliation, following operator approval/procedure. No application credentials are changed by this implementation.
6. Blind the model labels during report scoring where practical, then compare both candidate configurations using the frozen rubric. Changing provider can change numerical precision/serving behavior, so do not attribute differences solely to the model. Recommend SKILL_UPDATES_MODEL only after both evaluations and human review; no production selection is made here.

## Cost proposal

Prices inspected 2026-10-25; no cache discounts, tools/search, request fees or fallback attempts assumed. Each six-request allowance is 72,000 input and 18,000 output tokens:

| Campaign                    | Input/output $ per million | Six-request estimate |
| --------------------------- | -------------------------- | -------------------- |
| Flash/DigitalOcean standard | 0.119 /0.238               | $0.012852            |
| Luna/OpenAI standard        | 0.10 /0.50                 | $0.016200            |
| Combined twelve dispatches  | —                          | $0.029052            |

Evaluation routing filters are capped at **$0.20/M input, $0.75/M output and $0/request**, giving **$0.0279 per campaign /$0.0558 combined** at token allowances. Recommended two dedicated $0.03 key caps provide a $0.06 aggregate financial backstop, subject to verified provider enforcement. Existing code still refuses dedicated key caps above $0.25 and does not relax freshness/reset/BYOK requirements. The original $1/$5 price filters would allow $0.324 across twelve requests and are not used for this comparison.

Final serialized requests must fit 11,000 UTF-8 bytes after routing/usage fields are added. This is not native tokenizer proof. Actual returned tokens/costs and provider-side caps are still required. Unknown charges or unavailable eligible providers stop execution; do not enlarge the budget, switch routes or treat estimates as invoices.

## Offline verification results

Four new regressions failed against the original implementation before correction: complete-source/untested-runtime semantics, broad insertion/removal citations, Luna reasoning serialization and missing 429 diagnostics. Existing assertions were retained; the only existing changed expectation reflects the explicitly tighter evaluation price cap.

| Command/check                                                             | Actual result                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node --test tests/skill-*.test.mjs`                                      | PASS: 55 passed, 13 env-gated database cases skipped, 0 failed, 68 total                                                                                           |
| `node --test tests/cron-*.test.mjs`                                       | PASS: 134 passed, 1 env-gated PostgreSQL case skipped, 0 failed,135 total                                                                                          |
| `node node_modules/@typescript/native/bin/tsc --noEmit`                   | PASS (TypeScript 7.0.2)                                                                                                                                            |
| `node node_modules/eslint/bin/eslint.js`                                  | PASS: zero errors/warnings; initial unused destructuring warning corrected                                                                                         |
| Installed Prettier 3.9.6 `--check` on changed source/tests/canonical docs | PASS                                                                                                                                                               |
| `node node_modules/tsx/dist/cli.mjs scripts/evaluate-skill-updates.ts`    | PASS: 6/6 offline contracts; no model quality claim, zero network calls                                                                                            |
| Same evaluator `--plan-live --model=...` for each candidate               | PASS:two zero-request plans, same fixture IDs/rubric, separate provider/price estimates                                                                            |
| `git diff --check`                                                        | PASS                                                                                                                                                               |
| Hosted inference/schema/quality/billing verification                      | NOT RUN; separate paid approval required                                                                                                                           |
| PostgreSQL cases                                                          | NOT RUN:verified owned test target not supplied; no SQL/store/state-machine code changed. Offline snapshot/ingestion contracts passed; no hosted persistence claim |
| Build/deployment/production/browser                                       | NOT RUN; no UI change or production approval; build can query a configured database                                                                                |

The pinned pnpm 11.1.3 was obtained and installed the existing lockfile dependencies in the isolated worktree. Sandbox pnpm wrappers subsequently attempted an unavailable Corepack cache download, so verification used the exact installed package CLI equivalents shown above. No manifest/lockfile/dependency version was changed. This is local evidence, not hosted CI.

## Independent review and corrections

The initial independent review found two P2 issues: a later fixture with no response could receive the preceding raw report, and a JSON-null HTTP error could bypass audit capture. It also identified an inherited-property model-allowlist gap. All three were accepted in one correction wave. Each fixture now captures its audit index, invalid JSON envelopes retain safe HTTP diagnostics, and model profiles require own-property membership. Offline regressions reproduce the success-then-no-response, JSON-null429 and inherited-name scenarios. The staging suite passes21/21 and the full skill suite passes55 with13 database skips.

That reviewer hit a model-capacity error before completing its review; the partial findings are retained and are not approval. Complete review of the corrected checkpoint remains required.

## Remaining uncertainties and production assessment

DigitalOcean and OpenAI acceptance of the exact strict request, output quality, latency, rate-limit behavior and billing remain unverified. The SDK drops top-level routing metadata on non-2xx errors; the benchmark transport preserves it, while production telemetry can only retain metadata the SDK exposes. Absent diagnostics are null, not invented. Unknown typed provider codes are deliberately not copied as arbitrary text. Parsed Retry-After is evidence only and does not change existing cooldown/deadline decisions.

The earlier DeepInfra 429 subtype/Retry-After was never retained. A later read-only analysis recovered request-detail ID `gen-1792911393-pePTA1lAJnHLQWiX90Vy`; generation lookup returned 404, so its charge remains unresolved. This implementation does not rerun it or declare it free.

Independent design review found no blocking findings, requiring raw quality scores, inferred-citation precision, legitimate insufficient outcomes and transport-level diagnostics to remain explicit. Final independent code review is required before treating this implementation checkpoint as reviewed. Neither an offline pass nor reviewer approval authorizes paid execution, hosted preview or production activation. Staging review gates and later production backup/registration/baseline/deployment gates remain in force; cron stays unregistered.
