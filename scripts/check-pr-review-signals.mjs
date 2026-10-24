#!/usr/bin/env node
// PR review signals: flags T2-area files so a human knows which PRs need a deep read,
// rejects focused or newly skipped tests, and lists removed test cases.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Paths whose changes are T2 (AGENTS.md#task-size) regardless of the size the PR claims.
export const T2_PATHS = [
  /^drizzle\//,
  /^src\/db\/(schema|index|seed)\.ts$/,
  /^src\/app\/api\/(auth|cron|digest|release-advice|webhooks)\//,
  /^src\/app\/api\/releases\/[^/]+\/vote\//,
  /^src\/app\/digest\/unsubscribe\//,
  // Auth, ownership, cron auth, ingestion/lease recovery, AI spend and outbound notifications.
  /^src\/lib\/(auth|auth-return-path|actions|cron-auth|execution-budget|release-ingestion|release-votes|github|ai|ai-resilience|digest|webhooks|skill-(ingestion|store|analysis|github))\.ts$/,
  // Operator scripts that write production data or call paid providers.
  /^scripts\/(skill-updates|skill-eval-budget|evaluate-skill-updates|backfill-release-intelligence)\.ts$/,
  /^scripts\/verify-skill-neon\.mjs$/,
  // Cron registration: adding a schedule activates a background job.
  /^vercel\.json$/,
]
// CI, the guard and integrity scripts it runs, and the test-database ownership guard: weakening them removes
// protection from every later PR. They get a separate `guard-change` label (independent review), not T2 reading.
export const GUARD_PATHS = [
  /^\.github\/workflows\//,
  /^scripts\/(check-migration-history|check-pr-review-signals|check-engineering-workflow|sync-agent-skills)\.mjs$/,
  /^tests\/skill-test-database\.mjs$/,
]
const TEST_FILE = /(^|\/)tests?\/|\.(spec|test)\.[cm]?[jt]sx?$/
const CODE_FILE = /\.[cm]?[jt]sx?$/
// node:test focus: test.only/describe.only, test['only'], { only: true } or t.runOnly(true).
const FOCUS =
  /\b(?:it|test|describe|suite)\.only\b|\[\s*['"]only['"]\s*\]|(?<![\w-])['"]?only['"]?\s*:\s*true\b|\brunOnly\s*\(\s*true/
// node:test skips and todos (a failing todo test still exits 0): test.skip/test.todo, t.skip()/t.todo(),
// test['skip'], and the { skip } / { todo } options unless their value is the env gate below.
const SKIP_CALL =
  /\b(?:it|test|describe|suite)\.(?:skip|todo)\b|\.\s*(?:skip|todo)\s*\(|\[\s*['"](?:skip|todo)['"]\s*\]/
const SKIP_KEY = /(?<![\w-])['"]?(?:skip|todo)['"]?\s*:\s*(.*)$/
const SKIP_SHORTHAND = /[{,]\s*(?:skip|todo)\s*[,}]/
// The repository's env gate: `skip: !<env var or identifier> && '<reason>'`; the value may start on the next line.
const ENV_GATE =
  /^\s*!\s*(?!(?:true|false|null|undefined|NaN)\b)(?:process\.env\.[A-Za-z0-9_]+|[A-Za-z_$][\w$]*)\s*&&/
// A trailing `// allow-skip: <reason>` comment also allows a skip; added ones are listed for the human reviewer.
const ALLOW_SKIP = /\/\/\s*allow-skip:\s*(\S.*)$/
export const skipReason = (line) => line.match(ALLOW_SKIP)?.[1].trim() ?? null

/** Classifies consecutive lines of one test file: returns 'focus', 'skip' or null for each line. */
function testLineScanner() {
  let pendingKey = false
  return {
    reset: () => (pendingKey = false),
    scan(body) {
      const ungatedValue = pendingKey && !ENV_GATE.test(body)
      const key = body.match(SKIP_KEY)
      pendingKey = Boolean(key) && key[1].trim() === ''
      if (FOCUS.test(body)) return 'focus'
      const ungatedKey = key && key[1].trim() !== '' && !ENV_GATE.test(key[1])
      if (ungatedValue || ungatedKey || SKIP_CALL.test(body) || SKIP_SHORTHAND.test(body))
        return 'skip'
      return null
    },
  }
}

const skipError = (file, body) =>
  `${file}: skipped or todo test without the "skip: !<condition> && '<reason>'" env gate or a "// allow-skip: <reason>" comment: ${body.trim()}`

/** Whole-file check of a changed test file, so removing a gate line cannot leave an unconditional skip. */
export function checkTestSource(file, text) {
  if (!TEST_FILE.test(file) || !CODE_FILE.test(file)) return []
  const scanner = testLineScanner()
  const errors = []
  for (const body of text.split('\n')) {
    const kind = scanner.scan(body)
    if (kind === 'focus') errors.push(`${file}: focused test: ${body.trim()}`)
    else if (kind === 'skip' && !skipReason(body)) errors.push(skipError(file, body))
  }
  return errors
}
const ASSERTION = /\bexpect\(|\bassert(?:\.\w+)?\(/g
// Assertions that cannot fail.
const WEAK_MATCHER = /\bassert(?:\.ok)?\(\s*(?:true|1)\s*[,)]|\bassert\.doesNotThrow\(/
const TITLE = /\b(?:it|test)\(\s*(['"`])(.+?)\1/

export function guardFiles(files) {
  return files.filter((f) => GUARD_PATHS.some((re) => re.test(f)))
}

export function t2Files(files) {
  return files.filter((f) => T2_PATHS.some((re) => re.test(f)))
}

/** diff: `git diff --unified=0` text. Returns { errors, removedTests, assertionSignals, skipsAdded }. */
export function analyzeTestDiff(diff) {
  const errors = [],
    added = new Set(),
    removed = [],
    counts = new Map(),
    weak = [],
    skipsAdded = []
  const count = (file, key, body) => {
    const c = counts.get(file) ?? { added: 0, removed: 0 }
    c[key] += (body.match(ASSERTION) ?? []).length
    counts.set(file, c)
  }
  let file = null,
    oldFile = null
  const scanner = testLineScanner()
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) {
      oldFile = line.slice(4).replace(/^a\//, '')
      continue
    }
    if (line.startsWith('+++ ')) {
      // A deleted file's diff has `+++ /dev/null`; its removed tests still belong to the old path.
      file = line.slice(4) === '/dev/null' ? oldFile : line.slice(4).replace(/^b\//, '')
      scanner.reset()
      continue
    }
    if (!file || !TEST_FILE.test(file)) continue
    const body = line.slice(1)
    if (line.startsWith('+')) {
      const kind = CODE_FILE.test(file) ? scanner.scan(body) : null
      if (kind === 'focus') errors.push(`${file}: focused test: ${body.trim()}`)
      else if (kind === 'skip') {
        const reason = skipReason(body)
        if (reason) skipsAdded.push({ file, reason, line: body.trim() })
        else errors.push(skipError(file, body))
      }
      if (WEAK_MATCHER.test(body)) weak.push({ file, line: body.trim() })
      count(file, 'added', body)
      const t = body.match(TITLE)
      if (t) added.add(t[2])
      continue
    }
    scanner.reset()
    if (line.startsWith('-')) {
      count(file, 'removed', body)
      const t = body.match(TITLE)
      if (t) removed.push({ file, title: t[2] })
    }
  }
  const assertionSignals = [
    ...[...counts]
      .filter(([, c]) => c.removed > c.added)
      .map(
        ([file, c]) =>
          `${file}: ${c.removed - c.added} assertion(s) removed net (${c.removed} removed, ${c.added} added)`,
      ),
    ...weak.map((w) => `${w.file}: weak assertion added: ${w.line}`),
  ]
  return {
    errors,
    removedTests: removed.filter((r) => !added.has(r.title)),
    assertionSignals,
    skipsAdded,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head = 'HEAD'] = process.argv.slice(2)
  if (!base) {
    console.error('Usage: node scripts/check-pr-review-signals.mjs <base-ref> [head-ref]')
    process.exit(2)
  }
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 << 20 })
  const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean)
  const t2 = t2Files(files),
    guards = guardFiles(files)
  const {
    errors: diffErrors,
    removedTests,
    assertionSignals,
    skipsAdded,
  } = analyzeTestDiff(git('diff', '--unified=0', '--no-color', base, head))
  const show = (file) => {
    try {
      return git('show', `${head}:${file}`)
    } catch {
      return null // deleted at head
    }
  }
  const errors = [
    ...new Set([
      ...diffErrors,
      ...files.flatMap((file) => {
        const text = TEST_FILE.test(file) && CODE_FILE.test(file) ? show(file) : null
        return text === null ? [] : checkTestSource(file, text)
      }),
    ]),
  ]
  const lines = ['## Review signals', '']
  lines.push(
    t2.length
      ? `**T2 area touched** — read these files carefully:\n${t2.map((f) => `- \`${f}\``).join('\n')}`
      : 'No T2-area files changed.',
  )
  if (guards.length)
    lines.push(
      '',
      `**CI or guard change** — needs an independent reviewer:\n${guards.map((f) => `- \`${f}\``).join('\n')}`,
    )
  if (skipsAdded.length)
    lines.push(
      '',
      `**Skips added** — approve each reason:\n${skipsAdded.map((s) => `- \`${s.file}\`: ${s.reason}`).join('\n')}`,
    )
  if (removedTests.length)
    lines.push(
      '',
      `**Removed test cases** — confirm each removal is intended:\n${removedTests.map((r) => `- \`${r.file}\`: ${r.title}`).join('\n')}`,
    )
  if (assertionSignals.length)
    lines.push(
      '',
      `**Assertion changes** — check that tests were not weakened:\n${assertionSignals.map((s) => `- ${s}`).join('\n')}`,
    )
  if (errors.length)
    lines.push('', `**Blocking test changes:**\n${errors.map((e) => `- ${e}`).join('\n')}`)
  const report = lines.join('\n')
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `t2=${t2.length ? 'true' : 'false'}\nguard=${guards.length ? 'true' : 'false'}\n`,
    )
  for (const r of removedTests)
    console.log(`::warning file=${r.file}::Removed test case: ${r.title}`)
  for (const s of assertionSignals) console.log(`::warning::${s}`)
  for (const s of skipsAdded) console.log(`::warning file=${s.file}::Skip added: ${s.reason}`)
  process.exit(errors.length ? 1 : 0)
}
