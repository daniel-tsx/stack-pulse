# Skill Updates live OpenRouter evaluation

**Status:** current

**Date:** 2026-10-25 (Asia/Ho_Chi_Minh)

**Verdict:** FAILED — incomplete six-fixture campaign after provider rate limit; one of two generated reports rejected for usefulness.

**Application revision:** `558d223299c0cafc94965ec5d9b066eb58b0c72c`. Execution checkout: `499ea782cff64d3bf347cf035f727037ba793890`.

**Requested model:** `deepseek/deepseek-v4-flash-0731`. Pinned endpoint: `deepinfra/fp8`. No fallback provider or model.

## Outcome and stop

The campaign made **3 of 6 allowed inference dispatches**, sequentially: two HTTP-200 reports followed by HTTP **429 RATE_LIMITED** on `scripts`. It stopped immediately with **zero application or SDK retries**. `metadata`, `deletion` and `insufficient` were not dispatched. Only two live reports exist; all actual sanitized outputs are included below. No report is fabricated for the four unavailable slots.

Execution: **13:56:04.447–13:56:25.861 Asia/Ho_Chi_Minh**, elapsed **21,414 ms** (06:56 UTC). Each request remained within 25 seconds; campaign remained within 180 seconds. One read-only key preflight returned HTTP 200. No further inference or second preflight followed the failure. Two subsequent generation-metadata GETs were read-only billing reconciliation.

Both generated reports passed the strict production JSON Schema, Zod and comparative evidence validation. Independent quality review provisionally accepts `instructions` with limitations and rejects `references`. These two results do not establish six-fixture compatibility or production readiness. Human acceptance remains pending. Phase A was not rerun; hosted preview and production activation remain NOT STARTED.

## Explicit one-time financial gate exception

