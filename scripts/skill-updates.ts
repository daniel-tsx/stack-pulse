import { SKILL_CATALOG } from '../src/lib/skill-catalog'

async function main() {
  const args = process.argv.slice(2)
  if (
    args.length !== 1 ||
    !['--seed', '--preview', '--ingest', '--retry-failed'].includes(args[0])
  ) {
    console.error('Usage: pnpm skills --seed | --preview | --ingest | --retry-failed')
    process.exitCode = 1
  } else {
    try {
      if (args[0] === '--seed') {
        const { seedSkills } = await import('../src/lib/skill-store')
        await seedSkills()
        console.info('Curated skills seeded', { count: SKILL_CATALOG.length })
      } else if (args[0] === '--retry-failed') {
        const { resetFailedSkillAnalyses } = await import('../src/lib/skill-store')
        console.info('Failed skill analyses reset', { count: await resetFailedSkillAnalyses() })
      } else {
        const { ingestSkillUpdates } = await import('../src/lib/skill-ingestion')
        console.info(await ingestSkillUpdates(args[0] === '--preview'))
      }
    } catch {
      console.error('Skill operation failed; check configuration and isolated database setup.')
      process.exitCode = 1
    }
  }
}
void main()
