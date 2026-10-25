# Skill Updates live OpenRouter evaluation

**Status:** current

**Date:** 2026-10-25 (Asia/Ho_Chi_Minh)

**Verdict:** BLOCKED

**Application revision inspected:** `558d223299c0cafc94965ec5d9b066eb58b0c72c`

**Requested model:** `deepseek/deepseek-v4-flash-0731`

## Decision

The configured `SKILL_EVAL_OPENROUTER_API_KEY` does not satisfy the approved campaign's financial prerequisites. Its SHA-256 fingerprint matched the corresponding row in the authenticated OpenRouter API Keys page. That row showed a **$5 monthly limit**, **nonzero historical usage below $0.001**, and **No guardrails** assigned to the key.

The required key must be unused and capped at $0.25 for its lifetime, without a reset. Evaluation stopped before the API preflight or any inference request. The existing key was not changed, revoked, or used for inference. This result establishes a configuration blocker, not a model-quality or compatibility failure.

Scope and gates come from the [staging runbook](../operations/skill-staging-verification.md#approval-gate-b-six-paid-synthetic-model-evaluations). Phase A hosted Neon verification was previously completed; this document covers only the attempted Phase B campaign.

## Prerequisite evidence

| Requirement | Result | Evidence |
| --- | --- | --- |
| Dedicated variable present | PASS for presence only | `SKILL_EVAL_OPENROUTER_API_KEY` is nonempty; no secret value was printed or copied into this document. |
| Correct key identity | PASS | SHA-256 of the configured value matched the key row's identifier in the authenticated dashboard. |
| $0.25 lifetime cap and no reset | FAIL | The matched row showed **$5 MONTH**, not the required lifetime cap. |
| Zero prior usage | FAIL | The matched row showed nonzero historical usage, displayed as **< $0.001**, and prior use. |
| BYOK included in the cap | NOT VERIFIED | Inspection stopped after the financial prerequisites failed. |
| Approved model access and provider restrictions | NOT VERIFIED | No key-level guardrail was assigned. Effective workspace/provider policies, BYOK disablement, and authenticated model access were not verified after the financial gate failed. |
| Six synthetic fixtures available | PASS | All six IDs in the fixture table below are present in `tests/fixtures/skill-diffs.json`. |
| Production-compatible analyzer and schema | PASS for code inspection only | The harness imports `analyzeSkillUpdate` from `src/lib/skill-analysis.ts`; no alternate analyzer or schema was introduced. Live compatibility remains NOT RUN. |

The dashboard was inspected read-only at [OpenRouter API Keys](https://openrouter.ai/workspaces/default/keys). No key settings, account policies, production environment variables, or application code were modified.

## Campaign controls inspected

The existing [evaluation harness](../../scripts/evaluate-skill-updates.ts), [budget guard](../../scripts/skill-eval-budget.ts), and [analyzer](../../src/lib/skill-analysis.ts) were read without modification:

- At most six sequential paid inference dispatches, with one application attempt per fixture and no SDK retries. The [execution context](../../src/lib/ai-resilience.ts) supplies `maxRetries: 0` on each request, overriding the shared client's default.
- One `GET /api/v1/key` preflight validates the cap, reset, BYOK accounting, zero prior usage, and remaining allowance before dispatching inference.
- The analyzer retains strict JSON Schema, Zod parsing, comparative citation checks, and conservative recommendation rules.
- The transport fixes the requested model, disables provider fallbacks, and requires parameter support. It disallows alternate model lists, tools, and plugins.
- Limits are 25 seconds per request, 180 seconds overall, 3,000 output tokens per request, and a $0.25 campaign cap.
- The transport also enforces the documented request-byte and routing-price ceilings. Returned token counts and reported costs must be present and within allowance.
- Provider, validation, timeout, missing billing, or budget failures stop the live campaign. There was no attempt to relax a guard or substitute another model/provider.

These are inspected controls, not fresh live results. The documented live command was **NOT RUN** because the dashboard evidence already falsified mandatory prerequisites:

```bat
node --env-file=.env.skill-eval node_modules/tsx/dist/cli.mjs scripts/evaluate-skill-updates.ts --live --model=deepseek/deepseek-v4-flash-0731
```

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
| Dedicated-key API preflights | **0 of 1**; dashboard verification stopped execution earlier |
| Inference token usage | **0**; no dispatches |
| Actual inference spend | **$0** |
| Failed inference requests | **0**; no requests attempted |
| Generation IDs | None |
| Unknown or pending campaign charges | None caused by this campaign; no inference was dispatched |
| Reports generated / quality accepted | **0 / 0**; quality review was not performed |
| Cost per accepted report | **Undefined**, because there are no accepted reports |

There are no campaign generation IDs or activity entries to reconcile. The key's preexisting nonzero usage is historical activity, not evaluation spend; that historical activity was not reconciled or charged to this campaign. No second key preflight, paid probe, retry, or fallback request was made.

## Required next action

Provision a **fresh, unused, unshared** evaluation key in `SKILL_EVAL_OPENROUTER_API_KEY`, with a $0.25 lifetime cap, no reset, and BYOK spend included in that cap. Verify the approved model allowlist, eligible provider restrictions, and disabled BYOK for this campaign as required by the runbook. Changing the limit on the already-used key would not satisfy the zero-prior-usage requirement.

After those prerequisites exist, the approved harness can perform its single API preflight and the bounded six-fixture campaign. Reconcile all returned generation IDs, failures, and charges before revoking that campaign's dedicated key. Human acceptance must be recorded separately from the harness's schema/citation checks.

Hosted preview, production registration, baseline ingestion, deployment, and cron activation remain **NOT STARTED**. No database or GitHub ingestion was run during this Phase B attempt.

## Verification scope

- PASS: read-only inspection of the runbook, analyzer, schema, budget guard, all six fixtures, and the matching dashboard key row.
- NOT RUN: live harness, API preflight, model-quality review, and live billing/generation reconciliation; blocked by the key prerequisites above.
- No application-code changes were made. Lint, typecheck, application tests, and build are not evidence for this blocked live boundary and were not run for this documentation-only change.
