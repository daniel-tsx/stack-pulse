export type CuratedSkill = {
  name: string
  slug: string
  repository: string
  directory: string
  description: string
}

// Explicit allowlist. Source files are data, never installed or executed.
export const SKILL_CATALOG: readonly CuratedSkill[] = [
  {
    name: 'ponytail',
    slug: 'ponytail',
    repository: 'DietrichGebert/ponytail',
    directory: 'skills/ponytail',
    description: 'Focused implementation with the smallest complete solution.',
  },
  {
    name: 'ponytail-review',
    slug: 'ponytail-review',
    repository: 'DietrichGebert/ponytail',
    directory: 'skills/ponytail-review',
    description: 'Review changes for correctness and unnecessary complexity.',
  },
  {
    name: 'grilling',
    slug: 'grilling',
    repository: 'mattpocock/skills',
    directory: 'skills/productivity/grilling',
    description: 'Stress-test plans and decisions through questions.',
  },
  {
    name: 'grill-me',
    slug: 'grill-me',
    repository: 'mattpocock/skills',
    directory: 'skills/productivity/grill-me',
    description: 'Explore assumptions and tradeoffs in a proposed plan.',
  },
  {
    name: 'systematic-debugging',
    slug: 'systematic-debugging',
    repository: 'obra/superpowers',
    directory: 'skills/systematic-debugging',
    description: 'Investigate root causes before proposing fixes.',
  },
  {
    name: 'test-driven-development',
    slug: 'test-driven-development',
    repository: 'obra/superpowers',
    directory: 'skills/test-driven-development',
    description: 'Develop behavior through a test-first workflow.',
  },
  {
    name: 'supabase-postgres-best-practices',
    slug: 'supabase-postgres-best-practices',
    repository: 'supabase/agent-skills',
    directory: 'skills/supabase-postgres-best-practices',
    description: 'PostgreSQL schema and query guidance.',
  },
  {
    name: 'vercel-react-best-practices',
    slug: 'vercel-react-best-practices',
    repository: 'vercel-labs/agent-skills',
    directory: 'skills/react-best-practices',
    description: 'React and Next.js performance guidance.',
  },
  {
    name: 'web-design-guidelines',
    slug: 'web-design-guidelines',
    repository: 'vercel-labs/agent-skills',
    directory: 'skills/web-design-guidelines',
    description: 'Review web interfaces and accessibility.',
  },
  {
    name: 'skill-creator',
    slug: 'skill-creator',
    repository: 'anthropics/skills',
    directory: 'skills/skill-creator',
    description: 'Create, evaluate, and improve agent skills.',
  },
]

export function validateCatalog(catalog: readonly CuratedSkill[] = SKILL_CATALOG) {
  const identities = new Set<string>()
  const slugs = new Set<string>()
  for (const skill of catalog) {
    if (
      !/^[\w-]+\/[\w.-]+$/.test(skill.repository) ||
      !/^[a-z0-9-]+$/.test(skill.slug) ||
      !skill.directory
        .split('/')
        .every((part) => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')
    )
      throw new Error('Invalid curated skill')
    const identity = `${skill.repository.toLowerCase()}/${skill.directory}`
    if (identities.has(identity) || slugs.has(skill.slug))
      throw new Error('Duplicate curated skill')
    identities.add(identity)
    slugs.add(skill.slug)
  }
  return catalog
}

export function approvedSkill(skill: Pick<CuratedSkill, 'slug' | 'repository' | 'directory'>) {
  const approved = SKILL_CATALOG.find((entry) => entry.slug === skill.slug)
  if (
    !approved ||
    approved.repository.toLowerCase() !== skill.repository.toLowerCase() ||
    approved.directory !== skill.directory
  )
    throw new Error('Unapproved skill source')
  return approved
}

export function skillSourceUrl(skill: CuratedSkill, revision = 'HEAD') {
  return `https://github.com/${skill.repository}/tree/${encodeURIComponent(revision)}/${skill.directory}`
}
