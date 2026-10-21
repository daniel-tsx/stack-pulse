import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/neon-http'
import { openSkillTestDatabase } from './skill-test-database.mjs'
import { loadTs, localNeonClient } from './release-test-helpers.mjs'
import { interleaveSkillSnapshots, snapshotHash } from './skill-snapshot-helpers.mjs'

const connectionString = process.env.SKILL_TEST_DATABASE_URL
const namespace = `skill_test_${randomUUID().replaceAll('-', '')}`
let pool,
  store,
  seed,
  catalog,
  db,
  schema,
  storeModule,
  created = false
before(async () => {
  if (!connectionString) return
  pool = await openSkillTestDatabase(namespace)
  await pool.query(`create schema "${namespace}"`)
  created = true
  await pool.query(
    readFileSync(
      new URL('../drizzle/0010_tired_doctor_strange.sql', import.meta.url),
      'utf8',
    ).replaceAll('"public".', `"${namespace}".`),
  )
  db = drizzle(localNeonClient(pool))
  schema = loadTs('src/db/schema.ts')
  catalog = loadTs('src/lib/skill-catalog.ts')
  storeModule = loadTs(
    'src/lib/skill-store.ts',
    { '@/db': { getDb: () => db }, '@/db/schema': schema, '@/lib/skill-catalog': catalog },
    { AbortSignal },
  )
  seed = storeModule.seedSkills
  store = storeModule.createSkillStore()
})
after(async () => {
  if (!pool) return
  try {
    if (created) await pool.query(`drop schema "${namespace}" cascade`)
  } finally {
    await pool.end()
  }
})
const integration = (name, fn) =>
  test(
    name,
    {
      skip:
        !connectionString &&
        'Set SKILL_TEST_DATABASE_URL and SKILL_TEST_TARGET_FILE for an owned disposable cluster',
    },
    fn,
  )
const hash = (n) => String(n).repeat(40)
const obs = (revision, tree, hasSkillFile = true) => ({
  revision: hash(revision),
  tree: tree === null ? null : hash(tree),
  hasSkillFile,
  branch: 'main',
})

integration(
  'migration and idempotent curated seed register exactly ten identities without resetting tracking',
  async () => {
    await seed()
    await seed()
    assert.equal((await store.list()).length, 10)
    await pool.query("update agent_skills set tracking=false where slug='grill-me'")
    await seed()
    assert.equal((await store.list()).length, 9)
    await pool.query("update agent_skills set tracking=true where slug='grill-me'")
    await assert.rejects(
      pool.query("update agent_skills set directory='skills/../escape' where slug='grill-me'"),
      { code: '23514' },
    )
    await assert.rejects(
      pool.query("update agent_skills set repository='Mixed/Case' where slug='grill-me'"),
      { code: '23514' },
    )
  },
)

integration(
  'overlapping invocations acquire one lease; baseline has no event and unrelated HEAD has no AI work',
  async () => {
    const candidate = (await store.list())[0]
    const tokens = [randomUUID(), randomUUID()]
    const claims = await Promise.all(tokens.map((token) => store.acquire(candidate.id, token)))
    assert.equal(claims.filter(Boolean).length, 1)
    const token = tokens[claims.findIndex(Boolean)]
    const skill = claims.find(Boolean)
    assert.equal(await store.observe(skill, token, obs(1, 2)), 0)
    assert.equal((await store.pending(skill.id)).length, 0)
    assert.equal(await store.observe(skill, token, obs(3, 2)), 0)
    assert.equal((await store.pending(skill.id)).length, 0)
    assert.equal(await store.observe(skill, token, obs(4, 5)), 1)
    assert.equal(await store.observe(skill, token, obs(4, 5)), 0)
    const [event] = await store.pending(skill.id)
    assert.equal(event.previousRevision, hash(3))
    assert.equal(event.newRevision, hash(4))
    assert.equal(event.analysisStatus, 'pending')
    await store.release(skill.id, token)
  },
)

integration(
  'event insert failure rolls back checkpoint; check failure retains last success and revision',
  async () => {
    const candidate = (await store.list())[0],
      token = randomUUID()
    const skill = await store.acquire(candidate.id, token)
    if (!skill.baselineRevision) await store.observe(skill, token, obs(1, 2))
    const before = (await pool.query('select * from agent_skills where id=$1', [skill.id])).rows[0]
    await assert.rejects(
      store.observe(skill, token, { ...obs(6, 7), revision: null }),
      (error) => (error.cause?.code ?? error.code) === '23502',
    )
    const after = (await pool.query('select * from agent_skills where id=$1', [skill.id])).rows[0]
    assert.equal(after.observed_revision, before.observed_revision)
    await store.checkFailed(skill.id, token, 'GITHUB_RATE_LIMIT')
    const failed = (await pool.query('select * from agent_skills where id=$1', [skill.id])).rows[0]
    assert.equal(failed.check_status, 'failed')
    assert.equal(failed.observed_revision, before.observed_revision)
    assert.equal(failed.last_success_at.toISOString(), before.last_success_at.toISOString())
    await store.release(skill.id, token)
  },
)

