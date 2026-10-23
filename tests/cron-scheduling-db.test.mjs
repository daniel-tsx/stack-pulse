import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { drizzle } from 'drizzle-orm/neon-http'
import { openSkillTestDatabase } from './skill-test-database.mjs'
import { loadTs, localNeonClient } from './release-test-helpers.mjs'

test(
  'cron rotation uses persisted completed cron admission order on isolated PostgreSQL',
  {
    skip:
      !process.env.SKILL_TEST_DATABASE_URL &&
      'Requires SKILL_TEST_DATABASE_URL and SKILL_TEST_TARGET_FILE ownership proof',
  },
  async (t) => {
    // Reuse the verified local cluster, with no dotenv or application database fallback.
    const namespace = `skill_test_${randomUUID().replaceAll('-', '')}`
    const pool = await openSkillTestDatabase(namespace)
    let created = false
    const { createExecutionBudget } = loadTs(
      'src/lib/execution-budget.ts',
      {},
      {
        performance,
        AbortController,
        AbortSignal,
        setTimeout,
        clearTimeout,
      },
    )
    const execution = createExecutionBudget(performance.now() + 30_000)
    try {
      await pool.query(`create schema "${namespace}"`)
      created = true
      const migration = readFileSync(
        new URL('../drizzle/0002_military_galactus.sql', import.meta.url),
        'utf8',
      )
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (
          statement.includes('CREATE TABLE "release_fetch_runs"') ||
          statement.includes('CREATE INDEX "release_fetch_runs_started_idx"')
        )
          await pool.query(statement)
      }
      const db = drizzle(localNeonClient(pool))
      const { orderCronRepositories } = loadTs('src/lib/release-ingestion.ts', {
        '@/db': {
          getDb: (signal) => {
            assert.equal(signal, execution.signal)
            return db
          },
        },
        '@/db/schema': loadTs('src/db/schema.ts'),
        '@/lib/execution-budget': {},
        '@/lib/ai': {},
        '@/lib/ai-resilience': {},
        '@/lib/github': {},
      })
      const repos = [{ name: 'C' }, { name: 'A' }, { name: 'B' }]
      const names = async () =>
        Array.from(await orderCronRepositories(repos, execution), (row) => row.name)
      const seed = (trigger, started, finished, details) =>
        pool.query(
          `insert into release_fetch_runs (trigger, started_at, finished_at, details)
       values ($1, $2, $3, $4::jsonb)`,
          [trigger, started, finished, JSON.stringify(details)],
        )
      await t.test('no history has stable order without mutating input', async () => {
        assert.deepEqual(await names(), ['A', 'B', 'C'])
        assert.deepEqual(
          repos.map((row) => row.name),
          ['C', 'A', 'B'],
        )
      })
      await t.test(
        'latest started finished cron wins over custom, running and later-finishing older runs',
        async () => {
          await seed('cron', '2026-10-20', '2026-10-23', [{ tech: 'A', inserted: 0, errors: 0 }])
          await seed('cron', '2026-10-21', '2026-10-21', [
            { tech: 'A', inserted: 1, errors: 0 },
            { tech: 'B', inserted: 0, errors: 1 },
          ])
          await seed('custom_repo', '2026-10-22', '2026-10-22', [
            { tech: 'C', inserted: 1, errors: 0 },
          ])
          await seed('cron', '2026-10-23', null, [{ tech: 'C', inserted: 0, errors: 0 }])
          assert.deepEqual(await names(), ['C', 'A', 'B'])
        },
      )
      await t.test(
        'null, empty or malformed legacy details and removed names fall back safely',
        async () => {
          for (const details of [null, [], {}, [null], [{ tech: 'removed' }]]) {
            await pool.query('truncate release_fetch_runs')
            await seed('cron', '2026-10-23', '2026-10-23', details)
            assert.deepEqual(await names(), ['A', 'B', 'C'])
          }
        },
      )
      await t.test('last repository wraps and an empty registry needs no query', async () => {
        await pool.query('truncate release_fetch_runs')
        await seed('cron', '2026-10-23', '2026-10-23', [{ tech: 'C' }])
        assert.deepEqual(await names(), ['A', 'B', 'C'])
        assert.equal((await orderCronRepositories([], execution)).length, 0)
      })
    } finally {
      execution.close()
      try {
        if (created) {
          await pool.query(`drop schema "${namespace}" cascade`)
          assert.equal(
            (await pool.query('select to_regnamespace($1) as remaining', [namespace])).rows[0]
              .remaining,
            null,
          )
        }
      } finally {
        await pool.end()
      }
    }
  },
)
