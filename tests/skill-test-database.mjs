import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

// No dotenv or DATABASE_URL fallback. A loopback address alone proves no ownership.
export function localSkillTarget(connectionString, target) {
  const url = new URL(connectionString)
  assert.equal(target.kind, 'owned-local-skill-test')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.hostname, target.host)
  assert.equal(url.port, String(target.port))
  assert.equal(decodeURIComponent(url.pathname.slice(1)), target.database)
  assert.equal(decodeURIComponent(url.username), target.user)
  assert.equal(url.search, '', 'Connection options must not override the test target')
  assert.match(target.database, /^stackpulse_skill_test$/)
  assert.match(target.systemIdentifier, /^\d+$/)
  const directory = realpathSync(target.dataDirectory)
  const cache = realpathSync(new URL('../node_modules/.cache', import.meta.url))
  assert.ok(directory.startsWith(cache + path.sep), 'Cluster must be owned by this workspace')
  const pid = readFileSync(path.join(directory, 'postmaster.pid'), 'utf8').split(/\r?\n/)
  assert.equal(realpathSync(pid[1]), directory)
  assert.equal(pid[3], String(target.port))
  assert.equal(pid[5], '127.0.0.1')
  return { url, directory }
}

export async function openSkillTestDatabase(namespace) {
  assert.match(namespace, /^skill_test_[a-f0-9]{32}$/)
  assert.ok(
    process.env.SKILL_TEST_TARGET_FILE,
    'SKILL_TEST_TARGET_FILE ownership proof is required',
  )
  const target = JSON.parse(readFileSync(process.env.SKILL_TEST_TARGET_FILE, 'utf8'))
  const { directory } = localSkillTarget(process.env.SKILL_TEST_DATABASE_URL, target)
  const pool = new pg.Pool({
    connectionString: process.env.SKILL_TEST_DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 2000,
    options: `-c search_path=${namespace} -c statement_timeout=5000 -c lock_timeout=2000`,
  })
  try {
    // Read-only identity check precedes ALL DDL and fixture writes.
    const {
      rows: [identity],
    } = await pool.query(
      "select current_database() as database, current_user as username, current_setting('data_directory') as directory, system_identifier::text as system_identifier from pg_control_system()",
    )
    assert.equal(identity.database, target.database)
    assert.equal(identity.username, target.user)
    assert.equal(realpathSync(identity.directory), directory)
    assert.equal(identity.system_identifier, target.systemIdentifier)
    return pool
  } catch (error) {
    await pool.end()
    throw error
  }
}
