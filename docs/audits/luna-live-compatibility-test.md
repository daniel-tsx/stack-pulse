# Luna live compatibility smoke test

**Status:** current

**Executed:** October 24, 2026, 09:03:02.987–09:03:15.621 Asia/Saigon (02:03 UTC)

**Revision:** `390a476`

**Run ID:** `1353097c-f349-4f64-a722-ed5184fd0a17`

**Verdict:** **LUNA_COMPATIBLE_WITH_CHANGES**

The current release request reproduced HTTP 404 with an explicit parameter-routing error.
Removing only temperature restored a valid strict structured response. Adding
`reasoning.effort: "none"` also worked, used zero reasoning tokens, and was faster and
cheaper in this single sample. Upgrade advice using that configuration passed too.
Explicit reasoning configuration is therefore optional for routing; omitting temperature
is the smallest demonstrated compatibility change.

## Environment and isolation

- Windows Command Prompt; Node `v24.22.1`; installed OpenAI SDK `6.38.0`, Zod `4.4.3`.
- Loaded the existing environment using `node --env-file=.env`, matching the repository's
  env-file convention. Existing process environment takes precedence. Confirmed both
  `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` were present and the model was exactly
  `openai/gpt-6-luna`. The key was neither printed nor changed.
- Executed the actual [AI integration](../../src/lib/ai.ts),
  [F2 resilience](../../src/lib/ai-resilience.ts), and execution-budget modules through
  the repository's existing TypeScript/VM test pattern. The import allowlist excluded
  database, cron, authentication, ingestion and notification modules.
- Used the existing summary/advice prompts, JSON Schemas, Zod schemas and application
  validation/normalization. Private schemas were exposed only inside the temporary
  transpiled diagnostic context; application files were not edited.
- Four sequential OpenRouter POSTs; no SDK retries, no application retries, maximum
  25 seconds per request including body reading, `max_tokens: 2000` throughout.
  A durable local dispatch ledger prevented automatic replay after an uncertain outcome.
- **Common diagnostic safety addition:** every arm included
  `provider.allow_fallbacks: false` to honor the instruction against automatic provider
  switching. `provider.require_parameters: true` remained enabled. No provider order,
  alternate model, model fallback list or model-switching policy was added. Redirects
  were rejected. Initial provider selection remained OpenRouter's; all successful arms
  reported OpenAI.
- A is consequently production-style with the disclosed no-failover safeguard, rather
  than a byte-for-byte capture of a deployed request. The safeguard was identical in all
  four arms and was not varied to obtain success.

No production database access, real user data, cron invocation, environment/configuration
write, deployment, commit or push occurred. A public, unauthenticated endpoint-catalog
GET supplied current capabilities/pricing; it was not inference. The sandbox initially
blocked that GET; approved network execution succeeded before any inference was attempted.

## Inputs, payloads and validation

All summary arms used this synthetic release:

```text
Repository: SyntheticParser
Version/tag: v1.0.1
Title: Parser crash fix
Notes: Fixes a parser crash when input is empty. No API changes.
Source: https://example.test/releases/v1.0.1
Prerelease: no
```

The application constructed its normal system/user messages and the complete
`release_summary` schema. The transport asserted that the installed SDK serialized the
intended body, including `reasoning: { effort: "none" }` for C/D. A/B/C differed only in
the two fields below; model, messages, schema, token limit and provider preferences were
asserted equal.

| Test | Purpose             | Temperature | Reasoning        | Strict schema                             | Provider requirements / failover |
| ---- | ------------------- | ----------- | ---------------- | ----------------------------------------- | -------------------------------- |
| A    | Summary baseline    | `0`         | Absent           | `release_summary`, `strict: true`         | Required / disabled              |
| B    | Isolate temperature | Omitted     | Absent           | Same as A                                 | Same as A                        |
| C    | Disable reasoning   | Omitted     | `effort: "none"` | Same as A                                 | Same as A                        |
| D    | Upgrade advice      | Omitted     | `effort: "none"` | Existing `release_advice`, `strict: true` | Same as A                        |

D ran only after B and C returned valid, nonempty summaries. C was selected because both
were valid and C had lower observed latency, output usage and reported cost. D used
synthetic current version `1.0.0`, the same patch facts, a fictional service accepting
empty input, and the existing coverage note limiting evidence to the supplied release.

Independent JSON Schema validation used the already-installed ESLint dependency Ajv
`6.x` against the actual request schemas. The actual application Zod validators also ran.
Offline negative controls confirmed that missing required fields and additional object
properties fail strict schema validation; Zod's acceptance alone was not treated as proof
that every strict JSON Schema requirement was satisfied.

Payload provenance (SHA-256):

| Evidence                            | Hash                                                               |
| ----------------------------------- | ------------------------------------------------------------------ |
| `src/lib/ai.ts`                     | `52cc891a526da7ebced22c88ece20665b945544b12cca4b5d33ef6639d366a5d` |
| Shared A/B/C messages               | `eb7bfdd73d3ce74cd6bc446ea7cdb6618d7ac8f54adb396dbd02f3335fbf7f44` |
| Shared A/B/C response format/schema | `53a40f69212d6ca29b68d0fe9733bb378027076ed44f0a362413f7582bb06092` |
| D response format/schema            | `8c622e13d5dc896714eb3d7f7802a7724212e49915339dc74606e65504f1f9f0` |

