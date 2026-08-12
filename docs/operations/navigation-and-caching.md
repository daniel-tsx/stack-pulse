# Navigation and caching

**Status:** current  
**Last verified:** 2026-08-12

StackPulse enables Next.js 16.3 Cache Components and Partial Prefetching in
`next.config.ts`. Visible links use the default App Shell prefetch. There are deliberately no
`prefetch={true}` links: the stack directory renders about 90 dynamic-slug links, and runtime
prefetching each URL would multiply server work without improving the shared shell.

## Cache policy

- Public stack index/detail data and version-keyed upgrade plans are cached for one hour.
- Landing metrics are cached for 10 minutes in `src/lib/landing-stats.ts`.
- The public status page is cached for five minutes.
- The sitemap is cached for one hour.
- Session, preference, read-state, and webhook queries are never placed in a shared server
  cache. Dashboard, onboarding, and settings read them inside request-time Suspense boundaries.

The `stale` values preserve the previous route revalidation windows. `expire` is longer so a
stale value can remain available while the cache refreshes.

## Loading and blocking routes

- `/dashboard`, `/onboarding`, and `/settings` have route-specific, non-personalized loading
  shells while authenticated or user-specific data streams.
- `/stacks/[slug]` has one shared release-page shell for every slug.
- `/stacks/[slug]/upgrade` overrides the parent loader with an upgrade-planner shell.
- `/` sets `instant = false` because the session decides whether the route renders or redirects;
  streaming the public landing page first would flash the wrong UI to signed-in users.
- `/digest/unsubscribe` sets `instant = false` because it is entered from email and its private
  token determines the confirmation UI. The token is not placed in a prefetched shared shell.

When adding a route, prefer cached public data or a focused Suspense fallback. Use
`instant = false` only when blocking is intentional, and audit `prefetch={true}` by server cost
before adding it.
