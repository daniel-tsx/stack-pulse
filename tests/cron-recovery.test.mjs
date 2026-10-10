import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
const TOKEN = 'synthetic-github-credential'
const CRON_SECRET = 'synthetic-cron-credential'
const AI_KEY = 'synthetic-openrouter-credential'
const RAW_ERROR = `private upstream payload ${TOKEN} Authorization: Bearer ${CRON_SECRET}`
const plain = (value) => JSON.parse(JSON.stringify(value))
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers })
const release = (tag = 'v1', extra = {}) => ({
  id: 1,
  tag_name: tag,
  name: null,
  body: 'release notes',
  draft: false,
  prerelease: false,
  published_at: '2026-10-09T00:00:00Z',
  html_url: `https://github.com/org/repo/releases/tag/${tag}`,
  ...extra,
})
const tech = (id, extra = {}) => ({
  id: String(id),
  name: `Repo ${id}`,
  githubRepoUrl: `https://github.com/org/repo${id}`,
  category: 'framework',
  ...extra,
})

// Native fetch still handles redirects/aborts. Only its HTTP dispatcher is replaced;
// every dispatch is observable and there is no path to a real network connection.
function transport(reply, authFailed = () => false) {
  const dispatches = []
  const dispatcher = {
    dispatch(options, handler) {
      const request = { path: options.path, method: options.method, afterAuth: !!authFailed() }
      dispatches.push(request)
      let aborted = false
      handler.onConnect((error) => {
        aborted = true
        handler.onError(error)
      })
      Promise.resolve()
        .then(() => reply(request))
        .then(({ status = 200, headers = {}, body = [] }) => {
          if (aborted) return
          handler.onHeaders(
            status,
            Object.entries(headers)
              .flat()
              .map((value) => Buffer.from(value)),
            () => {},
            '',
          )
          handler.onData(Buffer.from(JSON.stringify(body)))
          handler.onComplete([])
        })
        .catch((error) => {
          if (!aborted) handler.onError(error)
        })
      return true
    },
  }
  return {
    dispatches,
    fetch: (url, config) => fetch(url, { ...config, dispatcher }),
  }
}

// Execute the actual TS modules with strict import allowlists. No production clients,
// real environment variables, external fetches, or Next server are loaded by this suite.
function harness(options = {}) {
  const env = { GITHUB_TOKEN: TOKEN, CRON_SECRET, OPENROUTER_API_KEY: AI_KEY, ...options.env }
  const state = {
    fetches: [],
    ai: [],
    inserts: [],
    conflicts: [],
    runs: [],
    logs: [],
    dispatched: [],
    finalizedAtDispatch: [],
    dbCalls: 0,
    dbOperations: [],
    activeOperations: 0,
    aiRequests: [],
    aiClients: [],
  }
  const schema = Object.fromEntries(
    [
      'technologies',
      'userTechPreferences',
      'releaseUpdates',
      'releaseFetchRuns',
      'userWebhooks',
    ].map((table) => [
      table,
      new Proxy(
        { table },
        { get: (target, field) => target[field] ?? `${table}.${String(field)}` },
      ),
    ]),
  )
  const rows = [...(options.existing ?? [])]
  function scopedDb(signal) {
    async function operation(stage, action, values) {
      signal?.throwIfAborted()
      state.dbOperations.push({
        stage,
        signal,
        time: options.performance?.now() ?? performance.now(),
      })
      state.activeOperations++
      try {
        if (options.dbOperation) await options.dbOperation({ stage, signal, values, state })
        signal?.throwIfAborted()
        const value = action()
        options.dbAcknowledged?.({ stage, values, state })
        return value
      } finally {
        state.activeOperations--
      }
    }
    return {
      select: (fields) => ({
        from(table) {
          if (table === schema.technologies) {
            if (options.setupFailure) throw new Error(RAW_ERROR)
            return operation('selection', () => options.techs ?? [tech(1)])
          }
          if (options.realWebhooks && (fields?.techName || table === schema.userWebhooks)) {
            const builder = {
              innerJoin() {
                return builder
              },
              where() {
                return operation(
                  table === schema.releaseUpdates
                    ? 'notificationReleases'
                    : 'notificationSubscriptions',
                  () =>
                    table === schema.releaseUpdates
                      ? (options.notificationReleases ?? [])
                      : (options.notificationSubscriptions ?? []),
                )
              },
            }
            return builder
          }
          assert.equal(table, schema.releaseUpdates)
          return {
            where(conditions) {
              return {
                async limit() {
                  if (options.lookupFailure) throw options.lookupFailure
                  const [techId, version] = conditions.map((item) => item.value)
                  return operation('lookup', () =>
                    rows.filter((row) => row.techId === techId && row.version === version),
                  )
                },
              }
            },
          }
        },
      }),
      selectDistinct: () => ({
        from: () =>
          operation('followers', () => (options.followed ?? []).map((techId) => ({ techId }))),
      }),
      insert: (table) => ({
        values(values) {
          const builder = {
            onConflictDoNothing({ target }) {
              state.conflicts.push(target)
              return builder
            },
            async returning() {
              if (table === schema.releaseFetchRuns) {
                if (options.runCreationFailure) throw new Error(RAW_ERROR)
                const row = {
                  id: `run-${state.runs.length}`,
                  status: 'running',
                  technologiesScanned: 0,
                  releasesInserted: 0,
                  errors: 0,
                  finishedAt: null,
                  ...values,
                }
                return operation(
                  'createRun',
                  () => {
                    state.runs.push(row)
                    return [row]
                  },
                  values,
                )
              }
              assert.equal(table, schema.releaseUpdates)
              const insertError =
                typeof options.insertFailure === 'function'
                  ? options.insertFailure(values)
                  : options.insertFailure
              if (insertError) throw insertError
              if (
                options.conflict ||
                rows.some((row) => row.techId === values.techId && row.version === values.version)
              )
                return []
              const row = { id: `release-${rows.length}`, ...values }
              return operation(
                'insert',
                () => {
                  rows.push(row)
                  state.inserts.push(row)
                  return [{ id: row.id }]
                },
                values,
              )
            },
          }
          return builder
        },
      }),
      update: () => ({
        set: (values) => ({
          async where(condition) {
            if (options.finalizationFailure) throw new Error(RAW_ERROR)
            assert.equal(condition.column, schema.releaseFetchRuns.id)
            const row = state.runs.find((run) => run.id === condition.value)
            assert.ok(row)
            await operation('finalization', () => Object.assign(row, values), values)
          },
        }),
      }),
    }
  }
  const imports = {
    openai: class extends nativeRequire('openai') {
      static default = this
      constructor(config) {
        state.aiClients.push(config)
        super({
          ...config,
          fetch: async (url, config) => {
            assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions')
            state.aiRequests.push({ config, time: options.aiRuntime?.now() ?? Date.now() })
            if (!options.aiFetch) throw new Error('No mock AI transport configured')
            return options.aiFetch(config, state.aiRequests.length)
          },
        })
      }
    },
    zod: nativeRequire('zod'),
    'next/server': {
      NextResponse: { json: (body, init) => Response.json(body, init) },
      NextRequest: Request,
    },
    crypto: nativeRequire('node:crypto'),
    'drizzle-orm': {
      eq: (column, value) => ({ column, value }),
      and: (...items) => items,
      desc: (column) => column,
      inArray: (column, value) => ({ column, value }),
      gte: (column, value) => ({ column, value }),
    },
    '@/db/schema': schema,
    '@/db': {
      getDb(signal) {
        state.dbCalls++
        signal?.throwIfAborted()
        return scopedDb(signal)
      },
    },
    '@/lib/ai': {
      async summarizeRelease(input) {
        state.ai.push(input)
        if (options.ai) return options.ai(input)
        return {
          summary: 'summary',
          new_features: [],
          breaking_changes: [],
          security_notes: [],
          deprecations: [],
          migration_steps: [],
          release_signals: [],
          importance_level: 'medium',
        }
      },
    },
    '@/lib/webhooks': {
      async dispatchReleaseWebhooks(ids, execution) {
        state.dispatched.push([...ids])
        state.finalizedAtDispatch.push(!!state.runs.at(-1)?.finishedAt)
        assert.equal(state.activeOperations, 0)
        if (options.dispatch) return options.dispatch(ids, execution, state)
        if (options.webhookFailure) throw new Error(RAW_ERROR)
        return options.webhooks ?? { webhooks: 0, sent: 0, errors: 0 }
      },
    },
  }
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    const compiledModule = { exports: {} }
    runInNewContext(
      compiled,
      {
        module: compiledModule,
        exports: compiledModule.exports,
        process: { env },
        Buffer,
        AbortController,
        AbortSignal: options.AbortSignal
          ? { any: AbortSignal.any, ...options.AbortSignal }
          : AbortSignal,
        Response,
        URL,
        Date: options.Date ?? Date,
        setTimeout:
          path === 'src/lib/execution-budget.ts'
            ? (options.clock?.setTimeout ?? setTimeout)
            : setTimeout,
        clearTimeout:
          path === 'src/lib/execution-budget.ts'
            ? (options.clock?.clearTimeout ?? clearTimeout)
            : clearTimeout,
        performance: options.performance ?? performance,
        setInterval,
        clearInterval,
        console: Object.fromEntries(
          ['info', 'warn', 'error'].map((method) => [method, (...args) => state.logs.push(args)]),
        ),
        fetch: async (url, config) => {
          state.fetches.push({ url, config })
          return options.fetch ? options.fetch(url, config, state.fetches.length) : json([])
        },
        require(specifier) {
          if (specifier === '@/lib/webhooks' && options.realWebhooks)
            return load('src/lib/webhooks.ts')
          if (specifier === '@/lib/execution-budget') return load('src/lib/execution-budget.ts')
          if (specifier === '@/lib/ai' && options.realAI) return load('src/lib/ai.ts')
          if (specifier === '@/lib/ai-resilience') {
            const resilience = load('src/lib/ai-resilience.ts')
            return options.aiRuntime
              ? {
                  ...resilience,
                  createAiExecutionContext: (deadline, _, execution) =>
                    resilience.createAiExecutionContext(deadline, options.aiRuntime, execution),
                }
              : resilience
          }
          if (Object.hasOwn(imports, specifier)) return imports[specifier]
          if (specifier === '@/lib/github') return load('src/lib/github.ts')
          if (specifier === '@/lib/cron-auth') return load('src/lib/cron-auth.ts')
          if (specifier === '@/lib/release-ingestion') {
            const ingestion = load('src/lib/release-ingestion.ts')
            return options.rejectProcessor
              ? { ...ingestion, processTechReleases: options.rejectProcessor }
              : ingestion
          }
          throw new Error(`Unexpected import: ${specifier}`)
        },
      },
      { filename: path },
    )
    cache.set(path, compiledModule.exports)
    return compiledModule.exports
  }
  async function invoke(path = 'fetch-releases', authorization = `Bearer ${CRON_SECRET}`) {
    const request = new Request(`https://example.test/api/cron/${path}`, {
      headers: { authorization },
    })
    const response = await load(`src/app/api/cron/${path}/route.ts`).GET(request)
    const body = await response.json()
    // Headers are inspected only in-memory; no credential is printed on success.
    const output = JSON.stringify({ body, logs: state.logs })
    for (const secret of [TOKEN, CRON_SECRET, AI_KEY, RAW_ERROR])
      assert.equal(output.includes(secret), false)
    return { response, body }
  }
  return { load, invoke, state, schema }
}