## Live results

Every request targeted and, when successful, returned model `openai/gpt-6-luna`.
Latency measures the application call through response reading and application Zod
validation; harness startup is excluded. Completion tokens include reasoning tokens.

| Test | HTTP / result    |  Latency | Provider      | Prompt tokens | Completion tokens | Reasoning tokens | Reported cost USD |
| ---- | ---------------- | -------: | ------------- | ------------: | ----------------: | ---------------: | ----------------: |
| A    | **404 / failed** |   836 ms | None reported |   Unavailable |       Unavailable |      Unavailable |       Unavailable |
| B    | **200 / passed** | 4,718 ms | OpenAI        |           632 |               311 |              146 |        $0.0002187 |
| C    | **200 / passed** | 3,639 ms | OpenAI        |           632 |               121 |                0 |        $0.0001237 |
| D    | **200 / passed** | 3,420 ms | OpenAI        |           478 |               164 |                0 |        $0.0001298 |

| Test | Finish reason | Valid JSON          | Strict JSON Schema  | Actual Zod          | Meaningful, nonempty |
| ---- | ------------- | ------------------- | ------------------- | ------------------- | -------------------- |
| A    | None          | NOT RUN: no content | NOT RUN: no content | NOT RUN: no content | No output            |
| B    | `stop`        | PASS                | PASS                | PASS                | PASS                 |
| C    | `stop`        | PASS                | PASS                | PASS                | PASS                 |
| D    | `stop`        | PASS                | PASS                | PASS                | PASS                 |

B and C returned all 13 required summary fields, accurate empty-input parser-crash
summaries, and no invented feature, breaking-change or security-fix lists. Both extracted
version `1.0.1` from tag `v1.0.1`, consistent with extracting the version number; ingestion
uses the original GitHub tag for persistence. For example, C summarized:

> Fixes a crash that occurred when the parser received empty input. The release notes report no API changes.

D returned all six required advice fields, risk `low`, source-backed upgrade advice and
empty-input/regression test steps. It did not invent migration requirements. This verifies
the short synthetic cases only, not a broader release-quality evaluation.

### Sanitized HTTP error and identifiers

A returned:

```json
{
  "error": {
    "code": 404,
    "message": "No endpoints found that can handle the requested parameters. To learn more about provider routing, visit: https://openrouter.ai/docs/guides/routing/provider-selection"
  }
}
```

No provider name, provider-specific code or typed error was returned for A. Its F2 result
was `UNKNOWN_ERROR`, `NON_RETRYABLE`, attempt `1`, retry count `0`, with no cooldown.
The selected upstream message was captured before F2 discarded it. B/C made one
application attempt each with zero retries; D's SDK retries were explicitly disabled.

A dedicated OpenRouter request ID was not present in the inspected request-ID headers
or selected response field. The following returned generation IDs and Cloudflare trace
IDs are separate correlation identifiers, not substitutes mislabeled as request IDs:

| Test | Generation ID                         | Cloudflare `cf-ray`    |
| ---- | ------------------------------------- | ---------------------- |
| A    | None returned                         | `a4f567495f04250b-HKG` |
| B    | `gen-1792807390-rd70m73ZSHtU0uUZtxKL` | `a4f5674da838250b-HKG` |
| C    | `gen-1792807395-Xo6vqeU47MW6PJCjMLQc` | `a4f5676b38d1250b-HKG` |
| D    | `gen-1792807398-GQNweyFeZdQD5Dfkx3TP` | `a4f56781fa22250b-HKG` |

### Cost and budget accounting

B/C/D returned `usage.cost`; their reported sum is **$0.0004722**. A returned no usage or
cost, so the complete billed total is not independently established and A is not assumed
free. Successful costs agree with current OpenAI endpoint base pricing of $0.10/M input
and $0.50/M completion tokens, with no cached input reported.

Before every dispatch, the harness reserved the next request's conservative cost against
the $0.02 target. The reservation used UTF-8 payload bytes plus 1,024 framing tokens,
2,232 completion tokens (2,000 plus margin), and the highest base input/output rates
across the catalog's Luna endpoints, including priority. Input accounting conservatively
added prompt, cache-write and cache-read rates. These short bounded inputs are far below
the 272K long-context pricing threshold. Reservations are diagnostic bounds, not bills.

A's unreported cost retained its **$0.0042577** reservation. Adding B/C/D's reported
costs gave **$0.0047299** conservative budget accounting, below $0.02. All four allowed
POSTs were used; no additional inference is authorized by this run.

## Root cause assessment

**High confidence: temperature-dependent provider filtering caused the reproduced 404.**
The upstream body explicitly identified incompatible requested parameters. B changed only
temperature and succeeded with the same model, messages, strict schema and
`require_parameters: true`. This is evidence beyond HTTP status alone.

