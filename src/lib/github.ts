const GITHUB_API = 'https://api.github.com'

export interface GithubRelease {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
  html_url: string
}

const TIMEOUT_MS = 8000

const errorMessages = {
  GITHUB_TOKEN_MISSING: 'GITHUB_TOKEN is not configured',
  GITHUB_AUTH: 'GitHub authentication failed; check token expiry or revocation',
  GITHUB_PERMISSION: 'GitHub repository access was denied',
  GITHUB_RATE_LIMIT: 'GitHub rate limit reached',
  GITHUB_NOT_FOUND: 'GitHub repository was not found or is inaccessible',
  GITHUB_UPSTREAM: 'GitHub returned an upstream error',
  GITHUB_NETWORK: 'GitHub request failed or timed out',
  GITHUB_REPOSITORY: 'GitHub repository request is invalid',
} as const

export class GithubApiError extends Error {
  readonly scope: 'global' | 'repository'

  constructor(
    readonly category: keyof typeof errorMessages,
    readonly upstreamStatus?: number,
  ) {
    super(errorMessages[category])
    this.name = 'GithubApiError'
    this.scope =
      category === 'GITHUB_AUTH' || category === 'GITHUB_TOKEN_MISSING' ? 'global' : 'repository'
  }
}

// One context per cron invocation; standalone public-repository callers need no token.
export type GithubFetchContext = { authFailure: GithubApiError | null }

export function createGithubFetchContext(): GithubFetchContext {
  return {
    authFailure: process.env.GITHUB_TOKEN?.trim()
      ? null
      : new GithubApiError('GITHUB_TOKEN_MISSING'),
  }
}

export function parseGithubRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const [, , , owner, repo] = repoUrl.replace(/\/$/, '').split('/')
  if (!owner || !repo) {
    throw new GithubApiError('GITHUB_REPOSITORY')
  }
  return { owner, repo }
}

async function requestGithub(
  path: string,
  context?: GithubFetchContext,
  retry = true,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'StackPulse',
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  // One retry on network error or 5xx.
  for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    let url = `${GITHUB_API}${path}`
    let res: Response
    try {
      for (let redirects = 0; ; redirects++) {
        // Guard every HTTP dispatch, including redirects and retries. Keep one
        // timeout across each redirect chain, as native fetch did before.
        if (context?.authFailure) throw context.authFailure
        res = await fetch(url, {
          headers,
          signal,
          cache: 'no-store',
          redirect: 'manual',
        })
        if (![301, 302, 303, 307, 308].includes(res.status)) break
        await res.body?.cancel()
        // The credential check allows one request; repository redirects remain bounded.
        if (!retry || redirects >= 20) throw new GithubApiError('GITHUB_UPSTREAM', res.status)
        const location = res.headers.get('location')
        let target: URL
        try {
          target = new URL(location ?? '', url)
        } catch {
          throw new GithubApiError('GITHUB_UPSTREAM', res.status)
        }
        // Never forward a credential to another origin or a URL containing credentials.
        if (!location || target.origin !== GITHUB_API || target.username || target.password)
          throw new GithubApiError('GITHUB_UPSTREAM', res.status)
        url = target.href
      }
    } catch (error) {
      if (error instanceof GithubApiError) throw error
      if (retry && attempt === 0) continue
      throw new GithubApiError('GITHUB_NETWORK')
    }

    if (res.ok) {
      const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '5000')
      if (remaining < 50) console.warn(`GitHub rate limit low: ${remaining} remaining`)
      return res
    }
    if (res.status >= 500 && retry && attempt === 0) {
      await res.body?.cancel()
      continue
    }

    let category: GithubApiError['category'] = 'GITHUB_REPOSITORY'
    if (res.status === 401) category = 'GITHUB_AUTH'
    else if (res.status === 404) category = 'GITHUB_NOT_FOUND'
    else if (res.status === 429) category = 'GITHUB_RATE_LIMIT'
    else if (res.status >= 500) category = 'GITHUB_UPSTREAM'
    else if (res.status === 403) {
      // Secondary rate limits may only be identified by the message. Never emit it.
      const body = await res.json().catch(() => null)
      const rateLimited =
        res.headers.get('x-ratelimit-remaining') === '0' ||
        res.headers.has('retry-after') ||
        (typeof body?.message === 'string' && /rate limit|abuse/i.test(body.message))
      category = rateLimited ? 'GITHUB_RATE_LIMIT' : 'GITHUB_PERMISSION'
    }
    const error = new GithubApiError(category, res.status)
    if (category === 'GITHUB_AUTH' && context) context.authFailure = error
    throw error
  }

  throw new GithubApiError('GITHUB_NETWORK')
}

export async function fetchLatestReleases(
  repoUrl: string,
  perPage = 5,
  context?: GithubFetchContext,
): Promise<GithubRelease[]> {
  const { owner, repo } = parseGithubRepoUrl(repoUrl)
  const res = await requestGithub(`/repos/${owner}/${repo}/releases?per_page=${perPage}`, context)
  try {
    const releases: unknown = await res.json()
    if (!Array.isArray(releases)) throw new GithubApiError('GITHUB_UPSTREAM', res.status)
    return releases
  } catch {
    throw new GithubApiError('GITHUB_UPSTREAM', res.status)
  }
}

/** Read-only credential check: exactly one request, no retries or profile returned. */
export async function verifyGithubAuthentication(): Promise<void> {
  const res = await requestGithub('/user', createGithubFetchContext(), false)
  await res.body?.cancel()
}
