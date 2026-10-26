import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as openai from 'openai'
import { loadTs } from './release-test-helpers.mjs'
import { verifyNeonTarget } from '../scripts/verify-skill-neon.mjs'

const diagnostics = loadTs('src/lib/skill-diagnostics.ts')
const budget = loadTs(
  'scripts/skill-eval-budget.ts',
  { '../src/lib/skill-diagnostics': diagnostics },
  { Buffer, AbortSignal },
)

test('approved skill schedule retains both existing cron jobs', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config.crons, [
    { path: '/api/cron/fetch-releases', schedule: '0 0,12 * * *' },
    { path: '/api/cron/send-digest', schedule: '0 14 * * 1' },
    { path: '/api/cron/fetch-skill-updates', schedule: '30 0,12 * * *' },
  ])
})
const executionBudget = loadTs(
  'src/lib/execution-budget.ts',
  {},
  { performance, AbortSignal, setTimeout, clearTimeout },
)
const resilience = loadTs(
  'src/lib/ai-resilience.ts',
  { openai, '@/lib/execution-budget': executionBudget },
  { AbortSignal, console: { info() {}, warn() {} } },
)
const path = 'skills/example/SKILL.md'
const report = {
  summary: 'Changed instructions',
  verifiedChanges: [
    {
      path,
      change: 'modified',
      beforeQuote: 'Require manual approval before changes.',
      afterQuote: 'Run automated verification after changes.',
    },
  ],
  capabilityChanges: [],
  behaviorImpact: [],
  securityConsiderations: [],
  impact: 'low',
  recommendation: 'update_candidate',
  justification: 'Review instructions',
  confidence: 'medium',
  limitations: [],
}
const input = {
  repository: 'synthetic/example',
  directory: 'skills/example',
  previousRevision: '1'.repeat(40),
  newRevision: '2'.repeat(40),
  evidence: {
    complete: true,
    limitations: [],
    totalChangedFiles: 1,
    files: [
      {
        path,
        status: 'modified',
        previousPath: null,
        previousBlob: null,
        newBlob: null,
        previousMode: '100644',
        newMode: '100644',
        before: report.verifiedChanges[0].beforeQuote,
        after: report.verifiedChanges[0].afterQuote,
        contentComplete: true,
      },
    ],
  },
}
const completion = (usage) => ({
  id: 'gen-synthetic',
  model: 'returned/model',
  provider: 'synthetic-provider',
  usage,
  choices: [{ message: { content: JSON.stringify(report) }, finish_reason: 'stop' }],
})
function harness(replies, runtime = {}, campaignModel) {
  let requests = 0,
    now = Date.now()
  const bodies = []
  const headers = []
  const transport = async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    headers.push(new Headers(options.headers))
    const reply = replies[Math.min(requests++, replies.length - 1)]
    return Response.json(reply.body, { status: reply.status ?? 200, headers: reply.headers })
  }
  const campaign = campaignModel
    ? budget.createEvalFetch(campaignModel, transport, new AbortController().signal)
    : null
  const client = new openai.default({
    apiKey: 'synthetic-offline',
    baseURL: 'https://openrouter.ai/api/v1',
    maxRetries: 0,
    fetch: campaign?.fetch ?? transport,
  })
  const analyzer = loadTs(
    'src/lib/skill-analysis.ts',
    {
      '@/lib/ai': { getOpenAI: () => client },
      '@/lib/ai-resilience': resilience,
      '@/lib/skill-diagnostics': diagnostics,
    },
    { performance, process: { env: {} } },
  )
  const execution = resilience.createAiExecutionContext(now + 60000, {
    now: () => now,
    sleep: async (ms) => {
      now += ms
    },
    random: () => 0,
    ...runtime,
  })
  return {
    run: (model) => analyzer.analyzeSkillUpdate(input, execution, model),
    bodies,
    headers,
    campaign,
    requests: () => requests,
  }
}

