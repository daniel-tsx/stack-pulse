import { NextResponse, type NextRequest } from 'next/server'
import { publicReleaseExists } from '@/lib/public-releases'

export async function proxy(request: NextRequest) {
  const segments = request.nextUrl.pathname.split('/')
  if (segments[1] === 'skills') {
    try {
      const slug = decodeURIComponent(segments[2])
      const { SKILL_CATALOG } = await import('@/lib/skill-catalog')
      if (!SKILL_CATALOG.some((skill) => skill.slug === slug)) return missingRelease(request)
      if (segments[3] === 'updates') {
        const { publicSkillUpdateExists } = await import('@/lib/public-skills')
        if (!(await publicSkillUpdateExists(slug, decodeURIComponent(segments[4]))))
          return missingRelease(request)
      }
      return NextResponse.next()
    } catch (error) {
      if (error instanceof URIError) return missingRelease(request)
      throw error
    }
  }
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
      source: '/skills/:slug',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    {
      source: '/skills/:slug/updates/:updateId',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
    {
      source: '/stacks/:slug/releases/:releaseId',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
