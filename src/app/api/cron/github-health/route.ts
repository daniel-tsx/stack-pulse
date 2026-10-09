import { NextRequest, NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { GithubApiError, verifyGithubAuthentication } from '@/lib/github'

export const maxDuration = 10

/** Manual, protected, read-only check. Not scheduled in vercel.json. */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    await verifyGithubAuthentication()
    return NextResponse.json(
      { status: 'success', githubAuthenticated: true },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch (err) {
    const error = err instanceof GithubApiError ? err : new GithubApiError('GITHUB_NETWORK')
    const failure = {
      category: error.category,
      scope: error.scope,
      repository: null,
      message: error.message,
      upstreamStatus: error.upstreamStatus,
    }
    console.error('GitHub credential check failed', failure)
    return NextResponse.json(
      { status: 'failed', githubAuthenticated: false, errors: [failure] },
      {
        status: error.category === 'GITHUB_TOKEN_MISSING' ? 500 : 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}
