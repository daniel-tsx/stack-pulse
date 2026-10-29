import { SkillPanel, SkillShell } from '@/components/skills/skill-ui'
import { PulseLoader } from '@/components/ui/pulse-loader'
export default function Loading() {
  return (
    <SkillShell>
      <PulseLoader size="sm" label="reading skill revisions" />
      <SkillPanel title="loading">
        <div className="skeleton h-8 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
      </SkillPanel>
    </SkillShell>
  )
}
