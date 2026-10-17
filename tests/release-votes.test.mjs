import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { loadTs } from './release-test-helpers.mjs'

const { safeReturnPath } = loadTs('src/lib/auth-return-path.ts')
const types = loadTs('src/lib/release-vote-types.ts')
const id = '550e8400-e29b-41d4-a716-446655440000'

test('the 404 proxy is scoped to release pages, skips prefetch and preserves branded missing responses', async () => {
  const { unstable_doesMiddlewareMatch } = createRequire(import.meta.url)(
    'next/experimental/testing/server',
  )
  const lookups = []
  const { proxy, config } = loadTs('src/proxy.ts', {
    '@/lib/public-releases': {
      publicReleaseExists: async (...args) => {
        lookups.push(args)
        return args[0] === 'nextjs'
      },
    },
  })
  const url = `https://stackpulse.test/stacks/nextjs/releases/${id}`
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true)
  for (const path of ['/dashboard', '/stacks/nextjs', `/api/releases/${id}/vote`]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }), false)
  }
  assert.equal(
    unstable_doesMiddlewareMatch({
      config,
      nextConfig: {},
      url,
      headers: { 'next-router-prefetch': '1' },
    }),
    false,
  )
  const request = (url) => ({ url, nextUrl: new URL(url) })
  assert.equal((await proxy(request(url))).headers.get('x-middleware-next'), '1')
  const missing = await proxy(request(url.replace('nextjs', 'other')))
  assert.equal(missing.status, 404)
  assert.equal(missing.headers.get('cache-control'), 'no-store')
  assert.equal(new URL(missing.headers.get('x-middleware-rewrite')).pathname, '/_not-found')
  assert.deepEqual(lookups, [
    ['nextjs', id],
    ['other', id],
  ])
})

test('sign-in accepts local paths and rejects external, encoded, and normalized redirects', () => {
  for (const path of [
    null,
    '',
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%2f/evil.invalid',
    '/%5cevil.invalid',
    '/%252f%252fevil.invalid',
    '/a/..//evil.invalid',
    '/\nevil.invalid',
    '/%0devil.invalid',
    '/bad%',
  ]) {
    assert.equal(safeReturnPath(path), '/dashboard', String(path))
  }
  for (const path of [
    '/dashboard',
    `/stacks/nextjs/releases/${id}`,
    '/stacks/nextjs?signal=security#latest-releases',
  ]) {
    assert.equal(safeReturnPath(path), path)
  }
})

test('GitHub sign-in passes the validated release return path and keeps the normal fallback', async () => {
  for (const [search, callbackURL] of [
    ['', '/dashboard'],
    [
      `?returnTo=${encodeURIComponent(`/stacks/nextjs/releases/${id}`)}`,
      `/stacks/nextjs/releases/${id}`,
    ],
    ['?returnTo=https%3A%2F%2Fevil.invalid', '/dashboard'],
  ]) {
    let submitted
    const page = loadTs(
      'src/app/(auth)/sign-in/page.tsx',
      {
        react: { useState: (initial) => [initial, () => {}] },
        'hugeicons-react': {},
        '@/components/logo': {},
        '@/components/theme-switcher': {},
        '@/components/ui/pulse-loader': {},
        '@/lib/auth-return-path': { safeReturnPath },
        '@/lib/auth-client': {
          authClient: {
            signIn: {
              social: async (input) => {
                submitted = input
                return {}
              },
            },
          },
        },
      },
      { window: { location: { search } } },
    )
    function findButton(node) {
      if (!node || typeof node !== 'object') return
      if (node?.type === 'button') return node
      for (const child of [node?.props?.children].flat()) {
        const found = findButton(child)
        if (found) return found
      }
    }
    await findButton(page.default()).props.onClick()
    assert.equal(submitted.provider, 'github')
    assert.equal(submitted.callbackURL, callbackURL)
  }
})

test('desired vote values and identifiers are strictly validated', () => {
  for (const value of [-1, 0, 1])
    assert.equal(types.voteRequestSchema.parse({ value }).value, value)
  for (const body of [
    { value: 2 },
    { value: '1' },
    { value: null },
    {},
    { value: 1, userId: 'other' },
  ]) {
    assert.equal(types.voteRequestSchema.safeParse(body).success, false)
  }
  assert.equal(types.releaseIdSchema.safeParse(id).success, true)
  assert.equal(types.releaseIdSchema.safeParse('not-a-uuid').success, false)
})

