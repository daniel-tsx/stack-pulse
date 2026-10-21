import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTs } from './release-test-helpers.mjs'
import {
  interleaveSkillSnapshots,
  memorySnapshotStore,
  snapshotHash,
} from './skill-snapshot-helpers.mjs'

class AiProviderError extends Error {
  constructor(category) {
    super(category)
    this.category = category
  }
}
const ai = loadTs('src/lib/skill-analysis.ts', {
  '@/lib/ai': {},
  '@/lib/ai-resilience': { AiProviderError },
})
const path = 'skills/ponytail/SKILL.md'
const approval = 'Ask for approval before modifying files.'
const evidence = (before, after, extra = {}) => ({
  complete: true,
  totalChangedFiles: 1,
  limitations: [],
  files: [
    {
      path,
      previousPath: null,
      status: 'modified',
      previousBlob: snapshotHash(3),
      newBlob: snapshotHash(4),
      previousMode: '100644',
      newMode: '100644',
      before,
      after,
      contentComplete: true,
      ...extra,
    },
  ],
})
const modelReport = (change = 'removed', beforeQuote = approval, afterQuote = null) => ({
  summary: 'Source change assessment.',
  verifiedChanges: [{ path, change, beforeQuote, afterQuote }],
  capabilityChanges: [],
  behaviorImpact: [],
  securityConsiderations: [],
  impact: 'low',
  recommendation: 'update_candidate',
  justification: 'Advisory assessment.',
  confidence: 'high',
  limitations: [],
})

test('older invocation cannot reuse HEAD A after newer invocation checkpoints B', async () => {
  const { store, rows, events } = memorySnapshotStore()
  await interleaveSkillSnapshots(store)
  assert.ok(rows.every((row) => row.observedRevision === snapshotHash(2)))
  assert.equal(events.length, 2)
  assert.ok(
    events.every(
      (event) =>
        event.previousRevision === snapshotHash(1) && event.newRevision === snapshotHash(2),
    ),
  )
})

test('a freshly observed branch rewrite may legitimately move B back to A', async () => {
  const { store, rows, events } = memorySnapshotStore()
  const { rewind } = await interleaveSkillSnapshots(store)
  await rewind()
  assert.ok(
    rows.every((row) => row.observedRevision === snapshotHash(1) && row.branch === 'rewrite'),
  )
  assert.equal(
    events.filter(
      (event) =>
        event.previousRevision === snapshotHash(2) && event.newRevision === snapshotHash(1),
    ).length,
    2,
  )
})

test('typo-only diff cannot verify removal of an unchanged approval requirement', () => {
  const source = evidence(`${approval}\nFix teh typo.`, `${approval}\nFix the typo.`)
  const response = modelReport()
  assert.equal(ai.skillReportSchema.safeParse(response).success, true)
  assert.throws(() => ai.validateSkillReport(response, source))
})

test('renaming a non-executable script into references still requires review', () => {
  const oldPath = 'skills/ponytail/scripts/check.sh',
    newPath = 'skills/ponytail/references/check.sh'
  const source = evidence('echo local verification', 'echo local verification', {
    path: newPath,
    previousPath: oldPath,
    status: 'renamed',
    previousBlob: snapshotHash(3),
    newBlob: snapshotHash(3),
  })
  const report = modelReport('renamed', null, 'echo local verification')
  report.verifiedChanges[0].path = newPath
  assert.equal(ai.validateSkillReport(report, source).recommendation, 'review_before_update')
})

test('genuine approval removal is a verified textual removal; semantic statements are not model-controlled', () => {
  const result = ai.validateSkillReport(
    modelReport(),
    evidence(`${approval}\nRun checks.`, 'Run checks.'),
  )
  assert.equal(result.verifiedChanges[0].change, 'removed')
  assert.equal(result.verifiedChanges[0].statement, 'Source text removed.')
  assert.equal(result.verifiedChanges[0].quote, approval)
  assert.equal(result.verifiedChanges[0].side, 'before')
})

test('added and modified trigger instructions require comparative evidence', () => {
  const oldTrigger = 'Activate only for a security review.'
  const newTrigger = 'Activate for every code change.'
  const added = ai.validateSkillReport(
    modelReport('added', null, newTrigger),
    evidence('General guidance.', `General guidance.\n${newTrigger}`),
  )
  assert.equal(added.verifiedChanges[0].statement, 'Source text added.')
  const changed = ai.validateSkillReport(
    modelReport('modified', oldTrigger, newTrigger),
    evidence(oldTrigger, newTrigger),
  )
  assert.equal(changed.verifiedChanges[0].beforeQuote, oldTrigger)
  assert.equal(changed.verifiedChanges[0].afterQuote, newTrigger)
  assert.throws(() =>
    ai.validateSkillReport(
      modelReport('modified', oldTrigger, oldTrigger),
      evidence(oldTrigger, `${oldTrigger}\n${newTrigger}`),
    ),
  )
})

test('unchanged surrounding context cannot serve as direct or indirect change evidence', () => {
  const before = `${approval}\nFix teh typo.`,
    after = `${approval}\nFix the typo.`
  assert.throws(() =>
    ai.validateSkillReport(modelReport('added', null, approval), evidence(before, after)),
  )
  const response = modelReport('modified', 'Fix teh typo.', 'Fix the typo.')
  response.behaviorImpact = [
    { statement: 'The approval requirement was removed.', path, side: 'before', quote: approval },
  ]
  assert.equal(ai.skillReportSchema.safeParse(response).success, true)
  assert.throws(() => ai.validateSkillReport(response, evidence(before, after)))
})