integration(
  'missing initial path makes no baseline; deletion and reappearance create durable distinct transitions',
  async () => {
    const candidate = (await store.list()).find((s) => !s.baselineRevision),
      token = randomUUID()
    const skill = await store.acquire(candidate.id, token)
    await store.observe(skill, token, obs(1, null, false))
    assert.equal((await store.pending(skill.id)).length, 0)
    assert.equal(
      (await pool.query('select baseline_revision from agent_skills where id=$1', [skill.id]))
        .rows[0].baseline_revision,
      null,
    )
    await store.observe(skill, token, obs(2, 3))
    assert.equal(await store.observe(skill, token, obs(4, null, false)), 1)
    assert.equal(await store.observe(skill, token, obs(5, 6)), 1)
    assert.equal(
      (
        await pool.query('select count(*)::int as n from agent_skill_updates where skill_id=$1', [
          skill.id,
        ])
      ).rows[0].n,
      2,
    )
    await store.release(skill.id, token)
  },
)

integration(
  'expired lease fences stale writes and final interrupted analysis remains manually recoverable',
  async () => {
    const candidate = (await store.list()).find((s) => s.baselineRevision),
      oldToken = randomUUID()
    const skill = await store.acquire(candidate.id, oldToken)
    const [pending] = await store.pending(skill.id)
    await store.saveUpdate(skill.id, oldToken, pending.id, {
      analysisStatus: 'analyzing',
      analysisAttempts: 3,
    })
    await pool.query("update agent_skills set lease_until=now()-interval '1 second' where id=$1", [
      skill.id,
    ])
    const newToken = randomUUID()
    assert.ok(await store.acquire(skill.id, newToken))
    await assert.rejects(
      store.saveUpdate(skill.id, oldToken, pending.id, { analysisStatus: 'complete' }),
    )
    assert.equal(await store.observe(skill, oldToken, obs(8, 9)), 0)
    await store.recoverInterrupted(skill.id, newToken)
    const row = (await pool.query('select * from agent_skill_updates where id=$1', [pending.id]))
      .rows[0]
    assert.equal(row.analysis_status, 'failed')
    assert.equal(row.analysis_error, 'INTERRUPTED_ANALYSIS')
    assert.equal(await storeModule.resetFailedSkillAnalyses(), 0)
    await store.release(skill.id, newToken)
    await storeModule.resetFailedSkillAnalyses()
    assert.equal((await store.pending(skill.id))[0].id, pending.id)
  },
)

