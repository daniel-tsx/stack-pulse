import { readFile } from 'node:fs/promises'
import {
  analyzeSkillUpdate,
  validateSkillReport,
  SkillAnalysisFailure,
  skillReportSchema,
} from '../src/lib/skill-analysis'
import { createAiExecutionContext } from '../src/lib/ai-resilience'
import {
  createEvalFetch,
  fixtureRawContent,
  SKILL_EVAL_BUDGET,
  SKILL_EVAL_CAMPAIGNS,
  SKILL_EVAL_COST_ALLOWANCE,
  SKILL_EVAL_RUBRIC,
  verifyEvalKey,
} from './skill-eval-budget'
import type { SkillEvidence } from '../src/lib/skill-types'

type Fixture = {
  id: string
  path: string
  before: string | null
  after: string | null
  expected: string
  focus: string
}
async function main() {
  const fixtures: Fixture[] = JSON.parse(
    await readFile(new URL('../tests/fixtures/skill-diffs.json', import.meta.url), 'utf8'),
  )
  const live = process.argv.includes('--live')
  const plan = process.argv.includes('--plan-live')
  const modelArg = process.argv.find((arg) => arg.startsWith('--model='))?.slice(8)
  const candidates = Object.keys(SKILL_EVAL_CAMPAIGNS)
  if (modelArg && !candidates.includes(modelArg))
    throw new Error('Select a reviewed candidate model')
  const model = modelArg || process.env.SKILL_UPDATES_MODEL || 'deepseek/deepseek-v4-flash-0731'
  if (!candidates.includes(model))
    throw new Error('Configured model needs a reviewed evaluation plan')
  if (plan) {
    const profile = SKILL_EVAL_CAMPAIGNS[model as keyof typeof SKILL_EVAL_CAMPAIGNS]
    console.info(
      JSON.stringify({
        mode: 'live-plan-only',
        model,
        fixtures: fixtures.map((f) => f.id),
        budget: SKILL_EVAL_BUDGET,
        totalInputTokenAllowance: 72000,
        totalOutputTokenCeiling: 18000,
        provider: profile.provider,
        serviceTier: 'default',
        rubric: SKILL_EVAL_RUBRIC,
        priceEstimateUsd: (72000 * profile.inputPrice + 18000 * profile.outputPrice) / 1e6,
        conservativePriceEstimateUsd: SKILL_EVAL_COST_ALLOWANCE,
        combinedTwoCampaignAllowanceUsd: 2 * SKILL_EVAL_COST_ALLOWANCE,
        tokenizerCountVerified: false,
        paidRequests: 0,
      }),
    )
    return
  }
  let campaign: ReturnType<typeof createEvalFetch> | undefined
  let campaignSignal: AbortSignal | undefined
  let campaignDeadline = 0
  const originalFetch = globalThis.fetch
  const key = process.env.SKILL_EVAL_OPENROUTER_API_KEY
  if (live) {
    if (process.env.SKILL_EVAL_APPROVED !== `skill-benchmark:${model}:six-fixtures` || !key)
      throw new Error(
        'Explicit campaign approval and a dedicated SKILL_EVAL_OPENROUTER_API_KEY are required',
      )
    if (fixtures.length !== SKILL_EVAL_BUDGET.requests)
      throw new Error('Fixture count changed; review the budget')
    campaignSignal = AbortSignal.timeout(SKILL_EVAL_BUDGET.totalMs)
    campaignDeadline = Date.now() + SKILL_EVAL_BUDGET.totalMs
    const response = await originalFetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
      redirect: 'error',
      signal: AbortSignal.any([campaignSignal, AbortSignal.timeout(5000)]),
    })
    if (!response.ok) throw new Error('Evaluation key budget preflight failed')
    verifyEvalKey((await response.json()).data)
    process.env.OPENROUTER_API_KEY = key
    campaign = createEvalFetch(model, originalFetch, campaignSignal)
    globalThis.fetch = campaign.fetch
  }
  let knownCostUsd = 0
  const models = live ? [model] : ['offline-contract']
  try {
    for (const model of models) {
      for (const fixture of fixtures) {
        const auditIndex = campaign?.audit.length ?? 0
        const path = `skills/example/${fixture.path}`
        const evidence: SkillEvidence = {
          complete: fixture.id !== 'insufficient',
          limitations: fixture.id === 'insufficient' ? ['Source revisions unavailable.'] : [],
          totalChangedFiles: 1,
          files: [
            {
              path,
              status: fixture.after === null ? 'deleted' : 'modified',
              previousPath: null,
              previousBlob: null,
              newBlob: null,
              previousMode: '100644',
              newMode: '100644',
              before: fixture.before,
              after: fixture.after,
              contentComplete: fixture.id !== 'insufficient',
            },
          ],
        }
        try {
          if (!live) {
            const added =
              fixture.after !== null &&
              (fixture.before === null || fixture.after.startsWith(fixture.before))
            const report = validateSkillReport(
              {
                summary: fixture.focus,
                verifiedChanges:
                  fixture.before !== null || fixture.after !== null
                    ? [
                        {
                          path,
                          change: fixture.after === null ? 'removed' : added ? 'added' : 'modified',
                          beforeQuote: added ? null : fixture.before,
                          afterQuote:
                            fixture.after === null
                              ? null
                              : added
                                ? fixture.after.slice(fixture.before?.length ?? 0).trim()
                                : fixture.after,
                        },
                      ]
                    : [],
                capabilityChanges: [],
                behaviorImpact: [],
                securityConsiderations: [],
                impact: 'low',
                recommendation: fixture.expected,
                justification: 'Synthetic contract fixture; not a model assessment.',
                confidence: 'low',
                limitations: [],
              },
              evidence,
            )
            console.info(
              JSON.stringify({
                fixture: fixture.id,
                mode: 'offline-contract',
                schemaValid: true,
                recommendation: report.recommendation,
                expected: fixture.expected,
                matched: report.recommendation === fixture.expected,
                modelQualityEvaluated: false,
              }),
            )
            if (report.recommendation !== fixture.expected) process.exitCode = 1
          } else {
            // No application retries in benchmarks, so each fixture has a known request cap.
            const execution = createAiExecutionContext(campaignDeadline, {
              maxAttempts: 1,
              signal: (ms) => AbortSignal.any([campaignSignal!, AbortSignal.timeout(ms)]),
            })
            const result = await analyzeSkillUpdate(
              {
                repository: 'synthetic/example',
                directory: 'skills/example',
                previousRevision: '1'.repeat(40),
                newRevision: '2'.repeat(40),
                evidence,
              },
              execution,
              model,
            )
            const rawReport = savedRawReport(campaign!, auditIndex)
            console.info(
              JSON.stringify({
                fixture: fixture.id,
                model,
                schemaValid: true,
                recommendationMatch: result.report.recommendation === fixture.expected,
                expected: fixture.expected,
                reviewFocus: fixture.focus,
                report: result.report,
                rawReport,
                rawRecommendationMatch: rawReport?.recommendation === fixture.expected,
                rubric: SKILL_EVAL_RUBRIC,
                qualityAcceptance: 'PENDING_HUMAN_REVIEW',
                telemetry: result.telemetry,
                manualReviewRequired: [
                  'behavior identification',
                  'unsupported assertions',
                  'evidence quality',
                  'recommendation usefulness',
                ],
              }),
            )
            knownCostUsd += result.telemetry.costUsd ?? 0
            if (
              result.telemetry.costKind !== 'reported' ||
              !rawReport ||
              result.telemetry.returnedModel !== model ||
              result.telemetry.inputTokens === null ||
              result.telemetry.outputTokens === null ||
              result.telemetry.inputTokens > SKILL_EVAL_BUDGET.inputTokensPerRequest ||
              result.telemetry.outputTokens > SKILL_EVAL_BUDGET.outputTokensPerRequest ||
              knownCostUsd > SKILL_EVAL_BUDGET.usd
            )
              throw new Error(
                'Incomplete billing or token/cost allowance exceeded; stop and reconcile',
              )
          }
        } catch (error) {
          if (error instanceof SkillAnalysisFailure) knownCostUsd += error.telemetry?.costUsd ?? 0
          console.info(
            JSON.stringify({
              fixture: fixture.id,
              model,
              schemaValid: false,
              accepted: false,
              cost:
                error instanceof SkillAnalysisFailure && error.telemetry
                  ? {
                      usd: error.telemetry.costUsd,
                      kind: error.telemetry.costKind,
                      unreportedAttempts: error.telemetry.unreportedAttempts,
                    }
                  : 'unknown; inspect OpenRouter usage',
              ...(error instanceof SkillAnalysisFailure
                ? { category: error.category, telemetry: error.telemetry }
                : {}),
              ...(campaign
                ? {
                    rawReport: savedRawReport(campaign, auditIndex),
                    rubric: SKILL_EVAL_RUBRIC,
                    qualityAcceptance: 'PENDING_HUMAN_REVIEW',
                  }
                : {}),
            }),
          )
          process.exitCode = 1
          if (live) return // Unknown charges, provider errors and invalid reports stop the campaign.
        }
      }
    }
  } finally {
    globalThis.fetch = originalFetch
    if (campaign)
      console.info(
        JSON.stringify({
          mode: 'live-campaign-audit',
          requests: campaign.requests(),
          knownReportedCostUsd: campaign.audit.reduce(
            (total, row) => total + (row.reportedCostUsd ?? 0),
            0,
          ),
          unknownChargeRequests:
            campaign.requests() -
            campaign.audit.filter((row) => row.reportedCostUsd !== null).length,
          audit: campaign.audit.map((row) => ({
            status: row.status,
            generationId: row.generationId,
            diagnostics: row.diagnostics,
            reportedCostUsd: row.reportedCostUsd,
          })),
          billingReconciliationRequired: true,
          humanAcceptanceRequired: true,
        }),
      )
  }
}
function savedRawReport(campaign: ReturnType<typeof createEvalFetch>, auditIndex: number) {
  try {
    const raw = skillReportSchema.safeParse(
      JSON.parse(fixtureRawContent(campaign, auditIndex) ?? ''),
    )
    return raw.success ? raw.data : null
  } catch {
    return null
  }
}
void main().catch(() => {
  console.error(
    'Skill evaluation stopped; check prerequisites and sanitized fixture/audit output. No automatic retry.',
  )
  process.exitCode = 1
})
