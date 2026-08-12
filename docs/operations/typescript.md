# TypeScript

**Status:** current
**Last verified:** 2026-08-12

The repo type-checks with **TypeScript 7** and keeps **TypeScript 6** installed alongside it.
That is deliberate — do not "clean up" one of them.

## Why both

TypeScript 7 is the Go-native compiler. It ships a `tsc` binary but **no JavaScript compiler
API** (that is expected in 7.1). typescript-eslint — which `eslint-config-next` depends on —
imports that API from the `typescript` package and declares `typescript: >=4.8.4 <6.1.0`.
Installing TypeScript 7 as `typescript` makes `pnpm lint` crash outright:

```
TypeError: Cannot read properties of undefined (reading 'Cjs')
  at @typescript-eslint/typescript-estree/dist/create-program/shared.js
```

So the repo follows Microsoft's documented side-by-side arrangement:

```jsonc
// package.json → devDependencies
"@typescript/native": "npm:typescript@^7.0.2",              // provides `tsc`  (v7)
"typescript": "npm:@typescript/typescript6@^6.0.2"          // provides `tsc6` (v6) + the TS 6 API
```

| Consumer                                    | Resolves to                  |
| ------------------------------------------- | ---------------------------- |
| `pnpm typecheck` → `tsc`                    | TypeScript 7                 |
| `pnpm typecheck:ts6` → `tsc6`               | TypeScript 6                 |
| typescript-eslint (`require('typescript')`) | TypeScript 6 API             |
| Editor (`node_modules/typescript/lib`)      | TypeScript 6                 |
| `next build` type check                     | TypeScript 6 API — see below |

Both compilers read the same `tsconfig.json` and check the same project program.

## `experimental.useTypeScriptCli: false`

Next.js 16.3 type-checks builds by running the project-local `tsc`, resolved as
`typescript/bin/tsc`. Under the alias above, `node_modules/typescript` is the TS 6 compat
package, whose only bin is `tsc6` — so Next's default CLI checker fails to find a compiler
and aborts the build. `next.config.ts` therefore sets `experimental.useTypeScriptCli: false`,
which points the build at the TS 6 compiler API instead.

This does not skip or weaken any check: `next build` still type-checks the whole project,
just with TypeScript 6 (~15s) rather than TypeScript 7 (~2s).

## When TypeScript 6 can be removed

Once typescript-eslint supports the TypeScript 7 API (tracked upstream against the 7.1
release), collapse this back to a single install:

1. `pnpm remove @typescript/native` and set `"typescript": "^7"` in `devDependencies`.
2. Delete `experimental.useTypeScriptCli` from `next.config.ts` so the default CLI checker
   runs — the build type check then also uses TypeScript 7.
3. Drop the `typecheck:ts6` script and this section.
4. Verify: `pnpm typecheck && pnpm lint && pnpm build`.

## tsconfig notes

`tsconfig.json` is already TypeScript 7 compatible and needed no changes:
no `baseUrl`, `moduleResolution: "bundler"`, no legacy ES5 target, no `ignoreDeprecations`.
`@types/node` reaches the program through `next`'s type reference, so no explicit `types`
array is required. The pre-existing `skipLibCheck: true` was left alone.
