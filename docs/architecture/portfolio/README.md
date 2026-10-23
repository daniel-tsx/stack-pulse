# StackPulse portfolio architecture image

**Status:** current  
**Verified:** 2026-10-07 against checkout `0717470`

One composition, exported in two formats:

- [PNG](./stackpulse-architecture.png): 3840 × 2160, opaque sRGB, 16:9. Use this for the portfolio upload.
- [SVG](./stackpulse-architecture.svg): 1920 × 1080 viewBox, editable text and vector shapes. Text uses Consolas and Arial with monospace/sans-serif fallbacks; the PNG fixes the rendered appearance across platforms.

The image adapts the context diagram and ingestion/feed sequences in [system-overview.html](../system-overview.html), the architecture in [DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md), and [ADR-004: AI before insert](../decisions/004-ai-before-insert.html). It uses the existing dark/lime palette and Beat Stack mark from [logo-mark.svg](../../../public/brand/logo-mark.svg).

## Implementation references

| Image element | Source of truth |
| --- | --- |
| Twice-daily checks at 00:00 / 12:00 UTC | [vercel.json](../../../vercel.json) |
| Cron handler, registry/custom scope, processing batches | [cron route](../../../src/app/api/cron/fetch-releases/route.ts) |
| Five latest releases per repo, draft/duplicate checks, AI before insertion | [release-ingestion.ts](../../../src/lib/release-ingestion.ts), [github.ts](../../../src/lib/github.ts) |
| OpenRouter through OpenAI SDK, structured output, Zod validation | [ai.ts](../../../src/lib/ai.ts) |
| Drizzle / Neon HTTP access, releases, raw notes, fetch-run audit | [db/index.ts](../../../src/db/index.ts), [db/schema.ts](../../../src/db/schema.ts) |
| Initial RSC data, React feed, pagination, filters and read state | [dashboard page](../../../src/app/(dashboard)/dashboard/page.tsx), [releases API](../../../src/app/api/releases/route.ts), [release-feed.ts](../../../src/lib/release-feed.ts), [feed component](../../../src/components/dashboard/release-feed.tsx) |

## Scope and documentation drift

This is a focused release data-flow diagram. The ingestion handler and UI belong to the same Next.js application; they are not separate deployed services. The lime arrows show the scheduled trigger and release data moving toward the feed. The cyan arrows show the external LLM request and response. The handler validates the returned summary before writing it to Neon. Fetch-run audit records are created and updated around processing, rather than only after summarization. UI reads run through server components and the releases API; the browser does not connect directly to Neon.

The overview still says only followed stacks are checked and describes a 60-second cron limit. Current code checks **all registry stacks plus followed custom repos** and uses a **300-second maximum with a 270-second internal budget**. The image follows the code. Older architecture pages also describe digest delivery, status UI and Sentry as absent; these now have implementations. Existing documentation was left unchanged in this asset-only task.

Auth, upgrade Q&A, immediate ingestion when adding a custom repository, email/webhook delivery and MCP are outside this thumbnail's scope. No queue, worker service, billing layer or unimplemented infrastructure was added to the diagram.

## Verification

Rendered locally with the existing `sharp` dependency at 144 DPI, with no added packages. Inspected the complete image and a 640 × 360 thumbnail; checked SVG parsing, dimensions, opaque PNG output, source claims and repository diff scope. Only these exports and this provenance note were added. Application typecheck/lint/build were not run because no application code or configuration changed. No live services, migrations or commits were used.