test('cron requires GITHUB_TOKEN; standalone public helper keeps unauthenticated access', async () => {
  const h = harness({ env: { GITHUB_TOKEN: undefined } })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 500)
  assert.equal(body.status, 'failed')
  assert.equal(body.errors[0].category, 'GITHUB_TOKEN_MISSING')
  assert.equal(body.summary.repositoriesAttempted, 0)
  assert.equal(body.summary.repositoriesDeferred, 1)
  assert.equal(h.state.fetches.length, 0)
  assert.equal(h.state.ai.length, 0)
  assert.equal(h.state.runs[0].status, 'failed')
  await h.load('src/lib/github.ts').fetchLatestReleases('https://github.com/org/public')
  assert.equal(h.state.fetches[0].config.headers.Authorization, undefined)
})

test('configured token is attached; default discovery stays at five without extra calls', async () => {
  const h = harness()
  const { response, body } = await h.invoke()
  assert.equal(response.status, 200)
  assert.equal(body.status, 'success')
  assert.equal(body.success, true)
  assert.equal(body.releaseCountersComplete, true)
  assert.equal(h.state.fetches.length, 1)
  assert.equal(h.state.fetches[0].config.headers.Authorization, `Bearer ${TOKEN}`)
  assert.match(h.state.fetches[0].url, /per_page=5$/)
  assert.equal(h.state.ai.length, 0)
  assert.equal(h.state.runs[0].status, 'completed')
})

for (const [label, status, headers, message, category, attempts] of [
  ['401', 401, {}, RAW_ERROR, 'GITHUB_AUTH', 1],
  ['403 permission', 403, {}, RAW_ERROR, 'GITHUB_PERMISSION', 1],
  [
    '403 primary rate limit',
    403,
    { 'x-ratelimit-remaining': '0' },
    RAW_ERROR,
    'GITHUB_RATE_LIMIT',
    1,
  ],
  ['403 secondary header', 403, { 'retry-after': '60' }, RAW_ERROR, 'GITHUB_RATE_LIMIT', 1],
  ['403 secondary message', 403, {}, `secondary rate limit ${RAW_ERROR}`, 'GITHUB_RATE_LIMIT', 1],
  ['404', 404, {}, RAW_ERROR, 'GITHUB_NOT_FOUND', 1],
  ['429', 429, {}, RAW_ERROR, 'GITHUB_RATE_LIMIT', 1],
  ['503', 503, {}, RAW_ERROR, 'GITHUB_UPSTREAM', 2],
]) {
  test(`GitHub ${label} is classified without raw payloads or inappropriate retries`, async () => {
    const h = harness({ fetch: () => json({ message }, status, headers) })
    const { response, body } = await h.invoke()
    assert.equal(response.status, 502)
    assert.equal(body.status, 'failed')
    assert.equal(body.errors[0].category, category)
    assert.equal(body.errors[0].scope, status === 401 ? 'global' : 'repository')
    assert.equal(body.errors[0].upstreamStatus, status)
    assert.equal(body.summary.repositoriesFailed, 1)
    assert.equal(body.summary.releasesFailed, 0) // Fetch failure is not an invented release failure.
    assert.equal(h.state.fetches.length, attempts)
    assert.equal(h.state.ai.length, 0)
  })
}

test('network errors have one retry and sanitized classification', async () => {
  const h = harness({
    fetch: () => {
      throw new Error(RAW_ERROR)
    },
  })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 502)
  assert.equal(body.errors[0].category, 'GITHUB_NETWORK')
  assert.equal(h.state.fetches.length, 2)
})

test('transient 5xx recovery succeeds with only the existing single retry', async () => {
  const h = harness({
    fetch: (_url, _config, attempt) => (attempt === 1 ? json({}, 503) : json([])),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.equal(h.state.fetches.length, 2)
})

for (const initialFailure of ['5xx', 'network']) {
  test(`401 blocks new chunks and in-flight ${initialFailure} retries while preserving inserts`, async () => {
    const h = harness({
      techs: Array.from({ length: 12 }, (_, index) => tech(index + 1)),
      fetch: (_url, _config, call) => {
        if (call === 1) return json({ message: RAW_ERROR }, 401)
        if (call === 2) {
          if (initialFailure === 'network') return Promise.reject(new Error(RAW_ERROR))
          return json({}, 503)
        }
        return json([release()])
      },
    })
    const { response, body } = await h.invoke()
    assert.equal(response.status, 502)
    assert.equal(body.status, 'failed')
    assert.equal(h.state.fetches.length, 6)
    assert.equal(body.summary.repositoriesAttempted, 6)
    assert.equal(body.summary.repositoriesDeferred, 6)
    assert.equal(body.summary.repositoriesSucceeded, 4)
    assert.equal(body.summary.repositoriesFailed, 2)
    assert.equal(body.summary.releasesInserted, 4)
    assert.equal(h.state.inserts.length, 4)
    assert.equal(h.state.dispatched[0].length, 4)
    assert.equal(h.state.runs[0].status, 'failed')
    assert.equal(body.runFinalized, true)
  })
}

for (const status of [403, 404]) {
  test(`${status} stays repository-specific; successful peers produce partial_success and later chunks run`, async () => {
    const h = harness({
      techs: Array.from({ length: 7 }, (_, index) => tech(index + 1)),
      fetch: (_url, _config, call) =>
        call === 1 ? json({ message: RAW_ERROR }, status) : json([]),
    })
    const { response, body } = await h.invoke()
    assert.equal(response.status, 200)
    assert.equal(body.status, 'partial_success')
    assert.equal(body.success, false)
    assert.equal(body.summary.repositoriesSucceeded, 6)
    assert.equal(body.summary.repositoriesFailed, 1)
    assert.equal(body.summary.repositoriesDeferred, 0)
    assert.equal(h.state.fetches.length, 7)
    assert.equal(h.state.runs[0].status, 'completed_with_errors')
  })
}

test('all operational failures produce failed, bounded reports, and complete error counters', async () => {
  const h = harness({
    techs: Array.from({ length: 25 }, (_, index) => tech(index)),
    fetch: () => json({}, 404),
  })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 502)
  assert.equal(body.status, 'failed')
  assert.equal(body.summary.repositoriesFailed, 25)
  assert.equal(body.errorCount, 25)
  assert.equal(body.errors.length, 20)
  assert.equal(body.errorsTruncated, true)
  assert.equal(h.state.runs[0].errors, 25)
})

test('registry/followed-custom selection, filters, dedup, prereleases and persistence remain intact', async () => {
  const h = harness({
    techs: [tech(1), tech(2, { category: 'custom' }), tech(3, { category: 'custom' })],
    followed: ['2'],
    existing: [
      { id: 'existing', techId: '1', version: 'stored' },
      { id: 'custom', techId: '2', version: 'stored' },
    ],
    fetch: () =>
      json([
        release('draft', { draft: true }),
        release('unpublished', { published_at: null }),
        release('', {}),
        release('stored'),
        release('new', { prerelease: true }),
      ]),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.equal(body.summary.repositoriesPlanned, 2)
  assert.equal(h.state.fetches.length, 2)
  assert.equal(body.summary.releasesDiscovered, 10)
  assert.equal(body.summary.releasesProcessed, 4)
  assert.equal(body.summary.releasesInserted, 2)
  assert.equal(h.state.ai.length, 2)
  for (const row of h.state.inserts) {
    assert.equal(row.isPrerelease, true)
    assert.equal(row.rawReleaseBody, 'release notes')
    assert.equal(row.summary, 'summary')
    assert.equal(row.version, 'new')
    assert.equal(row.publishedAt.toISOString(), '2026-10-09T00:00:00.000Z')
  }
  assert.deepEqual(plain(h.state.conflicts[0]), [
    h.schema.releaseUpdates.techId,
    h.schema.releaseUpdates.version,
  ])
})

test('already stored releases and insert conflicts are successful no-op work', async () => {
  for (const options of [
    { existing: [{ id: 'existing', techId: '1', version: 'v1' }] },
    { conflict: true },
  ]) {
    const h = harness({ ...options, fetch: () => json([release()]) })
    const { body } = await h.invoke()
    assert.equal(body.status, 'success')
    assert.equal(body.summary.releasesInserted, 0)
    assert.equal(body.summary.releasesProcessed, 1)
    assert.equal(h.state.inserts.length, 0)
    assert.equal(h.state.ai.length, options.existing ? 0 : 1)
  }
})

test('AI failures are release-specific; successful release work produces partial_success', async () => {
  const h = harness({
    fetch: () => json([release('bad'), release('good')]),
    ai: (input) => {
      if (input.version === 'bad') throw Object.assign(new Error(RAW_ERROR), { status: 429 })
      return { summary: 'summary', release_signals: [], importance_level: 'medium' }
    },
  })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 200)
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.repositoriesSucceeded, 0)
  assert.equal(body.summary.repositoriesFailed, 1)
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(body.errors[0].category, 'AI')
  assert.equal(body.errors[0].upstreamStatus, 429)
  assert.equal(h.state.ai.length, 2)
})

test('all AI operations failing is failed even though GitHub fetch succeeds', async () => {
  const h = harness({
    fetch: () => json([release()]),
    ai: () => {
      throw new Error(RAW_ERROR)
    },
  })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 502)
  assert.equal(body.status, 'failed')
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(h.state.inserts.length, 0)
})

