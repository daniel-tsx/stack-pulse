import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeTestDiff,
  guardFiles,
  skipReason,
  t2Files,
} from '../scripts/check-pr-review-signals.mjs'

// Keywords are split so this file never trips the guard itself.
const ONLY = 'test' + '.only',
  SKIP = 'test' + '.skip',
  SKIP_KEY = 'sk' + 'ip:',
  WEAK = 'assert' + '.ok(true)'
const diff = (file, ...lines) =>
  [`--- a/${file}`, `+++ b/${file}`, '@@ -1 +1 @@', ...lines].join('\n')
const SPEC = 'tests/release-votes.test.mjs'
const clean = { errors: [], removedTests: [], assertionSignals: [], skipsAdded: [] }

test('T2 paths are detected; others are not', () => {
  assert.deepEqual(
    t2Files([
      'drizzle/0011_x.sql',
      'drizzle/meta/_journal.json',
      'src/db/schema.ts',
      'src/lib/auth.ts',
      'src/lib/skill-store.ts',
      'src/app/api/cron/fetch-releases/route.ts',
      'src/app/api/releases/[releaseId]/vote/route.ts',
      'scripts/backfill-release-intelligence.ts',
      'vercel.json',
      'src/app/page.tsx',
      'src/components/dashboard/release-feed.tsx',
      'src/lib/public-stacks.ts',
      'src/lib/skill-catalog.ts',
      'src/app/api/mcp/[transport]/route.ts',
      'docs/features/auth.md',
    ]),
    [
      'drizzle/0011_x.sql',
      'drizzle/meta/_journal.json',
      'src/db/schema.ts',
      'src/lib/auth.ts',
      'src/lib/skill-store.ts',
      'src/app/api/cron/fetch-releases/route.ts',
      'src/app/api/releases/[releaseId]/vote/route.ts',
      'scripts/backfill-release-intelligence.ts',
      'vercel.json',
    ],
  )
})

test('CI, guard scripts and the test-database ownership guard are guard changes, not T2', () => {
  const files = [
    '.github/workflows/ci.yml',
    'scripts/check-migration-history.mjs',
    'tests/skill-test-database.mjs',
    'scripts/sync-agent-skills.mjs',
    'tests/release-votes-db.test.mjs',
  ]
  assert.deepEqual(guardFiles(files), files.slice(0, 3))
  assert.deepEqual(t2Files(files), [])
})

test('ordinary new tests pass', () => {
  assert.deepEqual(
    analyzeTestDiff(diff(SPEC, "+test('counts one vote per user', () => { assert.equal(1, 1) })")),
    clean,
  )
})

test('focused tests fail', () => {
  for (const line of [`${ONLY}('x', () => {})`, "test('x', { only: true }, () => {})"]) {
    assert.match(analyzeTestDiff(diff(SPEC, `+${line}`)).errors.join(), /focused/, line)
  }
})

test('env-gated skips pass silently, on one line or split across lines', () => {
  for (const lines of [
    [`+  { ${SKIP_KEY} !enabled && 'Set VOTE_TEST_DATABASE_URL' },`],
    [
      `+    ${SKIP_KEY}`,
      '+      !process.env.SKILL_TEST_DATABASE_URL &&',
      "+      'Requires an owned cluster',",
    ],
  ])
    assert.deepEqual(analyzeTestDiff(diff(SPEC, ...lines)), clean, lines.join())
})

test('a skip with an allow-skip comment passes but is listed for the human', () => {
  const r = analyzeTestDiff(diff(SPEC, `+${SKIP}('x', () => {}) // allow-skip: GitHub API outage`))
  assert.deepEqual(r.errors, [])
  assert.deepEqual(
    r.skipsAdded.map((s) => s.reason),
    ['GitHub API outage'],
  )
})

test('unconditional or disguised skips fail', () => {
  for (const lines of [
    [`+${SKIP}('x', () => {})`],
    [`+${SKIP}('x', () => {}) // process.env`],
    [`+test('x', { ${SKIP_KEY} true }, () => {})`],
    [`+test('x', { ${SKIP_KEY} 'later' }, () => {})`],
    [`+  ${SKIP_KEY}`, "+    'not gated',"],
    ['+  t' + '.skip()'],
    ['+test' + ".todo('x')"],
    [`+${SKIP}('x', () => {}) // allow-skip:`],
    [`+${SKIP}('x', () => {}) // allow-skip:   `],
    [`+${SKIP}('allow-skip: this is a title, not a comment', () => {})`],
  ]) {
    assert.equal(skipReason(lines.at(-1).slice(1)), null, lines.join())
    assert.match(analyzeTestDiff(diff(SPEC, ...lines)).errors.join(), /skipped/, lines.join())
  }
})

test('net assertion removal and weak assertions are surfaced, not blocking', () => {
  const r = analyzeTestDiff(
    diff(
      SPEC,
      '-  assert.equal(result.status, 403)',
      '-  assert.match(body.error, /cross-origin/)',
      `+  ${WEAK}`,
    ),
  )
  assert.deepEqual(r.errors, [])
  assert.match(r.assertionSignals.join('\n'), /1 assertion\(s\) removed net \(2 removed, 1 added\)/)
  assert.match(r.assertionSignals.join('\n'), /weak assertion added: assert\.ok\(true\)/)
  assert.deepEqual(
    analyzeTestDiff(diff(SPEC, '-  assert.equal(a, 1)', '+  assert.equal(a, 2)')).assertionSignals,
    [],
  )
})

test('skips outside test files are ignored', () => {
  assert.deepEqual(analyzeTestDiff(diff('src/lib/release-votes.ts', `+${SKIP}('x')`)).errors, [])
})

test('removed test cases are listed, renamed-in-place ones are not', () => {
  const r = analyzeTestDiff(
    diff(
      SPEC,
      "-test('rejects cross-origin votes', () => {})",
      "-test('kept title', () => {})",
      "+test('kept title', () => { /* edited */ })",
    ),
  )
  assert.deepEqual(r.removedTests, [{ file: SPEC, title: 'rejects cross-origin votes' }])
})
