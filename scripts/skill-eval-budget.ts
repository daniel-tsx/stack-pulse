import assert from 'node:assert/strict'
import { skillDiagnostics } from '../src/lib/skill-diagnostics'

export const SKILL_EVAL_CAMPAIGNS = {
  'deepseek/deepseek-v4-flash-0731': {
    provider: 'digitalocean',
    inputPrice: 0.119,
    outputPrice: 0.238,
  },
  'openai/gpt-6-luna': { provider: 'openai', inputPrice: 0.1, outputPrice: 0.5 },
} as const

export const SKILL_EVAL_RUBRIC = [
  'Strict schema and Zod validity; exact comparative changed-text citations.',
  'Distinguish complete source facts, recommendation evidence and untested runtime effects.',
  'No unsupported claims, invented tests, vulnerabilities or execution guarantees.',
  'Useful advisory recommendation consistent with coverage and mandatory-review policy; explain deviations from fixture label.',
] as const

export const SKILL_EVAL_BUDGET = Object.freeze({
  requests: 6,
  inputTokensPerRequest: 12000,
  outputTokensPerRequest: 3000,
  requestBytes: 11000,
  requestMs: 25000,
  totalMs: 180000,
  usd: 0.25,
  maxPrice: { prompt: 0.2, completion: 0.75, request: 0 },
})

export const SKILL_EVAL_COST_ALLOWANCE =
  (SKILL_EVAL_BUDGET.requests *
    (SKILL_EVAL_BUDGET.inputTokensPerRequest * SKILL_EVAL_BUDGET.maxPrice.prompt +
      SKILL_EVAL_BUDGET.outputTokensPerRequest * SKILL_EVAL_BUDGET.maxPrice.completion)) /
  1e6

export function verifyEvalKey(data: {
  limit?: number | null
  limit_reset?: string | null
  limit_remaining?: number | null
  include_byok_in_limit?: boolean
  usage?: number
  byok_usage?: number
}) {
  assert.ok(
    typeof data.limit === 'number' && data.limit > 0 && data.limit <= SKILL_EVAL_BUDGET.usd,
    'A dedicated key capped at $0.25 or less is required',
  )
  assert.equal(data.limit_reset, null, 'Key limit must never reset')
  assert.equal(data.include_byok_in_limit, true, 'BYOK must count toward the key cap')
  assert.equal(data.usage, 0, 'Use a fresh, unshared evaluation key')
  assert.equal(data.byok_usage, 0, 'Use a fresh, unshared evaluation key')
  assert.ok(
    typeof data.limit_remaining === 'number' && data.limit_remaining >= SKILL_EVAL_COST_ALLOWANCE,
    'Reserve the six-request token-price allowance',
  )
}

export function createEvalFetch(model: string, transport: typeof fetch, signal: AbortSignal) {
  const profile = SKILL_EVAL_CAMPAIGNS[model as keyof typeof SKILL_EVAL_CAMPAIGNS]
  assert.ok(profile, 'Select one of the two reviewed benchmark candidates')
  let requests = 0
  const audit: {
    status: number
    generationId: string | null
    diagnostics: ReturnType<typeof skillDiagnostics>
    rawContent: string | null
    reportedCostUsd: number | null
  }[] = []
  const guardedFetch: typeof fetch = async (input, options) => {
    signal.throwIfAborted()
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    assert.equal(
      url,
      'https://openrouter.ai/api/v1/chat/completions',
      'Only the evaluation endpoint is allowed',
    )
    assert.equal(options?.method?.toUpperCase(), 'POST')
    assert.ok(requests < SKILL_EVAL_BUDGET.requests, 'Evaluation request budget exhausted')
    assert.equal(typeof options.body, 'string')
    assert.ok(
      Buffer.byteLength(options.body as string, 'utf8') <= SKILL_EVAL_BUDGET.requestBytes,
      'Evaluation input byte allowance exceeded',
    )
    const body = JSON.parse(options.body as string)
    assert.equal(body.model, model)
    assert.equal(body.max_tokens, SKILL_EVAL_BUDGET.outputTokensPerRequest)
    assert.equal(body.response_format?.json_schema?.strict, true)
    assert.equal(body.provider?.require_parameters, true)
    assert.equal(body.tools, undefined)
    assert.equal(body.models, undefined)
    assert.equal(body.plugins, undefined)
    // Keep the production schema; restrict this campaign's eligible provider prices.
    body.provider = {
      ...body.provider,
      allow_fallbacks: false,
      only: [profile.provider],
      order: [profile.provider],
      max_price: SKILL_EVAL_BUDGET.maxPrice,
    }
    body.service_tier = 'default'
    body.usage = { include: true }
    const serialized = JSON.stringify(body)
    assert.ok(
      Buffer.byteLength(serialized, 'utf8') <= SKILL_EVAL_BUDGET.requestBytes,
      'Final serialized request exceeds byte allowance',
    )
    const headers = new Headers(options.headers)
    headers.set('X-OpenRouter-Metadata', 'enabled')
    requests++ // A timeout is still a dispatched, possibly billable request.
    const response = await transport(input, {
      ...options,
      headers,
      body: serialized,
      redirect: 'error',
      signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
    })
    const data = await response
      .clone()
      .json()
      .catch(() => ({}))
    const diagnostic = skillDiagnostics(data, response.headers, response.status)
    const content = data.choices?.[0]?.message?.content
    audit.push({
      status: response.status,
      generationId: diagnostic.generationId,
      diagnostics: diagnostic,
      rawContent: typeof content === 'string' && content.length <= 50000 ? content : null,
      reportedCostUsd:
        typeof data.usage?.cost === 'number' &&
        Number.isFinite(data.usage.cost) &&
        data.usage.cost >= 0
          ? data.usage.cost
          : null,
    })
    assert.notEqual(diagnostic.isByok, true, 'Unexpected external BYOK usage; stop and reconcile')
    return response
  }
  return { fetch: guardedFetch, audit, requests: () => requests }
}
