import { loadTs } from './release-test-helpers.mjs'

export const snapshotHash = (n) => String(n).repeat(40)
const catalog = loadTs('src/lib/skill-catalog.ts')
const sources = catalog.SKILL_CATALOG.slice(0, 2)

// Exercise the real ingestion, detector and GitHub transport; only HTTP, AI and
// persistence are boundaries. The SQL suite supplies the actual store instead.
export async function interleaveSkillSnapshots(store, { interruptHead = false, expireLease } = {}) {
  const skills = (await store.list())
    .filter((row) => sources.some((source) => source.slug === row.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))
  const target = skills[1]
  let unblock, reached
  const paused = new Promise((resolve) => {
    reached = resolve
  })
  const resume = new Promise((resolve) => {
    unblock = resolve
  })
  let head = '1',
    branch = 'main',
    headRequests = 0,
    held = false
  const rootA = snapshotHash(7),
    rootB = snapshotHash(8)
  const parentA = snapshotHash(9),
    parentB = snapshotHash('a')
  const leafA = snapshotHash(3),
    leafB = snapshotHash(4)
  const makeEntry = (path, sha, type = 'tree') => ({
    path,
    sha,
    type,
    mode: type === 'tree' ? '040000' : '100644',
    size: 20,
  })
  const quiet = { warn() {}, info() {} }
  const budget = loadTs(
    'src/lib/execution-budget.ts',
    {},
    { performance, AbortSignal, AbortController, setTimeout, clearTimeout },
  )

  function ingestion(older) {
    const github = loadTs(
      'src/lib/github.ts',
      { '@/lib/execution-budget': budget },
      {
        Buffer,
        AbortSignal,
        process: { env: { GITHUB_TOKEN: 'test-only' } },
        console: quiet,
        fetch: async (url) => {
          const path = new URL(url).pathname
          if (/\/commits\/(main|rewrite)$/.test(path)) {
            headRequests++
            const revision = head
            if (older && interruptHead && !held) {
              held = true
              reached()
              await resume
            }
            return Response.json({
              sha: snapshotHash(revision),
              commit: { tree: { sha: revision === '1' ? rootA : rootB } },
            })
          }
          if (path.endsWith('/git/blobs/' + snapshotHash(5)))
            return Response.json({
              encoding: 'base64',
              content: Buffer.from('Old skill instruction').toString('base64'),
            })
          if (path.endsWith('/git/blobs/' + snapshotHash(6)))
            return Response.json({
              encoding: 'base64',
              content: Buffer.from('New skill instruction').toString('base64'),
            })
          const sha = path.split('/').at(-1)
          const trees = {
            [rootA]: [makeEntry('skills', parentA)],
            [rootB]: [makeEntry('skills', parentB)],
            [parentA]: sources.map((source) =>
              makeEntry(source.directory.split('/').at(-1), leafA),
            ),
            [parentB]: sources.map((source) =>
              makeEntry(source.directory.split('/').at(-1), leafB),
            ),
            [leafA]: [makeEntry('SKILL.md', snapshotHash(5), 'blob')],
            [leafB]: [makeEntry('SKILL.md', snapshotHash(6), 'blob')],
          }
          if (trees[sha]) return Response.json({ tree: trees[sha], truncated: false })
          if (path === `/repos/${sources[0].repository}/`)
            return Response.json({ default_branch: branch })
          throw new Error('Unexpected fixture request')
        },
      },
    )
    const detector = loadTs(
      'src/lib/skill-github.ts',
      { '@/lib/skill-catalog': catalog, '@/lib/github': github },
      { Buffer },
    )
    class AnalysisFailure extends Error {}
    return loadTs(
      'src/lib/skill-ingestion.ts',
      {
        '@/lib/skill-catalog': catalog,
        '@/lib/github': github,
        '@/lib/skill-github': detector,
        '@/lib/execution-budget': budget,
        '@/lib/ai-resilience': {
          AiProviderError: AnalysisFailure,
          createAiExecutionContext: () => ({ stats: {} }),
        },
        '@/lib/skill-analysis': {
          SkillAnalysisFailure: AnalysisFailure,
          analyzeSkillUpdate: async () => ({
            report: { summary: 'Test report', recommendation: 'insufficient_evidence' },
            telemetry: { attempts: 1 },
          }),
        },
        '@/lib/skill-store': {
          createSkillStore: () => ({
            ...store,
            list: async () =>
              (await store.list())
                .filter((row) => skills.some((skill) => skill.id === row.id))
                .sort((a, b) => a.slug.localeCompare(b.slug)),
            acquire: async (id, token) => {
              if (older && !interruptHead && id === target.id && !held) {
                held = true
                reached()
                await resume
              }
              return store.acquire(id, token)
            },
          }),
        },
      },
      { performance, AbortSignal, console: quiet },
    )
  }
  const older = ingestion(true),
    newer = ingestion(false)
  const oldRun = older.ingestSkillUpdates()
  await paused
  head = '2'
  let newerResult
  try {
    if (expireLease) await expireLease(skills[0].id)
    newerResult = await newer.ingestSkillUpdates()
  } finally {
    unblock()
  }
  const olderResult = await oldRun
  return {
    olderResult,
    newerResult,
    headRequests,
    targetId: target.id,
    firstId: skills[0].id,
    rewind: async () => {
      head = '1'
      branch = 'rewrite'
      return newer.ingestSkillUpdates()
    },
  }
}

export function memorySnapshotStore() {
  const rows = sources.map((source, i) => ({
    ...source,
    id: `skill-${i}`,
    repository: source.repository.toLowerCase(),
    baselineRevision: snapshotHash(1),
    observedRevision: snapshotHash(1),
    observedTree: snapshotHash(3),
    token: null,
  }))
  const events = []
  const store = {
    list: async () => rows.map((row) => ({ ...row })),
    acquire: async (id, token) => {
      const row = rows.find((row) => row.id === id)
      if (row.token) return null
      row.token = token
      return { ...row }
    },
    recoverInterrupted: async () => {},
    observe: async (skill, token, next) => {
      const row = rows.find((row) => row.id === skill.id)
      if (row.token !== token) return 0
      const changed = row.observedTree !== next.tree
      if (changed)
        events.push({
          skillId: row.id,
          previousRevision: row.observedRevision,
          newRevision: next.revision,
        })
      row.observedRevision = next.revision
      row.observedTree = next.tree
      row.branch = next.branch
      return Number(changed)
    },
    checkFailed: async () => {},
    pending: async () => [],
    release: async (id, token) => {
      const row = rows.find((row) => row.id === id)
      if (row.token === token) row.token = null
    },
  }
  return { store, rows, events }
}
