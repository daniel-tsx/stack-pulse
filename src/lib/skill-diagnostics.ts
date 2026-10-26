export type SkillDiagnostic = {
  httpStatus: number | null
  errorType: string | null
  providerCode: string | null
  retryAfterMs: number | null
  requestId: string | null
  generationId: string | null
  provider: string | null
  routingAttempts: number | null
  isByok: boolean | null
}

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const codeValues = new Set([
  'rate_limit_exceeded',
  'rate_limited',
  'rate_limit',
  'insufficient_quota',
  'insufficient_credits',
  'quota_exceeded',
  'provider_overloaded',
  'overloaded',
  'provider_unavailable',
  'server_error',
  'server',
  'invalid_api_key',
  'authentication_error',
  'invalid_request',
  'context_length_exceeded',
  'timeout',
  'too_many_requests',
  'rate_limit_error',
  'resource_exhausted',
  'overloaded_error',
  'service_unavailable',
  'invalid_request_error',
])
function identifier(value: unknown, kind: 'id' | 'provider') {
  if (
    typeof value !== 'string' ||
    /sk-|bearer|secret|password|credential|token|private/i.test(value)
  )
    return null
  const pattern =
    kind === 'id'
      ? /^(?:(?:req|gen)[-_][A-Za-z0-9_-]{1,140}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i
      : /^[A-Za-z][A-Za-z0-9 ._/-]{0,79}$/
  return pattern.test(value) ? value : null
}
const code = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? String(value)
    : typeof value === 'string' && codeValues.has(value)
      ? value
      : null

// Deliberately omit messages, raw errors, arbitrary metadata, headers and request bodies.
export function skillDiagnostics(
  value: unknown,
  headers?: Headers,
  status?: number,
): SkillDiagnostic {
  const outer = object(value)
  const choice = object(Array.isArray(outer.choices) ? outer.choices[0] : null)
  const body = object(outer.error ?? choice.error ?? value)
  const metadata = object(body.metadata)
  const routing = object(outer.openrouter_metadata)
  const usage = object(outer.usage)
  const header = (name: string) => (typeof headers?.get === 'function' ? headers.get(name) : null)
  const retry = header('retry-after')
  let retryAfterMs: number | null = null
  if (retry && /^\d+(\.\d+)?$/.test(retry)) retryAfterMs = Number(retry) * 1000
  else if (retry && /^[A-Za-z]{3,9}[, ]/.test(retry)) {
    const date = Date.parse(retry)
    if (Number.isFinite(date)) retryAfterMs = Math.max(0, date - Date.now())
  }
  const millis = header('retry-after-ms')
  if (millis && /^\d+(\.\d+)?$/.test(millis))
    retryAfterMs = Math.max(retryAfterMs ?? 0, Number(millis))
  if (retryAfterMs !== null && !Number.isFinite(retryAfterMs)) retryAfterMs = null
  const httpStatus = status ?? outer.status
  const attemptList = Array.isArray(routing.attempts) ? routing.attempts : []
  const attempts = routing.attempt ?? (attemptList.length ? attemptList.length : null)
  return {
    httpStatus:
      typeof httpStatus === 'number' &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599
        ? httpStatus
        : null,
    errorType: code(metadata.error_type ?? body.type),
    providerCode: code(metadata.provider_code ?? body.code),
    retryAfterMs,
    requestId: identifier(header('x-request-id') ?? outer.requestID, 'id'),
    generationId: identifier(header('x-generation-id') ?? outer.id, 'id'),
    provider: identifier(
      outer.provider ?? metadata.provider_name ?? object(attemptList.at(-1)).provider,
      'provider',
    ),
    routingAttempts:
      typeof attempts === 'number' && Number.isInteger(attempts) && attempts >= 0 && attempts <= 100
        ? attempts
        : null,
    isByok:
      typeof usage.is_byok === 'boolean'
        ? usage.is_byok
        : typeof routing.is_byok === 'boolean'
          ? routing.is_byok
          : null,
  }
}
