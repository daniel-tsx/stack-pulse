import { NextResponse, type NextRequest } from 'next/server'
import { publicReleaseExists } from '@/lib/public-releases'

export async function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/')
  let slug: string, releaseId: string
  try {
    slug = decodeURIComponent(segments[2])
    releaseId = decodeURIComponent(segments[4])
  } catch {
    return missingRelease(request)
  }
  if (await publicReleaseExists(slug, releaseId)) return NextResponse.next()
  return missingRelease(request)
}

function missingRelease(request: NextRequest) {
  // Reuse the existing branded 404. Set status before Next.js can stream its
  // loading shell; notFound() inside a streamed page cannot change HTTP 200.
  return NextResponse.rewrite(new URL('/_not-found', request.url), {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export const config = {
  matcher: [
    {
      source: '/stacks/:slug/releases/:releaseId',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
