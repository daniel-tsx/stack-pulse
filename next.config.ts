import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // TypeScript 7 ships no JS compiler API yet, so typescript-eslint still needs the
    // TS 6 API. `typescript` is therefore aliased to @typescript/typescript6, whose bin
    // is `tsc6` — Next's default CLI checker looks for `typescript/bin/tsc` and would
    // fail. Point the build at the TS 6 compiler API instead; `pnpm typecheck` runs the
    // TS 7 `tsc` over the same tsconfig. Remove once typescript-eslint supports TS 7.
    useTypeScriptCli: false,
  },
}

// Only wrap when Sentry is actually configured so self-hosted builds stay untouched.
const sentryEnabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
      // Source map upload only runs when SENTRY_ORG/PROJECT/AUTH_TOKEN are set.
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : nextConfig