integration(
  'real ingestion baselines without AI, skips unchanged trees, preserves failed analysis and resumes it',
  async () => {
    await pool.query('delete from agent_skill_updates')
    await pool.query(
      "update agent_skills set baseline_revision=null, observed_revision=null, observed_tree=null, check_status='not_checked', lease_token=null, lease_until=null",
    )
    const budget = loadTs(
      'src/lib/execution-budget.ts',
      {},
      { performance, AbortSignal, AbortController, setTimeout, clearTimeout },
    )
    class ProviderFailure extends Error {
      category = 'INVALID_RESPONSE'
    }
    class RemoteFailure extends Error {}
    let revision = 1,
      tree = 2,
      calls = 0,
      fail = true,
      sourceFail = false
    const evidence = {
      files: [],
      complete: false,
      limitations: ['Synthetic missing source'],
      totalChangedFiles: 1,
    }
    const ingestion = loadTs(
      'src/lib/skill-ingestion.ts',
      {
        '@/lib/skill-catalog': catalog,
        '@/lib/skill-store': storeModule,
        '@/lib/execution-budget': budget,
        '@/lib/github': {
          createGithubFetchContext: () => ({ authFailure: null }),
          GithubApiError: RemoteFailure,
        },
        '@/lib/skill-github': {
          SkillEvidenceError: RemoteFailure,
          createSkillGithub: () => ({
            observe: async () => {
              if (sourceFail) throw new RemoteFailure()
              return obs(revision, tree)
            },
            evidence: async () => evidence,
          }),
        },
        '@/lib/ai-resilience': {
          AiProviderError: ProviderFailure,
          createAiExecutionContext: () => ({ stats: {} }),
        },
        '@/lib/skill-analysis': {
          SkillAnalysisFailure: ProviderFailure,
          analyzeSkillUpdate: async () => {
            calls++
            if (fail) throw new ProviderFailure()
            return {
              report: { summary: 'Synthetic unknown', recommendation: 'insufficient_evidence' },
              telemetry: {
                requestedModel: 'test/model',
                returnedModel: 'test/model',
                provider: 'test',
                inputTokens: 1,
                outputTokens: 1,
                reasoningTokens: 0,
                costUsd: null,
                costKind: 'unknown',
                attempts: 1,
                unreportedAttempts: 1,
                durationMs: 1,
              },
            }
          },
        },
      },
      { performance, AbortSignal, console: { warn() {}, info() {} } },
    )
    const baseline = await ingestion.ingestSkillUpdates()
    assert.equal(baseline.baselines, 10)
    assert.equal(calls, 0)
    revision = 3
    assert.equal((await ingestion.ingestSkillUpdates()).unchanged, 10)
    assert.equal(calls, 0)
    tree = 4
    revision = 5
    const changed = await ingestion.ingestSkillUpdates()
    assert.equal(changed.detected, 10)
    assert.equal(calls, 4)
    assert.equal(
      (await pool.query('select count(*)::int as n from agent_skill_updates')).rows[0].n,
      10,
    )
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from agent_skill_updates where analysis_status='failed'",
        )
      ).rows[0].n,
      4,
    )
    const before = (await pool.query('select * from agent_skills order by id')).rows
    revision = 6
    tree = 7
    await ingestion.ingestSkillUpdates(true)
    assert.equal(calls, 4)
    assert.deepEqual((await pool.query('select * from agent_skills order by id')).rows, before)
    // Remote discovery errors do not block retries of already durable work.
    fail = false
    sourceFail = true
    const recovered = await ingestion.ingestSkillUpdates()
    assert.equal(recovered.analyzed, 4)
    assert.equal(
      (await pool.query('select count(*)::int as n from agent_skill_updates')).rows[0].n,
      10,
    )
    assert.equal(
      (
        await pool.query(
          "select count(*)::int as n from agent_skill_updates where analysis_status='complete'",
        )
      ).rows[0].n,
      4,
    )
  },
)

async function prepareSnapshotRace() {
  await pool.query('delete from agent_skill_updates')
  await pool.query(
    'update agent_skills set tracking=false, baseline_revision=$1, observed_revision=$1, observed_tree=$2, lease_token=null, lease_until=null',
    [snapshotHash(1), snapshotHash(3)],
  )
  await pool.query(
    "update agent_skills set tracking=true where slug in ('ponytail','ponytail-review')",
  )
}

integration(
  'actual ingestion/HTTP detection and SQL leases prevent stale HEAD reversal while accepting a fresh branch rewrite',
  async () => {
    await prepareSnapshotRace()
    const result = await interleaveSkillSnapshots(store)
    const rows = (await pool.query('select observed_revision from agent_skills where tracking'))
      .rows
    assert.ok(rows.every((row) => row.observed_revision === snapshotHash(2)))
    const events = (
      await pool.query('select previous_revision,new_revision from agent_skill_updates')
    ).rows
    assert.equal(events.length, 2)
    assert.ok(
      events.every(
        (event) =>
          event.previous_revision === snapshotHash(1) && event.new_revision === snapshotHash(2),
      ),
    )
    await result.rewind()
    assert.equal(
      (await pool.query('select count(*)::int as n from agent_skill_updates')).rows[0].n,
      4,
    )
    assert.ok(
      (
        await pool.query('select observed_revision,branch from agent_skills where tracking')
      ).rows.every((row) => row.observed_revision === snapshotHash(1) && row.branch === 'rewrite'),
    )
  },
)

integration(
  'a GitHub response held past lease expiry cannot overwrite the newer SQL owner',
  async () => {
    await prepareSnapshotRace()
    await interleaveSkillSnapshots(store, {
      interruptHead: true,
      expireLease: (id) =>
        pool.query("update agent_skills set lease_until=now()-interval '1 second' where id=$1", [
          id,
        ]),
    })
    assert.ok(
      (await pool.query('select observed_revision from agent_skills where tracking')).rows.every(
        (row) => row.observed_revision === snapshotHash(2),
      ),
    )
    const events = (
      await pool.query('select previous_revision,new_revision from agent_skill_updates')
    ).rows
    assert.equal(events.length, 2)
    assert.ok(
      events.every(
        (event) =>
          event.previous_revision === snapshotHash(1) && event.new_revision === snapshotHash(2),
      ),
    )
  },
)