test('database unavailability is fatal; SQL data errors stay release-specific', async () => {
  for (const [code, expectedStatus, scope] of [
    ['08006', 'failed', 'global'],
    ['23503', 'partial_success', 'release'],
  ]) {
    const h = harness({
      techs: [tech(1), tech(2)],
      fetch: (url) => json(url.includes('repo1/') ? [release()] : []),
      insertFailure: Object.assign(new Error(RAW_ERROR), { cause: { code } }),
    })
    const { response, body } = await h.invoke()
    assert.equal(body.status, expectedStatus)
    assert.equal(response.status, scope === 'global' ? 500 : 200)
    assert.equal(body.errors[0].category, 'DATABASE')
    assert.equal(body.errors[0].scope, scope)
    assert.equal(body.summary.releasesFailed, 1)
  }
})

for (const stage of ['setupFailure', 'runCreationFailure', 'finalizationFailure']) {
  test(`database ${stage} is sanitized and fails without losing confirmed counts`, async () => {
    const h = harness({ [stage]: true, fetch: () => json([release()]) })
    const { response, body } = await h.invoke()
    assert.equal(response.status, 500)
    assert.equal(body.status, 'failed')
    assert.equal(body.runFinalized, false)
    assert.equal(body.errors[0].category, 'DATABASE')
    assert.equal(body.summary.releasesInserted, stage === 'finalizationFailure' ? 1 : 0)
  })
}

test('unexpected processor rejection contributes a real repository failure', async () => {
  const h = harness({
    rejectProcessor: async () => {
      throw new Error(RAW_ERROR)
    },
  })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 500)
  assert.equal(body.status, 'failed')
  assert.equal(body.summary.repositoriesFailed, 1)
  assert.equal(body.errorCount, 1)
  assert.equal(body.releaseCountersComplete, false)
  assert.equal(h.state.runs[0].errors, 1)
})

test('time budget defers later chunks and reports partial instead of clean completion', async () => {
  let now = 0
  const h = harness({
    performance: { now: () => now },
    techs: Array.from({ length: 7 }, (_, index) => tech(index)),
    fetch: () => json([]),
  })
  const original = h.load('src/lib/release-ingestion.ts').processTechReleases
  h.load('src/lib/release-ingestion.ts').processTechReleases = async (...args) => {
    const result = await original(...args)
    now = 270_001
    return result
  }
  const { response, body } = await h.invoke()
  assert.equal(response.status, 200)
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.repositoriesAttempted, 6)
  assert.equal(body.summary.repositoriesDeferred, 1)
  assert.equal(body.errors[0].category, 'TIME_BUDGET')
  assert.equal(h.state.runs[0].errors, 1)
})

test('an empty selected repository set succeeds', async () => {
  const h = harness({ techs: [] })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 200)
  assert.equal(body.status, 'success')
  assert.equal(body.summary.repositoriesAttempted, 0)
})

test('auth failure state is limited to one invocation', async () => {
  const h = harness({ fetch: (_url, _config, call) => (call === 1 ? json({}, 401) : json([])) })
  assert.equal((await h.invoke()).body.status, 'failed')
  assert.equal((await h.invoke()).body.status, 'success')
  assert.equal(h.state.fetches.length, 2)
})

test('ingestion is finalized before webhooks, with delivery counts kept separate', async () => {
  const h = harness({ webhooks: { webhooks: 1, sent: 0, errors: 1 } })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.equal(body.webhooks.errors, 1)
  assert.equal(h.state.runs[0].status, 'completed')
  assert.equal(h.state.finalizedAtDispatch[0], true)
  const failing = harness({ webhookFailure: true })
  const failure = await failing.invoke()
  assert.equal(failure.body.status, 'partial_success')
  assert.equal(failure.body.errors[0].category, 'WEBHOOK')
  assert.equal(failure.body.runFinalized, true)
  assert.equal(failing.state.runs[0].status, 'completed')
})

for (const path of ['fetch-releases', 'github-health']) {
  test(`${path} preserves CRON_SECRET denial and performs no work for unauthorized callers`, async () => {
    for (const [env, authorization, status] of [
      [{}, 'Bearer wrong', 401],
      [{}, `Bearer X${CRON_SECRET.slice(1)}`, 401],
      [{}, '', 401],
      [{}, 'Basic wrong', 401],
      [{ CRON_SECRET: undefined }, '', 500],
    ]) {
      const h = harness({ env })
      const { response, body } = await h.invoke(path, authorization)
      assert.equal(response.status, status)
      assert.equal(body.error, status === 401 ? 'Unauthorized' : 'Server misconfigured')
      assert.equal(h.state.dbCalls, 0)
      assert.equal(h.state.fetches.length, 0)
      assert.equal(h.state.ai.length, 0)
    }
  })
}

test('health check does exactly one read-only /user request, returns no profile, and never loads DB/AI', async () => {
  const h = harness({ fetch: () => json({ login: 'private-user', token: TOKEN }) })
  const { response, body } = await h.invoke('github-health')
  assert.equal(response.status, 200)
  assert.deepEqual(body, { status: 'success', githubAuthenticated: true })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(h.state.fetches.length, 1)
  assert.equal(h.state.fetches[0].url, 'https://api.github.com/user')
  assert.equal(h.state.fetches[0].config.headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(h.state.dbCalls, 0)
  assert.equal(h.state.ai.length, 0)
  assert.equal(h.state.runs.length, 0)
  assert.equal(h.state.dispatched.length, 0)
})

test('health failure is sanitized; missing token makes zero calls and network/5xx are not retried', async () => {
  for (const options of [
    { env: { GITHUB_TOKEN: undefined } },
    { env: { GITHUB_TOKEN: ' \t ' } },
    { fetch: () => json({ message: RAW_ERROR }, 401) },
    { fetch: () => json({ message: RAW_ERROR }, 503) },
    {
      fetch: () => {
        throw new Error(RAW_ERROR)
      },
    },
  ]) {
    const h = harness(options)
    const { response, body } = await h.invoke('github-health')
    assert.equal(response.status, options.env ? 500 : 502)
    assert.equal(body.status, 'failed')
    assert.equal(body.githubAuthenticated, false)
    assert.equal(h.state.fetches.length, options.env ? 0 : 1)
    assert.equal(h.state.dbCalls, 0)
    assert.equal(h.state.ai.length, 0)
  }
})

test('F1.1 health rejects redirects with exactly one native HTTP dispatch', async () => {
  const wire = transport(({ path }) =>
    path === '/user'
      ? { status: 302, headers: { location: '/redirected-user' } }
      : { body: { login: 'private-user' } },
  )
  const h = harness({ fetch: wire.fetch })
  const { response, body } = await h.invoke('github-health')
  assert.equal(response.status, 502)
  assert.equal(body.githubAuthenticated, false)
  assert.equal(wire.dispatches[0].method, 'GET')
  assert.deepEqual(
    wire.dispatches.map((request) => request.path),
    ['/user'],
  )
  assert.equal(h.state.dbCalls, 0)
  assert.equal(h.state.ai.length, 0)
  assert.equal(h.state.dispatched.length, 0)
})

for (const pending of ['redirect', '5xx', 'network']) {
  test(`F1.1 401 blocks native ${pending} follow-ups and preserves settled writes`, async () => {
    let releasePending
    const delayed = new Promise((resolve, reject) => {
      releasePending = () => {
        if (pending === 'network') reject(new Error(RAW_ERROR))
        else
          resolve(
            pending === 'redirect'
              ? { status: 301, headers: { location: '/repositories/moved/releases' } }
              : { status: 503 },
          )
      }
    })
    let context
    const wire = transport(
      ({ path }) => {
        if (path.includes('/repo1/')) return delayed
        if (path.includes('/repo2/')) return { status: 401 }
        return { body: [release()] }
      },
      () => context?.authFailure,
    )
    const h = harness({
      techs: Array.from({ length: 12 }, (_, index) => tech(index + 1)),
      fetch: wire.fetch,
    })
    const github = h.load('src/lib/github.ts')
    const createContext = github.createGithubFetchContext
    github.createGithubFetchContext = () => {
      context = createContext()
      let failure = context.authFailure
      Object.defineProperty(context, 'authFailure', {
        get: () => failure,
        set(value) {
          failure = value
          releasePending()
        },
      })
      return context
    }
    const { response, body } = await h.invoke()
    assert.equal(context.authFailure.category, 'GITHUB_AUTH')
    assert.equal(response.status, 502)
    assert.equal(body.status, 'failed')
    assert.equal(wire.dispatches.length, 6)
    assert.equal(wire.dispatches.filter((request) => request.afterAuth).length, 0)
    assert.equal(body.summary.repositoriesAttempted, 6)
    assert.equal(body.summary.repositoriesDeferred, 6)
    assert.equal(body.summary.repositoriesSucceeded, 4)
    assert.equal(body.summary.repositoriesFailed, 2)
    assert.equal(h.state.inserts.length, 4)
    assert.equal(body.summary.releasesInserted, 4)
    assert.equal(h.state.runs[0].releasesInserted, 4)
    assert.equal(h.state.runs[0].status, 'failed')
    assert.deepEqual(
      h.state.dispatched[0],
      h.state.inserts.map((row) => row.id),
    )
  })
}

for (const [status, location] of [
  [301, 'https://api.github.com/repositories/123/releases?per_page=5'],
  [307, '/repositories/123/releases?per_page=5'],
]) {
  test(`F1.1 healthy ${status} repository redirects retain ingestion`, async () => {
    const wire = transport(({ path }) =>
      path.includes('/repo1/') ? { status, headers: { location } } : { body: [release()] },
    )
    const h = harness({ fetch: wire.fetch })
    const { body } = await h.invoke()
    assert.equal(body.status, 'success')
    assert.equal(wire.dispatches.length, 2)
    assert.equal(wire.dispatches[1].path, '/repositories/123/releases?per_page=5')
    assert.equal(h.state.fetches[0].config.signal, h.state.fetches[1].config.signal)
    assert.equal(body.summary.releasesInserted, 1)
    assert.equal(h.state.runs[0].releasesInserted, 1)
    assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
  })
}

test('F1.1 malformed, credential-bearing and non-API redirects are rejected before dispatch', async () => {
  for (const location of [
    undefined,
    'https://other.test/releases',
    'http://api.github.com/releases',
    `https://${TOKEN}@api.github.com/releases`,
    'https://[invalid',
  ]) {
    const wire = transport(() => ({ status: 302, headers: location ? { location } : {} }))
    const h = harness({ fetch: wire.fetch })
    const { response, body } = await h.invoke()
    assert.equal(response.status, 502)
    assert.equal(body.errors[0].category, 'GITHUB_UPSTREAM')
    assert.equal(wire.dispatches.length, 1)
    assert.equal(h.state.inserts.length, 0)
  }
})

test('F1.1 redirect chains are bounded without retrying a redirect loop', async () => {
  const wire = transport(() => ({ status: 302, headers: { location: '/loop' } }))
  const h = harness({ fetch: wire.fetch })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 502)
  assert.equal(body.errors[0].category, 'GITHUB_UPSTREAM')
  assert.equal(wire.dispatches.length, 21)
})

