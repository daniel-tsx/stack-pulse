import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
const TOKEN = 'synthetic-github-credential'
const CRON_SECRET = 'synthetic-cron-credential'
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
  const env = { GITHUB_TOKEN: TOKEN, CRON_SECRET, ...options.env }
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
  }
  const schema = Object.fromEntries(
    ['technologies', 'userTechPreferences', 'releaseUpdates', 'releaseFetchRuns'].map((table) => [
      table,
      new Proxy(
        { table },
        { get: (target, field) => target[field] ?? `${table}.${String(field)}` },
      ),
    ]),
  )
  const rows = [...(options.existing ?? [])]
  const db = {
    select: () => ({
      from(table) {
        if (table === schema.technologies) {
          if (options.setupFailure) throw new Error(RAW_ERROR)
          return Promise.resolve(options.techs ?? [tech(1)])
        }
        assert.equal(table, schema.releaseUpdates)
        return {
          where(conditions) {
            return {
              async limit() {
                if (options.lookupFailure) throw options.lookupFailure
                const [techId, version] = conditions.map((item) => item.value)
                return rows.filter((row) => row.techId === techId && row.version === version)
              },
            }
          },
        }
      },
    }),
    selectDistinct: () => ({
      from: () => Promise.resolve((options.followed ?? []).map((techId) => ({ techId }))),
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
              state.runs.push(row)
              return [row]
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
            rows.push(row)
            state.inserts.push(row)
            return [{ id: row.id }]
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
          Object.assign(row, values)
        },
      }),
    }),
  }
  const imports = {
    'next/server': {
      NextResponse: { json: (body, init) => Response.json(body, init) },
      NextRequest: Request,
    },
    crypto: nativeRequire('node:crypto'),
    'drizzle-orm': {
      eq: (column, value) => ({ column, value }),
      and: (...items) => items,
      desc: (column) => column,
    },
    '@/db/schema': schema,
    '@/db': {
      getDb() {
        state.dbCalls++
        return db
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
      async dispatchReleaseWebhooks(ids) {
        state.dispatched.push([...ids])
        state.finalizedAtDispatch.push(!!state.runs.at(-1)?.finishedAt)
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
        AbortSignal: options.AbortSignal ?? AbortSignal,
        Response,
        URL,
        Date: options.Date ?? Date,
        console: Object.fromEntries(
          ['info', 'warn', 'error'].map((method) => [method, (...args) => state.logs.push(args)]),
        ),
        fetch: async (url, config) => {
          state.fetches.push({ url, config })
          return options.fetch ? options.fetch(url, config, state.fetches.length) : json([])
        },
        require(specifier) {
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
    for (const secret of [TOKEN, CRON_SECRET, RAW_ERROR])
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
  let clockCalls = 0
  class TestDate extends Date {
    static now() {
      return ++clockCalls <= 2 ? 0 : 270_001
    }
  }
  const h = harness({ Date: TestDate, techs: Array.from({ length: 7 }, (_, index) => tech(index)) })
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
