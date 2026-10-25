import type { SkillDiagnostic } from './skill-diagnostics'

export type SkillFile = {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  previousPath: string | null
  previousBlob: string | null
  newBlob: string | null
  previousMode: string | null
  newMode: string | null
  before: string | null
  after: string | null
  contentComplete: boolean
}

export type SkillEvidence = {
  files: SkillFile[]
  complete: boolean
  limitations: string[]
  totalChangedFiles: number
}

export type SkillObservation = {
  revision: string
  tree: string | null
  branch: string
  hasSkillFile: boolean
}

export type SkillTelemetry = {
  requestedModel: string
  returnedModel: string | null
  provider: string | null
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  costUsd: number | null
  costKind: 'reported' | 'partial_reported' | 'unknown'
  durationMs: number
  attempts: number
  unreportedAttempts: number
  diagnostics?: SkillDiagnostic[]
  runs?: Omit<SkillTelemetry, 'runs'>[]
}