test('actual serialized SDK requests use each candidate model parameters with the same production schema and evidence', async () => {
  const requests = []
  for (const model of ['deepseek/deepseek-v4-flash-0731', 'openai/gpt-6-luna']) {
    const h = harness(
      [{ body: completion({ prompt_tokens: 10, completion_tokens: 20, cost: 0.001 }) }],
      { maxAttempts: 1 },
    )
    await h.run(model)
    const body = h.bodies[0]
    requests.push(body)
    assert.equal(body.model, model)
    assert.equal(body.temperature, undefined)
    assert.equal(body.provider.require_parameters, true)
    assert.equal(body.response_format.json_schema.strict, true)
    assert.deepEqual(
      body.reasoning,
      model === 'openai/gpt-6-luna' ? { effort: 'none' } : { enabled: false },
    )
    assert.equal(h.requests(), 1)
  }
  assert.deepEqual(requests[0].messages, requests[1].messages)
  assert.deepEqual(requests[0].response_format, requests[1].response_format)
})

test('sanitized 429 diagnostics survive SDK and analyzer wrapping without changing retry policy', async () => {
  const h = harness(
    [
      {
        status: 429,
        headers: {
          'retry-after': '2',
          'x-request-id': 'req-offline-123',
          'x-generation-id': 'gen-1790000000-Offline123',
        },
        body: {
          error: {
            code: 429,
            message: 'private-secret-request-body',
            metadata: {
              error_type: 'rate_limit_exceeded',
              provider_code: 'rate_limited',
              provider_name: 'DigitalOcean',
              raw: 'private-secret-request-body',
            },
          },
        },
      },
    ],
    { maxAttempts: 1 },
  )
  await assert.rejects(h.run(), (error) => {
    assert.equal(error.category, 'RATE_LIMITED')
    const [diagnostic] = error.telemetry.diagnostics
    assert.equal(diagnostic.httpStatus, 429)
    assert.equal(diagnostic.errorType, 'rate_limit_exceeded')
    assert.equal(diagnostic.providerCode, 'rate_limited')
    assert.equal(diagnostic.retryAfterMs, 2000)
    assert.equal(diagnostic.requestId, 'req-offline-123')
    assert.equal(diagnostic.generationId, 'gen-1790000000-Offline123')
    assert.equal(diagnostic.provider, 'DigitalOcean')
    assert.doesNotMatch(
      JSON.stringify(error.telemetry),
      /private-secret-request-body|authorization|Bearer/i,
    )
    return true
  })
  assert.equal(h.requests(), 1)
})

test('both benchmark campaigns serialize the same evidence/schema with pinned standard providers and no fallbacks', async () => {
  const bodies = []
  for (const [model, provider] of [
    ['deepseek/deepseek-v4-flash-0731', 'digitalocean'],
    ['openai/gpt-6-luna', 'openai'],
  ]) {
    const body = {
      ...completion({ prompt_tokens: 10, completion_tokens: 20, cost: 0.001, is_byok: false }),
      model,
    }
    const h = harness([{ body }], { maxAttempts: 1 }, model)
    await h.run(model)
    const [serialized] = h.bodies
    bodies.push(serialized)
    assert.deepEqual(serialized.provider.only, [provider])
    assert.deepEqual(serialized.provider.order, [provider])
    assert.equal(serialized.provider.allow_fallbacks, false)
    assert.equal(serialized.provider.require_parameters, true)
    assert.deepEqual(serialized.provider.max_price, { prompt: 0.2, completion: 0.75, request: 0 })
    assert.equal(serialized.service_tier, 'default')
    assert.equal(serialized.usage.include, true)
    assert.equal(serialized.models, undefined)
    assert.equal(h.headers[0].get('X-OpenRouter-Metadata'), 'enabled')
    assert.equal(h.headers[0].get('x-stainless-retry-count'), '0')
    assert.equal(h.requests(), 1)
  }
  assert.deepEqual(bodies[0].messages, bodies[1].messages)
  assert.deepEqual(bodies[0].response_format, bodies[1].response_format)
  assert.equal(budget.SKILL_EVAL_RUBRIC.length, 4)
  assert.equal(budget.SKILL_EVAL_COST_ALLOWANCE, 0.0279)
})

