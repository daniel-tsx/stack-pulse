# AI summarization

**Status:** current

## Provider

- **OpenRouter** via OpenAI SDK (`src/lib/ai.ts`)
- Base URL: `https://openrouter.ai/api/v1`
- Model: `OPENROUTER_MODEL` env or default `deepseek/deepseek-chat`
- Requires `OPENROUTER_API_KEY`

## Release summarisation

`summarizeRelease()` — called during ingestion. Returns structured JSON validated with Zod:

- summary, new features, breaking changes, security notes, deprecations, migration steps
- importance level, release signals, optional code snippet
- Stored on `release_updates` including `summary_model`, `summarized_at`, `raw_release_body`

### Summary reliability

`src/lib/ai-resilience.ts` creates an execution-scoped FIFO queue with the conservative
default of **one active summary**, including its retries. The factory accepts an internal
`concurrency:2` option; other values fall back to one. Cron uses the default and shares it across repositories;
GitHub discovery still runs in chunks of six. There is no new environment variable or
cross-instance limiter. Throughput tuning requires a reviewed change to this default.

Application code owns summary retries: each SDK call uses `maxRetries:0`, with at most
**three total SDK attempts** for rate limits, overload or provider unavailability. Native
fetch redirects can add HTTP dispatches within an attempt; transport redirect hardening
remains a deferred P2 finding. Valid
`Retry-After` seconds/HTTP dates and `retry-after-ms` are respected (the later hint wins).
Otherwise exponential backoff starts at 1s, with 0.75–1.25 jitter. A wait over 10s fails
explicitly instead of retrying early. Rate/provider failures establish a shared cooldown,
even after exhaustion or when `x-should-retry:false` forbids retrying that operation.

Cron AI queueing, requests and waits share the invocation's cooperative 270s work cutoff;
request timeout is the lesser of 25s and remaining time, with a combined cancellation
signal also covering response-body reading. Cancelled 429/5xx error-body reads are terminal,
retain their HTTP status, and do not activate cooldown or retry.
Less than 1s remaining prevents dispatch. Standalone summary calls and custom-repository
processors receive a local 90s budget. Queue/cooldown state never persists across runs.

Invalid summaries/JSON, timeouts/cancellation, authentication, exhausted credits and unknown
errors are not retried. Authentication/credit failure blocks further AI dispatch in that
execution. OpenRouter's explicitly identified 402 in-flight budget with a usable retry
header is treated as a transient limit, distinct from exhausted credits.

Top-level and selected choice-level HTTP-200 provider errors, including
`finish_reason:error`, are rejected before accepting content. Valid numeric error codes
use the existing sanitized classifier; malformed envelopes are invalid responses.
An extra `error` property inside summary JSON does not make it a provider envelope.
Only validated summaries
are returned; there is no fabricated success fallback. Safe errors report category,
gateway/model, HTTP status, attempt/retry count and final reason. Known StreamLake/DeepInfra
provider names and numeric GitHub release IDs are included where available; raw provider
payloads, prompts, response headers and credentials are excluded. See
[F2 implementation record](../audits/F2-ai-rate-limit-resilience.md) and
[F2.1 fixes and verification](../audits/F2.1-review-fixes.md).

## Upgrade advice

`adviseOnRelease()` — used by `POST /api/release-advice`:

- Input: release ID, question, optional `currentVersion`, `projectContext`
- Loads related releases in upgrade range for coverage context
- Output: risk level, answer, blockers, next steps

Rate limits and payload caps in `src/app/api/release-advice/route.ts`.
Advice retains the shared client's existing 25s timeout and one SDK retry; F2's summary
queue and application retry loop do not wrap this caller.

## Backfill

`pnpm releases:backfill [--limit=N] [--tech=slug] [--dry-run]` for rows missing summaries.
This existing-row script receives bounded retries per summary but does not share the
cron's execution context. It cannot discover absent releases. AI still precedes release
persistence; durable pending summaries and outage discovery/backfill remain separate work.
