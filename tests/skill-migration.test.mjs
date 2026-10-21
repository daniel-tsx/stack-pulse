import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { openSkillTestDatabase } from './skill-test-database.mjs'

test(
  'journal migration 0009 to 0010 preserves legacy rows; migration rerun is a no-op',
  {
    skip: !process.env.SKILL_TEST_DATABASE_URL && 'Owned local PostgreSQL required',
    timeout: 20000,
  },
  async () => {
    const namespace = `skill_test_${randomUUID().replaceAll('-', '')}`
    const pool = await openSkillTestDatabase(namespace)
    const folder = await mkdtemp(path.join(tmpdir(), 'stackpulse-skill-migration-'))
    let created = false
    try {
      await pool.query(`create schema "${namespace}"`)
      created = true
      await mkdir(path.join(folder, 'meta'))
      const journal = JSON.parse(
        await readFile(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
      )
      assert.equal(journal.entries.at(-1).tag, '0010_tired_doctor_strange')
      const prior = { ...journal, entries: journal.entries.slice(0, -1) }
      // Only explicit schema targets change. Existing public tables are inaccessible via search_path.
      for (const entry of journal.entries) {
        const source = await readFile(
          new URL(`../drizzle/${entry.tag}.sql`, import.meta.url),
          'utf8',
        )
        await writeFile(
          path.join(folder, entry.tag + '.sql'),
          source.replaceAll('"public".', `"${namespace}".`),
        )
      }
      await writeFile(path.join(folder, 'meta', '_journal.json'), JSON.stringify(prior))
      const db = drizzle(pool),
        options = { migrationsFolder: folder, migrationsSchema: namespace }
      await migrate(db, options)
      await pool.query(
        "insert into users(id,email,name) values ('synthetic-staging-user','synthetic@example.invalid','Synthetic user')",
      )
      await pool.query(
        "insert into technologies(name,slug,github_repo_url) values ('Synthetic tech','synthetic-tech','https://github.com/synthetic/example')",
      )
      const before = {
        users: (await pool.query('select * from users')).rows,
        technologies: (await pool.query('select * from technologies')).rows,
      }
      const beforeTables = (
        await pool.query('select tablename from pg_tables where schemaname=$1 order by tablename', [
          namespace,
        ])
      ).rows.map((r) => r.tablename)
      await writeFile(path.join(folder, 'meta', '_journal.json'), JSON.stringify(journal))
      await migrate(db, options)
      await migrate(db, options)
      assert.deepEqual((await pool.query('select * from users')).rows, before.users)
      assert.deepEqual((await pool.query('select * from technologies')).rows, before.technologies)
      const afterTables = (
        await pool.query('select tablename from pg_tables where schemaname=$1 order by tablename', [
          namespace,
        ])
      ).rows.map((r) => r.tablename)
      assert.deepEqual(afterTables.filter((t) => !beforeTables.includes(t)).sort(), [
        'agent_skill_updates',
        'agent_skills',
      ])
      assert.equal(
        (await pool.query('select count(*)::int n from __drizzle_migrations')).rows[0].n,
        journal.entries.length,
      )
    } finally {
      try {
        if (created) await pool.query(`drop schema "${namespace}" cascade`)
      } finally {
        await pool.end()
        assert.equal(path.dirname(folder), path.resolve(tmpdir()))
        assert.ok(path.basename(folder).startsWith('stackpulse-skill-migration-'))
        await rm(folder, { recursive: true, force: true })
      }
    }
  },
)
