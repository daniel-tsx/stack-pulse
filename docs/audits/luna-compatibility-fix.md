# Luna request compatibility fix

**Status:** current

**Date:** October 24, 2026 (Asia/Saigon)

**Base revision:** `390a476`

**Scope:** local implementation and offline verification; no deployment

## Root cause and change

The [approved live smoke test](luna-live-compatibility-test.md) reproduced OpenRouter's
parameter-routing rejection: temperature `0` returned HTTP 404, removing temperature
returned a valid strict summary, and removing temperature plus
`reasoning.effort: "none"` returned valid summaries and upgrade advice. The actual error
identified incompatible requested parameters. This evidence predates this implementation;
**no paid inference was performed in this run**.

In [the AI integration](../../src/lib/ai.ts), one small shared
`getModelRequestParameters(model, temperature)` function now chooses request fields:

| Configured model            | Summary                                                       | Upgrade advice                           |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Exactly `openai/gpt-6-luna` | Omit temperature; `reasoning: { effort: 'none' }`             | Same                                     |
| Every other model ID        | Temperature `0`; no explicit reasoning                        | Temperature `0.2`; no explicit reasoning |
| No configured model         | Existing `deepseek/deepseek-chat` default and temperature `0` | Existing default and temperature `0.2`   |

Both callers retain `max_tokens: 2000`, strict `json_schema`, the complete existing
schemas, and `provider: { require_parameters: true }`. The diagnostic-only
`allow_fallbacks: false` was not introduced into production requests. No alternate model,
provider selection policy, environment variable or new dependency was added.

Request objects now have an explicit `OpenRouterChatParams` annotation instead of a type
assertion. That type extends the installed OpenAI SDK `6.38.0`
`ChatCompletionCreateParamsNonStreaming` contract. Its OpenRouter-only nested reasoning
field uses the SDK's `ChatCompletionReasoningEffort` type. No `any`, broad suppression or
new unchecked request cast was needed.

The canonical [AI documentation](../features/ai-summarization.md) now records this model
exception. The original live investigation report is preserved as historical execution
evidence, including its limits and request identifiers.

## Compatibility and safety

The exact-ID comparison deliberately does not match other Luna names or variants.
Regression cases cover exact Luna, explicit DeepSeek, the unset-model DeepSeek default,
and another Luna ID. Other models retain their previous parameters.

The summary/advice prompts, input and return types, JSON Schemas, Zod schemas and
normalization are unchanged. Callers in release ingestion, custom-repository processing,
the backfill script and the advice route keep their existing contracts. The shared
OpenAI client and the separate skill-analysis caller are unchanged.

`src/lib/ai-resilience.ts` is unchanged: one default summary lane, bounded retries and
cooldowns, cancellation, deadlines and safe errors remain intact. Advice retains its
existing client timeout and SDK retry behavior. Ingestion still summarizes before
persistence; no database schema, application response, scheduler or notification contract
was changed.

## Offline regression evidence

Six new cases in [the existing recovery suite](../../tests/cron-recovery.test.mjs) execute
the actual TypeScript integration and installed SDK with synthetic environment values and
a fully mocked HTTP transport. They inspect `JSON.parse(config.body)` from the SDK fetch
boundary, rather than testing only a constructed object. No local `.env` is loaded by
these tests, and no real provider or database is contacted.

The tests verify both callers' serialized temperature omission and nested reasoning,
absence of the alternative `reasoning_effort` field, exact model identity, unchanged
2,000-token cap, strict schema names and required fields, and unchanged provider settings.
They also check successful summary persistence mapping in the in-memory fixture, Zod
defaults, advice text normalization and coverage fallback, and rejection of invalid
summary/advice values for Luna and DeepSeek. Existing assertions were preserved.

Before the implementation, the focused run produced **5 PASS / 1 expected FAIL**: exact
Luna still serialized temperature. After the change it produced **6 PASS / 0 FAIL / 0
SKIP**.