function api({
  user = 'alice',
  state = { score: 0, upvotes: 0, downvotes: 0, myVote: 0 },
  fail = false,
} = {}) {
  const writes = []
  const reads = []
  const routes = loadTs('src/app/api/releases/[releaseId]/vote/route.ts', {
    '@/lib/auth': {
      getAuth: () => ({ api: { getSession: async () => (user ? { user: { id: user } } : null) } }),
    },
    '@/lib/release-vote-types': types,
    '@/lib/release-votes': {
      getReleaseVoteState: async (...args) => {
        reads.push(args)
        if (fail) throw new Error('private-db-credential')
        return state
      },
      setReleaseVote: async (...args) => {
        writes.push(args)
        if (fail) throw new Error('private-db-credential')
        return state
      },
    },
  })
  const invoke = async (method, body = { value: 1 }, headers = {}, releaseId = id) => {
    const response = await routes[method](
      new Request(`https://stackpulse.test/api/releases/${releaseId}/vote`, {
        method,
        headers: {
          Origin: 'https://stackpulse.test',
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(method === 'PUT'
          ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
          : {}),
      }),
      { params: Promise.resolve({ releaseId }) },
    )
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('vary'), 'Cookie')
    return { status: response.status, body: await response.json() }
  }
  return { invoke, writes, reads }
}

test('public totals use anonymous identity; authenticated reads use the server session', async () => {
  const anonymous = api({ user: null, state: { score: 4, upvotes: 5, downvotes: 1, myVote: null } })
  assert.equal((await anonymous.invoke('GET')).body.myVote, null)
  assert.deepEqual(anonymous.reads, [[id, null]])
  const signedIn = api()
  await signedIn.invoke('GET')
  assert.deepEqual(signedIn.reads, [[id, 'alice']])
})

test('PUT requires session, same origin and a strict JSON desired state', async () => {
  const anonymous = api({ user: null })
  assert.equal((await anonymous.invoke('PUT')).status, 401)
  assert.equal(anonymous.writes.length, 0)
  const signedIn = api()
  for (const headers of [
    { Origin: 'https://evil.invalid' },
    { Origin: '' },
    { Origin: 'null' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    assert.equal((await signedIn.invoke('PUT', { value: 1 }, headers)).status, 403)
  }
  for (const body of ['invalid-json', { value: 9 }, { value: true }, { value: 1, userId: 'bob' }]) {
    assert.equal((await signedIn.invoke('PUT', body)).status, 400)
  }
  assert.equal(
    (await signedIn.invoke('PUT', { value: 1 }, { 'Content-Type': 'text/plain' })).status,
    400,
  )
  assert.equal((await signedIn.invoke('PUT', 'x'.repeat(257))).status, 413)
  assert.equal((await signedIn.invoke('PUT', { value: 1 }, {}, 'bad-id')).status, 400)
  assert.equal(signedIn.writes.length, 0)
  for (const value of [1, -1, 0])
    assert.equal((await signedIn.invoke('PUT', { value })).status, 200)
  assert.deepEqual(signedIn.writes, [
    [id, 'alice', 1],
    [id, 'alice', -1],
    [id, 'alice', 0],
  ])
})

test('API missing resources and failures are safe, uncached responses', async () => {
  for (const method of ['GET', 'PUT']) {
    assert.equal((await api({ state: null }).invoke(method)).status, 404)
    const result = await api({ fail: true }).invoke(method)
    assert.equal(result.status, 500)
    assert.ok(!JSON.stringify(result.body).includes('private-db-credential'))
    assert.equal((await api().invoke(method, undefined, {}, 'invalid')).status, 400)
  }
})

test('release metadata is canonical, content-derived and independent of votes', async () => {
  let data = {
    tech: { name: 'Framework', slug: 'framework' },
    release: {
      id,
      version: 'v2',
      title: 'Upgrade notes',
      summary: 'Stored release summary',
      publishedAt: new Date('2026-10-15T00:00:00Z'),
    },
  }
  const page = loadTs('src/app/stacks/[slug]/releases/[releaseId]/page.tsx', {
    '@/components/logo': {},
    '@/components/releases/release-auth': {},
    '@/components/releases/release-notes': {},
    '@/components/releases/release-vote': {},
    '@/components/theme-switcher': {},
    '@/lib/public-releases': { getPublicRelease: async () => data },
    'hugeicons-react': {},
    'next/navigation': {
      notFound() {
        throw new Error('NOT_FOUND')
      },
    },
  })
  const props = { params: Promise.resolve({ slug: 'framework', releaseId: id }) }
  const metadata = await page.generateMetadata(props)
  assert.equal(metadata.title, 'Framework v2 — Upgrade notes')
  assert.equal(metadata.description, 'Stored release summary')
  assert.equal(metadata.alternates.canonical, `/stacks/framework/releases/${id}`)
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical)
  assert.equal(metadata.twitter.title, metadata.title)
  assert.equal(JSON.stringify(metadata).includes('myVote'), false)
  data = null
  assert.equal((await page.generateMetadata(props)).robots.index, false)
  await assert.rejects(page.default(props), /NOT_FOUND/)
})
