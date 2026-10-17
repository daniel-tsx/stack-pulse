import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTs } from './release-test-helpers.mjs'

const { safeReturnPath } = loadTs('src/lib/auth-return-path.ts')
const id = '550e8400-e29b-41d4-a716-446655440000'
const returnPath = `/stacks/nextjs/releases/${id}`
const session = { user: { id: 'alice', email: 'alice@example.test' } }
const empty = { score: 0, upvotes: 0, downvotes: 0, myVote: 0 }

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat().flatMap(nodes)]
}

function ui({
  user = null,
  sessionPending = false,
  data,
  fetching = false,
  failed = false,
  save,
} = {}) {
  const hooks = []
  let index = 0
  const paths = []
  const writes = []
  let reads = 0
  const query = {
    data,
    isPending: !data && !failed,
    isFetching: fetching,
    isError: failed,
    refetch: async () => {
      reads++
      return { isError: query.isError }
    },
  }
  const auth = { data: user, isPending: sessionPending }
  const { ReleaseVote } = loadTs(
    'src/components/releases/release-vote.tsx',
    {
      react: {
        useRef(initial) {
          const slot = index++
          return (hooks[slot] ??= { current: initial })
        },
        useState(initial) {
          const slot = index++
          if (!(slot in hooks)) hooks[slot] = initial
          return [
            hooks[slot],
            (value) => {
              hooks[slot] = value
            },
          ]
        },
      },
      '@tanstack/react-query': {
        useQuery: () => query,
        useQueryClient: () => ({
          cancelQueries: async () => {},
          setQueryData: (_, state) => {
            query.data = state
          },
        }),
      },
      '@/lib/auth-client': { useSession: () => auth },
      '@/lib/auth-return-path': { safeReturnPath },
      '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
      'next/link': { __esModule: true, default: 'a' },
      'next/navigation': { useRouter: () => ({ push: (path) => paths.push(path) }) },
      'hugeicons-react': {},
    },
    {
      AbortSignal,
      fetch: async (url, options) => {
        writes.push({ url, value: JSON.parse(options.body).value })
        return save ? save() : Response.json({ ...empty, score: 1, upvotes: 1, myVote: 1 })
      },
    },
  )
  const render = () => {
    index = 0
    return ReleaseVote({ releaseId: id, returnPath })
  }
  const button = (value) => nodes(render()).find((node) => node.props?.['aria-label'] === value)
  return {
    render,
    button,
    paths,
    writes,
    query,
    get reads() {
      return reads
    },
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('anonymous votes remain actionable when totals fail, with an explicit safe sign-in link', () => {
  const view = ui({ failed: true })
  for (const name of ['Upvote', 'Downvote']) {
    const button = view.button(name)
    assert.equal(button.props.disabled, false)
    assert.match(button.props.className, /cursor-pointer/)
    button.props.onClick()
  }
  assert.deepEqual(view.paths, Array(2).fill(`/sign-in?returnTo=${encodeURIComponent(returnPath)}`))
  assert.equal(view.writes.length, 0)
  const tree = nodes(view.render())
  assert.ok(
    tree.some((node) => node.type === 'a' && node.props.children === 'Sign in with GitHub to vote'),
  )
  assert.equal(
    tree.find((node) => node.props?.['aria-label'] === 'Net vote score').props.children,
    '—',
  )
  assert.equal(tree[0].props['aria-busy'], false)
})

test('anonymous sign-in does not wait for the public vote request', () => {
  const view = ui({ fetching: true })
  assert.equal(view.button('Upvote').props.disabled, false)
  assert.match(view.button('Upvote').props.className, /cursor-pointer/)
  view.button('Upvote').props.onClick()
  assert.equal(view.paths.length, 1)
  assert.equal(view.writes.length, 0)
})

test('authenticated read failure is unavailable, not permanently loading, and offers retry', () => {
  const view = ui({ user: session, failed: true })
  const button = view.button('Upvote')
  assert.equal(button.props.disabled, true)
  assert.match(button.props.className, /cursor-not-allowed/)
  assert.doesNotMatch(button.props.className, /cursor-wait/)
  const retry = nodes(view.render()).find(
    (node) => node.type === 'button' && node.props.children === 'reload votes',
  )
  assert.equal(retry.props.disabled, false)
  retry.props.onClick()
  assert.equal(view.reads, 1)
  assert.equal(view.writes.length, 0)
})

test('initial authenticated read has a wait cursor only until the request finishes', () => {
  const view = ui({ user: session, fetching: true })
  assert.equal(view.button('Upvote').props.disabled, true)
  assert.match(view.button('Upvote').props.className, /cursor-wait/)
  Object.assign(view.query, { isFetching: false, isPending: false, isError: true })
  assert.doesNotMatch(view.button('Upvote').props.className, /cursor-wait/)
  assert.equal(view.render().props['aria-busy'], false)
})

test('a pending write locks duplicate clicks and unlocks with the authoritative response', async () => {
  let finish
  let requests = 0
  const response = new Promise((resolve) => {
    finish = resolve
  })
  const view = ui({
    user: session,
    data: empty,
    save: () => (++requests === 1 ? response : Response.json(empty)),
  })
  view.button('Upvote').props.onClick()
  view.button('Upvote').props.onClick()
  await settle()
  assert.equal(view.writes.length, 1)
  assert.equal(view.button('Downvote').props.disabled, true)
  assert.match(view.button('Downvote').props.className, /cursor-wait/)
  finish(Response.json({ ...empty, score: 1, upvotes: 1, myVote: 1 }))
  await settle()
  assert.equal(view.button('Upvote').props.disabled, false)
  assert.match(view.button('Upvote').props.className, /cursor-pointer/)
  assert.equal(view.button('Upvote').props['aria-pressed'], true)
  view.button('Upvote').props.onClick()
  await settle()
  assert.equal(view.writes[1].value, 0)
  assert.equal(view.button('Upvote').props['aria-pressed'], false)
})

test('failed writes and reconciliation clear the pending state without fabricating totals', async () => {
  const view = ui({
    user: session,
    data: { ...empty, score: 3, upvotes: 3 },
    failed: false,
    save: () => new Response('', { status: 500 }),
  })
  view.query.refetch = async () => {
    view.query.isError = true
    return { isError: true }
  }
  view.button('Downvote').props.onClick()
  await settle()
  assert.equal(view.render().props['aria-busy'], false)
  assert.doesNotMatch(view.button('Downvote').props.className, /cursor-wait/)
  assert.equal(view.query.data.score, 3)
  assert.ok(nodes(view.render()).some((node) => node.props?.role === 'alert'))
})

test('release header reuses the account menu or shows sign-in with a safe return path', () => {
  let user = null
  const { ReleaseAuth } = loadTs('src/components/releases/release-auth.tsx', {
    'next/link': { __esModule: true, default: 'a' },
    '@/components/dashboard/user-menu': { UserMenu: 'ExistingUserMenu' },
    '@/lib/auth-client': { useSession: () => ({ data: user }) },
    '@/lib/auth-return-path': { safeReturnPath },
  })
  assert.equal(
    ReleaseAuth({ returnPath }).props.href,
    `/sign-in?returnTo=${encodeURIComponent(returnPath)}`,
  )
  assert.equal(
    ReleaseAuth({ returnPath: '//external.invalid' }).props.href,
    '/sign-in?returnTo=%2Fdashboard',
  )
  user = session
  const menu = ReleaseAuth({ returnPath })
  assert.equal(menu.type, 'ExistingUserMenu')
  assert.equal(menu.props.email, session.user.email)
})
