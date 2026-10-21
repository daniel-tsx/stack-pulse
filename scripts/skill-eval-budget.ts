import assert from 'node:assert/strict'

export const SKILL_EVAL_BUDGET = Object.freeze({
  requests: 6,
  inputTokensPerRequest: 12000,
  outputTokensPerRequest: 3000,
  requestBytes: 11000,
  requestMs: 25000,
  totalMs: 180000,
  usd: 0.25,
  maxPrice: { prompt: 1, completion: 5, request: 0 },
})

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
    typeof data.limit_remaining === 'number' && data.limit_remaining >= 0.162,
    'Reserve $0.162 for all six worst-case requests',
  )
}

export function createEvalFetch(model: string, transport: typeof fetch, signal: AbortSignal) {
  let requests = 0
  const audit: { status: number; generationId: string | null }[] = []
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
      max_price: SKILL_EVAL_BUDGET.maxPrice,
    }
    requests++ // A timeout is still a dispatched, possibly billable request.
    const response = await transport(input, {
      ...options,
      body: JSON.stringify(body),
      redirect: 'error',
      signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
    })
    const data = await response
      .clone()
      .json()
      .catch(() => ({}))
    audit.push({
      status: response.status,
      generationId: typeof data.id === 'string' ? data.id.slice(0, 150) : null,
    })
    return response
  }
  return { fetch: guardedFetch, audit, requests: () => requests }
}
