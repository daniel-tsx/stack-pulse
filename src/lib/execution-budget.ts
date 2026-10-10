// Invocation-scoped cooperative cancellation. Await operations themselves so cleanup
// cannot race outstanding writes. A cancelled write may still have committed remotely.
export class ExecutionDeadlineError extends Error {
  constructor() {
    super('Execution cancelled or time budget exhausted')
    this.name = 'ExecutionDeadlineError'
  }
}

export type StageTimings = Record<
  string,
  { durationMs: number; operations: number; active: number }
>

export function createExecutionBudget(deadline: number, timings: StageTimings = {}) {
  const controller = new AbortController()
  const cancel = () => controller.abort(new ExecutionDeadlineError())
  const timer = setTimeout(cancel, Math.max(0, deadline - performance.now()))
  timer.unref?.()

  function remainingMs() {
    return Math.max(0, deadline - performance.now())
  }

  function check(minimumMs = 1) {
    if (remainingMs() === 0) cancel()
    if (controller.signal.aborted || remainingMs() < minimumMs) throw new ExecutionDeadlineError()
  }

  async function measure<T>(stage: string, operation: () => PromiseLike<T>): Promise<T> {
    check()
    const start = performance.now()
    const timing = (timings[stage] ??= { durationMs: 0, operations: 0, active: 0 })
    timing.active++
    try {
      return await operation()
    } finally {
      timing.durationMs += Math.max(0, performance.now() - start)
      timing.operations++
      timing.active--
    }
  }

  function requestSignal(timeoutMs: number) {
    check()
    return AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(Math.max(1, Math.floor(Math.min(timeoutMs, remainingMs())))),
    ])
  }

  return {
    signal: controller.signal,
    remainingMs,
    check,
    measure,
    requestSignal,
    cancel,
    close: () => clearTimeout(timer),
  }
}

export type ExecutionBudget = ReturnType<typeof createExecutionBudget>

export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ExecutionDeadlineError())
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new ExecutionDeadlineError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