test('evaluation transport retains top-level 429 routing metadata lost by SDK errors and includes reported failure charges', async () => {
  const model = 'deepseek/deepseek-v4-flash-0731'
  const h = harness(
    [
      {
        status: 429,
        headers: { 'retry-after': '3', 'x-generation-id': 'gen-1790000000-OfflineFailure' },
        body: {
          error: {
            code: 429,
            message: 'secret-body',
            metadata: { error_type: 'rate_limit_exceeded', provider_name: 'DigitalOcean' },
          },
          openrouter_metadata: { attempt: 1, is_byok: false, pipeline: [{ data: 'secret-body' }] },
          usage: { cost: 0.0001 },
        },
      },
    ],
    { maxAttempts: 1 },
    model,
  )
  await assert.rejects(h.run(model))
  const [row] = h.campaign.audit
  assert.equal(row.diagnostics.routingAttempts, 1)
  assert.equal(row.diagnostics.retryAfterMs, 3000)
  assert.equal(row.generationId, 'gen-1790000000-OfflineFailure')
  assert.equal(row.reportedCostUsd, 0.0001)
  assert.equal(row.rawContent, null)
  assert.doesNotMatch(JSON.stringify(row), /secret-body|pipeline/)
  assert.equal(h.requests(), 1)
})

test('diagnostics omit sensitive or unrecognized metadata values and preserve only safe fields', () => {
  const value = diagnostics.skillDiagnostics(
    {
      id: 'gen-sk-or-secret',
      provider: 'sk-or-secret',
      error: {
        message: 'private-request-body',
        metadata: {
          error_type: 'sk-or-secret',
          provider_code: 'private-request-body',
          raw: 'Authorization: Bearer secret',
        },
      },
      openrouter_metadata: { attempt: 999999, pipeline: [{ data: 'private-request-body' }] },
    },
    new Headers({ 'x-request-id': 'Bearer secret', 'retry-after': 'not-a-date' }),
    429,
  )
  assert.equal(value.httpStatus, 429)
  for (const key of [
    'errorType',
    'providerCode',
    'requestId',
    'generationId',
    'provider',
    'retryAfterMs',
    'routingAttempts',
  ])
    assert.equal(value[key], null)
  assert.doesNotMatch(JSON.stringify(value), /sk-or|Bearer|private-request-body|Authorization/)
})

test('unexpected BYOK use stops the benchmark after one possibly billable dispatch', async () => {
  const model = 'deepseek/deepseek-v4-flash-0731'
  const h = harness(
    [
      {
        body: completion({ prompt_tokens: 10, completion_tokens: 20, cost: 0.001, is_byok: true }),
      },
    ],
    { maxAttempts: 1 },
    model,
  )
  await assert.rejects(h.run(model))
  assert.equal(h.requests(), 1)
  assert.equal(h.campaign.audit[0].reportedCostUsd, 0.001)
  assert.equal(h.campaign.audit[0].diagnostics.isByok, true)
})

test('evaluation byte ceiling applies after provider and usage fields are serialized', async () => {
  let calls = 0
  const model = 'deepseek/deepseek-v4-flash-0731'
  const guard = budget.createEvalFetch(
    model,
    async () => {
      calls++
      return Response.json({})
    },
    new AbortController().signal,
  )
  const body = {
    model,
    max_tokens: 3000,
    provider: { require_parameters: true },
    response_format: { json_schema: { strict: true } },
    padding: '',
  }
  body.padding = 'x'.repeat(
    budget.SKILL_EVAL_BUDGET.requestBytes - Buffer.byteLength(JSON.stringify(body)),
  )
  assert.equal(Buffer.byteLength(JSON.stringify(body)), 11000)
  await assert.rejects(
    guard.fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  )
  assert.equal(calls, 0)
  assert.equal(guard.requests(), 0)
})

test('a later fixture without a response never reuses the preceding raw report', async () => {
  let calls = 0
  const model = 'deepseek/deepseek-v4-flash-0731'
  const guard = budget.createEvalFetch(
    model,
    async () => {
      if (calls++ === 0) return Response.json(completion({ cost: 0 }))
      throw new TypeError('synthetic network failure')
    },
    new AbortController().signal,
  )
  const options = {
    method: 'POST',
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      provider: { require_parameters: true },
      response_format: { json_schema: { strict: true } },
    }),
  }
  const url = 'https://openrouter.ai/api/v1/chat/completions'
  await guard.fetch(url, options)
  assert.equal(budget.fixtureRawContent(guard, 0), JSON.stringify(report))
  const nextFixtureIndex = guard.audit.length
  await assert.rejects(guard.fetch(url, options))
  assert.equal(budget.fixtureRawContent(guard, nextFixtureIndex), null)
  assert.equal(guard.requests(), 2)
  assert.equal(guard.audit.length, 1)
})

