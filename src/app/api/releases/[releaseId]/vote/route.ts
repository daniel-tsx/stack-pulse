import { NextResponse } from 'next/server'
import { getAuth } from '@/lib/auth'
import { getReleaseVoteState, setReleaseVote } from '@/lib/release-votes'
import { releaseIdSchema, voteRequestSchema } from '@/lib/release-vote-types'

type Context = { params: Promise<{ releaseId: string }> }
const responseHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: responseHeaders })

export async function GET(request: Request, context: Context) {
  const id = releaseIdSchema.safeParse((await context.params).releaseId)
  if (!id.success) return json({ error: 'invalid release id' }, 400)
  try {
    const session = await getAuth().api.getSession({ headers: request.headers })
    const state = await getReleaseVoteState(id.data, session?.user.id ?? null)
    return state ? json(state) : json({ error: 'release was not found' }, 404)
  } catch {
    return json({ error: 'could not load votes' }, 500)
  }
}

export async function PUT(request: Request, context: Context) {
  const id = releaseIdSchema.safeParse((await context.params).releaseId)
  if (!id.success) return json({ error: 'invalid release id' }, 400)
  try {
    const session = await getAuth().api.getSession({ headers: request.headers })
    if (!session) return json({ error: 'sign in with GitHub to vote' }, 401)
    // A cookie-authenticated mutation must originate from this app. Do not trust
    // forwarded host headers or allow a missing/opaque Origin on this endpoint.
    if (
      request.headers.get('origin') !== new URL(request.url).origin ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    ) {
      return json({ error: 'cross-origin voting is not allowed' }, 403)
    }
    if (
      request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    ) {
      return json({ error: 'invalid vote request' }, 400)
    }
    if (Number(request.headers.get('content-length')) > 256)
      return json({ error: 'vote request is too large' }, 413)
    let value
    try {
      const body = await request.text()
      if (body.length > 256) return json({ error: 'vote request is too large' }, 413)
      value = voteRequestSchema.parse(JSON.parse(body)).value
    } catch {
      return json({ error: 'invalid vote value' }, 400)
    }
    const state = await setReleaseVote(id.data, session.user.id, value)
    return state ? json(state) : json({ error: 'release was not found' }, 404)
  } catch {
    return json({ error: 'could not save vote; reload votes before trying again' }, 500)
  }
}
