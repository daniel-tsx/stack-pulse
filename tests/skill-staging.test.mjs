import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as openai from 'openai'
import { loadTs } from './release-test-helpers.mjs'
import { verifyNeonTarget } from '../scripts/verify-skill-neon.mjs'

const budget = loadTs('scripts/skill-eval-budget.ts', {}, { Buffer, AbortSignal })

test('candidate deployment leaves skill scheduling disabled while retaining existing cron jobs', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.deepEqual(config.crons, [
    { path: '/api/cron/fetch-releases', schedule: '0 0,12 * * *' },
    { path: '/api/cron/send-digest', schedule: '0 14 * * 1' },
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
function harness(replies, runtime = {}) {
  let requests = 0,
    now = Date.now()
  const bodies = []
  const client = new openai.default({
    apiKey: 'synthetic-offline',
    baseURL: 'https://openrouter.ai/api/v1',
    maxRetries: 0,
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body))
      const reply = replies[Math.min(requests++, replies.length - 1)]
      return Response.json(reply.body, { status: reply.status ?? 200, headers: reply.headers })
    },
  })
  const analyzer = loadTs(
    'src/lib/skill-analysis.ts',
    { '@/lib/ai': { getOpenAI: () => client }, '@/lib/ai-resilience': resilience },
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
    run: () => analyzer.analyzeSkillUpdate(input, execution),
    bodies,
    requests: () => requests,
  }
}

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
    'test/model',
    async (_url, options) => {
      calls++
      const body = JSON.parse(options.body)
      assert.equal(options.redirect, 'error')
      assert.equal(body.provider.max_price.completion, 5)
      assert.equal(body.provider.allow_fallbacks, false)
      return Response.json({ id: 'gen-offline' })
    },
    new AbortController().signal,
  )
  const url = 'https://openrouter.ai/api/v1/chat/completions'
  const params = {
    model: 'test/model',
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