test('JSON-null error responses preserve HTTP diagnostics and unreviewed model names fail before dispatch', async () => {
  const model = 'deepseek/deepseek-v4-flash-0731'
  assert.throws(() =>
    budget.createEvalFetch('toString', async () => Response.json({}), new AbortController().signal),
  )
  const guard = budget.createEvalFetch(
    model,
    async () =>
      Response.json(null, {
        status: 429,
        headers: { 'retry-after': '4', 'x-generation-id': 'gen-1790000000-NullFailure' },
      }),
    new AbortController().signal,
  )
  await guard.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      provider: { require_parameters: true },
      response_format: { json_schema: { strict: true } },
    }),
  })
  assert.equal(guard.audit[0].status, 429)
  assert.equal(guard.audit[0].diagnostics.retryAfterMs, 4000)
  assert.equal(guard.audit[0].generationId, 'gen-1790000000-NullFailure')
  assert.equal(guard.audit[0].reportedCostUsd, null)
  assert.equal(budget.fixtureRawContent(guard, 0), null)
})

test('actual SDK and retry context preserve billable HTTP-200 errors, tokens, reasoning subset and total cost', async () => {
  const first = {
    ...completion({
      prompt_tokens: 10,
      completion_tokens: 20,
      completion_tokens_details: { reasoning_tokens: 5 },
      cost: 0.001,
    }),
    error: { code: 503, message: 'Synthetic private provider text' },
  }
  const h = harness([
    { body: first },
    {
      body: completion({
        prompt_tokens: 20,
        completion_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 6 },
        cost: 0.002,
      }),
    },
  ])
  const { telemetry } = await h.run()
  assert.equal(h.requests(), 2)
  assert.equal(telemetry.inputTokens, 30)
  assert.equal(telemetry.outputTokens, 50)
  assert.equal(telemetry.reasoningTokens, 11) // A subset; do not add it again to billed output.
  assert.equal(telemetry.costUsd, 0.003)
  assert.equal(telemetry.costKind, 'reported')
  assert.equal(telemetry.unreportedAttempts, 0)
  assert.equal(telemetry.returnedModel, 'returned/model')
  assert.equal(telemetry.provider, 'synthetic-provider')
  assert.equal(h.bodies[0].response_format.json_schema.strict, true)
})

test('an unknown retry charge remains partial, while genuine zero usage and cost remain zero', async () => {
  const h = harness([
    { body: { error: { code: 503 } } },
    {
      body: completion({
        prompt_tokens: 0,
        completion_tokens: 0,
        completion_tokens_details: { reasoning_tokens: 0 },
        cost: 0,
      }),
    },
  ])
  const { telemetry } = await h.run()
  assert.equal(telemetry.costUsd, 0)
  assert.equal(telemetry.costKind, 'partial_reported')
  assert.equal(telemetry.unreportedAttempts, 1)
  assert.equal(telemetry.inputTokens, 0)
  assert.equal(telemetry.outputTokens, 0)
})

for (const [status, category, attempts] of [
  [401, 'AUTHENTICATION_ERROR', 1],
  [402, 'QUOTA_OR_CREDIT_EXHAUSTED', 1],
  [429, 'RATE_LIMITED', 1],
  [503, 'PROVIDER_UNAVAILABLE', 3],
]) {
  test(`actual SDK HTTP ${status} is sanitized as ${category} with bounded attempts`, async () => {
    const h = harness([
      {
        status,
        headers: status === 429 ? { 'x-should-retry': 'false' } : {},
        body: { error: { code: status, message: 'private-provider-body' } },
      },
    ])
    await assert.rejects(h.run(), (error) => {
      assert.equal(error.category, category)
      assert.equal(error.status, status)
      assert.equal(error.telemetry.attempts, attempts)
      assert.equal(error.telemetry.costUsd, null)
      assert.equal(error.telemetry.costKind, 'unknown')
      assert.doesNotMatch(error.message, /private-provider-body/)
      return true
    })
    assert.equal(h.requests(), attempts)
  })
}

