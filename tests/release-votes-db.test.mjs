import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { drizzle } from 'drizzle-orm/neon-http'
import pg from 'pg'
import { loadTs, localNeonClient } from './release-test-helpers.mjs'

// Never fall back to DATABASE_URL or load .env. Only a loopback test database is
// accepted. Each run owns a fresh schema; production/public tables are untouched.
const connectionString = process.env.VOTE_TEST_DATABASE_URL
const enabled = Boolean(connectionString)
let pool, schema, votes, publicRelease
const releaseId = randomUUID()
const missingId = randomUUID()
const techId = randomUUID()
const namespace = `vote_test_${randomUUID().replaceAll('-', '')}`

before(async () => {
  if (!enabled) return
  const url = new URL(connectionString)
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Test DB must use loopback')
  assert.match(url.pathname, /test/i, 'Test database name must contain test')
  pool = new pg.Pool({ connectionString, max: 16, options: `-c search_path=${namespace},public` })
  await pool.query(`create schema "${namespace}"`)
  // Initial migrations qualify new FK targets with public. In this dedicated
  // test namespace, redirect only that qualification, preserving the SQL itself.
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort()) {
    const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8').replaceAll(
      '"public".',
      `"${namespace}".`,
    )
    await pool.query(sql)
  }
  await pool.query(
    "insert into users (id,email) values ('alice','alice@example.test'),('bob','bob@example.test')",
  )
  await pool.query('insert into technologies (id,name,slug,github_repo_url) values ($1,$2,$3,$4)', [
    techId,
    'Test framework',
    'test-framework',
    'https://github.com/example/test',
  ])
  await pool.query(
    'insert into release_updates (id,tech_id,version,summary,breaking_changes,code_snippet) values ($1,$2,$3,$4,$5,$6)',
    [
      releaseId,
      techId,
      'v1',
      'Stored summary',
      JSON.stringify(['Stored breaking note']),
      'const stored = true',
    ],
  )
  schema = loadTs('src/db/schema.ts')
  const db = drizzle(localNeonClient(pool))
  votes = loadTs('src/lib/release-votes.ts', { '@/db': { getDb: () => db }, '@/db/schema': schema })
  const stacks = loadTs('src/lib/public-stacks.ts', {
    '@/db': { getDb: () => db },
    '@/db/schema': schema,
    'next/cache': { cacheLife() {} },
  })
  publicRelease = loadTs('src/lib/public-releases.ts', {
    '@/db': { getDb: () => db },
    '@/db/schema': schema,
    'next/cache': { cacheLife() {} },
    './public-stacks': stacks,
    './release-vote-types': loadTs('src/lib/release-vote-types.ts'),
  })
})

after(async () => {
  if (!pool) return
  try {
    await pool.query(`drop schema "${namespace}" cascade`)
  } finally {
    await pool.end()
  }
})

const integration = (name, fn) =>
  test(
    name,
    {
      skip: !enabled && 'Set VOTE_TEST_DATABASE_URL to an isolated local PostgreSQL test database',
    },
    fn,
  )
const clean = () => pool.query('delete from release_votes')
const state = (user) => votes.getReleaseVoteState(releaseId, user)
const set = (value, user = 'alice') => votes.setReleaseVote(releaseId, user, value)

integration(
  'migration constraints, FK cascades, timestamps and release aggregation index',
  async () => {
    await clean()
    await set(1)
    await assert.rejects(
      pool.query('insert into release_votes (user_id,release_id,value) values ($1,$2,1)', [
        'alice',
        releaseId,
      ]),
      { code: '23505' },
    )
    for (const value of [0, 2, -2])
      await assert.rejects(
        pool.query('insert into release_votes (user_id,release_id,value) values ($1,$2,$3)', [
          'bob',
          releaseId,
          value,
        ]),
        { code: '23514' },
      )
    await assert.rejects(
      pool.query('insert into release_votes (user_id,release_id,value) values ($1,$2,1)', [
        'unknown',
        releaseId,
      ]),
      { code: '23503' },
    )
    await assert.rejects(
      pool.query('insert into release_votes (user_id,release_id,value) values ($1,$2,1)', [
        'bob',
        missingId,
      ]),
      { code: '23503' },
    )
    const first = (await pool.query('select created_at,updated_at from release_votes')).rows[0]
    await set(-1)
    const second = (await pool.query('select created_at,updated_at from release_votes')).rows[0]
    assert.equal(first.created_at.toISOString(), second.created_at.toISOString())
    assert.ok(second.updated_at >= first.updated_at)
    assert.ok(
      (
        await pool.query(
          "select indexdef from pg_indexes where schemaname=$1 and indexname='release_votes_release_idx'",
          [namespace],
        )
      ).rows[0].indexdef.includes('(release_id)'),
    )
    await pool.query("insert into users (id,email) values ('temporary','temporary@example.test')")
    await set(1, 'temporary')
    await pool.query("delete from users where id='temporary'")
    assert.equal(
      (await pool.query("select count(*)::int as n from release_votes where user_id='temporary'"))
        .rows[0].n,
      0,
    )
    const temporaryRelease = randomUUID()
    await pool.query('insert into release_updates (id,tech_id,version) values ($1,$2,$3)', [
      temporaryRelease,
      techId,
      'temporary',
    ])
    await votes.setReleaseVote(temporaryRelease, 'bob', 1)
    await pool.query('delete from release_updates where id=$1', [temporaryRelease])
    assert.equal(
      (
        await pool.query('select count(*)::int as n from release_votes where release_id=$1', [
          temporaryRelease,
        ])
      ).rows[0].n,
      0,
    )
  },
)