| Possible cause                       | Assessment from this run                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Model not found                      | Not the explanation reproduced: B/C/D served the exact configured model.                                              |
| No compatible endpoint               | Confirmed for A by its explicit error body.                                                                           |
| Unsupported parameters               | Temperature is strongly isolated by A/B; current endpoint capability metadata also omits temperature.                 |
| Authentication / billing restriction | No such error observed; the same configured credential served B/C/D. This is not a general account-permissions audit. |
| Strict schema incompatibility        | Both existing schemas passed with strict mode and parameter requirements preserved.                                   |
| Default reasoning blocks routing     | Disproved for this synthetic case: B succeeded without an explicit reasoning setting and used 146 reasoning tokens.   |
| Upstream provider outage             | No upstream outage error was observed. One sample cannot exclude intermittent provider failures.                      |

This strongly corroborates the October 23 production failure mechanism. It does not
recover the historical production error body or prove every historical error had the
same cause. F2's safe classification alone was insufficient to establish it.

## Recommended configuration and required code change

For `openai/gpt-6-luna`, omit temperature in both `summarizeRelease()` and
`adviseOnRelease()`. **That deletion is the smallest live-demonstrated fix.**

Prefer the tested C configuration for these short extraction/advice tasks:

```ts
// Luna-specific request fields; omit temperature entirely.
reasoning: { effort: 'none' },
max_tokens: 2000,
response_format: existingStrictResponseFormat,
provider: { require_parameters: true },
```

The example retains the production provider policy. The diagnostic's common
`allow_fallbacks: false` was an isolation constraint, not a required compatibility change.
Keep other models' existing parameters and F2's concurrency, deadlines and retry policy.
If implemented, represent the OpenRouter `reasoning` extension explicitly in its local
request type. No model/credential change, migration or new environment variable is needed.

Reasoning `none` is supported and reduced latency, completion usage and cost in this
sample; it is **not necessary to resolve the routing failure**. The 146 versus zero
reasoning tokens and 4,718 versus 3,639 ms observations are not a throughput benchmark
or proof of equivalent quality across longer releases.

Application code changes are required for durable compatibility because both existing
callers unconditionally send temperature. **No production implementation was changed.**

## Safe rollout and rollback recommendations

1. Separately authorize a focused Luna-only request change and offline SDK payload
   regressions for both callers. Assert temperature omission, reasoning serialization,
   preserved strict schema, actual Zod validation and unchanged parameters for other models.
2. Run relevant recovery tests, `pnpm typecheck` and `pnpm lint`, then obtain review and
   normal deployment authorization. This smoke test does not authorize deployment.
3. Observe the next normally scheduled ingestion and approved advice usage. Inspect
   parameter-routing errors, confirmed inserts, AI attempts/retries, latency, deferrals,
   schema failures and spend. Do not trigger cron or backfill as a verification shortcut.
4. If disabling reasoning causes a quality regression, remove only that optional setting
   while retaining temperature omission; B demonstrated that configuration. Restoring the
   old temperature-bearing Luna payload would restore the observed incompatibility.
   Any full code rollback should explicitly acknowledge that consequence. Model or
   credential rollback requires its own authorization; neither is part of this report.

## Verification and cleanup

| Check                                                     | Result                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Environment/model and offline payload/validator preflight | **PASS**; no key printed                                                                                   |
| Live summary A/B/C                                        | **A reproduced the failure; B and C PASS**                                                                 |
| Conditional live advice D                                 | **PASS**                                                                                                   |
| Live-call accounting                                      | **PASS**; exactly four sequential POSTs, zero retries                                                      |
| Offline evidence audit                                    | **PASS**; A/B/C messages/schema equality, source hashes unchanged, no pending request, budget below target |
| Report formatting and relative links                      | **PASS**; Prettier check and all three local links                                                         |
| Working-tree whitespace check                             | **PASS**; `git diff --check`                                                                               |
| Typecheck, lint, build and full recovery suite            | **NOT RUN in this task**; no application code changes                                                      |
| Database, cron and deployment verification                | **NOT RUN**; outside the authorized smoke test                                                             |

Execution commands used the ignored directory
`node_modules/.cache/luna-live-compatibility/`:

```bat
node --env-file=.env node_modules/.cache/luna-live-compatibility/diagnostic.mjs preflight
node --env-file=.env node_modules/.cache/luna-live-compatibility/diagnostic.mjs live
node node_modules/.cache/luna-live-compatibility/check-results.mjs
node node_modules/prettier/bin/prettier.cjs --check docs/audits/luna-live-compatibility-test.md
git diff --check
```

Temporary diagnostic scripts, catalog snapshot and local result ledger were removed
after retaining the necessary evidence here. Only this requested report was added.

## Official references

- [Live Luna endpoint capabilities and pricing](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints)
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Reasoning tokens and shared output budgets](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [OpenRouter error handling](https://openrouter.ai/docs/api_reference/errors-and-debugging)
- [Current application AI contract](../features/ai-summarization.md)
