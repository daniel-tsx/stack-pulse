import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { neon, neonConfig } from '@neondatabase/serverless'
import { loadTs } from '../tests/release-test-helpers.mjs'
import { interleaveSkillSnapshots, snapshotHash } from '../tests/skill-snapshot-helpers.mjs'

export function verifyNeonTarget(target, connectionString, approval, now = Date.now()) {
  assert.equal(target.kind, 'disposable-neon-skill-verification')
  assert.match(target.runId, /^[a-f0-9]{32}$/)
  assert.equal(approval, target.runId, 'Explicit approval for this run ID is required')
  assert.equal(target.dataPolicy, 'new-empty-database-no-user-data')
  assert.equal(target.branchIsDefault, false)
  assert.ok(Date.parse(target.expiresAt) > now && Date.parse(target.expiresAt) <= now + 86400000)
  assert.match(target.projectId, /^[a-z0-9-]+$/)
  assert.match(target.branchId, /^br-[a-z0-9-]+$/)
  assert.match(target.endpointId, /^ep-[a-z0-9-]+$/)
  const url = new URL(connectionString)
  assert.equal(url.protocol, 'postgresql:')
  assert.equal(url.hostname, target.host)
  assert.ok(url.hostname.startsWith(target.endpointId + '.') && url.hostname.endsWith('.neon.tech'))
  assert.ok(!url.port || url.port === '5432')
  assert.equal(target.database, `skill_staging_${target.runId}`)
  assert.equal(target.role, target.database)
  assert.equal(decodeURIComponent(url.pathname.slice(1)), target.database)
  assert.equal(decodeURIComponent(url.username), target.role)
  assert.ok(url.password)
  assert.equal(url.searchParams.get('sslmode'), 'require')
  for (const key of url.searchParams.keys()) assert.ok(['sslmode', 'channel_binding'].includes(key))
  return url
}