integration(
  'all desired states, separate user ownership, accurate totals and nonexistent releases',
  async () => {
    await clean()
    assert.deepEqual(await state(null), { score: 0, upvotes: 0, downvotes: 0, myVote: null })
    assert.equal((await state('alice')).myVote, 0)
    for (const value of [1, 1, -1, -1, 0, 0, -1, 1, 0]) {
      const result = await set(value)
      assert.equal(result.myVote, value)
      assert.equal(result.score, value)
    }
    await set(1)
    await set(-1, 'bob')
    assert.deepEqual(await state('alice'), { score: 0, upvotes: 1, downvotes: 1, myVote: 1 })
    await set(0, 'bob')
    assert.equal((await state('alice')).myVote, 1)
    assert.equal((await state('bob')).myVote, 0)
    for (const value of [-1, 0, 1])
      assert.equal(await votes.setReleaseVote(missingId, 'alice', value), null)
    assert.equal(await votes.getReleaseVoteState(missingId, null), null)
  },
)

integration(
  'simultaneous first votes, identical retries, replacements and removals retain one row and exact totals',
  async () => {
    await clean()
    await Promise.all([set(1), set(1)])
    await Promise.all(Array.from({ length: 20 }, () => set(1)))
    assert.deepEqual(await state('alice'), { score: 1, upvotes: 1, downvotes: 0, myVote: 1 })
    await Promise.all(Array.from({ length: 20 }, (_, i) => set(i % 2 ? 1 : -1)))
    const replaced = await state('alice')
    assert.ok([-1, 1].includes(replaced.myVote))
    assert.equal(replaced.score, replaced.myVote)
    assert.equal(replaced.upvotes + replaced.downvotes, 1)
    await Promise.all(Array.from({ length: 20 }, () => set(0)))
    assert.deepEqual(await state('alice'), { score: 0, upvotes: 0, downvotes: 0, myVote: 0 })
    await Promise.all(Array.from({ length: 20 }, (_, i) => set([1, 0, -1][i % 3])))
    const overlapping = await state('alice')
    assert.equal(overlapping.score, overlapping.myVote)
    assert.ok(overlapping.upvotes + overlapping.downvotes <= 1)
    await Promise.all([set(1), set(-1, 'bob')])
    assert.deepEqual(await state('alice'), { score: 0, upvotes: 1, downvotes: 1, myVote: 1 })
  },
)

integration(
  'public detail uses matching slug and UUID, returns stored content without internal fields',
  async () => {
    const data = await publicRelease.getPublicRelease('test-framework', releaseId)
    assert.equal(data.tech.name, 'Test framework')
    assert.equal(data.release.summary, 'Stored summary')
    assert.equal(data.release.codeSnippet, 'const stored = true')
    assert.ok(data.release.releaseSignals.includes('breaking'))
    for (const field of ['summaryModel', 'rawReleaseBody', 'fetchedAt', 'summarizedAt'])
      assert.equal(field in data.release, false)
    assert.equal(await publicRelease.getPublicRelease('other-stack', releaseId), null)
    assert.equal(await publicRelease.getPublicRelease('test-framework', missingId), null)
    assert.equal(await publicRelease.getPublicRelease('test-framework', 'invalid'), null)
    assert.equal(await publicRelease.getPublicRelease('../unsafe', releaseId), null)
    assert.equal(await publicRelease.publicReleaseExists('test-framework', releaseId), true)
    assert.equal(await publicRelease.publicReleaseExists('other-stack', releaseId), false)
    assert.equal(await publicRelease.publicReleaseExists('test-framework', missingId), false)
    assert.equal(await publicRelease.publicReleaseExists('test-framework', 'invalid'), false)
  },
)
