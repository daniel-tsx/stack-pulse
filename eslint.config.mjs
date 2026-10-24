import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Task worktrees and scratch space are separate checkouts.
    '.tmp/**',
    '.claude/worktrees/**',
    // Pinned third-party skill examples are verified by sync-agent-skills.mjs.
    '.agents/skills/**',
    '.claude/skills/**',
  ]),
])

export default eslintConfig
