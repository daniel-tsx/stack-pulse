# Skill Updates live OpenRouter evaluation

**Status:** current

**Date:** 2026-10-25 (Asia/Ho_Chi_Minh)

**Verdict:** FAILED — prerequisite preflight; model compatibility and quality NOT ASSESSED.

**Execution status:** BLOCKED before inference.

**Application revision inspected:** `558d223299c0cafc94965ec5d9b066eb58b0c72c`

**Requested model:** `deepseek/deepseek-v4-flash-0731`

## Decision

The resumed campaign made exactly one authenticated `GET /api/v1/key`, which returned **HTTP 200**. It reported **`include_byok_in_limit: false`**. The [runbook](../operations/skill-staging-verification.md#approval-gate-b-six-paid-synthetic-model-evaluations) requires Include BYOK enabled, and that prerequisite was not among the user's two explicit exceptions. The temporary runner therefore stopped before any inference. No credential or account setting was changed.

The campaign started at **2026-10-25 02:46:24.859 UTC** and stopped at **02:46:25.304 UTC**: **445 ms**, zero inference dispatches, zero tokens, zero generation IDs and **$0 attributable inference spend**. This is a prerequisite failure, not evidence that the requested model fails strict schema or produces poor reports.

Phase A hosted Neon verification was previously completed; it was not rerun. This document covers Phase B only.

## Explicit one-time approved exception

On resumption, the user explicitly authorized the existing shared key in `SKILL_EVAL_OPENROUTER_API_KEY`, overriding the fresh/unused key requirement and dedicated $0.25 lifetime-cap requirement for **this evaluation only**. The existing $5 monthly resetting limit and historical activity were consequently allowed. They were not the reason for this stop.

All other safety controls remained required, including BYOK accounting, routing restrictions, six sequential inference dispatches at most, exact model, no SDK/application retries or provider/model fallback, 25-second request timeout, 180-second campaign deadline, strict production schema, and a spending target below $0.25. The shared key was neither modified nor revoked. The runbook, canonical evaluation harness, application code and production security/spending settings remain unchanged. This exception creates no standing approval for another campaign.

The canonical `verifyEvalKey()` intentionally rejects this shared key. An ignored, one-time operator adapter reused the existing analyzer, fixtures, execution context and `createEvalFetch()` guard, replacing only the waived key checks while retaining `include_byok_in_limit === true` and sufficient remaining allowance. It saved a durable campaign-start marker to refuse an accidental rerun. No permanent exception flag or alternative production schema was added.

## Prerequisite evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| Configured evaluation variable present | PASS | Only `SKILL_EVAL_OPENROUTER_API_KEY` was selected; no secret value was printed, copied into an artifact, or modified. |
| Correct key identity | PASS | SHA-256 of the configured value matched the key row's identifier in the authenticated dashboard. |
| Fresh key / dedicated lifetime cap | EXPLICIT ONE-TIME EXCEPTION | Existing shared key: limit `$5`, reset `monthly`, prior usage `$0.0004722`; these values did not block resumption. |
| Remaining key allowance | PASS | API reported `$4.9995278`, exceeding the `$0.162` conservative request allowance. Shared activity can change this; it is not an isolated financial backstop. |
| BYOK included in the cap | **FAIL — STOP** | API reported `include_byok_in_limit: false`; the non-waived prerequisite requires `true`. Historical `byok_usage` was `0`. |
| BYOK availability | PASS for read-only inspection | All 75 providers in the authenticated default workspace BYOK page showed **Not configured**, including DeepInfra. No provider credentials were changed. This observation does not satisfy the separate mandatory Include BYOK flag check. |
| Model/provider routing preparation | PASS for preparation; authenticated model inference NOT RUN | Public endpoint metadata advertises the exact model on `deepinfra/fp8`, status `0`, `structured_outputs`, `response_format`, `reasoning` and `max_tokens`. Planned requests pin only that endpoint, disable fallbacks, and impose price filters. Dashboard showed no key guardrails, balanced provider sort, and no default fallback model. No paid access probe was made. |
| Six synthetic fixtures available | PASS | All six IDs in the fixture table below are present in `tests/fixtures/skill-diffs.json`. |
| Production-compatible analyzer and schema | PASS for code inspection only | The harness imports `analyzeSkillUpdate` from `src/lib/skill-analysis.ts`; no alternate analyzer or schema was introduced. Live compatibility remains NOT RUN. |

The dashboard was inspected read-only at [API Keys](https://openrouter.ai/workspaces/default/keys), [BYOK](https://openrouter.ai/workspaces/default/byok) and [Routing](https://openrouter.ai/workspaces/default/routing). Provider capability and price evidence came from the public [model endpoint metadata](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints). Advertised capabilities are not live compatibility evidence.

## Campaign controls inspected

The existing [evaluation harness](../../scripts/evaluate-skill-updates.ts), [budget guard](../../scripts/skill-eval-budget.ts), and [analyzer](../../src/lib/skill-analysis.ts) were read without modification:

- At most six sequential paid inference dispatches, with one application attempt per fixture and no SDK retries. The [execution context](../../src/lib/ai-resilience.ts) supplies `maxRetries: 0` on each request, overriding the shared client's default.
- The one-time adapter made one `GET /api/v1/key`, recorded existing usage/cap/reset, and checked the retained BYOK accounting and remaining-allowance prerequisites. Canonical fresh-key checks remain unchanged for ordinary runs.
- The analyzer retains strict JSON Schema, Zod parsing, comparative citation checks, and conservative recommendation rules.
- The transport fixes the requested model, disables provider fallbacks, and requires parameter support. It disallows alternate model lists, tools, and plugins.
- Limits are 25 seconds per request, 180 seconds overall including preflight/processing, and 3,000 output tokens per request. The $0.25 spending target remains; a dedicated provider-enforced campaign cap was explicitly waived.
- The transport also enforces the documented request-byte and routing-price ceilings. Returned token counts and reported costs must be present and within allowance.
- Provider, validation, timeout, missing billing, or budget failures stop the live campaign. No non-waived guard was relaxed and no other model/provider was substituted.

The conservative pre-execution calculation was **$0.162**: 72,000 input tokens at $1/M plus 18,000 output tokens at $5/M, zero per-request fees. Public DeepInfra FP8 prices were $0.06/M input and $0.18/M output, giving **$0.00756** at those allowances before caching. Request bytes remain limited to 11,000; this reserves framing room but is not a native tokenizer proof or hard financial cap. Actual returned tokens/costs would have been checked after each response, with unknown charges stopping execution.

The temporary adapter's offline assert-based guard self-check **PASS**: invalid URL and seventh dispatch refused; routing price/fallback fields checked; false BYOK and insufficient allowance refused; all six fixture identities checked. Zero network calls in that self-check. A fresh independent read-only reviewer found no blocking execution-design findings before the single live preflight. The reviewer required failed-response charges to be reconciled from raw usage and generation records rather than relying solely on analyzer telemetry.

Executed from the task worktree, using existing installed dependencies:

```bat
node ../../../node_modules/tsx/dist/cli.mjs ../evaluate-shared-key.ts --self-test
node ../../../node_modules/tsx/dist/cli.mjs ../evaluate-shared-key.ts --live
```

Self-check exit `0`; live adapter exit `1`, with sanitized final output `execution: stopped`, `requests: 0`, `elapsedMs: 445`, `keyPreflight: 200`. The ordinary canonical live command was not run. No retry or second preflight followed the failure.

## All six fixture outcomes and sanitized reports

No AI reports were generated. Each slot is explicitly recorded below; there are no synthetic stand-ins presented as live model output.

| Fixture | Source path within `skills/example/` | Expected recommendation | Live result | Sanitized AI report |
| --- | --- | --- | --- | --- |
| `instructions` | `SKILL.md` | `review_before_update` | NOT RUN | Not generated |
| `references` | `references/query.md` | `update_candidate` | NOT RUN | Not generated |
| `scripts` | `scripts/check.sh` | `review_before_update` | NOT RUN | Not generated |
| `metadata` | `metadata.json` | `no_action_needed` | NOT RUN | Not generated |
| `deletion` | `SKILL.md` | `review_before_update` | NOT RUN | Not generated |
| `insufficient` | `SKILL.md` | `insufficient_evidence` | NOT RUN | Not generated |

The following values apply **individually to every fixture above**:

| Requested measurement | Recorded result |
| --- | --- |
| HTTP status | NOT RUN; no inference response |
| Returned provider and model | NOT RUN; none returned |
| Latency | NOT RUN; no inference dispatched |
| Input/output/reasoning tokens | NOT RUN; no measured token usage |
| Reported response cost | NOT RUN; no response billing record |
| Strict JSON Schema validity | NOT RUN |
| Zod validation | NOT RUN |
| Evidence and citation quality | NOT ASSESSED; no generated report |
| Unsupported claims or hallucinations | NOT ASSESSED; no generated report |
| Recommendation usefulness | NOT ASSESSED; no generated recommendation |
| Quality acceptance | NOT ASSESSED; not rejected on quality grounds |

Schema validity must not be treated as report quality when this campaign eventually runs. The six sanitized validated reports, their comparative evidence, and separate quality judgments remain outstanding deliverables; they cannot be produced from this blocked attempt.

## Usage and billing reconciliation

| Item | This campaign |
| --- | --- |
| Paid inference requests | **0 of 6** |
| Shared-key API preflights | **1 of 1**; HTTP 200, non-waived BYOK flag check failed |
| Inference token usage | **0**; no dispatches |
| Actual inference spend | **$0** |
| Failed inference requests | **0**; no requests attempted |
| Generation IDs | None |
| Unknown or pending campaign charges | None caused by this campaign; no inference was dispatched |
| Reports generated / quality accepted | **0 / NOT ASSESSED**; quality review was not performed |
| Cost per accepted report | **Undefined**, because there are no accepted reports |

There are no campaign generation IDs or inference activity entries to reconcile; generation-metadata queries were therefore not needed. The API's **$0.0004722 historical key usage** is recorded separately and is **not evaluation spend**. No shared-key balance delta is used to attribute cost. This campaign had no timed-out inference or failed billable request; there are no pending inference charges caused by it. No second key preflight, paid probe, retry, or fallback request was made.

## Outstanding blocker and next decision

The remaining blocker is **Include BYOK is false**. The runbook states: “with a lifetime limit of **$0.25**, no reset, and Include BYOK enabled.” The lifetime-cap restriction was waived; Include BYOK was not. An operator must resolve that retained prerequisite, or the user must explicitly decide whether to extend the one-time exception. Neither credential modification nor a further exception is inferred from the current approval. The fresh-key and dedicated lifetime-cap requirements are **not being reimposed** on this stopped campaign.

No further inference or key preflight was attempted. All six actual model outputs and schema/quality judgments remain unavailable. A follow-up campaign needs a resolved gate and explicit resumption; historical usage must remain separate from generation-attributed evaluation charges. Do not revoke or change this shared key as routine dedicated-key cleanup.

Hosted preview, production registration, baseline ingestion, deployment, and cron activation remain **NOT STARTED**. No database or GitHub ingestion was run during this Phase B attempt.

## Verification scope

- PASS: runbook/analyzer/schema/budget inspection, matching key identity, all six fixtures, offline guard self-check, public selected-provider metadata, read-only BYOK/routing inspection, and independent pre-execution design review.
- FAIL: retained BYOK accounting prerequisite in the single HTTP-200 key preflight.
- NOT RUN: six model inferences, schema/citation/model-quality evaluations and generation billing reconciliation; stopped before inference.
- No application-code changes were made. Lint, typecheck, application tests, and build are not evidence for this blocked live boundary and were not run for this documentation-only change.
- Cloud resources created: **none**. Credentials created/modified/revoked: **none**. Deployment revision: **none**; no deployment. Production database, GitHub ingestion, cron and production configuration: **not accessed or changed**.

## Earlier blocked attempt retained

The initial Phase B attempt, recorded in local commit `03edf38340795abbdab7f26024a6ebd17e4dbf4a`, stopped at dashboard inspection because the key was shared, previously used and capped at $5 monthly. That attempt made **zero API preflights and zero inference requests**, spent **$0**, and had verdict **BLOCKED**. The latest user approval superseded those two blockers for this evaluation only. The resumed attempt above is separate and stopped on the newly measured, non-waived BYOK-accounting prerequisite. The earlier evidence remains in git history and the ignored verification record.
