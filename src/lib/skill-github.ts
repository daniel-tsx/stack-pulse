import { z } from 'zod'
import { approvedSkill, type CuratedSkill } from '@/lib/skill-catalog'
import { requestGithubJson, type GithubFetchContext } from '@/lib/github'
import type { SkillEvidence, SkillFile, SkillObservation } from '@/lib/skill-types'

const hash = z.string().regex(/^[a-f0-9]{40}$/)
const entry = z.object({
  path: z.string().max(1024),
  sha: hash,
  type: z.enum(['blob', 'tree', 'commit']),
  mode: z.string(),
  size: z.number().optional(),
})
const treeSchema = z.object({ tree: z.array(entry).max(15000), truncated: z.boolean() })
type Entry = z.infer<typeof entry>
export class SkillEvidenceError extends Error {
  constructor() {
    super('Skill source evidence is unavailable or incomplete')
  }
}

export function createSkillGithub(context: GithubFetchContext) {
  const requests = new Map<string, Promise<unknown>>()
  const json = (path: string, limit?: number) => {
    if (!requests.has(path)) requests.set(path, requestGithubJson(path, context, limit))
    return requests.get(path)!
  }
  async function tree(repository: string, sha: string, recursive = false) {
    const parsed = treeSchema.parse(
      await json(`/repos/${repository}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`),
    )
    if (parsed.truncated) throw new SkillEvidenceError()
    return parsed.tree
  }
  async function observe(input: CuratedSkill): Promise<SkillObservation> {
    const skill = approvedSkill(input)
    // Mutable branch/HEAD responses must be fetched after this skill's lease is
    // acquired. Only SHA-addressed trees and blobs are shared across observations.
    const repo = z
      .object({ default_branch: z.string().min(1).max(256) })
      .parse(await requestGithubJson(`/repos/${skill.repository}`, context))
    const head = z
      .object({ sha: hash, commit: z.object({ tree: z.object({ sha: hash }) }) })
      .parse(
        await requestGithubJson(
          `/repos/${skill.repository}/commits/${encodeURIComponent(repo.default_branch)}`,
          context,
        ),
      )
    let sha = head.commit.tree.sha
    for (const segment of skill.directory.split('/')) {
      const found = (await tree(skill.repository, sha)).find((file) => file.path === segment)
      if (!found || found.type !== 'tree')
        return { revision: head.sha, tree: null, branch: repo.default_branch, hasSkillFile: false }
      sha = found.sha
    }
    const files = await tree(skill.repository, sha)
    return {
      revision: head.sha,
      tree: sha,
      branch: repo.default_branch,
      hasSkillFile: files.some(
        (file) =>
          file.path === 'SKILL.md' &&
          file.type === 'blob' &&
          ['100644', '100755'].includes(file.mode),
      ),
    }
  }
  async function evidence(
    input: CuratedSkill,
    previousTree: string | null,
    newTree: string | null,
  ): Promise<SkillEvidence> {
    const skill = approvedSkill(input)
    const [before, after] = await Promise.all([
      previousTree ? tree(skill.repository, previousTree, true) : Promise.resolve([]),
      newTree ? tree(skill.repository, newTree, true) : Promise.resolve([]),
    ])
    const files = diffSkillTrees(before, after, skill.directory)
    const limitations: string[] = []
    if (files.length > 100) limitations.push('Only the first 100 changed files are listed.')
    let remaining = 24000
    // Prioritize instructions and executable changes in the bounded content sample.
    const selected = files.sort((a, b) => priority(a.path) - priority(b.path)).slice(0, 100)
    for (const file of selected) {
      file.contentComplete = true
      for (const side of ['before', 'after'] as const) {
        const blob = side === 'before' ? file.previousBlob : file.newBlob
        const mode = side === 'before' ? file.previousMode : file.newMode
        const entries = side === 'before' ? before : after
        const size = entries.find((e) => e.sha === blob)?.size
        if (!blob) continue
        if (
          remaining <= 0 ||
          !['100644', '100755'].includes(mode ?? '') ||
          size === undefined ||
          size > 16000
        ) {
          file.contentComplete = false
          continue
        }
        const data = z
          .object({ encoding: z.literal('base64'), content: z.string().max(24000) })
          .parse(await json(`/repos/${skill.repository}/git/blobs/${blob}`, 30000))
        const bytes = Buffer.from(data.content, 'base64')
        if (bytes.includes(0)) {
          file.contentComplete = false
          continue
        }
        const text = bytes.toString('utf8')
        const take = Math.min(4000, remaining)
        file[side] = text.slice(0, take)
        remaining -= file[side]!.length
        if (text.length > take) file.contentComplete = false
      }
    }
    if (selected.some((file) => !file.contentComplete))
      limitations.push(
        'Some source content was omitted (size, binary, symlink, submodule, or input budget).',
      )
    return {
      files: selected,
      complete: limitations.length === 0,
      limitations,
      totalChangedFiles: files.length,
    }
  }
  return { observe, evidence }
}

function priority(path: string) {
  return path.endsWith('/SKILL.md') ? 0 : /\/scripts\//.test(path) ? 1 : 2
}

export function diffSkillTrees(before: Entry[], after: Entry[], directory: string): SkillFile[] {
  const old = new Map(before.filter((e) => e.type !== 'tree').map((e) => [e.path, e]))
  const next = new Map(after.filter((e) => e.type !== 'tree').map((e) => [e.path, e]))
  const result: SkillFile[] = []
  for (const path of [...new Set([...old.keys(), ...next.keys()])].sort()) {
    const a = old.get(path),
      b = next.get(path)
    if (a?.sha === b?.sha && a?.mode === b?.mode) continue
    result.push({
      path: `${directory}/${path}`,
      status: !a ? 'added' : !b ? 'deleted' : 'modified',
      previousPath: null,
      previousBlob: a?.sha ?? null,
      newBlob: b?.sha ?? null,
      previousMode: a?.mode ?? null,
      newMode: b?.mode ?? null,
      before: null,
      after: null,
      contentComplete: false,
    })
  }
  // Exact-blob renames are certain; edited renames remain an honest add/delete pair.
  for (const added of result.filter((f) => f.status === 'added')) {
    const deleted = result.find(
      (f) =>
        f.status === 'deleted' &&
        f.previousBlob === added.newBlob &&
        f.previousMode === added.newMode,
    )
    if (deleted) {
      added.status = 'renamed'
      added.previousPath = deleted.path
      added.previousBlob = deleted.previousBlob
      added.previousMode = deleted.previousMode
      result.splice(result.indexOf(deleted), 1)
    }
  }
  return result
}
