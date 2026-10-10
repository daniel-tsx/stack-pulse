import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } from 'openai'
import {
  ExecutionDeadlineError,
  sleepWithSignal,
  type ExecutionBudget,
} from '@/lib/execution-budget'

const messages = {
  RATE_LIMITED: 'AI rate limit reached',
  PROVIDER_OVERLOADED: 'AI provider is temporarily overloaded',
  PROVIDER_UNAVAILABLE: 'AI provider is temporarily unavailable',
  AUTHENTICATION_ERROR: 'AI authentication failed; check the OpenRouter key',
  QUOTA_OR_CREDIT_EXHAUSTED: 'AI credits or quota exhausted; check the OpenRouter account',
  TIMEOUT: 'AI request timed out or was cancelled',
  INVALID_RESPONSE: 'AI returned an invalid summary',
  UNKNOWN_ERROR: 'AI request failed',
  EXECUTION_BUDGET_EXCEEDED: 'Insufficient execution time for AI work',
} as const

export class AiProviderError extends Error {
  attempt = 0
  reason = 'NON_RETRYABLE'
  model?: string

  constructor(
    readonly category: keyof typeof messages,
    readonly status?: number,
    readonly retryable = false,
    readonly retryAfterMs?: number,
    readonly upstreamProvider?: 'StreamLake' | 'DeepInfra',
    readonly upstreamCode?: number,
  ) {
    super(messages[category])
    this.name = 'AiProviderError'
    this.reason = retryable ? 'TRANSIENT_FAILURE' : 'NON_RETRYABLE'
  }