test('F1.1 redirected 5xx retries once with a fresh timeout per attempt', async () => {
  let destinationCalls = 0
  const wire = transport(({ path }) => {
    if (path.includes('/repo1/')) return { status: 302, headers: { location: '/moved' } }
    return ++destinationCalls === 1 ? { status: 503 } : { body: [] }
  })
  const h = harness({ fetch: wire.fetch })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.equal(wire.dispatches.length, 4)
  const signals = h.state.fetches.map((request) => request.config.signal)
  assert.equal(signals[0], signals[1])
  assert.equal(signals[2], signals[3])
  assert.notEqual(signals[0], signals[2])
})

test('F1.1 native fetch timeout stays at 8s and retries only once', async () => {
  const timeouts = []
  const timers = []
  const wire = transport(() => new Promise(() => {}))
  const h = harness({
    fetch: wire.fetch,
    AbortSignal: {
      timeout(ms) {
        timeouts.push(ms)
        const controller = new AbortController()
        timers.push(setTimeout(() => controller.abort(), 5))
        return controller.signal
      },
    },
  })
  try {
    const { response, body } = await h.invoke()
    assert.equal(response.status, 502)
    assert.equal(body.errors[0].category, 'GITHUB_NETWORK')
    assert.equal(wire.dispatches.length, 2)
    assert.deepEqual(timeouts, [8000, 8000])
  } finally {
    timers.forEach(clearTimeout)
  }
})

for (const [label, releases, inserted, failed] of [
  ['committed insert then invalid entry', [release(), null], 1, 1],
  ['invalid entry before insert', [null, release()], 1, 1],
  ['all entries invalid before inserts', [null, 'invalid', {}], 0, 3],
  ['all inserts successful', [release('v1'), release('v2')], 2, 0],
]) {
  test(`F1.1 ${label} retains exact durable progress and notification IDs`, async () => {
    const h = harness({ fetch: () => json(releases) })
    const { response, body } = await h.invoke()
    const status = failed ? (inserted ? 'partial_success' : 'failed') : 'success'
    const storedStatus = failed ? (inserted ? 'completed_with_errors' : 'failed') : 'completed'
    assert.equal(response.status, status === 'failed' ? 500 : 200)
    assert.equal(body.status, status)
    assert.equal(body.releaseCountersComplete, true)
    assert.equal(body.summary.releasesDiscovered, releases.length)
    assert.equal(body.summary.releasesProcessed, inserted)
    assert.equal(body.summary.releasesInserted, inserted)
    assert.equal(body.summary.releasesFailed, failed)
    assert.equal(body.summary.repositoriesFailed, failed ? 1 : 0)
    assert.equal(body.summary.repositoriesSucceeded, failed ? 0 : 1)
    assert.equal(h.state.inserts.length, inserted)
    assert.equal(h.state.ai.length, inserted)
    assert.equal(h.state.runs[0].status, storedStatus)
    assert.equal(h.state.runs[0].releasesInserted, inserted)
    assert.equal(h.state.runs[0].errors, failed)
    assert.deepEqual(plain(h.state.runs[0].details), [{ tech: 'Repo 1', inserted, errors: failed }])
    assert.deepEqual(
      h.state.dispatched[0],
      h.state.inserts.map((row) => row.id),
    )
    if (failed) assert.equal(body.errors[0].category, 'PROCESSING')

    // A subsequent invocation deduplicates committed rows and never schedules them twice.
    const again = await h.invoke()
    assert.equal(again.body.summary.releasesInserted, 0)
    assert.equal(again.body.summary.releasesProcessed, inserted)
    assert.equal(again.body.summary.releasesFailed, failed)
    assert.equal(h.state.inserts.length, inserted)
    assert.equal(h.state.ai.length, inserted)
    assert.deepEqual(h.state.dispatched[1], [])
    assert.equal(h.state.runs[0].releasesInserted, inserted)
    assert.equal(h.state.runs[1].releasesInserted, 0)
    assert.equal(h.state.runs[1].status, storedStatus)
  })
}

test('F1.1 non-array release payload fails safely before processing', async () => {
  const h = harness({ fetch: () => json({ message: RAW_ERROR }) })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 502)
  assert.equal(body.errors[0].category, 'GITHUB_UPSTREAM')
  assert.equal(body.releaseCountersComplete, true)
  assert.equal(body.summary.releasesDiscovered, 0)
  assert.equal(h.state.runs[0].status, 'failed')
  assert.equal(h.state.runs[0].errors, 1)
  assert.equal(h.state.runs[0].releasesInserted, 0)
  assert.equal(h.state.ai.length, 0)
  assert.equal(h.state.inserts.length, 0)
  assert.deepEqual(h.state.dispatched[0], [])
})

for (const [code, status, http] of [
  ['23503', 'partial_success', 200],
  ['08006', 'failed', 500],
]) {
  test(`F1.1 ${code} insert failure after a commit preserves only confirmed rows`, async () => {
    const h = harness({
      fetch: () => json([release('good'), release('bad')]),
      insertFailure: (values) =>
        values.version === 'bad' ? Object.assign(new Error(RAW_ERROR), { cause: { code } }) : null,
    })
    const { response, body } = await h.invoke()
    assert.equal(response.status, http)
    assert.equal(body.status, status)
    assert.equal(body.summary.releasesProcessed, 1)
    assert.equal(body.summary.releasesFailed, 1)
    assert.equal(body.summary.releasesInserted, 1)
    assert.equal(h.state.inserts.length, 1)
    assert.equal(h.state.inserts[0].version, 'good')
    assert.equal(h.state.runs[0].releasesInserted, 1)
    assert.equal(h.state.runs[0].errors, 1)
    assert.equal(h.state.runs[0].status, code === '08006' ? 'failed' : 'completed_with_errors')
    assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
  })
}

test('F1.1 custom ingestion keeps optional auth and legacy finalization', async () => {
  const h = harness({ env: { GITHUB_TOKEN: undefined }, fetch: () => json([release()]) })
  const ingestion = h.load('src/lib/release-ingestion.ts')
  const runId = await ingestion.createReleaseFetchRun('custom_repo')
  const result = await ingestion.processTechReleases(tech(1, { category: 'custom' }))
  await ingestion.finishReleaseFetchRun({ runId, details: [result.detail] })
  assert.equal(h.state.fetches.length, 1)
  assert.equal(h.state.fetches[0].config.headers.Authorization, undefined)
  assert.equal(h.state.runs[0].status, 'completed')
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.equal(h.state.inserts.length, 1)
  assert.deepEqual(plain(result.insertedReleaseIds), [h.state.inserts[0].id])
})

function aiSuccess(
  content = JSON.stringify({ version: 'v1', title: 'release', summary: 'summary' }),
) {
  return json({ choices: [{ message: { content } }] })
}

function aiError(status, headers = {}, metadata = {}, code = status) {
  return json({ error: { code, message: RAW_ERROR, metadata } }, status, headers)
}

function aiHarness(options = {}) {
  let now = Date.parse('2026-10-09T00:00:00Z')
  const waits = []
  const timeouts = []
  const runtime = {
    now: () => now,
    sleep: async (ms) => {
      waits.push(ms)
      now += ms
    },
    random: () => 0.5,
    signal: (ms) => {
      timeouts.push(ms)
      return AbortSignal.timeout(ms)
    },
    ...options.runtime,
  }
  const h = harness({
    realAI: true,
    fetch: () => json([release()]),
    aiFetch: () => aiSuccess(),
    ...options,
    aiRuntime: runtime,
    Date: class extends Date {
      static now() {
        return runtime.now()
      }
    },
  })
  return {
    ...h,
    waits,
    timeouts,
    advance: (ms) => {
      now += ms
    },
  }
}

