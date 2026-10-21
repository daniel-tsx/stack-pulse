import { and, desc, eq, inArray } from 'drizzle-orm'
import { cacheLife } from 'next/cache'
import { getDb } from '@/db'
import { agentSkills, agentSkillUpdates } from '@/db/schema'
import { SKILL_CATALOG, skillSourceUrl } from '@/lib/skill-catalog'

export async function getPublicSkills() {
  'use cache'
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 })
  const rows = await getDb()
    .select({
      slug: agentSkills.slug,
      observedRevision: agentSkills.observedRevision,
      checkStatus: agentSkills.checkStatus,
      lastCheckedAt: agentSkills.lastCheckedAt,
      lastSuccessAt: agentSkills.lastSuccessAt,
      baselineRevision: agentSkills.baselineRevision,
    })
    .from(agentSkills)
    .where(
      inArray(
        agentSkills.slug,
        SKILL_CATALOG.map((s) => s.slug),
      ),
    )
  const updates = await getDb()
    .select({
      id: agentSkillUpdates.id,
      slug: agentSkills.slug,
      previousRevision: agentSkillUpdates.previousRevision,
      newRevision: agentSkillUpdates.newRevision,
      analysisStatus: agentSkillUpdates.analysisStatus,
      report: agentSkillUpdates.report,
      createdAt: agentSkillUpdates.createdAt,
    })
    .from(agentSkillUpdates)
    .innerJoin(agentSkills, eq(agentSkills.id, agentSkillUpdates.skillId))
    .where(
      inArray(
        agentSkills.slug,
        SKILL_CATALOG.map((s) => s.slug),
      ),
    )
    .orderBy(desc(agentSkillUpdates.createdAt), desc(agentSkillUpdates.id))
    .limit(30)
  return {
    skills: SKILL_CATALOG.map((source) => ({
      ...source,
      sourceUrl: skillSourceUrl(source),
      observedRevision: null,
      checkStatus: 'not_checked',
      lastCheckedAt: null,
      lastSuccessAt: null,
      baselineRevision: null,
      ...rows.find((row) => row.slug === source.slug),
    })),
    updates,
  }
}

export async function getPublicSkill(slug: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 })
  const source = SKILL_CATALOG.find((skill) => skill.slug === slug)
  if (!source) return null
  const { skills } = await getPublicSkills()
  const updates = await getDb()
    .select({
      id: agentSkillUpdates.id,
      previousRevision: agentSkillUpdates.previousRevision,
      newRevision: agentSkillUpdates.newRevision,
      analysisStatus: agentSkillUpdates.analysisStatus,
      report: agentSkillUpdates.report,
      createdAt: agentSkillUpdates.createdAt,
    })
    .from(agentSkillUpdates)
    .innerJoin(agentSkills, eq(agentSkills.id, agentSkillUpdates.skillId))
    .where(eq(agentSkills.slug, slug))
    .orderBy(desc(agentSkillUpdates.createdAt), desc(agentSkillUpdates.id))
    .limit(30)
  return { skill: skills.find((skill) => skill.slug === slug)!, updates }
}

export async function getPublicSkillUpdate(slug: string, id: string) {
  'use cache'
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 })
  const source = SKILL_CATALOG.find((skill) => skill.slug === slug)
  if (!source || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
    return null
  const [row] = await getDb()
    .select({ update: agentSkillUpdates })
    .from(agentSkillUpdates)
    .innerJoin(agentSkills, eq(agentSkills.id, agentSkillUpdates.skillId))
    .where(and(eq(agentSkills.slug, slug), eq(agentSkillUpdates.id, id)))
    .limit(1)
  return row ? { skill: source, update: row.update } : null
}

export async function publicSkillUpdateExists(slug: string, id: string) {
  if (
    !SKILL_CATALOG.some((skill) => skill.slug === slug) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    return false
  const [row] = await getDb()
    .select({ id: agentSkillUpdates.id })
    .from(agentSkillUpdates)
    .innerJoin(agentSkills, eq(agentSkills.id, agentSkillUpdates.skillId))
    .where(and(eq(agentSkills.slug, slug), eq(agentSkillUpdates.id, id)))
    .limit(1)
  return Boolean(row)
}

export function skillCheckLabel(status: string, baseline: string | null) {
  if (status === 'failed') return 'Check failed · last known revision retained'
  if (status === 'missing') return 'Skill path or SKILL.md missing · review source'
  if (!baseline || status === 'not_checked') return 'Not checked yet'
  if (status === 'changed') return 'Update detected · see history'
  return 'No update detected at last check'
}

export function skillAnalysisLabel(status: string) {
  return status === 'complete'
    ? 'Analysis complete'
    : status === 'failed'
      ? 'Analysis failed · report unavailable'
      : 'Analysis pending'
}
