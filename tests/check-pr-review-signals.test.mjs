import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  analyzeTestDiff,
  checkTestSource,
  guardFiles,
  skipReason,
  t2Files,
} from '../scripts/check-pr-review-signals.mjs'

// Keywords are split so this file never trips the guard itself.
const ONLY = 'test' + '.only',
  SKIP = 'test' + '.skip',
  SKIP_KEY = 'sk' + 'ip:',
  TODO_KEY = 'to' + 'do:',
  ONLY_KEY = 'on' + 'ly:',
  ALLOW = '// allow-sk' + 'ip:',
  WEAK = 'assert' + '.ok(true)'
const diff = (file, ...lines) =>
  [`--- a/${file}`, `+++ b/${file}`, '@@ -1 +1 @@', ...lines].join('\n')
const SPEC = 'tests/release-votes.test.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const clean = { errors: [], removedTests: [], assertionSignals: [], skipsAdded: [] }

test('T2 paths are detected; others are not', () => {
  const t2 = [
    'drizzle/0011_x.sql',
    'drizzle/meta/_journal.json',
    'src/db/schema.ts',
    'src/lib/auth.ts',
    'src/lib/skill-store.ts',
    'src/app/api/cron/fetch-releases/route.ts',
    'src/app/api/releases/[releaseId]/vote/route.ts',
    'src/app/digest/unsubscribe/page.tsx',
    'src/app/(auth)/sign-in/page.tsx',
    'scripts/backfill-release-intelligence.ts',
    'scripts/evaluate-skill-updates.ts',
    'vercel.json',
  ]
  const other = [
    'src/app/api/releases/route.ts',
    'src/app/page.tsx',
    'src/components/dashboard/release-feed.tsx',
    'src/lib/public-stacks.ts',
    'src/lib/skill-catalog.ts',
    'src/app/api/mcp/[transport]/route.ts',
    'docs/features/auth.md',
  ]
  assert.deepEqual(t2Files([...t2, ...other]), t2)
})

test('CI, guard and integrity scripts and the test-database ownership guard are guard changes, not T2', () => {
  const files = [
    '.github/workflows/ci.yml',
    'scripts/check-migration-history.mjs',
    'scripts/check-pr-review-signals.mjs',
    'scripts/check-engineering-workflow.mjs',
    'scripts/sync-agent-skills.mjs',
    'tests/skill-test-database.mjs',
    'tests/release-votes-db.test.mjs',
    'package.json',
  ]
  assert.deepEqual(guardFiles(files), files.slice(0, 6))
  assert.deepEqual(t2Files(files), [])
})

test('ordinary new tests pass', () => {
  assert.deepEqual(
    analyzeTestDiff(diff(SPEC, "+test('counts one vote per user', () => { assert.equal(1, 1) })")),
    clean,
  )
})

test('focused tests fail', () => {
  for (const line of [
    `${ONLY}('x', () => {})`,
    `test('x', { ${ONLY_KEY} true }, () => {})`,
    "test['on" + "ly']('x', () => {})",
    '  t.run' + 'Only(true)',
  ]) {
    assert.match(analyzeTestDiff(diff(SPEC, `+${line}`)).errors.join(), /focused/, line)
  }
  const split = diff(SPEC, `+test('x', { ${ONLY_KEY}`, '+  true }, () => {})')
  assert.match(analyzeTestDiff(split).errors.join(), /focused/)
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
  const r = analyzeTestDiff(diff(SPEC, `+${SKIP}('x', () => {}) ${ALLOW} GitHub API outage`))
  assert.deepEqual(r.errors, [])
  assert.deepEqual(
    r.skipsAdded.map((s) => s.reason),
    ['GitHub API outage'],
  )
})