test('F2 actual SDK summary succeeds once and retains model/schema/persistence', async () => {
  const h = aiHarness()
  const { response, body } = await h.invoke()
  assert.equal(response.status, 200)
  assert.equal(body.status, 'success')
  assert.deepEqual(body.ai, { succeeded: 1, failed: 0, attempts: 1, retries: 0, cooldowns: 0 })
  assert.equal(body.summary.aiOperationsFailed, 0)
  assert.equal(h.state.aiRequests.length, 1)
  assert.equal(h.state.aiClients[0].maxRetries, 1) // Advice's client default is unchanged.
  const payload = JSON.parse(h.state.aiRequests[0].config.body)
  assert.equal(payload.model, 'deepseek/deepseek-chat')
  assert.equal(payload.provider.require_parameters, true)
  assert.equal(payload.response_format.json_schema.strict, true)
  assert.deepEqual(h.timeouts, [25000])
  assert.equal(h.state.inserts[0].summary, 'summary')
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
})

for (const [label, headers, delay] of [
  ['seconds', { 'retry-after': '2' }, 2000],
  ['HTTP date', { 'retry-after': 'Fri, 09 Oct 2026 00:00:03 GMT' }, 3000],
  ['missing', {}, 1000],
  ['malformed', { 'retry-after': 'nonsense' }, 1000],
  ['negative', { 'retry-after': '-1' }, 1000],
  ['zero', { 'retry-after': '0' }, 0],
  ['milliseconds', { 'retry-after-ms': '1500' }, 1500],
  ['two hints', { 'retry-after': '2', 'retry-after-ms': '1000' }, 2000],
]) {
  test(`F2 actual SDK 429 then success respects ${label} Retry-After`, async () => {
    const h = aiHarness({
      aiFetch: (_, attempt) => (attempt === 1 ? aiError(429, headers) : aiSuccess()),
    })
    const { body } = await h.invoke()
    assert.equal(body.status, 'success')
    assert.equal(h.state.aiRequests.length, 2)
    assert.equal(h.state.aiRequests[1].time - h.state.aiRequests[0].time, delay)
    assert.deepEqual(h.waits, delay ? [delay] : [])
    assert.deepEqual(body.ai, { succeeded: 1, failed: 0, attempts: 2, retries: 1, cooldowns: 1 })
    assert.equal(h.state.inserts.length, 1)
  })
}

test('F2 repeated 429 makes exactly three SDK HTTP attempts without stacked retries', async () => {
  const h = aiHarness({ aiFetch: () => aiError(429) })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 502)
  assert.equal(body.status, 'failed')
  assert.equal(h.state.aiRequests.length, 3)
  assert.deepEqual(h.waits, [1000, 2000])
  assert.deepEqual(body.ai, { succeeded: 0, failed: 1, attempts: 3, retries: 2, cooldowns: 3 })
  assert.equal(body.summary.aiOperationsFailed, 1)
  assert.equal(body.errors[0].ai.category, 'RATE_LIMITED')
  assert.equal(body.errors[0].ai.reason, 'RETRY_EXHAUSTED')
  assert.equal(body.errors[0].ai.attempt, 3)
  assert.equal(body.errors[0].releaseId, 1)
  assert.equal(h.state.inserts.length, 0)
  assert.equal(h.state.runs[0].status, 'failed')
  assert.deepEqual(h.state.dispatched[0], [])
})

for (const metadata of [
  {
    provider_name: 'DeepInfra',
    raw: JSON.stringify({ error: { code: 'engine_overloaded', message: RAW_ERROR } }),
  },
  { provider_name: 'StreamLake', error_type: 'provider_overloaded' },
]) {
  test(`F2 ${metadata.provider_name} overload recovers with sanitized metadata`, async () => {
    const h = aiHarness({ aiFetch: (_, n) => (n === 1 ? aiError(429, {}, metadata) : aiSuccess()) })
    const { body } = await h.invoke()
    assert.equal(body.status, 'success')
    assert.equal(h.state.aiRequests.length, 2)
    const retry = h.state.logs.find(([message]) => message === 'AI summary retry')[1]
    assert.equal(retry.category, 'PROVIDER_OVERLOADED')
    assert.equal(retry.upstreamProvider, metadata.provider_name)
    assert.equal(retry.provider, 'OpenRouter')
    assert.equal(retry.releaseId, 1)
    assert.equal(retry.cooldownActivated, true)
    assert.equal(retry.reason, 'TRANSIENT_FAILURE')
  })
}

for (const [status, metadata, category] of [
  [401, {}, 'AUTHENTICATION_ERROR'],
  [402, {}, 'QUOTA_OR_CREDIT_EXHAUSTED'],
  [429, { error_type: 'insufficient_quota' }, 'QUOTA_OR_CREDIT_EXHAUSTED'],
  [402, { limit_source: 'openrouter_key_limit' }, 'QUOTA_OR_CREDIT_EXHAUSTED'],
]) {
  test(`F2 ${status}/${category} never retries and blocks futile queued requests`, async () => {
    const h = aiHarness({
      techs: [tech(1), tech(2)],
      aiFetch: () => aiError(status, { 'retry-after': '1' }, metadata),
    })
    const { body } = await h.invoke()
    assert.equal(body.status, 'failed')
    assert.equal(body.summary.aiOperationsFailed, 2)
    assert.equal(h.state.aiRequests.length, 1)
    assert.deepEqual(h.waits, [])
    assert.equal(body.errors[0].ai.category, category)
    assert.equal(body.errors[1].ai.reason, 'EXECUTION_BLOCKED')
    assert.equal(h.state.inserts.length, 0)
  })
}

