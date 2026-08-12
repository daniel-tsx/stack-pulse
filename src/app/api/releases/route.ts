import { NextResponse } from 'next/server'

import { getAuth } from '@/lib/auth'
import { getReleaseFeedPage, getUserTechIds } from '@/lib/release-feed'
import {
  parseImportanceFilter,
  parseReadFilter,
  parseSearchFilter,
  parseSignalFilter,
  parseTechFilter,
} from '@/lib/release-feed-types'

export async function GET(request: Request) {
  const requestHeaders = request.headers
  const url = new URL(request.url)
  const session = await getAuth().api.getSession({ headers: requestHeaders })
  const importance = parseImportanceFilter(url.searchParams.get('importance') ?? undefined)
  const read = session ? parseReadFilter(url.searchParams.get('read') ?? undefined) : 'all'
  const signal = parseSignalFilter(url.searchParams.get('signal') ?? undefined)
  const tech = parseTechFilter(url.searchParams.get('tech') ?? undefined)
  const search = parseSearchFilter(url.searchParams.get('q') ?? undefined)
  const cursor = url.searchParams.get('cursor')
  const techIds = session ? await getUserTechIds(session.user.id) : null
  const page = await getReleaseFeedPage({
    scope: session
      ? { type: 'user', userId: session.user.id, techIds: techIds ?? [] }
      : { type: 'public' },
    importance,
    read,
    signal,
    tech,
    search,
    cursor,
  })

  return NextResponse.json(page)
}