test('unconditional, todo or disguised skips fail', () => {
  for (const lines of [
    [`+${SKIP}('x', () => {})`],
    [`+${SKIP}('x', () => {}) // process.env`],
    [`+test('x', { ${SKIP_KEY} true }, () => {})`],
    [`+test('x', { ${SKIP_KEY} 'later' }, () => {})`],
    [`+test('x', { ${TODO_KEY} true }, () => {})`],
    [`+test('x', { ${TODO_KEY} 'later' }, () => {})`],
    [`+  ${SKIP_KEY}`, "+    'not gated',"],
    [`+  { ${SKIP_KEY} !false && 'r' },`],
    [`+  { ${SKIP_KEY} !0 && 'r' },`],
    [`+  { ${SKIP_KEY} !enabled || 'r' },`],
    [`+  { ${SKIP_KEY} 1 },`],
    [`+  { ${SKIP_KEY} REASON },`],
    [`+  { ${SKIP_KEY} (true) },`],
    [`+  { ${SKIP_KEY} !enabled && 'r' || true },`],
    [`+  { ${SKIP_KEY} !enabled && 'r', ${TODO_KEY} true },`],
    [`+    ${SKIP_KEY}`, '+      !enabled &&', "+      'r' || true,"],
    ["+test('x', { 'sk" + "ip': true }, () => {})"],
    ["+test('x', { sk" + 'ip }, () => {})'],
    ["+test['sk" + "ip']('x', () => {})"],
    ['+  t' + '.sk' + 'ip()'],
    ['+  context' + '.sk' + 'ip()'],
    ['+test' + '.to' + "do('x')"],
    [`+${SKIP}('x', () => {}) ${ALLOW}`],
    [`+${SKIP}('x', () => {}) ${ALLOW}   `],
    [`+${SKIP}('allow-skip: this is a title, not a comment', () => {})`],
  ]) {
    assert.equal(skipReason(lines.at(-1).slice(1)), null, lines.join())
    assert.match(analyzeTestDiff(diff(SPEC, ...lines)).errors.join(), /skipped/, lines.join())
  }
})

test('the whole-file check catches a skip made unconditional by deleting its gate line', () => {
  const gated = [
    "test('x', {",
    `  ${SKIP_KEY}`,
    '    !process.env.SKILL_TEST_DATABASE_URL &&',
    "    'Requires an owned cluster',",
    '}, fn)',
  ]
  assert.deepEqual(checkTestSource(SPEC, gated.join('\n')), { errors: [], allowed: [] })
  // A `--unified=0` diff of this change contains only the removed gate line, which adds nothing.
  assert.deepEqual(analyzeTestDiff(diff(SPEC, `-${gated[2]}`)).errors, [])
  const ungated = gated.filter((_, i) => i !== 2)
  assert.match(checkTestSource(SPEC, ungated.join('\n')).errors.join(), /skipped/)
  // Justified with allow-skip on the reason line instead: allowed, and reported for approval.
  ungated[2] += ` ${ALLOW} local PostgreSQL unavailable`
  const justified = checkTestSource(SPEC, ungated.join('\n'))
  assert.deepEqual(justified.errors, [])
  assert.deepEqual(
    justified.allowed.map((s) => s.reason),
    ['local PostgreSQL unavailable'],
  )
  assert.deepEqual(checkTestSource('tests/fixtures/x.json', `{ "${SKIP_KEY} true }`).errors, [])
  assert.deepEqual(checkTestSource('src/lib/x.ts', `${SKIP}('x')`).errors, [])
})

test('the CLI blocks a removed gate and lists a newly justified skip whose key line is unchanged', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'stackpulse-review-signals-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: directory,
      encoding: 'utf8',
    }).trim()
  const file = join(directory, 'tests/x.test.mjs')
  const lines = [
    "test('x', {",
    `  ${SKIP_KEY}`,
    '    !process.env.SKILL_TEST_DATABASE_URL &&',
    "    'Requires an owned cluster',",
    '}, fn)',
  ]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, lines.join('\n'))
  git('init', '-q')
  git('add', '-A')
  git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  const run = () =>
    spawnSync(process.execPath, [join(root, 'scripts/check-pr-review-signals.mjs'), base, 'HEAD'], {
      cwd: directory,
      encoding: 'utf8',
      windowsHide: true,
    })
  writeFileSync(file, lines.filter((_, i) => i !== 2).join('\n'))
  git('commit', '-qam', 'remove gate')
  const blocked = run()
  assert.equal(blocked.status, 1, blocked.stdout)
  assert.match(blocked.stdout, /Blocking test changes[\s\S]*Requires an owned cluster/)
  const justified = lines.filter((_, i) => i !== 2)
  justified[2] += ` ${ALLOW} local PostgreSQL unavailable`
  writeFileSync(file, justified.join('\n'))
  git('commit', '-qam', 'justify skip')
  const listed = run()
  assert.equal(listed.status, 0, listed.stdout)
  assert.match(listed.stdout, /Skips added[\s\S]*local PostgreSQL unavailable/)
})

test('a deleted test file lists its removed tests and assertions', () => {
  const file = 'tests/release-votes-db.test.mjs'
  const r = analyzeTestDiff(
    [
      `--- a/${file}`,
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      "-test('rejects cross-origin votes', () => {",
      '-  assert.equal(status, 403)',
    ].join('\n'),
  )
  assert.deepEqual(r.removedTests, [{ file, title: 'rejects cross-origin votes' }])
  assert.match(r.assertionSignals.join(), /1 assertion\(s\) removed net/)
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