test('F2 documented transient 402 in-flight budget respects Retry-After without credit retries', async () => {
  const h = aiHarness({
    aiFetch: (_, n) =>
      n === 1
        ? aiError(402, { 'retry-after': '1' }, { limit_source: 'openrouter_in_flight_budget' })
        : aiSuccess(),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.deepEqual(h.waits, [1000])
  assert.equal(h.state.aiRequests.length, 2)
})

test('F2 six repository processors share a serial AI lane and cooldown after each 429', async () => {
  let active = 0
  let peak = 0
  const h = aiHarness({
    techs: Array.from({ length: 6 }, (_, i) => tech(i + 1)),
    aiFetch: async (_, n) => {
      peak = Math.max(peak, ++active)
      await Promise.resolve()
      active--
      return n % 2 ? aiError(429, { 'retry-after': '1' }) : aiSuccess()
    },
  })
  const { body } = await h.invoke()
  assert.equal(peak, 1)
  assert.equal(body.status, 'success')
  assert.equal(body.summary.repositoriesAttempted, 6)
  assert.equal(h.state.fetches.length, 6) // GitHub concurrency/scheduling still independent.
  assert.equal(h.state.aiRequests.length, 12)
  assert.deepEqual(h.waits, Array(6).fill(1000))
  assert.equal(body.ai.cooldowns, 6)
  assert.equal(body.ai.retries, 6)
  assert.equal(h.state.inserts.length, 6)
})

test('F2 exhausted 429 cooldown delays the next queued release before its first HTTP request', async () => {
  const h = aiHarness({
    techs: [tech(1), tech(2)],
    aiFetch: (_, n) => (n <= 3 ? aiError(429) : aiSuccess()),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'partial_success')
  assert.deepEqual(h.waits, [1000, 2000, 4000])
  assert.equal(h.state.aiRequests[3].time - h.state.aiRequests[2].time, 4000)
  assert.equal(h.state.inserts.length, 1)
  assert.equal(body.summary.aiOperationsFailed, 1)
})

test('F2 excessive Retry-After prevents early retries and queued dispatches, with fresh state next run', async () => {
  const h = aiHarness({
    techs: [tech(1), tech(2)],
    aiFetch: (_, n) => (n === 1 ? aiError(429, { 'retry-after': '60' }) : aiSuccess()),
  })
  const first = await h.invoke()
  assert.equal(first.body.status, 'failed')
  assert.equal(first.body.errors[0].ai.reason, 'RETRY_DELAY_EXCEEDS_WAIT_LIMIT')
  assert.equal(first.body.errors[1].ai.reason, 'COOLDOWN_EXCEEDS_WAIT_LIMIT')
  assert.equal(h.state.aiRequests.length, 1)
  assert.deepEqual(h.waits, [])
  const next = await h.invoke()
  assert.equal(next.body.status, 'success')
  assert.equal(next.body.ai.attempts, 2)
  assert.equal(h.state.inserts.length, 2)
})

test('F2 waiting and queued AI work stop at the cron execution deadline', async () => {
  const h = aiHarness({
    techs: [tech(1), tech(2)],
    aiFetch: () => {
      h.advance(269000)
      return aiError(429, { 'retry-after': '2' })
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'failed')
  assert.equal(body.errors[0].ai.reason, 'EXECUTION_DEADLINE')
  assert.equal(body.errors[1].ai.category, 'EXECUTION_BUDGET_EXCEEDED')
  assert.equal(h.state.aiRequests.length, 1)
  assert.deepEqual(h.waits, [])
  assert.equal(body.summary.aiOperationsFailed, 2)
  assert.equal(h.state.runs[0].status, 'failed')
  assert.equal(body.runFinalized, true)
})

test('F2 SDK timeout cancellation propagates, settles and is not retried as a rate limit', async () => {
  const timeouts = []
  const h = aiHarness({
    runtime: {
      signal: (ms) => {
        timeouts.push(ms)
        return AbortSignal.timeout(5)
      },
    },
    aiFetch: (config) =>
      new Promise((_, reject) => {
        config.signal.addEventListener(
          'abort',
          () => reject(Object.assign(new Error(RAW_ERROR), { name: 'AbortError' })),
          { once: true },
        )
      }),
  })
  const keepAlive = setInterval(() => {}, 100)
  try {
    const { body } = await h.invoke()
    assert.equal(body.status, 'failed')
    assert.equal(body.errors[0].ai.category, 'TIMEOUT')
    assert.equal(h.state.aiRequests.length, 1)
    assert.deepEqual(timeouts, [25000])
    assert.deepEqual(h.waits, [])
    assert.equal(body.runFinalized, true)
  } finally {
    clearInterval(keepAlive)
  }
})

for (const [label, reply] of [
  ['empty choices', () => json({ choices: [] })],
  ['missing choices', () => json({})],
  ['invalid JSON', () => aiSuccess('not json')],
  ['invalid schema', () => aiSuccess('{}')],
  ['HTTP 200 error envelope', () => aiError(200, { 'retry-after': '1' }, {}, 429)],
]) {
  test(`F2 ${label} is safely classified without becoming a successful insert`, async () => {
    const h = aiHarness({ aiFetch: reply })
    const { body } = await h.invoke()
    const envelope = label === 'HTTP 200 error envelope'
    assert.equal(body.status, 'failed')
    assert.equal(body.errors[0].ai.category, envelope ? 'RATE_LIMITED' : 'INVALID_RESPONSE')
    if (envelope) {
      assert.equal(body.errors[0].ai.httpStatus, 200)
      assert.equal(body.errors[0].ai.upstreamCode, 429)
    }
    assert.equal(h.state.aiRequests.length, envelope ? 3 : 1)
    assert.equal(h.state.inserts.length, 0)
    assert.equal(body.summary.releasesFailed, 1)
    assert.equal(body.summary.aiOperationsFailed, 1)
  })
}

test('F2 late AI retry exhaustion retains committed progress, audit status and exact notification IDs', async () => {
  const h = aiHarness({
    fetch: () => json([release('good'), release('bad')]),
    aiFetch: (_, n) => (n === 1 ? aiSuccess() : aiError(429)),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(body.summary.releasesProcessed, 1)
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(body.summary.aiOperationsFailed, 1)
  assert.equal(body.releaseCountersComplete, true)
  assert.equal(h.state.inserts[0].version, 'good')
  assert.equal(h.state.runs[0].status, 'completed_with_errors')
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
  await h.invoke()
  assert.equal(h.state.inserts.length, 1)
  assert.deepEqual(h.state.dispatched[1], [])
  assert.equal(h.state.runs[0].releasesInserted, 1)
})

test('F2 non-retry instruction still coordinates a cooldown for other queued AI work', async () => {
  const h = aiHarness({
    techs: [tech(1), tech(2)],
    aiFetch: (_, n) =>
      n === 1 ? aiError(429, { 'x-should-retry': 'false', 'retry-after': '2' }) : aiSuccess(),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'partial_success')
  assert.equal(h.state.aiRequests.length, 2)
  assert.equal(body.ai.retries, 0)
  assert.deepEqual(h.waits, [2000])
  assert.equal(h.state.aiRequests[1].time - h.state.aiRequests[0].time, 2000)
})

test('F2 unavailable providers/network errors recover, unknown failures are not retried', async () => {
  for (const unavailable of [
    () => aiError(503),
    () => {
      throw new Error('Connection failure')
    },
  ]) {
    const h = aiHarness({ aiFetch: (_, n) => (n === 1 ? unavailable() : aiSuccess()) })
    const { body } = await h.invoke()
    assert.equal(body.status, 'success')
    assert.equal(h.state.aiRequests.length, 2)
    assert.equal(
      h.state.logs.find(([message]) => message === 'AI summary retry')[1].category,
      'PROVIDER_UNAVAILABLE',
    )
  }
  const h = aiHarness({ aiFetch: () => aiError(400) })
  const { body } = await h.invoke()
  assert.equal(body.errors[0].ai.category, 'UNKNOWN_ERROR')
  assert.equal(h.state.aiRequests.length, 1)
})

test('F2 jitter varies bounded retry waits instead of synchronizing executions', async () => {
  for (const [random, expected] of [
    [0, 750],
    [1, 1250],
  ]) {
    const h = aiHarness({
      runtime: { random: () => random },
      aiFetch: (_, n) => (n === 1 ? aiError(429) : aiSuccess()),
    })
    await h.invoke()
    assert.deepEqual(h.waits, [expected])
  }
})

test('F2 retry request timeout is reduced to remaining execution time', async () => {
  const h = aiHarness({
    aiFetch: (_, n) => {
      if (n > 1) return aiSuccess()
      h.advance(260000)
      return aiError(429, { 'retry-after': '2' })
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.deepEqual(h.timeouts, [25000, 8000])
  assert.deepEqual(h.waits, [2000])
})

test('F2 missing key fails closed without HTTP, AI success followed by insert failure stays uncommitted', async () => {
  const missing = aiHarness({ env: { OPENROUTER_API_KEY: undefined } })
  const noKey = await missing.invoke()
  assert.equal(noKey.body.errors[0].ai.category, 'AUTHENTICATION_ERROR')
  assert.equal(missing.state.aiRequests.length, 0)
  assert.equal(noKey.body.summary.aiOperationsFailed, 1)
  const h = aiHarness({ insertFailure: Object.assign(new Error(RAW_ERROR), { code: '23503' }) })
  const { body } = await h.invoke()
  assert.equal(body.ai.succeeded, 1)
  assert.equal(body.summary.aiOperationsFailed, 0)
  assert.equal(body.summary.releasesInserted, 0)
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(h.state.inserts.length, 0)
  assert.equal(h.state.runs[0].releasesInserted, 0)
  assert.deepEqual(h.state.dispatched[0], [])
})

test('F2 deadline signal also cancels a stalled SDK response body after headers', async () => {
  const h = aiHarness({
    runtime: { signal: () => AbortSignal.timeout(5) },
    aiFetch: (config) =>
      new Response(
        new ReadableStream({
          start(controller) {
            config.signal.addEventListener(
              'abort',
              () => controller.error(new DOMException('cancelled', 'AbortError')),
              { once: true },
            )
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  })
  const keepAlive = setInterval(() => {}, 100)
  try {
    const { body } = await h.invoke()
    assert.equal(body.errors[0].ai.category, 'TIMEOUT')
    assert.equal(h.state.aiRequests.length, 1)
    assert.equal(body.runFinalized, true)
    assert.equal(h.state.inserts.length, 0)
  } finally {
    clearInterval(keepAlive)
  }
})

test('F2 concurrency tuning is bounded at two and shares cooldown across active lanes', async () => {
  let active = 0
  let peak = 0
  const h = aiHarness({
    runtime: { concurrency: 2 },
    techs: Array.from({ length: 6 }, (_, i) => tech(i + 1)),
    aiFetch: async (_, n) => {
      peak = Math.max(peak, ++active)
      await Promise.resolve()
      active--
      return n <= 2 ? aiError(429, { 'retry-after': '1' }) : aiSuccess()
    },
  })
  const { body } = await h.invoke()
  assert.equal(peak, 2)
  assert.equal(body.status, 'success')
  assert.equal(h.state.aiRequests.length, 8)
  assert.equal(body.ai.retries, 2)
  assert.ok(
    h.state.aiRequests
      .slice(2)
      .every((request) => request.time >= h.state.aiRequests[1].time + 1000),
  )
})

test('F2 shared authentication block also prevents a late retry from another active lane', async () => {
  let releasePeer
  const pending = new Promise((resolve) => {
    releasePeer = () => resolve(aiError(429))
  })
  const h = aiHarness({
    runtime: { concurrency: 2 },
    techs: [tech(1), tech(2)],
    aiFetch: (_, n) => (n === 1 ? aiError(401) : pending),
  })
  const push = h.state.logs.push
  h.state.logs.push = function (entry) {
    if (entry[0] === 'AI summary failed' && entry[1].category === 'AUTHENTICATION_ERROR')
      releasePeer()
    return push.call(this, entry)
  }
  const { body } = await h.invoke()
  assert.equal(h.state.aiRequests.length, 2)
  assert.equal(body.status, 'failed')
  assert.equal(body.summary.aiOperationsFailed, 2)
  assert.equal(body.errors[1].ai.reason, 'EXECUTION_BLOCKED')
  assert.deepEqual(h.waits, [])
})

test('F2 preprocessing failure after a committed summary is counted without another HTTP request', async () => {
  const h = aiHarness({ fetch: () => json([release('good'), release('bad', { body: 42 })]) })
  const { body } = await h.invoke()
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.aiOperationsFailed, 1)
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(body.errors[0].ai.category, 'UNKNOWN_ERROR')
  assert.equal(h.state.aiRequests.length, 1)
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.equal(h.state.runs[0].status, 'completed_with_errors')
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
})

test('F2.1 choice-level HTTP 200 error takes precedence over valid summary content', async () => {
  const h = aiHarness({
    aiFetch: (_, n) =>
      n === 1
        ? json(
            {
              choices: [
                {
                  finish_reason: 'error',
                  error: { code: 429, message: RAW_ERROR },
                  message: {
                    content: JSON.stringify({
                      version: 'v1',
                      title: 'release',
                      summary: 'untrusted',
                    }),
                  },
                },
              ],
            },
            200,
            { 'retry-after': '1' },
          )
        : aiSuccess(),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.equal(h.state.aiRequests.length, 2)
  assert.equal(h.state.inserts[0].summary, 'summary')
  assert.equal(body.ai.retries, 1)
})

for (const status of [429, 503]) {
  test(`F2.1 aborted ${status} error body is terminal without cooldown or retry`, async () => {
    const h = aiHarness({
      runtime: { signal: () => AbortSignal.timeout(5) },
      aiFetch: (config) =>
        new Response(
          new ReadableStream({
            start(controller) {
              config.signal.addEventListener(
                'abort',
                () => controller.error(new DOMException('cancelled', 'AbortError')),
                { once: true },
              )
            },
          }),
          { status, headers: { 'content-type': 'application/json' } },
        ),
    })
    const keepAlive = setInterval(() => {}, 100)
    try {
      const { body } = await h.invoke()
      assert.equal(body.errors[0].ai.category, 'TIMEOUT')
      assert.equal(body.errors[0].ai.httpStatus, status)
      assert.equal(h.state.aiRequests.length, 1)
      assert.equal(body.ai.cooldowns, 0)
      assert.equal(body.ai.retries, 0)
      assert.deepEqual(h.waits, [])
      assert.equal(h.state.inserts.length, 0)
      assert.equal(body.runFinalized, true)
    } finally {
      clearInterval(keepAlive)
    }
  })
}

function manualClock() {
  let now = 0
  let next = 0
  const timers = new Map()
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = { id: ++next, unref() {} }
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    advance(ms) {
      now += ms
      for (const [id, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.fn()
        }
      }
    },
    get pending() {
      return timers.size
    },
  }
}

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await Promise.resolve()
  }
  assert.fail('Expected operation did not start')
}

function cancelledWait(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

test('F2.1 discovery cancellation settles all processors and prevents retry/new chunks', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    techs: Array.from({ length: 7 }, (_, i) => tech(i)),
    fetch: (_, config) => cancelledWait(config.signal),
  })
  const invocation = h.invoke()
  await until(() => h.state.fetches.length === 6)
  clock.advance(270000)
  const { body } = await invocation
  assert.equal(body.status, 'failed')
  assert.equal(body.runFinalized, true)
  assert.equal(body.summary.repositoriesAttempted, 6)
  assert.equal(body.summary.repositoriesFailed, 6)
  assert.equal(body.summary.repositoriesDeferred, 1)
  assert.equal(h.state.fetches.length, 6)
  assert.equal(h.state.ai.length, 0)
  assert.ok(body.errors.every((error) => error.category === 'TIME_BUDGET'))
  assert.equal(body.timings.githubDiscovery.operations, 6)
  assert.equal(body.timings.githubDiscovery.active, 0)
  assert.equal(h.state.activeOperations, 0)
  assert.equal(clock.pending, 0)
})

test('F2.1 GitHub 5xx at the work deadline cannot start its normal retry', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => {
      clock.advance(270000)
      return json({}, 503)
    },
  })
  const { body } = await h.invoke()
  assert.equal(h.state.fetches.length, 1)
  assert.equal(body.errors[0].category, 'TIME_BUDGET')
  assert.equal(body.runFinalized, true)
})

test('F2.1 shared deadline aborts active AI and terminates queued work without more HTTP', async () => {
  const clock = manualClock()
  const h = aiHarness({
    clock,
    performance: clock,
    techs: [tech(1), tech(2)],
    fetch: () => json([release('v1'), release('v2')]),
    aiFetch: (config) => cancelledWait(config.signal),
  })
  const invocation = h.invoke()
  await until(
    () =>
      h.state.aiRequests.length === 1 &&
      h.state.dbOperations.filter((op) => op.stage === 'lookup').length === 2,
  )
  clock.advance(270000)
  const { body } = await invocation
  assert.equal(body.status, 'failed')
  assert.equal(body.ai.failed, 2)
  assert.equal(body.ai.cooldowns, 0)
  assert.equal(body.ai.attempts, 1)
  assert.equal(h.state.aiRequests.length, 1)
  assert.equal(body.summary.releasesDiscovered, 4)
  assert.equal(body.summary.releasesCancelled, 2)
  assert.equal(body.summary.releasesFailed, 2)
  assert.equal(body.summary.releasesDeferred, 2)
  assert.equal(body.summary.releasesInserted, 0)
  assert.equal(body.releaseCountersComplete, true)
  assert.equal(body.runFinalized, true)
  assert.equal(h.state.runs[0].status, 'failed')
  assert.ok(Object.values(body.timings).every((stage) => stage.active === 0))
  assert.equal(clock.pending, 0)
})

for (const label of ['during cooldown', 'immediately before retry']) {
  test(`F2.1 cancellation ${label} prevents another attempt or queued dispatch`, async () => {
    const clock = manualClock()
    let waitStarted = false
    const h = aiHarness({
      clock,
      performance: clock,
      techs: [tech(1), tech(2)],
      runtime: {
        sleep: async (_, signal) => {
          waitStarted = true
          if (label === 'during cooldown') return cancelledWait(signal)
          clock.advance(270000)
        },
      },
      aiFetch: () => aiError(429, { 'retry-after': '1' }),
    })
    const invocation = h.invoke()
    await until(() => waitStarted)
    if (label === 'during cooldown') clock.advance(270000)
    const { body } = await invocation
    assert.equal(h.state.aiRequests.length, 1)
    assert.equal(body.ai.retries, 0)
    assert.equal(body.ai.failed, 2)
    assert.equal(body.status, 'failed')
    assert.equal(body.runFinalized, true)
    assert.equal(body.timings.aiRetryWait.active, 0)
  })
}

test('F2.1 deadline before persistence prevents insert; earlier commits retain exact IDs and deduplicate later', async () => {
  const clock = manualClock()
  let calls = 0
  const h = harness({
    clock,
    performance: clock,
    fetch: () => json([release('good'), release('late'), release('deferred')]),
    ai: () => {
      if (++calls === 2) clock.advance(270000)
      return { summary: 'summary' }
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(body.summary.releasesProcessed, 1)
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(body.summary.releasesCancelled, 1)
  assert.equal(body.summary.releasesDeferred, 1)
  assert.equal(body.releaseCountersComplete, true)
  assert.equal(h.state.dbOperations.filter((op) => op.stage === 'insert').length, 1)
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.equal(h.state.runs[0].status, 'completed_with_errors')
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
  assert.equal(body.runFinalized, true)
  assert.equal(h.state.activeOperations, 0)
  await h.invoke()
  assert.equal(h.state.inserts.filter((row) => row.version === 'good').length, 1)
  assert.equal(h.state.dispatched[1].includes(h.state.inserts[0].id), false)
})

test('F2.1 stalled insert aborts before cleanup, reports uncertain write and preserves acknowledged peer', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => json([release('good'), release('unknown')]),
    dbOperation: ({ stage, signal, values }) =>
      stage === 'insert' && values.version === 'unknown' ? cancelledWait(signal) : undefined,
  })
  const invocation = h.invoke()
  await until(() => h.state.dbOperations.filter((op) => op.stage === 'insert').length === 2)
  clock.advance(270000)
  const { body } = await invocation
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(body.summary.releasesCancelled, 1)
  assert.equal(body.releaseCountersComplete, false)
  assert.equal(h.state.inserts.length, 1)
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.equal(body.runFinalized, true)
  assert.equal(h.state.activeOperations, 0)
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
  assert.equal(body.timings.databaseWrite.active, 0)
})

test('F2.1 finalization is cancelled by its separate reserve without losing successful inserts', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => json([release()]),
    dbOperation: ({ stage, signal }) =>
      stage === 'finalization' ? cancelledWait(signal) : undefined,
  })
  const invocation = h.invoke()
  await until(() => h.state.dbOperations.some((op) => op.stage === 'finalization'))
  clock.advance(285000)
  const { response, body } = await invocation
  assert.equal(response.status, 500)
  assert.equal(body.status, 'failed')
  assert.equal(body.runFinalized, false)
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(h.state.inserts.length, 1)
  assert.equal(h.state.runs[0].status, 'running')
  assert.equal(h.state.runs[0].releasesInserted, 0)
  assert.equal(body.timings.finalization.active, 0)
  assert.equal(h.state.activeOperations, 0)
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
  assert.equal(clock.pending, 0)
})

test('F2.1 selection failure waits for a pending peer before cleanup', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    setupFailure: true,
    dbOperation: ({ stage, signal }) => (stage === 'followers' ? cancelledWait(signal) : undefined),
  })
  const invocation = h.invoke()
  await until(() => h.state.activeOperations === 1)
  clock.advance(270000)
  const { body } = await invocation
  assert.equal(body.status, 'failed')
  assert.equal(h.state.activeOperations, 0)
  assert.equal(h.state.fetches.length, 0)
  assert.equal(h.state.runs.length, 0)
  assert.equal(clock.pending, 0)
})

test('F2.1 filtering separates skipped entries from failed, processed and deferred work', async () => {
  const h = harness({
    fetch: () =>
      json([
        release('draft', { draft: true }),
        release('unpublished', { published_at: null }),
        release('good'),
        null,
      ]),
  })
  const { body } = await h.invoke()
  assert.equal(body.summary.releasesSkipped, 2)
  assert.equal(body.summary.releasesProcessed, 1)
  assert.equal(body.summary.releasesFailed, 1)
  assert.equal(body.summary.releasesDeferred, 0)
  assert.equal(body.summary.releasesDiscovered, 4)
  assert.equal(body.status, 'partial_success')
})

for (const [label, envelope, attempts, category] of [
  [
    'choice overload',
    {
      choices: [
        {
          finish_reason: 'error',
          error: {
            code: 503,
            message: RAW_ERROR,
            metadata: { error_type: 'provider_overloaded', provider_name: 'DeepInfra' },
          },
        },
      ],
    },
    3,
    'PROVIDER_OVERLOADED',
  ],
  [
    'choice authentication',
    { choices: [{ finish_reason: 'error', error: { code: 401, message: RAW_ERROR } }] },
    1,
    'AUTHENTICATION_ERROR',
  ],
  ['malformed top-level', { error: { message: RAW_ERROR } }, 1, 'INVALID_RESPONSE'],
  [
    'malformed choice',
    { choices: [{ finish_reason: 'error', error: 'bad', message: { content: '{}' } }] },
    1,
    'INVALID_RESPONSE',
  ],
  [
    'missing error details',
    { choices: [{ finish_reason: 'error', message: { content: '{}' } }] },
    1,
    'INVALID_RESPONSE',
  ],
]) {
  test(`F2.1 HTTP 200 ${label} preserves sanitized classification and never inserts`, async () => {
    const h = aiHarness({ aiFetch: () => json(envelope) })
    const { body } = await h.invoke()
    assert.equal(body.status, 'failed')
    assert.equal(body.errors[0].ai.category, category)
    assert.equal(body.errors[0].ai.httpStatus, 200)
    assert.equal(h.state.aiRequests.length, attempts)
    assert.equal(h.state.inserts.length, 0)
    assert.equal(h.state.runs[0].status, 'failed')
    assert.deepEqual(h.state.dispatched[0], [])
  })
}

test('F2.1 summary content containing an extra error field remains valid schema output', async () => {
  const h = aiHarness({
    aiFetch: () =>
      aiSuccess(
        JSON.stringify({
          version: 'v1',
          title: 'release',
          summary: 'valid',
          error: 'ordinary user content',
        }),
      ),
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.equal(h.state.aiRequests.length, 1)
  assert.equal(h.state.inserts[0].summary, 'valid')
})

test('F2.1 actual Neon HTTP/Drizzle adapter receives scoped cancellation without changing shared callers', async () => {
  const driver = nativeRequire('@neondatabase/serverless')
  const drizzle = nativeRequire('drizzle-orm/neon-http')
  const orm = nativeRequire('drizzle-orm')
  const priorFetch = driver.neonConfig.fetchFunction
  const requests = []
  driver.neonConfig.fetchFunction = (_, config) => {
    requests.push(config)
    return cancelledWait(config.signal)
  }
  try {
    const source = readFileSync(new URL('../src/db/index.ts', import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const compiledModule = { exports: {} }
    runInNewContext(compiled, {
      module: compiledModule,
      exports: compiledModule.exports,
      process: {
        env: { DATABASE_URL: 'postgresql://synthetic:synthetic@db.example.test/example' },
      },
      require: (id) =>
        ({ '@neondatabase/serverless': driver, 'drizzle-orm/neon-http': drizzle, './schema': {} })[
          id
        ],
    })
    const controller = new AbortController()
    const db = compiledModule.exports.getDb(controller.signal)
    assert.equal(compiledModule.exports.getDb(controller.signal), db)
    assert.notEqual(compiledModule.exports.getDb(), db)
    assert.equal(compiledModule.exports.getDb(), compiledModule.exports.getDb())
    const operation = db.execute(orm.sql`select 1`)
    const rejected = assert.rejects(operation)
    await until(() => requests.length === 1)
    assert.equal(requests[0].signal, controller.signal)
    controller.abort(new Error('synthetic cancellation'))
    await rejected
    assert.equal(requests.length, 1)
    assert.throws(() => compiledModule.exports.getDb(controller.signal))
  } finally {
    driver.neonConfig.fetchFunction = priorFetch
  }
})

const notificationRelease = {
  id: 'release-0',
  techId: '1',
  techName: 'Repo 1',
  version: 'v1',
  title: 'release',
  summary: 'summary',
  importanceLevel: 'high',
  breakingChanges: [],
  rawReleaseUrl: 'https://github.com/org/repo/releases/tag/v1',
}
const notificationSubscription = {
  webhookId: 'webhook-1',
  kind: 'slack',
  url: 'https://hooks.slack.com/services/synthetic',
  minImportance: 'medium',
  techId: '1',
}

for (const stage of ['notificationReleases', 'notificationSubscriptions']) {
  test(`F2.1 actual webhook ${stage} preparation cancels at cleanup deadline after finalized ingestion`, async () => {
    const clock = manualClock()
    const h = harness({
      clock,
      performance: clock,
      realWebhooks: true,
      notificationReleases: [notificationRelease],
      notificationSubscriptions: [notificationSubscription],
      fetch: () => json([release()]),
      dbOperation: ({ stage: current, signal }) =>
        current === stage ? cancelledWait(signal) : undefined,
    })
    const invocation = h.invoke()
    await until(() => h.state.dbOperations.some((op) => op.stage === stage))
    assert.equal(h.state.runs[0].status, 'completed')
    clock.advance(295000)
    const { body } = await invocation
    assert.equal(body.status, 'partial_success')
    assert.equal(body.runFinalized, true)
    assert.equal(body.webhooks.deadlineReached, true)
    assert.equal(body.webhooks.errors, 1)
    assert.equal(body.summary.releasesInserted, 1)
    assert.equal(h.state.fetches.length, 1)
    assert.equal(h.state.activeOperations, 0)
    assert.equal(body.timings.notificationPreparation.active, 0)
    assert.equal(clock.pending, 0)
  })
}

test('F2.1 actual webhook delivery cancellation prevents later sends and leaves completed ingestion intact', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    realWebhooks: true,
    notificationReleases: [notificationRelease],
    notificationSubscriptions: [
      notificationSubscription,
      { ...notificationSubscription, webhookId: 'webhook-2' },
    ],
    fetch: (url, config) =>
      url.startsWith('https://hooks.slack.com/') ? cancelledWait(config.signal) : json([release()]),
  })
  const invocation = h.invoke()
  await until(() => h.state.fetches.length === 2)
  assert.equal(h.state.runs[0].status, 'completed')
  clock.advance(295000)
  const { body } = await invocation
  assert.equal(body.status, 'partial_success')
  assert.equal(body.webhooks.webhooks, 1)
  assert.equal(body.webhooks.sent, 0)
  assert.equal(body.webhooks.errors, 1)
  assert.equal(body.webhooks.deferred, 1)
  assert.equal(h.state.fetches.length, 2)
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.equal(body.timings.notificationDelivery.active, 0)
  assert.equal(clock.pending, 0)
})

test('F2.1 an acknowledged insert at the cutoff remains committed and only later work is deferred', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => json([release('acknowledged'), release('deferred')]),
    dbAcknowledged: ({ stage }) => {
      if (stage === 'insert') clock.advance(270000)
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'partial_success')
  assert.equal(body.summary.releasesInserted, 1)
  assert.equal(body.summary.releasesProcessed, 1)
  assert.equal(body.summary.releasesDeferred, 1)
  assert.equal(body.summary.releasesFailed, 0)
  assert.equal(body.summary.releasesCancelled, 0)
  assert.equal(body.releaseCountersComplete, true)
  assert.equal(h.state.runs[0].releasesInserted, 1)
  assert.deepEqual(h.state.dispatched[0], [h.state.inserts[0].id])
})

test('F2.1 confirmed GitHub 401 remains global even when the work cutoff fires concurrently', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => {
      clock.advance(270000)
      return json({}, 401)
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'failed')
  assert.equal(body.errors[0].category, 'GITHUB_AUTH')
  assert.equal(body.errors[0].scope, 'global')
  assert.equal(h.state.runs[0].status, 'failed')
  assert.equal(h.state.fetches.length, 1)
})

test('F2.1 confirmed database connection error remains global at the cutoff', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => json([release()]),
    dbOperation: ({ stage }) => {
      if (stage === 'insert') {
        clock.advance(270000)
        throw Object.assign(new Error(RAW_ERROR), { code: '08006' })
      }
    },
  })
  const { response, body } = await h.invoke()
  assert.equal(response.status, 500)
  assert.equal(body.status, 'failed')
  assert.equal(body.errors[0].category, 'DATABASE')
  assert.equal(body.errors[0].scope, 'global')
  assert.equal(body.releaseCountersComplete, false)
  assert.equal(h.state.runs[0].status, 'failed')
  assert.equal(h.state.inserts.length, 0)
})