test('invalid/truncated paid output preserves billing; absent or invalid usage never becomes a zero bill', async () => {
  const truncated = completion({ prompt_tokens: 8, completion_tokens: 9, cost: 0.01 })
  truncated.choices[0].finish_reason = 'length'
  await assert.rejects(
    harness([{ body: truncated }]).run(),
    (error) =>
      error.category === 'INVALID_RESPONSE' &&
      error.telemetry.costKind === 'reported' &&
      error.telemetry.costUsd === 0.01,
  )
  for (const usage of [undefined, { prompt_tokens: -1, completion_tokens: null, cost: -1 }]) {
    const { telemetry } = await harness([{ body: completion(usage) }]).run()
    assert.equal(telemetry.inputTokens, null)
    assert.equal(telemetry.outputTokens, null)
    assert.equal(telemetry.costUsd, null)
    assert.equal(telemetry.costKind, 'unknown')
  }
})

test('SDK cancellation is TIMEOUT with unknown billing and no fallback request', async () => {
  const controller = new AbortController()
  controller.abort()
  const h = harness([{ body: completion() }], { signal: () => controller.signal })
  await assert.rejects(
    h.run(),
    (error) => error.category === 'TIMEOUT' && error.telemetry.costKind === 'unknown',
  )
  assert.equal(h.requests(), 0)
})

test('evaluation keeps production error classification while disabling application retries', async () => {
  const h = harness([{ status: 503, body: { error: { code: 503 } } }], { maxAttempts: 1 })
  await assert.rejects(
    h.run(),
    (error) => error.category === 'PROVIDER_UNAVAILABLE' && error.telemetry.attempts === 1,
  )
  assert.equal(h.requests(), 1)
})

test('live evaluation refuses uncapped/shared keys and enforces endpoint, request, byte and output budgets offline', async () => {
  const key = {
    limit: 0.25,
    limit_reset: null,
    limit_remaining: 0.25,
    include_byok_in_limit: true,
    usage: 0,
    byok_usage: 0,
  }
  budget.verifyEvalKey(key)
  for (const override of [
    { limit: null },
    { limit: 1 },
    { limit_reset: 'daily' },
    { include_byok_in_limit: false },
    { usage: 0.01 },
    { limit_remaining: 0.01 },
  ])
    assert.throws(() => budget.verifyEvalKey({ ...key, ...override }))
  let calls = 0
  const guard = budget.createEvalFetch(
    'deepseek/deepseek-v4-flash-0731',
    async (_url, options) => {
      calls++
      const body = JSON.parse(options.body)
      assert.equal(options.redirect, 'error')
      assert.equal(body.provider.max_price.completion, 0.75)
      assert.equal(body.provider.allow_fallbacks, false)
      return Response.json({ id: 'gen-offline' })
    },
    new AbortController().signal,
  )
  const url = 'https://openrouter.ai/api/v1/chat/completions'
  const params = {
    model: 'deepseek/deepseek-v4-flash-0731',
    max_tokens: 3000,
    provider: { require_parameters: true },
    response_format: { json_schema: { strict: true } },
  }
  const send = (body = params, endpoint = url) =>
    guard.fetch(endpoint, { method: 'POST', body: JSON.stringify(body) })
  await assert.rejects(send(params, 'https://unknown.test/'))
  await assert.rejects(send({ ...params, max_tokens: 3001 }))
  await assert.rejects(send({ ...params, messages: ['x'.repeat(12000)] }))
  for (let i = 0; i < 6; i++) await send()
  await assert.rejects(send())
  assert.equal(calls, 6)
})

test('Neon cloud runner refuses unknown, expired, default-branch and mismatched targets before network access', () => {
  const runId = '1'.repeat(32)
  const target = {
    kind: 'disposable-neon-skill-verification',
    runId,
    projectId: 'approved-project',
    branchId: 'br-approved',
    endpointId: 'ep-approved',
    host: 'ep-approved.us-east-2.aws.neon.tech',
    database: `skill_staging_${runId}`,
    role: `skill_staging_${runId}`,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    dataPolicy: 'new-empty-database-no-user-data',
    branchIsDefault: false,
  }
  const url = `postgresql://${target.role}:synthetic@${target.host}/${target.database}?sslmode=require`
  verifyNeonTarget(target, url, runId)
  for (const override of [
    { branchIsDefault: true },
    { host: 'unknown.neon.tech' },
    { dataPolicy: 'copied-development' },
    { expiresAt: '2020-01-01' },
    { database: 'production' },
  ])
    assert.throws(() => verifyNeonTarget({ ...target, ...override }, url, runId))
  assert.throws(() => verifyNeonTarget(target, url, 'unapproved'))
  assert.throws(() => verifyNeonTarget(target, url + '&options=search_path=public', runId))
})
