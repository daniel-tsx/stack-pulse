import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { neon, neonConfig } from '@neondatabase/serverless'
import { loadTs } from './release-test-helpers.mjs'
import { openSkillTestDatabase, localSkillTarget } from './skill-test-database.mjs'

const namespace = `skill_test_${randomUUID().replaceAll('-', '')}`
const enabled = !!process.env.SKILL_TEST_DATABASE_URL
const integration = (name, fn) =>
  test(name, { skip: !enabled && 'Owned local PostgreSQL required', timeout: 10000 }, fn)
const schema = loadTs('src/db/schema.ts')
const catalog = loadTs('src/lib/skill-catalog.ts')
let pool,
  server,
  endpoint,
  getDb,
  storeModule,
  created = false,
  fault,
  requests = 0
const originalEndpoint = neonConfig.fetchEndpoint
const originalFetch = neonConfig.fetchFunction
const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

before(async () => {
  if (!enabled) return
  pool = await openSkillTestDatabase(namespace)
  await pool.query(`create schema "${namespace}"`)
  created = true
  await pool.query(
    readFileSync(
      new URL('../drizzle/0010_tired_doctor_strange.sql', import.meta.url),
      'utf8',
    ).replaceAll('"public".', `"${namespace}".`),
  )
  server = createServer(async (request, response) => {
    try {
      const parts = []
      for await (const part of request) parts.push(part)
      const body = JSON.parse(Buffer.concat(parts).toString())
      requests++
      const current = fault
      fault = null
      if (current?.stage === 'before') {
        current.seen.resolve()
        await current.resume.promise
        // A controlled pre-execution failure; no assumption about hosted SQL cancellation.
        response.destroy()
        return
      }
      assert.equal(body.queries, undefined, 'Exercise production single-statement requests')
      const result = await pool.query({
        text: body.query,
        values: body.params,
        rowMode: 'array',
        types: { getTypeParser: () => (value) => value },
      })
      if (current?.stage === 'after') {
        // Autocommit has completed. Deliberately lose the response after a real durable write.
        current.seen.resolve()
        await current.resume.promise
        response.destroy()
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
          rows: result.rows,
          rowCount: result.rowCount,
          command: result.command,
        }),
      )
    } catch {
      response.statusCode = 400
      response.end(JSON.stringify({ message: 'Isolated SQL bridge failure' }))
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  endpoint = `http://127.0.0.1:${server.address().port}/sql`
  neonConfig.fetchEndpoint = (host) => {
    assert.equal(host, 'skill-http.invalid')
    return endpoint
  }
  neonConfig.fetchFunction = (url, options) => {
    assert.equal(String(url), endpoint, 'All remote network access is forbidden')
    return fetch(url, { ...options, redirect: 'error' })
  }
  // Actual production getDb, Neon SDK and Drizzle, with an impossible remote hostname.
  getDb = loadTs(
    'src/db/index.ts',
    { './schema': schema, '@neondatabase/serverless': { neon } },
    {
      process: { env: { DATABASE_URL: 'postgresql://synthetic@skill-http.invalid/test' } },
      AbortSignal,
    },
  ).getDb
  storeModule = loadTs(
    'src/lib/skill-store.ts',
    { '@/db': { getDb }, '@/db/schema': schema, '@/lib/skill-catalog': catalog },
    { AbortSignal },
  )
  await storeModule.seedSkills()
})
after(async () => {
  fault?.resume.resolve()
  neonConfig.fetchEndpoint = originalEndpoint
  neonConfig.fetchFunction = originalFetch
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  if (pool) {
    try {
      if (created) await pool.query(`drop schema "${namespace}" cascade`)
    } finally {
      await pool.end()
    }
  }
})
const observe = (n) => ({
  revision: String(n).repeat(40),
  tree: String(n + 1).repeat(40),
  branch: 'main',
  hasSkillFile: true,
})
function arm(stage) {
  fault = { stage, seen: deferred(), resume: deferred() }
  return fault
}
async function loseResponse(operation, stage = 'after') {
  const gate = arm(stage),
    controller = new AbortController()
  const result = operation(storeModule.createSkillStore(controller.signal))
  const rejection = assert.rejects(result)
  await gate.seen.promise
  const started = performance.now()
  controller.abort()
  await rejection
  assert.ok(performance.now() - started < 2000, 'Client must stop waiting promptly')
  gate.resume.resolve()
}

test('database guard refuses unknown remote and unproved local targets before connecting', () => {
  for (const url of [
    'postgresql://user@production.neon.tech/test',
    'postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test',
  ])
    assert.throws(() => localSkillTarget(url, {}))
})

integration(
  'Neon signal scopes cancel before dispatch and a pre-execution failure leaves no transition',
  async () => {
    const candidate = (await storeModule.createSkillStore().list())[0],
      token = randomUUID()
    const skill = await storeModule.createSkillStore().acquire(candidate.id, token)
    await storeModule.createSkillStore().observe(skill, token, observe(1))
    const controller = new AbortController(),
      beforeRequests = requests
    controller.abort()
    assert.throws(() => storeModule.createSkillStore(controller.signal))
    assert.equal(requests, beforeRequests)
    await loseResponse((store) => store.observe(skill, token, observe(3)), 'before')
    assert.equal(
      (await pool.query('select observed_revision from agent_skills where id=$1', [skill.id]))
        .rows[0].observed_revision,
      observe(1).revision,
    )
    assert.equal(await storeModule.createSkillStore().observe(skill, token, observe(3)), 1)
    await storeModule.createSkillStore().release(skill.id, token)
  },
)

integration(
  'lost Neon HTTP commit acknowledgement preserves atomic event/checkpoint and retry makes no duplicate',
  async () => {
    const store = storeModule.createSkillStore(),
      candidate = (await store.list())[0],
      token = randomUUID()
    const skill = await store.acquire(candidate.id, token)
    if (!skill.baselineRevision) await store.observe(skill, token, observe(1))
    await loseResponse((scoped) => scoped.observe(skill, token, observe(5)))
    assert.equal(
      (await pool.query('select observed_revision from agent_skills where id=$1', [skill.id]))
        .rows[0].observed_revision,
      observe(5).revision,
    )
    assert.equal(await store.observe(skill, token, observe(5)), 0)
    assert.equal(
      (
        await pool.query(
          'select count(*)::int n from agent_skill_updates where skill_id=$1 and new_revision=$2',
          [skill.id, observe(5).revision],
        )
      ).rows[0].n,
      1,
    )
    await store.release(skill.id, token)
  },
)

integration(
  'lost lease acknowledgement blocks overlap until expiry; stale owner remains fenced',
  async () => {
    const store = storeModule.createSkillStore(),
      candidate = (await store.list())[0],
      old = randomUUID(),
      fresh = randomUUID()
    await loseResponse((scoped) => scoped.acquire(candidate.id, old))
    assert.equal(await store.acquire(candidate.id, fresh), null)
    await pool.query("update agent_skills set lease_until=now()-interval '1 second' where id=$1", [
      candidate.id,
    ])
    assert.ok(await store.acquire(candidate.id, fresh))
    assert.equal(await store.observe(candidate, old, observe(7)), 0)
    await store.release(candidate.id, old)
    assert.equal(
      (await pool.query('select lease_token from agent_skills where id=$1', [candidate.id])).rows[0]
        .lease_token,
      fresh,
    )
    await store.release(candidate.id, fresh)
  },
)

integration(
  'lost analysis acknowledgements recover interrupted work and retain completed reports',
  async () => {
    const store = storeModule.createSkillStore(),
      candidate = (await store.list())[0],
      token = randomUUID()
    const skill = await store.acquire(candidate.id, token)
    await store.observe(skill, token, observe(1))
    await store.observe(skill, token, observe(3))
    const [event] = await store.pending(skill.id)
    await loseResponse((scoped) =>
      scoped.saveUpdate(skill.id, token, event.id, {
        analysisStatus: 'analyzing',
        analysisAttempts: 1,
      }),
    )
    await store.recoverInterrupted(skill.id, token)
    assert.equal((await store.pending(skill.id))[0].analysisError, 'INTERRUPTED_ANALYSIS')
    await loseResponse((scoped) =>
      scoped.saveUpdate(skill.id, token, event.id, {
        analysisStatus: 'complete',
        report: { summary: 'Synthetic persisted report' },
      }),
    )
    assert.equal(
      (
        await pool.query('select analysis_status, report from agent_skill_updates where id=$1', [
          event.id,
        ])
      ).rows[0].report.summary,
      'Synthetic persisted report',
    )
    assert.ok(!(await store.pending(skill.id)).some((row) => row.id === event.id))
    await store.release(skill.id, token)
  },
)