test('F2.1 near-cutoff GitHub success defers releases before lookup or AI without false failures', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    fetch: () => {
      clock.advance(269500)
      return json([release('v1'), release('v2')])
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'failed')
  assert.equal(body.summary.releasesDiscovered, 2)
  assert.equal(body.summary.releasesDeferred, 2)
  assert.equal(body.summary.releasesFailed, 0)
  assert.equal(body.summary.releasesCancelled, 0)
  assert.equal(h.state.ai.length, 0)
  assert.equal(h.state.dbOperations.filter((op) => op.stage === 'lookup').length, 0)
  assert.equal(body.runFinalized, true)
})

test('F2.1 fractional monotonic remaining time becomes a valid integer request timeout', async () => {
  const clock = manualClock()
  const h = aiHarness({
    clock,
    performance: clock,
    fetch: () => {
      clock.advance(257500.25)
      return json([release()])
    },
  })
  const { body } = await h.invoke()
  assert.equal(body.status, 'success')
  assert.deepEqual(h.timeouts, [12499])
  assert.equal(h.state.inserts.length, 1)
})

test('F2.1 default retry sleep is actually cancelled, disposed and awaited before finalization', async () => {
  const clock = manualClock()
  const h = harness({
    clock,
    performance: clock,
    realAI: true,
    techs: [tech(1), tech(2)],
    fetch: () => json([release()]),
    aiFetch: () => aiError(429, { 'retry-after': '1' }),
  })
  const invocation = h.invoke()
  await until(() => clock.pending === 4) // Three phase timers and the actual retry sleep.
  clock.advance(270000)
  const { body } = await invocation
  assert.equal(body.status, 'failed')
  assert.equal(body.ai.attempts, 1)
  assert.equal(body.ai.retries, 0)
  assert.equal(body.ai.failed, 2)
  assert.equal(h.state.aiRequests.length, 1)
  assert.equal(body.runFinalized, true)
  assert.equal(body.timings.aiRetryWait.operations, 1)
  assert.equal(body.timings.aiRetryWait.active, 0)
  assert.equal(clock.pending, 0)
})
