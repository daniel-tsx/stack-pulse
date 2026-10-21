import { and, asc, eq, inArray, lt, ne, or, sql } from 'drizzle-orm'
import { getDb } from '@/db'
import { agentSkills, agentSkillUpdates } from '@/db/schema'
import { SKILL_CATALOG, skillSourceUrl, validateCatalog } from '@/lib/skill-catalog'
import type { SkillObservation } from '@/lib/skill-types'

export type StoredSkill = typeof agentSkills.$inferSelect
export type StoredSkillUpdate = typeof agentSkillUpdates.$inferSelect

export async function seedSkills() {
  for (const skill of validateCatalog()) {
    await getDb()
      .insert(agentSkills)
      .values({
        ...skill,
        repository: skill.repository.toLowerCase(),
        sourceUrl: skillSourceUrl(skill),
      })
      .onConflictDoUpdate({
        target: [agentSkills.repository, agentSkills.directory],
        set: {
          name: skill.name,
          slug: skill.slug,
          description: skill.description,
          sourceUrl: skillSourceUrl(skill),
        },
      })
  }
}

export async function resetFailedSkillAnalyses() {
  // Lock skill rows before reset so a concurrent cron cannot acquire halfway through.
  const result = await getDb().execute(sql`
    with eligible as (select id from agent_skills where ${inArray(
      agentSkills.slug,
      SKILL_CATALOG.map((s) => s.slug),
    )}
      and (lease_until is null or lease_until < now()) for update skip locked)
    update agent_skill_updates u set analysis_status='pending', analysis_attempts=0, analysis_error=null
    from eligible where u.skill_id=eligible.id and u.analysis_status in ('failed', 'analyzing') returning u.id`)
  return result.rows.length
}

export function createSkillStore(signal?: AbortSignal) {
  const db = getDb(signal)
  const owned = (id: string, token: string) =>
    and(
      eq(agentSkills.id, id),
      eq(agentSkills.leaseToken, token),
      sql`${agentSkills.leaseUntil} > now()`,
    )
  return {
    list: () =>
      db
        .select()
        .from(agentSkills)
        .where(
          and(
            eq(agentSkills.tracking, true),
            inArray(
              agentSkills.slug,
              SKILL_CATALOG.map((s) => s.slug),
            ),
          ),
        )
        .orderBy(sql`${agentSkills.lastCheckedAt} asc nulls first`),
    async acquire(id: string, token: string) {
      const [row] = await db
        .update(agentSkills)
        .set({ leaseToken: token, leaseUntil: sql`now() + interval '6 minutes'` })
        .where(
          and(
            eq(agentSkills.id, id),
            or(sql`${agentSkills.leaseUntil} is null`, sql`${agentSkills.leaseUntil} < now()`),
          ),
        )
        .returning()
      return row ?? null
    },
    async observe(skill: StoredSkill, token: string, next: SkillObservation) {
      // Event insertion and checkpoint advancement share one statement and row lock.
      // A lost/uncertain HTTP response can be retried without losing the durable event.
      const result = await db.execute(sql`
        with owned as (
          select * from agent_skills where id = ${skill.id} and lease_token = ${token}::uuid and lease_until > now() for update
        ), event as (
          insert into agent_skill_updates (skill_id, previous_revision, new_revision, previous_tree, new_tree)
          select id, observed_revision, ${next.revision}, observed_tree, ${next.tree} from owned
          where baseline_revision is not null and observed_tree is distinct from ${next.tree}
          on conflict (skill_id, previous_revision, new_revision) do nothing returning id
        )
        update agent_skills s set
          baseline_revision = coalesce(s.baseline_revision, ${next.tree && next.hasSkillFile ? next.revision : null}),
          observed_revision = case when s.baseline_revision is not null or ${Boolean(next.tree && next.hasSkillFile)} then ${next.revision} else s.observed_revision end,
          observed_tree = case when s.baseline_revision is not null or ${Boolean(next.tree && next.hasSkillFile)} then ${next.tree} else s.observed_tree end,
          branch = ${next.branch}, check_status = case when ${Boolean(next.tree && next.hasSkillFile)} then case when owned.baseline_revision is not null and owned.observed_tree is distinct from ${next.tree} then 'changed' else 'ok' end else 'missing' end, check_error = null,
          last_checked_at = now(), last_success_at = now(), updated_at = now()
        from owned where s.id = owned.id
        returning (select count(*)::int from event) as inserted`)
      return Number(result.rows[0]?.inserted ?? 0)
    },
    async checkFailed(id: string, token: string, category: string) {
      await db
        .update(agentSkills)
        .set({
          checkStatus: 'failed',
          checkError: category,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(owned(id, token))
    },
    pending: (id: string) =>
      db
        .select()
        .from(agentSkillUpdates)
        .where(
          and(
            eq(agentSkillUpdates.skillId, id),
            ne(agentSkillUpdates.analysisStatus, 'complete'),
            lt(agentSkillUpdates.analysisAttempts, 3),
          ),
        )
        .orderBy(asc(agentSkillUpdates.createdAt))
        .limit(1),
    async recoverInterrupted(id: string, token: string) {
      await db
        .update(agentSkillUpdates)
        .set({ analysisStatus: 'failed', analysisError: 'INTERRUPTED_ANALYSIS' })
        .where(
          and(
            eq(agentSkillUpdates.skillId, id),
            eq(agentSkillUpdates.analysisStatus, 'analyzing'),
            sql`exists (select 1 from agent_skills where ${owned(id, token)})`,
          ),
        )
    },
    async saveUpdate(
      skillId: string,
      token: string,
      id: string,
      values: Partial<typeof agentSkillUpdates.$inferInsert>,
    ) {
      const rows = await db
        .update(agentSkillUpdates)
        .set(values)
        .where(
          and(
            eq(agentSkillUpdates.id, id),
            eq(agentSkillUpdates.skillId, skillId),
            sql`exists (select 1 from agent_skills where ${owned(skillId, token)})`,
          ),
        )
        .returning({ id: agentSkillUpdates.id })
      if (!rows.length) throw new Error('Skill lease expired')
    },
    async release(id: string, token: string) {
      await db
        .update(agentSkills)
        .set({ leaseToken: null, leaseUntil: null })
        .where(and(eq(agentSkills.id, id), eq(agentSkills.leaseToken, token)))
    },
  }
}