The user approved the existing shared `SKILL_EVAL_OPENROUTER_API_KEY`, prior usage and existing resetting key cap, then explicitly approved `include_byok_in_limit: false` **only if external BYOK spending was excluded or verified inapplicable**. This is a one-time exception for this evaluation, not a permanent relaxation of the [operations runbook](../operations/skill-staging-verification.md#approval-gate-b-six-paid-synthetic-model-evaluations).

Fresh authenticated inspection of the default workspace's [BYOK page](https://openrouter.ai/workspaces/default/byok) showed **all 75 providers Not configured**, including DeepInfra. The configured key's hash matched its workspace key row without disclosing the credential. Only DeepInfra FP8 was eligible for the campaign, so no configured external BYOK credential was applicable at execution. No API key, BYOK credential, account restriction or production variable was created, modified or revoked.

The account [Credits page](https://openrouter.ai/settings/credits) showed **$7.46 available** before execution. The single key API preflight reported:

| Field | Sanitized observed value |
| --- | --- |
| HTTP status | 200 |
| Existing limit / reset | $5 / monthly |
| Remaining key allowance | $4.9995278 |
| Historical shared-key usage | $0.0004722 — excluded from evaluation spend |
| Historical BYOK usage | $0 |
| include_byok_in_limit | false — explicitly approved conditional exception |
| is_free_tier | false |

Every inference requested `usage: { include: true }`, as described by [OpenRouter's usage/BYOK announcement](https://openrouter.ai/blog/announcements/gif-prompts-omni-search-tool-caching-and-byok-flags/). Both HTTP-200 responses and their generation records returned **is_byok: false**. The 429 response supplied no usage or BYOK flag; the independently verified absence of eligible credentials remains its BYOK provenance evidence. No unexpected BYOK use was detected. A true BYOK flag would stop further processing.

## Harness, bounds and provenance

The checked-in [six-fixture harness](../../scripts/evaluate-skill-updates.ts), [budget guard](../../scripts/skill-eval-budget.ts), [production analyzer/schema](../../src/lib/skill-analysis.ts), [execution context](../../src/lib/ai-resilience.ts) and [fixtures](../../tests/fixtures/skill-diffs.json) remain unchanged. The ignored one-time operator adapter reused their fixtures, evidence construction, analyzer, strict schema, execution context and fetch guard. Only the approved financial prerequisites were adapted; usage metadata and a single-provider pin were added to the campaign request. No alternate prompt, synthetic expected-answer response or production code was used.

Controls: six serial dispatches maximum; `maxAttempts: 1`; per-request SDK `maxRetries: 0`; exact model; `provider.only/order: ["deepinfra/fp8"]`; `allow_fallbacks: false`; `require_parameters: true`; strict JSON Schema; `max_tokens: 3000`; no tools, plugins or alternate model lists. Timeouts: 25 seconds/request, 180 seconds including preflight/response processing. A durable campaign marker prevents accidental reruns; earlier stopped records remain intact.

Before inference, the conservative routing-price estimate was **$0.162**: 72,000 input tokens at $1/M plus 18,000 output tokens at $5/M; request fee ceiling $0. At selected endpoint prices **$0.06/M input, $0.18/M output**, the six-request allowance estimated **$0.00756 before caching**. Both are below the $0.25 target. Serialized input ceiling is 11,000 UTF-8 bytes/request; actual three requests were 5,844 / 5,860 / 5,819 bytes. This byte allowance is not a native tokenizer proof or a hard financial cap. Returned tokens/costs were checked after each successful call; missing accounting and provider errors stop execution.

Executed adapter SHA-256: `0ee993f7bfbe6666010ca1a9400296f89c4487cf6964bd41e796a8f88fd83832`. Later offline schema-validation/metadata-reporting helpers were added only after inference; they do not change that execution hash. No production database or GitHub module was invoked, and database/cron/GitHub credentials were cleared from the child process. Only the selected evaluation key was read into memory; no credential file was created.

## Per-fixture results

“Approved model” below is `deepseek/deepseek-v4-flash-0731`, returned by both successful completion responses. Input tokens include cached tokens; reasoning tokens are a subset of output, not additional charges.

| Fixture | HTTP | Provider / response model | Client latency ms | Input / output / reasoning | Reported cost | JSON Schema / Zod | Recommendation | Agent quality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `instructions` | 200 | DeepInfra / approved model | 10,445 | 568 / 427 / 0 | $0.00011094 | PASS / PASS | review_before_update / matches | Accept with limitations |
| `references` | 200 | DeepInfra / approved model | 9,999 | 572 / 249 / 0 | $0.00006762 | PASS / PASS | insufficient_evidence / expected update_candidate | Reject for usefulness |
| `scripts` | 429 | DeepInfra pinned; error response has no model/provider fields | 470 | Unknown | Unknown | N/A: no report | No report | Not assessed |
| `metadata` | NOT RUN | — | — | — | — | NOT RUN | No report | Not assessed |
| `deletion` | NOT RUN | — | — | — | — | NOT RUN | No report | Not assessed |
| `insufficient` | NOT RUN | — | — | — | — | NOT RUN | No report | Not assessed |

Independent **Ajv 8.20.0 draft-2020 JSON Schema validation passed 2/2**, using the exact schema generated by `z.toJSONSchema(skillReportSchema)` with `$schema` removed as in the production request. Raw Zod validation passed 2/2, and the production evidence validator passed 2/2. The 429 is a provider failure, not an invalid report counted against schema compatibility. Remaining cases are NOT RUN.

## Evidence accuracy, hallucinations and usefulness

**instructions — provisionally ACCEPT WITH LIMITATIONS.** Distinct exact quotes establish replacement of “Ask for approval before modifying files.” with “Modify files autonomously and run verification.” The output correctly identifies changed autonomy and approval expectations, and `review_before_update` is useful. Security wording describes a generic hypothetical risk rather than a verified vulnerability. It omits a fuller discussion of the newly added verification instruction and repeats the autonomy concern across sections. No fabricated CVE, benchmark, compatibility test or executed behavior was found. The production report marks implications as untested and retains low confidence.

**references — REJECT for usefulness and quotation precision.** Complete comparative source evidence establishes the appended instruction “Check the query plan.” The model instead chooses `insufficient_evidence`, despite verifying an addition; expected fixture recommendation is `update_candidate`. It confuses uncertainty about real-world behavior with absence of comparative source evidence. The quoted “addition” includes unchanged “Use an index for selective queries.” The combined string is present after and absent before, so it passes the current validator, but it is broader than the actual added text. No fabricated vulnerability or test result appears. As for every report, the server replaces the model's free-form summary/justification with deterministic source-fact and recommendation wording.

Schema validity therefore does **not** establish useful or sufficiently precise reports. Provisional agent acceptance is **1/2 generated reports**; human acceptance has not occurred. No quality conclusion can be drawn for `scripts`, `metadata`, `deletion` or `insufficient`.

## Generation and billing reconciliation

| Fixture | Generation ID | Response cost | Generation total_cost | Native input / output / reasoning | is_byok |
| --- | --- | --- | --- | --- | --- |
| instructions | `gen-1792911373-qNGsZjHrh81Rp93bSTRp` | $0.00011094 | $0.00011094 | 568 / 427 / 0 | false |
| references | `gen-1792911383-Mx52UrAopqAgsqpCNgbj` | $0.00006762 | $0.00006762 | 572 / 249 / 0 | false |
| scripts | None in response | Unknown | Not available | Unknown | Not returned |

Known attributable, reconciled generation charges: **$0.00017856**. Known tokens: **1,140 input, 676 output, 0 reasoning**, total **1,816**. The references response reports 256 cached input tokens, already included in its 572 input tokens. Both generation GETs returned HTTP 200; costs and native token counts match response usage.

Authenticated [generation logs](https://openrouter.ai/logs) were matched to both exact generation IDs, source key, DeepInfra, token counts and rounded displayed costs ($0.000111 and $0.0000676), with usage type **Credits**. The upstream-request tab also showed the corresponding two HTTP-200 attempts and the HTTP-429 attempt, each with **one attempt** and key type **OR**. The 429 response has no generation ID, cost or token usage, and the displayed upstream row provides no charge amount. Its final charge remains **unknown/unresolved**; absence of a billed generation entry is not proof of zero charge. No timeout occurred and no other unknown evaluation dispatch exists. Complete actual campaign spend therefore cannot yet be declared final.

The historical shared-key usage **$0.0004722** and unrelated key/account activity are excluded. No aggregate balance delta is used to attribute evaluation spending. A final invoice/account-wide total is not asserted. Known spend per provisional agent-accepted report is **$0.00017856 / 1**, but final cost per accepted report remains unresolved until the failed request's charge status is known. Cost per **human-accepted** report is undefined because human acceptance is pending.

Generation metadata reports model `deepseek/deepseek-v4-flash-20260731`; both completion responses report the requested `...-0731`. Refreshed public [endpoint metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints) maps `model_id: deepseek/deepseek-v4-flash-0731` to `name: DeepInfra | deepseek/deepseek-v4-flash-20260731`. These are the advertised API/upstream labels for the pinned endpoint; the different labels are disclosed, not treated as an undocumented model switch.

## All six sanitized output slots

Only synthetic fixture text was transmitted. The two actual raw reports are shown verbatim as parsed JSON, followed by the server-normalized production reports so human review can distinguish model prose from deterministic policy. No secret or real repository/user content appears.

### instructions

Raw model output:

```json
{
  "summary": "The review found one modified file with a single changed instruction. The before and after quotes are supported by the evidence, but no behavioral conclusions are drawn in this section.",
  "verifiedChanges": [
    {
      "path": "skills/example/SKILL.md",
      "change": "modified",
      "beforeQuote": "Ask for approval before modifying files.",
      "afterQuote": "Modify files autonomously and run verification."
    }
  ],
  "capabilityChanges": [
    {
      "statement": "The skill's instruction to 'Modify files autonomously and run verification' indicates a potential increase in autonomous file modification capability, as the prior instruction called for prior approval.",
      "path": "skills/example/SKILL.md",
      "side": "after",
      "quote": "Modify files autonomously and run verification."
    }
  ],
  "behaviorImpact": [
    {
      "statement": "The skill now instructs autonomous file modification without prior approval, which could lead to unintended file changes if not properly supervised.",
      "path": "skills/example/SKILL.md",
      "side": "after",
      "quote": "Modify files autonomously and run verification."
    }
  ],
  "securityConsiderations": [
    {
      "statement": "Autonomous file modification without prior approval may introduce risks if the skill is used in an untrusted environment; manual review is recommended.",
      "path": "skills/example/SKILL.md",
      "side": "after",
      "quote": "Modify files autonomously and run verification."
    }
  ],
  "impact": "unknown",
  "recommendation": "review_before_update",
  "justification": "The modified instruction changes the skill's default behavior from requiring approval to autonomous action, which has not been tested and may have broader implications.",
  "confidence": "low",
  "limitations": [
    "Only one file and one change were provided; no other context or prior verification results were available."
  ]
}
```

Validated production report:

```json
{
  "summary": "Source text replaced. skills/example/SKILL.md",
  "verifiedChanges": [
    {
      "path": "skills/example/SKILL.md",
      "change": "modified",
      "beforeQuote": "Ask for approval before modifying files.",
      "afterQuote": "Modify files autonomously and run verification.",
      "side": "after",
      "quote": "Modify files autonomously and run verification.",
      "statement": "Source text replaced."
    }
  ],
  "capabilityChanges": [
    {
      "statement": "The skill's instruction to 'Modify files autonomously and run verification' indicates a potential increase in autonomous file modification capability, as the prior instruction called for prior approval.",
      "path": "skills/example/SKILL.md",
      "side": "after",
      "quote": "Modify files autonomously and run verification."
    }
  ],
  "behaviorImpact": [
    {
      "statement": "The skill now instructs autonomous file modification without prior approval, which could lead to unintended file changes if not properly supervised.",
      "path": "skills/example/SKILL.md",
      "side": "after",
      "quote": "Modify files autonomously and run verification."
    }
  ],
  "securityConsiderations": [
    {
      "statement": "Autonomous file modification without prior approval may introduce risks if the skill is used in an untrusted environment; manual review is recommended.",
      "path": "skills/example/SKILL.md",
      "side": "after",
      "quote": "Modify files autonomously and run verification."
    }
  ],
  "impact": "unknown",
  "recommendation": "review_before_update",
  "justification": "Review the cited source changes and any potential implications before updating. This assessment has not been tested in your environment.",
  "confidence": "low",
  "limitations": [
    "Behavioral implications are untested inferences, not verified source changes.",
    "Only one file and one change were provided; no other context or prior verification results were available."
  ]
}
```

### references

Raw model output:

```json
{
  "summary": "query.md was modified adding a single instruction. No scripts, executables, or metadata changes. Insufficient evidence of behavioral impact.",
  "verifiedChanges": [
    {
      "path": "skills/example/references/query.md",
      "change": "added",
      "beforeQuote": null,
      "afterQuote": "Use an index for selective queries. Check the query plan."
    }
  ],
  "capabilityChanges": [],
  "behaviorImpact": [],
  "securityConsiderations": [],
  "impact": "unknown",
  "recommendation": "insufficient_evidence",
  "justification": "The only verified change is an added instruction to check the query plan in a reference file. No executable changes or metadata changes. Whether this alters agent behavior, host compatibility, or approval requirements cannot be established from the evidence.",
  "confidence": "low",
  "limitations": [
    "The added instruction may imply a planning or verification adjustment, but this is not directly evidenced.",
    "No interaction with other files or scripts was verified.",
    "The reference file is not executable, but it may be read by agents at runtime."
  ]
}
```

Validated production report:

```json
{
  "summary": "Source text added. skills/example/references/query.md",
  "verifiedChanges": [
    {
      "path": "skills/example/references/query.md",
      "change": "added",
      "beforeQuote": null,
      "afterQuote": "Use an index for selective queries. Check the query plan.",
      "side": "after",
      "quote": "Use an index for selective queries. Check the query plan.",
      "statement": "Source text added."
    }
  ],
  "capabilityChanges": [],
  "behaviorImpact": [],
  "securityConsiderations": [],
  "impact": "unknown",
  "recommendation": "insufficient_evidence",
  "justification": "Source coverage or comparative evidence is insufficient. Keep your pinned revision until the source can be reviewed.",
  "confidence": "low",
  "limitations": [
    "The added instruction may imply a planning or verification adjustment, but this is not directly evidenced.",
    "No interaction with other files or scripts was verified.",
    "The reference file is not executable, but it may be read by agents at runtime.",
    "Coverage or verified change evidence is insufficient."
  ]
}
```

### scripts

No report. Actual response was HTTP 429 with sanitized error `{"code":429,"message":"Provider returned error"}`. One dispatch; no retry. No generation ID or usage returned.

### metadata

NOT RUN after the 429 stop. No model output exists.

### deletion

NOT RUN after the 429 stop. No model output exists.

### insufficient

NOT RUN after the 429 stop. No model output exists.

## Verification and remaining decisions

| Check | Actual outcome |
| --- | --- |
| `node ../../../node_modules/tsx/dist/cli.mjs ../evaluate-shared-key.ts --self-test` | PASS, exit 0; zero-network guard checks cover URL allowlist, seventh-dispatch refusal, fallback/price fields, shared-key exception and insufficient balance |
| Same adapter `--live` | FAILED/stopped, exit 1; 3 dispatches, 2 reports, 1 HTTP429, 3 fixtures unrun |
| Same adapter `--reconcile` | PASS for two captured generation IDs, exit 0; two read-only GETs, no inference |
| Same adapter `--validate-saved` | PASS, exit 0; Ajv 2/2, raw Zod 2/2, existing production evidence checks 2/2 |
| Independent pre-execution design review | No blocking findings; fresh read-only reviewer, no inference by reviewer |
| Independent actual-output quality review | 1 provisional acceptance, 1 rejection, 4 unavailable; human review pending |
| Lint/typecheck/application test/build | NOT RUN; no application source changed, and these do not close live model/billing boundaries |
| Hosted CI/deployment/production activation | NOT RUN; no push, deploy, cron, ingestion or production DB operation |

The repository-local ponytail, ponytail-review and codex-review procedures were used proportionately. Codex CLI's previously recorded configuration failure led to fresh independent read-only subagent fallback reviews; they are agent reviews, not human approval.

Before any follow-up inference, review the provider rate-limit failure, the reference report's recommendation/quotation problem, and the unresolved 429 charge. No retry, provider switch, credential edit or production activation is authorized by this stopped run. Any follow-up campaign requires explicit resumption and refreshed financial/BYOK prerequisites. The runbook remains unchanged.

Cloud resources created: **none**. API/BYOK credentials created, edited or revoked: **none**. Production configuration/data changes: **none**. Deployment revision: **none**. Task branch remains local.

## Earlier attempts retained

The initial attempt in `03edf38340795abbdab7f26024a6ebd17e4dbf4a` stopped at the shared-key/fresh-key/cap prerequisite with zero API preflights or inference. The next attempt, recorded in `499ea782cff64d3bf347cf035f727037ba793890`, made one HTTP-200 key preflight and stopped on `include_byok_in_limit:false`, with zero inference and $0 spend. The latest explicit conditional exception supersedes those blockers for the campaign above. Both previous attempts remain in git history and the ignored verification record; neither spent inference credits.