test('a schema-valid fabricated AI behavior claim is rejected rather than becoming a report', async () => {
  const response = modelReport('modified', 'Fix teh typo.', 'Fix the typo.')
  response.behaviorImpact = [
    { statement: 'The approval requirement was removed.', path, side: 'before', quote: approval },
  ]
  assert.equal(ai.skillReportSchema.safeParse(response).success, true)
  const analyzer = loadTs(
    'src/lib/skill-analysis.ts',
    {
      '@/lib/ai-resilience': { AiProviderError },
      '@/lib/ai': {
        getOpenAI: () => ({
          chat: {
            completions: {
              create: () => ({
                withResponse: async () => ({
                  data: {
                    model: 'test/model',
                    choices: [
                      { message: { content: JSON.stringify(response) }, finish_reason: 'stop' },
                    ],
                  },
                  response: new Response(),
                }),
              }),
            },
          },
        }),
      },
    },
    { performance },
  )
  await assert.rejects(
    analyzer.analyzeSkillUpdate(
      {
        repository: 'test/source',
        directory: 'skills/ponytail',
        previousRevision: snapshotHash(1),
        newRevision: snapshotHash(2),
        evidence: evidence(`${approval}\nFix teh typo.`, `${approval}\nFix the typo.`),
      },
      { run: (operation) => operation({}) },
      'test/model',
    ),
    (error) => error.category === 'INVALID_RESPONSE',
  )
})

test('fabricated free-form summary and justification cannot bypass the comparative contract', () => {
  const response = modelReport('modified', 'Fix teh typo.', 'Fix the typo.')
  response.summary =
    'The approval requirement was removed. The agent now modifies files without permission.'
  response.justification = 'Approval is no longer required.'
  assert.equal(ai.skillReportSchema.safeParse(response).success, true)
  const result = ai.validateSkillReport(
    response,
    evidence(`${approval}\nFix teh typo.`, `${approval}\nFix the typo.`),
  )
  assert.doesNotMatch(result.summary, /approval|permission/i)
  assert.doesNotMatch(result.justification, /approval|permission/i)
  assert.match(result.summary, /Source text replaced/)
})

test('inference category cannot bypass mandatory review or confidence caps', () => {
  for (const category of ['capabilityChanges', 'behaviorImpact', 'securityConsiderations']) {
    const response = modelReport('modified', 'Fix teh typo.', 'Fix the typo.')
    response[category] = [
      {
        statement: 'The approval requirement may have been removed.',
        path,
        side: 'after',
        quote: 'Fix the typo.',
      },
    ]
    const result = ai.validateSkillReport(
      response,
      evidence(`${approval}\nFix teh typo.`, `${approval}\nFix the typo.`),
    )
    assert.equal(result.recommendation, 'review_before_update')
    assert.equal(result.confidence, 'medium')
    assert.match(result.limitations[0], /inferences/)
  }
})

test('incomplete/truncated samples cannot establish verified additions or removals', () => {
  const source = evidence(approval, 'A partial after sample.', { contentComplete: false })
  source.complete = false
  source.limitations = ['Truncated source.']
  const result = ai.validateSkillReport(modelReport(), source)
  assert.equal(result.verifiedChanges.length, 0)
  assert.equal(result.recommendation, 'insufficient_evidence')
  assert.equal(result.confidence, 'low')
  assert.equal(result.impact, 'unknown')
})

test('legitimate indirect behavior implications cite changed instructions and require review', () => {
  const before = 'Activate only for a security review.',
    after = 'Activate for every code change.'
  const response = modelReport('modified', before, after)
  response.behaviorImpact = [
    {
      statement: 'The skill may now run during routine implementation.',
      path,
      side: 'after',
      quote: after,
    },
  ]
  const result = ai.validateSkillReport(response, evidence(before, after))
  assert.equal(result.behaviorImpact.length, 1)
  assert.equal(result.recommendation, 'review_before_update')
  assert.equal(result.confidence, 'medium')
  assert.match(result.limitations[0], /inferences/)
})

test('script additions, deletions, both rename directions and executable modes require review', () => {
  const script = 'skills/ponytail/scripts/check.sh',
    reference = 'skills/ponytail/references/check.sh'
  for (const [oldPath, newPath] of [
    [script, reference],
    [reference, script],
  ]) {
    const source = evidence('echo local verification', 'echo local verification', {
      path: newPath,
      previousPath: oldPath,
      status: 'renamed',
    })
    const response = modelReport('renamed', null, 'echo local verification')
    response.verifiedChanges[0].path = newPath
    assert.equal(ai.validateSkillReport(response, source).recommendation, 'review_before_update')
  }
  for (const [status, before, after, change] of [
    ['added', null, 'echo local verification', 'added'],
    ['deleted', 'echo local verification', null, 'removed'],
  ]) {
    const source = evidence(before, after, { path: script, status })
    const response = modelReport(change, before, after)
    response.verifiedChanges[0].path = script
    assert.equal(ai.validateSkillReport(response, source).recommendation, 'review_before_update')
  }
  const modeChanged = evidence('echo local verification', 'echo local verification', {
    path: reference,
    previousMode: '100644',
    newMode: '100755',
  })
  const response = modelReport('mode_changed', null, null)
  response.verifiedChanges[0].path = reference
  assert.equal(ai.validateSkillReport(response, modeChanged).recommendation, 'review_before_update')
})
