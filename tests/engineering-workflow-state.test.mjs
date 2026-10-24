import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const slug = 'fixture-task'
const task = `.tmp/agent-workflows/${slug}`

function fixture(t) {
  // Long-form path: the helper compares its location with git's toplevel (8.3 names differ on Windows).
  const directory = realpathSync.native(mkdtempSync(join(tmpdir(), 'stackpulse-workflow-state-')))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: directory,
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
  }
  git('init', '-q')
  mkdirSync(join(directory, 'scripts'))
  cpSync(
    join(root, 'scripts/engineering-workflow-state.mjs'),
    join(directory, 'scripts/engineering-workflow-state.mjs'),
  )
  writeFileSync(join(directory, '.gitignore'), '.tmp/\n')
  writeFileSync(join(directory, 'app.txt'), 'v1\n')
  git('add', '-A')
  git('commit', '-qm', 'init')
  const write = (name, data) => {
    mkdirSync(join(directory, task), { recursive: true })
    writeFileSync(join(directory, task, name), data)
  }
  const run = (...args) =>
    spawnSync(process.execPath, ['scripts/engineering-workflow-state.mjs', ...args], {
      cwd: directory,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    })
  const ok = (...args) => {
    const r = run(...args)
    assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`)
    return r
  }
  return { directory, write, run, ok }
}

test('re-verification after a correction may record refreshed verification evidence', (t) => {
  const f = fixture(t)
  f.ok('init', slug, 'MEDIUM')
  f.ok('advance', slug, 'READY')
  f.write('plan.md', 'plan')
  f.ok('advance', slug, 'READY', '--artifact', `${task}/plan.md`)
  f.write('plan-review-1.md', 'approved')
  f.ok(
    'advance',
    slug,
    'PLAN_APPROVED',
    '--artifact',
    `${task}/plan-review-1.md`,
    '--reviewer-id',
    'r1',
  )
  writeFileSync(join(f.directory, 'app.txt'), 'v2\n')
  f.ok('advance', slug, 'READY')
  f.write('verification.json', '{"run":1}')
  f.ok('advance', slug, 'VERIFIED', '--artifact', `${task}/verification.json`)
  f.write('code-review-1.md', 'changes requested')
  f.ok(
    'advance',
    slug,
    'REVIEW_REQUEST_CHANGES',
    '--artifact',
    `${task}/code-review-1.md`,
    '--reviewer-id',
    'r2',
  )
  writeFileSync(join(f.directory, 'app.txt'), 'v3\n')
  f.ok('advance', slug, 'READY')
  // VERIFY again: the prescribed verification.json is rewritten with the new run's evidence.
  f.write('verification.json', '{"run":2}')
  f.ok('advance', slug, 'VERIFIED', '--artifact', `${task}/verification.json`)
  // Reviewer reports stay immutable.
  f.write('code-review-1.md', 'edited after the fact')
  const resumed = JSON.parse(f.ok('resume', slug).stdout)
  assert.equal(resumed.result, 'BLOCKED_EVIDENCE_CHANGED')
  assert.deepEqual(resumed.artifactProblems, [`Modified: ${task}/code-review-1.md`])
})
