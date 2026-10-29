import type { Metadata } from 'next'
import Link from 'next/link'
import { PageIntro } from '@/components/review/review-ui'
import { SkillDate, SkillPanel, SkillShell, UpdateRows } from '@/components/skills/skill-ui'
import { getPublicSkills, skillCheckLabel } from '@/lib/public-skills'

export const metadata: Metadata = {
  title: 'Agent skill updates and behavior impact',
  description:
    'Track ten curated agent skills through source revisions, behavior changes, and evidence-backed update assessments.',
  alternates: { canonical: '/skills' },
  openGraph: {
    title: 'Agent skill updates',
    description: 'Source-linked changes to ten curated agent skills.',
    url: '/skills',
  },
}

export default async function SkillsPage() {
  const { skills, updates } = await getPublicSkills()
  return (
    <SkillShell>
      <PageIntro
        path={[{ label: 'stackpulse', href: '/' }, { label: 'skills' }]}
        state={{ label: 'phase 1', tone: 'neutral' }}
        title="Instructions change. Understand the impact."
        lede="Source changes, potential behavior shifts, and advisory update assessments for ten curated skills. Compare immutable revisions before changing your pinned copy."
      />
      <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line font-mono">
        {[
          ['curated', skills.length],
          ['baselined', skills.filter((s) => s.baselineRevision).length],
          ['recent events', updates.length],
        ].map(([label, value]) => (
          <div key={label} className="bg-shade p-4">
            <p className="text-xs text-dust">{label}</p>
            <p className="mt-2 text-3xl tabular-nums text-lime">{value}</p>
          </div>
        ))}
      </div>
      <SkillPanel title="registry">
        <ul className="grid gap-px bg-line md:grid-cols-2">
          {skills.map((skill) => (
            <li key={skill.slug} className="min-w-0 bg-shade p-5">
              <Link
                href={`/skills/${skill.slug}`}
                className="break-words font-mono text-lg text-ink hover:text-lime"
              >
                {skill.name} ↗
              </Link>
              <p className="mt-2 text-xs text-dust">
                {skill.repository} / {skill.directory}
              </p>
              <p className="mt-3">{skill.description}</p>
              <p
                className={`mt-4 font-mono text-xs ${skill.checkStatus === 'failed' || skill.checkStatus === 'missing' ? 'text-amber' : 'text-dust'}`}
              >
                {skillCheckLabel(skill.checkStatus, skill.baselineRevision)}
              </p>
              <p className="mt-2 font-mono text-xs text-dust">
                revision {skill.observedRevision?.slice(0, 7) ?? '—'} · checked{' '}
                <SkillDate value={skill.lastCheckedAt} />
              </p>
            </li>
          ))}
        </ul>
      </SkillPanel>
      <SkillPanel title="recent_updates">
        <UpdateRows updates={updates} />
      </SkillPanel>
    </SkillShell>
  )
}