  get info() {
    return {
      category: this.category,
      provider: 'OpenRouter',
      upstreamProvider: this.upstreamProvider,
      model: this.model,
      httpStatus: this.status,
      upstreamCode: this.upstreamCode,
      attempt: this.attempt,
      retryCount: Math.max(0, this.attempt - 1),
      reason: this.reason,
    }
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function retryAfter(value: string | null | undefined, now: number): number | undefined {
  if (!value?.trim()) return
  const text = value.trim()
  if (/^\d+(\.\d+)?$/.test(text)) {
    const delay = Number(text) * 1000
    return Number.isFinite(delay) ? delay : undefined
  }
  if (!/^[A-Za-z]{3,9}[, ]/.test(text)) return
  const date = Date.parse(text)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

// Inspect only for classification. Never retain or emit raw SDK/provider errors.
function classify(error: unknown, now: number): AiProviderError {
  if (error instanceof AiProviderError) return error
  const outer = record(error)
  const body = record(outer.error ?? error)
  const metadata = record(body.metadata)
  let raw: Record<string, unknown> = {}
  if (typeof metadata.raw === 'string') {
    try {
      raw = record(JSON.parse(metadata.raw.slice(0, 4096)))
    } catch {}
  }
  const code = [
    body.code,
    body.type,
    metadata.error_type,
    metadata.provider_code,
    record(raw.error).code,
    record(raw.error).type,
    raw.code,
  ]
    .join(' ')
    .toLowerCase()
  const message = typeof body.message === 'string' ? body.message.toLowerCase() : ''
  const status =
    typeof outer.status === 'number'
      ? outer.status
      : typeof body.code === 'number'
        ? body.code
        : undefined
  const failureStatus =
    (status === undefined || status < 400) && typeof body.code === 'number' ? body.code : status
  const headers = outer.headers as Headers | undefined
  let delay = retryAfter(
    typeof headers?.get === 'function' ? headers.get('retry-after') : null,
    now,
  )
  const millis = typeof headers?.get === 'function' ? headers.get('retry-after-ms') : null
  if (millis && /^\d+(\.\d+)?$/.test(millis) && Number.isFinite(Number(millis))) {
    delay = Math.max(delay ?? 0, Number(millis))
  }
  const provider =
    metadata.provider_name === 'StreamLake' || metadata.provider_name === 'DeepInfra'
      ? metadata.provider_name
      : undefined
  let category: AiProviderError['category'] = 'UNKNOWN_ERROR'
  if (failureStatus === 401 || /authentication|invalid_api_key/.test(code))
    category = 'AUTHENTICATION_ERROR'
  else if (
    failureStatus === 402 &&
    metadata.limit_source === 'openrouter_in_flight_budget' &&
    delay !== undefined
  )
    category = 'RATE_LIMITED'
  else if (
    failureStatus === 402 ||
    /insufficient_quota|quota_exceeded|payment_required|insufficient_credits/.test(code) ||
    /insufficient (credits|quota)|credits? exhausted/.test(message)
  )
    category = 'QUOTA_OR_CREDIT_EXHAUSTED'
  else if (/overload/.test(code) || /engine_overloaded|temporarily overloaded/.test(message))
    category = 'PROVIDER_OVERLOADED'
  else if (failureStatus === 429 || /rate_limit/.test(code)) category = 'RATE_LIMITED'
  else if (
    failureStatus === 408 ||
    failureStatus === 504 ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    /timeout|abort/i.test(String(outer.name)) ||
    /timeout/.test(code)
  )
    category = 'TIMEOUT'
  else if (
    (failureStatus !== undefined && failureStatus >= 500) ||
    /provider_unavailable/.test(code) ||
    error instanceof APIConnectionError
  )
    category = 'PROVIDER_UNAVAILABLE'
  else if (outer.name === 'SyntaxError') category = 'INVALID_RESPONSE'
  const transient = ['RATE_LIMITED', 'PROVIDER_OVERLOADED', 'PROVIDER_UNAVAILABLE'].includes(
    category,
  )
  return new AiProviderError(
    category,
    status,
    transient && !(typeof headers?.get === 'function' && headers.get('x-should-retry') === 'false'),
    delay,
    provider,
    failureStatus !== status ? failureStatus : undefined,
  )
}

const MAX_ATTEMPTS = 3
const MAX_WAIT_MS = 10_000
const REQUEST_TIMEOUT_MS = 25_000
const MIN_REQUEST_MS = 1000

type Runtime = {
  now: () => number
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  random: () => number
  signal: (ms: number) => AbortSignal
}
type Identity = { model: string; repositoryId?: string; releaseId?: number }
type RequestOptions = { maxRetries: 0; timeout: number; signal: AbortSignal }

// Awaited FIFO lanes default to one summary at a time; tuning is capped at two.
// The client may be reused, but this queue/cooldown belongs only to its caller's execution.
export function createAiExecutionContext(
  deadline = Date.now() + 90_000,
  runtime: Partial<Runtime> & { concurrency?: 1 | 2 } = {},
  execution?: ExecutionBudget,
) {
  const clock: Runtime = {
    now: Date.now,
    sleep: sleepWithSignal,
    random: Math.random,
    signal: (ms) => AbortSignal.timeout(ms),
    ...runtime,
  }
  const lanes = Array.from({ length: runtime.concurrency === 2 ? 2 : 1 }, () => Promise.resolve())
  let nextLane = 0
  let cooldownUntil = 0
  let lastTransient: AiProviderError | undefined
  let blocked: AiProviderError | undefined
  const stats = { succeeded: 0, failed: 0, attempts: 0, retries: 0, cooldowns: 0 }
  const remainingMs = () => Math.min(deadline - clock.now(), execution?.remainingMs() ?? Infinity)
  const measure = <T>(stage: string, operation: () => Promise<T>) =>
    execution ? execution.measure(stage, operation) : operation()

  async function run<T>(
    operation: (options: RequestOptions) => Promise<T>,
    identity: Identity,
  ): Promise<T> {
    const lane = nextLane++ % lanes.length
    const previous = lanes[lane]
    let release!: () => void
    lanes[lane] = new Promise<void>((resolve) => {
      release = resolve
    })
    let attempt = 0
    // Model/IDs come from caller configuration/DB, never from provider payloads.
    const model =
      /^[\w./:-]{1,120}$/.test(identity.model) && !identity.model.startsWith('sk-')
        ? identity.model
        : undefined
    const ids = {
      repositoryId: identity.repositoryId,
      releaseId: Number.isSafeInteger(identity.releaseId) ? identity.releaseId : undefined,
    }
    try {
      await measure('aiQueue', () => previous)
      for (;;) {
        execution?.check()
        if (blocked) {
          const error = new AiProviderError(blocked.category, blocked.status)
          error.reason = 'EXECUTION_BLOCKED'
          throw error
        }
        const wait = Math.max(0, cooldownUntil - clock.now())
        if (wait > MAX_WAIT_MS) {
          const error = new AiProviderError(
            lastTransient?.category ?? 'RATE_LIMITED',
            lastTransient?.status,
          )
          error.reason = 'COOLDOWN_EXCEEDS_WAIT_LIMIT'
          throw error
        }
        if (wait + MIN_REQUEST_MS > remainingMs()) {
          const error = new AiProviderError('EXECUTION_BUDGET_EXCEEDED')
          error.reason = 'EXECUTION_DEADLINE'
          throw error
        }
        if (wait > 0) {
          await measure('aiRetryWait', () => clock.sleep(wait, execution?.signal))
          continue
        }
        const timeout = Math.floor(Math.min(REQUEST_TIMEOUT_MS, remainingMs()))
        const attemptSignal = clock.signal(timeout)
        const signal = execution
          ? AbortSignal.any([attemptSignal, execution.signal])
          : attemptSignal
        attempt++
        stats.attempts++
        if (attempt > 1) stats.retries++
        try {
          const value = await measure('aiRequest', () =>
            operation({ maxRetries: 0, timeout, signal }),
          )
          signal.throwIfAborted()
          stats.succeeded++
          if (attempt > 1)
            console.info('AI summary recovered', {
              ...ids,
              provider: 'OpenRouter',
              model,
              attempt,
              outcome: 'success',
            })
          return value
        } catch (cause) {
          // The SDK may swallow an aborted error-body read and retain HTTP 429/5xx.
          // Cancellation takes precedence; never activate cooldown or retry it.
          if (signal.aborted || remainingMs() <= 0) {
            const error = new AiProviderError('TIMEOUT', classify(cause, clock.now()).status)
            error.reason =
              execution?.signal.aborted || remainingMs() <= 0
                ? 'EXECUTION_DEADLINE'
                : 'REQUEST_CANCELLED'
            throw error
          }
          const error = classify(cause, clock.now())
          if (
            error.category === 'AUTHENTICATION_ERROR' ||
            error.category === 'QUOTA_OR_CREDIT_EXHAUSTED'
          )
            blocked = error
          if (
            !['RATE_LIMITED', 'PROVIDER_OVERLOADED', 'PROVIDER_UNAVAILABLE'].includes(
              error.category,
            )
          )
            throw error
          const delay =
            error.retryAfterMs ??
            Math.min(MAX_WAIT_MS, 1000 * 2 ** (attempt - 1) * (0.75 + clock.random() * 0.5))
          cooldownUntil = Math.max(cooldownUntil, clock.now() + delay)
          lastTransient = error
          stats.cooldowns++
          error.attempt = attempt
          error.model = model
          if (!error.retryable) throw error
          if (attempt >= MAX_ATTEMPTS) {
            error.reason = 'RETRY_EXHAUSTED'
            throw error
          }
          if (delay > MAX_WAIT_MS) {
            error.reason = 'RETRY_DELAY_EXCEEDS_WAIT_LIMIT'
            throw error
          }
          if (delay + MIN_REQUEST_MS > remainingMs()) {
            error.reason = 'EXECUTION_DEADLINE'
            throw error
          }
          console.warn('AI summary retry', {
            ...ids,
            ...error.info,
            retryDelayMs: delay,
            cooldownActivated: true,
            outcome: 'retry',
          })
        }
      }
    } catch (cause) {
      const error =
        cause instanceof ExecutionDeadlineError
          ? new AiProviderError('EXECUTION_BUDGET_EXCEEDED')
          : classify(cause, clock.now())
      if (cause instanceof ExecutionDeadlineError) error.reason = 'EXECUTION_DEADLINE'
      error.attempt = attempt
      error.model = model
      stats.failed++
      if (attempt > 0)
        console.warn('AI summary failed', { ...ids, ...error.info, outcome: 'failed' })
      throw error
    } finally {
      release()
    }
  }

  return { run, stats }
}

export type AiExecutionContext = ReturnType<typeof createAiExecutionContext>
