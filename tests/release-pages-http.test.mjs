import assert from 'node:assert/strict'
import { test } from 'node:test'

const appUrl = process.env.VOTE_TEST_APP_URL

test(
  'public detail supports direct access and real 404/noindex responses',
  { skip: !appUrl && 'Set VOTE_TEST_APP_URL to a running local app for HTTP smoke checks' },
  async () => {
    const base = new URL(appUrl)
    assert.ok(
      ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
      'HTTP smoke checks require a local app',
    )
    // Read-only discovery; this suite never calls the vote API or mutates data.
    const stack = await fetch(new URL('/stacks/nextjs', base))
    assert.equal(stack.status, 200)
    const collection = await stack.text()
    const path = collection.match(/href="(\/stacks\/nextjs\/releases\/[a-f0-9-]+)"/)?.[1]
    assert.ok(path, 'Seeded Next.js stack needs at least one stored release')
    const release = await fetch(new URL(path, base))
    assert.equal(release.status, 200)
    const html = await release.text()
    assert.match(html, /<h1[^>]*>Next\.js/)
    assert.ok(html.includes('community_signal'))
    assert.ok(html.includes(`href="${new URL(path, base).href}"`), 'Canonical uses the UUID URL')
    assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(html))
    for (const missing of [
      '/stacks/nextjs/releases/invalid',
      path.replace('/nextjs/', '/react/'),
      '/stacks/nextjs/releases/550e8400-e29b-41d4-a716-446655440000',
    ]) {
      const response = await fetch(new URL(missing, base))
      assert.equal(response.status, 404, missing)
      assert.match(await response.text(), /<meta name="robots" content="[^"]*noindex/)
    }
  },
)
