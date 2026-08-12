# MCP server

**Status:** current

**Last verified:** 2026-08-12

Remote MCP server exposing StackPulse's public release data to AI agents (Claude Code, Claude Desktop, Cursor, etc.) over streamable HTTP.

## Endpoint

`POST /api/mcp/mcp` — `src/app/api/mcp/[transport]/route.ts`, built on Vercel's
`mcp-handler` 2.x and `@modelcontextprotocol/server` 2.x. Public, read-only, no auth. Per-IP
rate limit: 120 requests/hour (in-memory).

The handler serves the current stateless MCP protocol and a stateless fallback for 2025-era
Streamable HTTP clients. MCP-over-SSE is not served.

## Tools

| Tool | Input | Returns |
|------|-------|---------|
| `list_stacks` | — | Registry stacks with slug, category, repo, release stats |
| `get_releases` | `stack` slug, `limit` (≤20) | AI-distilled releases: summary, breaking/security/deprecations/migrations, importance, source URL |
| `get_upgrade_plan` | `stack`, `from_version` | Aggregated upgrade plan between version and latest (reuses `src/lib/upgrade-plan.ts`) |
| `search_releases` | `query`, `limit` (≤30) | Full-text search via `getReleaseFeedPage` public scope |

All results are JSON in a single text content block. Custom repos (`category: 'custom'`) are excluded from `list_stacks`.

## Connecting

Claude Code:

```bash
claude mcp add --transport http stackpulse https://<domain>/api/mcp/mcp
```

Cursor / Claude Desktop (`mcpServers` config):

```json
{ "mcpServers": { "stackpulse": { "url": "https://<domain>/api/mcp/mcp" } } }
```

## Verification

```bash
curl -s -X POST http://localhost:3000/api/mcp/mcp \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