| Check                                        | Result                     | Evidence / limitation                                                                              |
| -------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| Focused configuration/validation regressions | **PASS**                   | 6 executed, 6 passed, 0 failed/skipped                                                             |
| Existing cron/F2 suite plus new regressions  | **PASS for offline cases** | 134 passed, 0 failed, 1 SQL test deliberately skipped; 135 discovered                              |
| Typecheck                                    | **PASS**                   | Repository TypeScript 7 `tsc --noEmit`                                                             |
| ESLint                                       | **PASS**                   | Full repository `eslint`                                                                           |
| Formatting / whitespace / doc links          | **PASS**                   | Edited-file Prettier check, `git diff --check`, and local document links/statuses                  |
| Production build                             | **NOT RUN**                | No verified isolated build database target; prerendering calls database-backed stack/skill readers |
| Real SQL / hosted integration                | **NOT RUN**                | Database writes and production access are excluded from this task                                  |
| Live inference / cron / deployment           | **NOT RUN**                | Explicitly prohibited in this implementation run                                                   |

The SQL test requires explicit ownership-verified target variables. They were cleared in
the test subprocess to prevent any database mutation. The full suite's SQL skip is not
claimed as integration evidence. The other 128 existing recovery cases still passed,
including retries, cooldowns, deadlines, concurrency, invalid responses, deduplication,
confirmed insert accounting and cancellation.

The ordinary pnpm shim could not download the pinned version in the sandbox. The
already-cached **pnpm 11.1.3** CLI was verified and used to execute the repository scripts:

```bat
node --test --test-name-pattern=Luna.compatibility tests/cron-recovery.test.mjs
set SKILL_TEST_DATABASE_URL=&& set SKILL_TEST_TARGET_FILE=&& node node_modules/.cache/workflow-corepack/v1/pnpm/11.1.3/bin/pnpm.cjs test:cron
node node_modules/.cache/workflow-corepack/v1/pnpm/11.1.3/bin/pnpm.cjs typecheck
node node_modules/.cache/workflow-corepack/v1/pnpm/11.1.3/bin/pnpm.cjs lint
node node_modules/prettier/bin/prettier.cjs --check src/lib/ai.ts tests/cron-recovery.test.mjs docs/features/ai-summarization.md docs/audits/luna-compatibility-fix.md
git diff --check
```

Build isolation was assessed against the installed Next.js environment-loading guidance,
the Neon HTTP database client, and stack/skill prerendering callers. A native local SQL
test cluster is not an application Neon HTTP build target. The build was not started
against the checkout's unverified environment. No environment file was moved or changed.

## Review and remaining limitations

Ponytail Review with the Eastbase overlay was applied as a self-review, not an independent
review. The final change is limited to model request fields, their checked types, focused
regressions and documentation. No blocking correctness, contract, retry/spend or data-safety
finding was identified in that scope.

Reasoning `none` follows the requested configuration and the prior synthetic smoke test.
That sample is not proof of equivalent quality on long, ambiguous releases or complex
upgrade questions. Offline fixtures establish serialization and validation, not new model
quality or hosted availability. No production freshness, backlog recovery, latency or
cost improvement is claimed by this local change.

## Deployment and rollback considerations

This implementation is ready for review of the locally verified request change;
deployment and the full production build remain separate. No migrations, new environment
variables, scheduler changes or infrastructure changes are required.

After separate deployment authorization and build verification against an isolated
environment, observe normal scheduled ingestion and authorized advice usage. Check
parameter-routing errors, valid summary/advice outputs, confirmed inserts, AI attempts,
latency, deferrals and spend. Do not manually invoke cron, backfill or paid tests as an
automatic rollout check.

If reasoning `none` causes a quality regression, a separately reviewed rollback can remove
that optional setting while continuing to omit temperature; smoke configuration B already
demonstrated routing compatibility. Reverting the entire Luna request change restores
the known incompatible temperature-bearing request. Any model or credential change
requires separate authorization.

No commit, push, deployment, production access, database write, paid provider request or
live notification occurred. The pre-existing untracked live-smoke report was preserved.
