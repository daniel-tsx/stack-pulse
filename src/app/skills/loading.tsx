import { SkillPanel, SkillShell } from '@/components/skills/skill-ui'
export default function Loading() {
  return (
    <SkillShell>
      <p role="status" className="font-mono text-lime">
        reading skill revisions…
      </p>
      <SkillPanel title="loading">
        <div className="h-8 w-2/3 bg-lift" />
        <div className="h-4 w-full bg-lift" />
        <div className="h-4 w-3/4 bg-lift" />
      </SkillPanel>
    </SkillShell>
  )
}