async function main() {
  if (!process.argv.includes('--run')) {
    console.info(
      JSON.stringify({
        mode: 'plan-only',
        requests: 0,
        required: [
          'approved disposable Neon project/branch/endpoint IDs',
          'fresh empty skill_staging_<runId> database and matching dedicated role',
          'SKILL_STAGING_DATABASE_URL',
          '--target=<ignored JSON manifest>',
          'SKILL_STAGING_APPROVED_RUN=<runId>',
        ],
        maxHttpRequests: 150,
        maxExecutionMs: 120000,
        maxRequestMs: 10000,
        aiRequests: 0,
        cleanup:
          'Delete only the approved disposable branch; never reuse this database for application data',
      }),
    )
    return
  }
  const file = process.argv.find((a) => a.startsWith('--target='))?.slice(9)
  assert.ok(file, 'Target manifest required; no ambient DATABASE_URL fallback')
  const target = JSON.parse(readFileSync(file, 'utf8'))
  const connectionString = process.env.SKILL_STAGING_DATABASE_URL
  const url = verifyNeonTarget(target, connectionString, process.env.SKILL_STAGING_APPROVED_RUN)
  const originalFetch = neonConfig.fetchFunction
  const endpoint =
    typeof neonConfig.fetchEndpoint === 'function'
      ? neonConfig.fetchEndpoint(url.hostname, 5432)
      : neonConfig.fetchEndpoint
  let requests = 0,
    loseNextResponse = false,
    abortAfterCommit
  const total = AbortSignal.timeout(120000)
  neonConfig.fetchFunction = async (input, options) => {
    assert.equal(String(input), endpoint)
    assert.equal(new Headers(options.headers).get('Neon-Connection-String'), connectionString)
    assert.ok(++requests <= 150, 'Neon HTTP request budget exhausted')
    const lose = loseNextResponse
    loseNextResponse = false
    const response = await fetch(input, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.any([
        total,
        AbortSignal.timeout(10000),
        ...(options.signal ? [options.signal] : []),
      ]),
    })
    if (lose) {
      assert.ok(response.ok)
      await response.text() // SQL response is complete; discard its acknowledgement.
      abortAfterCommit.abort()
      throw new DOMException('Injected acknowledgement loss', 'AbortError')
    }
    return response
  }
  try {
    const sql = neon(connectionString)
    const [identity] = await sql.query(
      'select current_database() as database, current_user as role',
    )
    assert.equal(identity.database, target.database)
    assert.equal(identity.role, target.role)
    const tables = await sql.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','f','S') and n.nspname not like 'pg_%' and n.nspname <> 'information_schema'",
    )
    assert.equal(tables.length, 0, 'Refuse all writes unless the dedicated database is empty')
    console.info(
      JSON.stringify({ stage: 'identity-and-empty-database', passed: true, runId: target.runId }),
    )
    for (const statement of readFileSync(
      new URL('../drizzle/0010_tired_doctor_strange.sql', import.meta.url),
      'utf8',
    )
      .split('--> statement-breakpoint')
      .filter((s) => s.trim()))
      await sql.query(statement)
    const schema = loadTs('src/db/schema.ts'),
      catalog = loadTs('src/lib/skill-catalog.ts')
    const { getDb } = loadTs(
      'src/db/index.ts',
      { './schema': schema, '@neondatabase/serverless': { neon } },
      { process: { env: { DATABASE_URL: connectionString } }, AbortSignal },
    )
    const storeModule = loadTs(
      'src/lib/skill-store.ts',
      { '@/db': { getDb }, '@/db/schema': schema, '@/lib/skill-catalog': catalog },
      { AbortSignal },
    )
    await storeModule.seedSkills()
    await storeModule.seedSkills()
    const store = storeModule.createSkillStore()
    assert.equal((await store.list()).length, 10)
    const candidate = (await store.list())[0],
      tokens = [randomUUID(), randomUUID()]
    const claims = await Promise.all(tokens.map((t) => store.acquire(candidate.id, t)))
    assert.equal(claims.filter(Boolean).length, 1)
    const token = tokens[claims.findIndex(Boolean)],
      skill = claims.find(Boolean)
    const obs = (n) => ({
      revision: String(n).repeat(40),
      tree: String(n + 1).repeat(40),
      branch: 'main',
      hasSkillFile: true,
    })
    await store.observe(skill, token, obs(1))
    assert.equal((await store.pending(skill.id)).length, 0)
    abortAfterCommit = new AbortController()
    loseNextResponse = true
    await assert.rejects(
      storeModule.createSkillStore(abortAfterCommit.signal).observe(skill, token, obs(3)),
    )
    assert.equal(await store.observe(skill, token, obs(3)), 0)
    assert.equal((await store.pending(skill.id)).length, 1)
    assert.equal(
      (await sql.query('select observed_revision from agent_skills where id=$1', [skill.id]))[0]
        .observed_revision,
      obs(3).revision,
    )
    await store.release(skill.id, token)
    console.info(JSON.stringify({ stage: 'overlap-and-unknown-commit-recovery', passed: true }))
    // Actual hosted HTTP cancellation. It does NOT establish that PostgreSQL rolled back.
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 200)
    const started = performance.now()
    try {
      await assert.rejects(
        neon(connectionString, { fetchOptions: { signal: controller.signal } }).query(
          'select pg_sleep(3)',
        ),
      )
    } finally {
      clearTimeout(timer)
    }
    assert.equal(controller.signal.aborted, true, 'Deliberate cancellation must cause rejection')
    assert.ok(performance.now() - started < 2000)
    await sql.query('delete from agent_skill_updates')
    await sql.query(
      'update agent_skills set tracking=false, baseline_revision=$1, observed_revision=$1, observed_tree=$2, lease_token=null, lease_until=null',
      [snapshotHash(1), snapshotHash(3)],
    )
    await sql.query(
      "update agent_skills set tracking=true where slug in ('ponytail','ponytail-review')",
    )
    await interleaveSkillSnapshots(store)
    const events = await sql.query('select previous_revision,new_revision from agent_skill_updates')
    assert.equal(events.length, 2)
    assert.ok(
      events.every(
        (e) => e.previous_revision === snapshotHash(1) && e.new_revision === snapshotHash(2),
      ),
    )
    console.info(
      JSON.stringify({
        stage: 'hosted-cancellation-and-overlapping-ingestion',
        passed: true,
        requests,
        aiRequests: 0,
      }),
    )
  } finally {
    neonConfig.fetchFunction = originalFetch
    console.info(
      JSON.stringify({
        cleanupRequired: true,
        projectId: target.projectId,
        branchId: target.branchId,
        runId: target.runId,
        requests,
      }),
    )
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      'Neon verification failed; retain sanitized stage output, inspect the approved disposable resource, then delete its branch. No automatic retry.',
    )
    process.exitCode = 1
  })
