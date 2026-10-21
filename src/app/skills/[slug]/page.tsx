import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SkillDate, SkillPanel, SkillShell, UpdateRows } from '@/components/skills/skill-ui'
import { SKILL_CATALOG, skillSourceUrl } from '@/lib/skill-catalog'
import { getPublicSkill, skillCheckLabel } from '@/lib/public-skills'

type Props = { params: Promise<{ slug: string }> }
export function generateStaticParams() {
  return SKILL_CATALOG.map((skill) => ({ slug: skill.slug }))
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const skill = SKILL_CATALOG.find((skill) => skill.slug === slug)
  return skill
    ? {
        title: `${skill.name} skill updates`,
        description: skill.description,
        alternates: { canonical: `/skills/${slug}` },
      }
    : { title: 'Skill not found', robots: { index: false } }
}

export default async function SkillPage({ params }: Props) {
  const { slug } = await params
  const data = await getPublicSkill(slug)
  if (!data) notFound()
  const { skill, updates } = data
  return (
    <SkillShell>
      <Link href="/skills" className="font-mono text-xs text-lime hover:underline">
        ← all skills
      </Link>
      <h1 className="mt-6 break-words font-mono text-3xl font-semibold text-ink sm:text-5xl">
        {skill.name}
        <span className="text-lime">.</span>
      </h1>
      <p className="mt-4 text-dust">{skill.description}</p>
      <SkillPanel title={`${skill.slug}/source`}>
        <p className="font-mono text-xs">
          {skill.repository}
          <br />
          {skill.directory}
        </p>
        <p className="text-amber">{skillCheckLabel(skill.checkStatus, skill.baselineRevision)}</p>
        <dl className="grid gap-3 font-mono text-xs sm:grid-cols-2">
          <div>
            <dt>latest observed revision</dt>
            <dd className="mt-1 break-all text-ink">
              {skill.observedRevision ?? 'Not observed yet'}
            </dd>
          </div>
          <div>
            <dt>last attempted check</dt>
            <dd className="mt-1 text-ink">
              <SkillDate value={skill.lastCheckedAt} />
            </dd>
          </div>
          <div>
            <dt>last successful observation</dt>
            <dd className="mt-1 text-ink">
              <SkillDate value={skill.lastSuccessAt} />
            </dd>
          </div>
        </dl>
        <a
          href={skillSourceUrl(skill, skill.observedRevision ?? 'HEAD')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-lime hover:underline"
        >
          view source on github ↗
        </a>
        <p>
          Polling combines changes since the last observation. Intermediate commits are not
          individually monitored. A baseline is not an update report.
        </p>
      </SkillPanel>
      <SkillPanel title={`${skill.slug}/history`}>
        <UpdateRows slug={slug} updates={updates} />
      </SkillPanel>
    </SkillShell>
  )
}
