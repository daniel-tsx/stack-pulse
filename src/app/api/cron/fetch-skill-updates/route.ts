import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { ingestSkillUpdates, skillFailureCategory } from '@/lib/skill-ingestion'

export const maxDuration = 300

export async function GET(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await ingestSkillUpdates(new URL(request.url).searchParams.get('dryRun') === '1')
    console.info('skill cron completed', result)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const category = skillFailureCategory(error)
    console.error('skill cron failed', { category })
    return NextResponse.json({ error: category }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
