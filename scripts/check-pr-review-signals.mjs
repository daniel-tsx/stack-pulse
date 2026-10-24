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
  /^src\/app\/api\/(auth|cron|digest|releases|release-advice|webhooks)\//,
  // Auth, ownership, cron auth, ingestion/lease recovery, AI spend and outbound notifications.
  /^src\/lib\/(auth|auth-return-path|actions|cron-auth|execution-budget|release-ingestion|release-votes|github|ai|ai-resilience|digest|webhooks|skill-(ingestion|store|analysis|github))\.ts$/,
  // Operator scripts that write production data or call paid providers.
  /^scripts\/(skill-updates|skill-eval-budget|backfill-release-intelligence)\.ts$/,
  /^scripts\/verify-skill-neon\.mjs$/,
  // Cron registration: adding a schedule activates a background job.
  /^vercel\.json$/,
]
// CI, the guards and the test-database ownership guard: weakening them removes protection from every
// later PR. They get a separate `guard-change` label (independent review) rather than T2 reading.
export const GUARD_PATHS = [
  /^\.github\/workflows\//,
  /^scripts\/check-(migration-history|pr-review-signals)\.mjs$/,
  /^tests\/skill-test-database\.mjs$/,
]
const TEST_FILE = /(^|\/)tests?\/|\.(spec|test)\.[cm]?[jt]sx?$/
// node:test focus: test.only/describe.only or the { only: true } option.
const FOCUS = /\b(?:it|test|describe|suite)\.only\b|\bonly\s*:\s*true\b/
// node:test skips: test.skip/test.todo, t.skip()/t.todo(), or an unconditional { skip: true | '<reason>' }.
const SKIP =
  /\b(?:it|test|describe|suite)\.(?:skip|todo)\b|\bt\.(?:skip|todo)\(|\bskip\s*:\s*(?:true\b|['"`])/
// Allowed skips: the repository's env gate `skip: !<condition> && '<reason>'` (its value may start on the
// next line), or a trailing `// allow-skip: <reason>` comment, which is always listed for the human reviewer.
const SKIP_KEY_ONLY = /\bskip\s*:\s*$/
const ENV_GATE_VALUE = /^\s*!/
const ALLOW_SKIP = /\/\/\s*allow-skip:\s*(\S.*)$/
export const skipReason = (line) => line.match(ALLOW_SKIP)?.[1].trim() ?? null
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
    skipKey = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.slice(4).replace(/^b\//, '')
      skipKey = false
      continue
    }
    if (line.startsWith('--- ') || !file || !TEST_FILE.test(file)) continue
    const body = line.slice(1)
    if (line.startsWith('+')) {
      // A bare `skip:` key takes its value from the next added line, which must be an env gate.
      const ungatedValue = skipKey && !ENV_GATE_VALUE.test(body)
      skipKey = SKIP_KEY_ONLY.test(body)
      if (FOCUS.test(body)) errors.push(`${file}: focused test added: ${body.trim()}`)
      else if (SKIP.test(body) || ungatedValue) {
        const reason = skipReason(body)
        if (reason) skipsAdded.push({ file, reason, line: body.trim() })
        else
          errors.push(
            `${file}: skipped test added without the "skip: !<condition> && '<reason>'" env gate or a "// allow-skip: <reason>" comment: ${body.trim()}`,
          )
      }
      if (WEAK_MATCHER.test(body)) weak.push({ file, line: body.trim() })
      count(file, 'added', body)
      const t = body.match(TITLE)
      if (t) added.add(t[2])
      continue
    }
    skipKey = false
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
  const { errors, removedTests, assertionSignals, skipsAdded } = analyzeTestDiff(
    git('diff', '--unified=0', '--no-color', base, head),
  )
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
