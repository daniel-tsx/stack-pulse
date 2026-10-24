# Luna fix final deployment verification

**Status:** current

**Date:** October 24, 2026 (Asia/Saigon)

**Code verdict:** Approve for the focused compatibility change; no blocking code finding

**Deployment verdict:** **HOLD** — candidate is uncommitted and its full production build is unverified

This was a focused, read-only review of the existing candidate. Application code, tests,
configuration and prior reports were not changed. Only this requested report was added;
temporary ignored verification artifacts were removed after retaining the evidence here.

## Exact reviewed candidate

The working directory was `C:\Work\Side Projects\stack-pulse`, branch `main`, at:

```text
390a4769f28d63d3e113bbd738626a043fee1085
```

**That SHA is the base, not a commit containing the fix.** The candidate is the existing
uncommitted patch on that base. Its tracked patch SHA-256, captured with
`git diff --no-ext-diff --binary HEAD -- src/lib/ai.ts tests/cron-recovery.test.mjs docs/features/ai-summarization.md`, is:

```text
d1ed383be9cde2ad2d94be92aa6bf9dc96b60bd825f163a0968915de4076d375
```

Git blob IDs identify the reviewed file contents independently of a future commit SHA:

| Reviewed file                                 | Git blob ID                                |
| --------------------------------------------- | ------------------------------------------ |
| `src/lib/ai.ts`                               | `2aa918b8404f308cfc37d26726c21970c191ba12` |
| `tests/cron-recovery.test.mjs`                | `f4eb35182804d24cd464e900364062fd3aa56861` |
| `docs/features/ai-summarization.md`           | `43f4362ca4cd3e87881edd337cb4caa22c2ddc9f` |
| `docs/audits/luna-compatibility-fix.md`       | `76fce15121bc4f464964913862921b8017af02e4` |
| `docs/audits/luna-live-compatibility-test.md` | `f2b20c73f4ed5a707895ae671a35b1e34d1d894f` |

The application file's raw-byte SHA-256 was
`e4f31131b4f4e29d978367f532ddb457d2711d0aa6bb9964fa6412ddf331fe24`;
the test file's was
`874eb9c5d6b9b8b3550c09b8e15e6dc0195d6435ebaceefbd63a8b45c22501b4`.
All five file fingerprints, the tracked patch and HEAD were rechecked unchanged at the
end of verification. No commit was created to manufacture a release revision.

## Confirmed findings

| Requirement                                    | Finding                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact Luna omits temperature                   | **PASS.** `getModelRequestParameters()` uses exact equality with `openai/gpt-6-luna` and returns no temperature property. Both SDK request bodies were checked with `Object.hasOwn(payload, 'temperature') === false`.                                                                                                          |
| Nested reasoning serialization                 | **PASS.** Both callers serialize `reasoning: { effort: 'none' }`; neither sends `reasoning_effort`. The local extension uses the installed SDK's `ChatCompletionReasoningEffort` type.                                                                                                                                          |
| Schema, tokens and provider requirements       | **PASS.** Both retain strict `json_schema`, their complete existing schemas, `max_tokens: 2000`, and exactly `provider: { require_parameters: true }`. No diagnostic-only `allow_fallbacks` setting leaked into the fix.                                                                                                        |
| Other model configuration                      | **PASS.** The other branch preserves summary temperature `0` and advice temperature `0.2`, without explicit reasoning. Tests cover explicit/default DeepSeek and another Luna ID; an additional baseline comparison covered an arbitrary synthetic model ID. Exact equality makes this the branch for every other model string. |
| F2 controls                                    | **PASS within offline scope.** Resilience/budget source is unchanged. The existing cases still verify retry caps, cooldowns, queue concurrency, cancellation and deadlines. Summary SDK retries remain disabled inside F2; advice retains the client's existing retry setting.                                                  |
| Persistence, auth, scheduler and notifications | **No introduced regression identified.** Their implementation files and integration signatures are unchanged; relevant existing offline contracts passed. This does not claim new real-database, OAuth or notification-delivery verification.                                                                                   |
| Actual SDK request evidence                    | **PASS.** Tests inspect the installed SDK fetch boundary's serialized `config.body`, using synthetic credentials and mocked HTTP, rather than only inspecting an object builder.                                                                                                                                                |
| Focused candidate                              | **PASS.** The only modified application file is `src/lib/ai.ts`; remaining changes are its recovery tests and relevant documentation. No dependency, migration, infrastructure or scheduler changes are present.                                                                                                                |

The [live evidence](luna-live-compatibility-test.md) and
[implementation record](luna-compatibility-fix.md) were read and checked against the diff.
The shared helper, explicit non-streaming SDK request types and both callers were traced.
Prompts, schemas, Zod validation, normalization, return types and database mappings were
preserved. No request type assertion, broad suppression, automatic model fallback or new
configuration variable was introduced.

An additional isolated comparison executed **HEAD and candidate implementations** through
the actual SDK with mocked fetch. It compared both callers across five configurations:
unset model, DeepSeek, exact Luna, another Luna ID and `synthetic/other-model`.
All **10 request-pair comparisons passed**. For exact Luna, the only parsed serialized
JSON differences were temperature removal and nested reasoning addition. Every other
request parameter and the fixture return contracts matched the baseline. This made
20 mocked SDK dispatches and **zero live inference calls**.

The review used local Ponytail Review with the Eastbase overlay. It is focused
reverification in the implementation chat, not a newly staffed independent review or a
broad subsystem audit. No implementation correction was needed or applied.

## Active production comparison

Read-only Vercel alias/deployment metadata was observed at
**2026-10-24 02:46:49.831 UTC / 09:46:49.831 Asia/Saigon**:

| Field               | Active production value                          |
| ------------------- | ------------------------------------------------ |
| Team                | `team_yzTvlVGW2KYvgKGdZOb1VDOo` (`daniel-tsx`)   |
| Project             | `prj_eSOmhOMsFDscTZhVmvxfxRkXuISi`               |
| Production alias    | `www.stackpulse.work`                            |
| Deployment ID       | `dpl_6UA75PcJQL9TTvrWL3gY8j2RKc8R`               |
| Deployment hostname | `stack-pulse-8lpy4fwk0-daniel-tsx.vercel.app`    |
| Target / state      | `production` / `READY`; aliases assigned         |
| Source              | `redeploy`; Git source type `github`, ref `main` |
| Git SHA             | `390a4769f28d63d3e113bbd738626a043fee1085`       |

The apex `stackpulse.work` alias points to the same deployment and redirects to
`www.stackpulse.work`. The project's current standard and main-branch aliases also
resolve to this deployment. Older legacy aliases were not mistaken for active production.

**The Luna fix is not deployed.** Production's Git SHA equals the local base SHA, whose
AI source still sends temperature `0` for summaries and `0.2` for advice. The reviewed
fix exists only in the uncommitted candidate. Production's READY status proves neither a
build of this candidate nor its activation. Current production model/environment values
were deliberately not inspected.

The connector returned HTTP 403 for this team. Its documented CLI fallback, using existing
Vercel authentication, successfully retrieved aliases and the exact active deployment's
metadata. The general deployment-list lookup was inconclusive; the alias-to-deployment
mapping and direct deployment lookup established the comparison. No application URL,
production database, environment-variable API, credential file or build/runtime log was
read. No connection permissions were changed.

## Fresh verification results

Runtime: Node `v24.22.1`; installed OpenAI SDK `6.38.0`; repository pnpm `11.1.3` via its
existing cached CLI. These checks ran in this verification, rather than relying on prior
reports:

| Check                                                          | Result                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Focused Luna configuration and Zod regressions                 | **PASS: 6/6**, zero failures/skips                                          |
| Full cron/F2 regression suite                                  | **PASS for offline cases: 134 passed, 0 failed, 1 skipped**, 135 discovered |
| HEAD/candidate serialized request comparison                   | **PASS: 10 pairs**, both callers across five model configurations           |
| TypeScript 7 typecheck                                         | **PASS**                                                                    |
| Full repository ESLint                                         | **PASS**                                                                    |
| Candidate/report formatting, whitespace and local report links | **PASS**                                                                    |
| Candidate identity before/after review                         | **PASS**, fingerprints and patch unchanged                                  |
| Complete production build of candidate                         | **NOT RUN**; prerequisites below remain unverified                          |
| Real SQL, production data, OAuth, delivery and live inference  | **NOT RUN**, outside scope                                                  |

The skipped SQL scheduling test needs an ownership-verified test database. Its target
variables were explicitly cleared in the subprocess to honor the read-only boundary.
The skip is not a database integration PASS. Existing mock persistence, authentication,
notification, retry, cooldown, concurrency and deadline cases still ran.

Commands executed:

```bat
node --test --test-name-pattern=Luna.compatibility tests/cron-recovery.test.mjs
set SKILL_TEST_DATABASE_URL=&& set SKILL_TEST_TARGET_FILE=&& node node_modules/.cache/workflow-corepack/v1/pnpm/11.1.3/bin/pnpm.cjs test:cron
node node_modules/.cache/workflow-corepack/v1/pnpm/11.1.3/bin/pnpm.cjs typecheck
node node_modules/.cache/workflow-corepack/v1/pnpm/11.1.3/bin/pnpm.cjs lint
node node_modules/prettier/bin/prettier.cjs --check src/lib/ai.ts tests/cron-recovery.test.mjs docs/features/ai-summarization.md docs/audits/luna-compatibility-fix.md docs/audits/luna-fix-final-verification.md
git diff --check
```

Temporary ignored checks captured fingerprints, compared baseline/candidate requests,
checked public-host DNS, selected non-secret Vercel metadata, and verified report links.
Their evidence is retained above; the scripts and local JSON artifacts were removed.

## Build blocker and safest completion path

The [existing build record](F2-final-verification.md#5-build-verification-status-and-exact-completion-steps)
reports an isolated Next.js production-build failure fetching Geist and Geist Mono.
The current root layout still uses those Google Fonts. Fresh DNS checks in this default
sandbox returned **ENOTFOUND** for `fonts.googleapis.com`, `fonts.gstatic.com` and
`registry.npmjs.org`. This is a current constraint of this verification context, not a
claim that a network-enabled CI runner has the same problem.

There is also no verified isolated application build database target for this candidate.
Stack/skill prerendering calls the real database readers. Production uses Drizzle's Neon
HTTP transport, so the local tests' native PostgreSQL transport cannot simply be supplied
as an application build URL. No production `.env`, credentials or data were substituted.

**Build status: NOT RUN for this candidate; successful full build remains a release
blocker.** The previous font failure is historical evidence, not a newly executed build.
No application compile defect was established by that failure, and passing standalone
typecheck does not certify bundling, build-integrated checks, prerendering or final output.

The safest completion path is a network-enabled isolated checkout/CI runner containing
an immutable commit of the reviewed blobs. Keep production environment files absent;
an operator must provision/verify a dedicated disposable Neon HTTP-compatible build
target with synthetic data and the existing schema. Use nonproduction auth/origin values
and leave paid AI, notification and production telemetry credentials unavailable.
That setup and any test-data preparation require their own authorization; none occurred
here. Do not change fonts, weaken validation or bypass build stages to manufacture a pass.

In that isolated environment, with the repository's pinned runtime/tooling:

```bat
pnpm install --frozen-lockfile
pnpm test:cron
pnpm typecheck
pnpm lint
pnpm exec prettier --check src/lib/ai.ts tests/cron-recovery.test.mjs docs/features/ai-summarization.md docs/audits/luna-compatibility-fix.md docs/audits/luna-fix-final-verification.md
git diff --check
pnpm build
```

Require exit code zero through all build stages. Diagnose any subsequent error from its
own evidence; do not assume it is another font problem. No database-backed preview or
production build should be used as an isolated test fixture.

## Exact deployment checklist — operator only, not executed

1. **Freeze the reviewed candidate.** Under separate commit/push authorization, create a
   release commit containing the reviewed application/test blobs and relevant docs.
   Record its full SHA as `LUNA_RELEASE_SHA`; `390a476...` must not be labeled the fix.
   Require a clean checkout and compare:

   ```bat
   git rev-parse HEAD
   git status --porcelain
   git rev-parse "%LUNA_RELEASE_SHA%:src/lib/ai.ts"
   git rev-parse "%LUNA_RELEASE_SHA%:tests/cron-recovery.test.mjs"
   ```

   The last two outputs must equal `2aa918b8404f308cfc37d26726c21970c191ba12` and
   `f4eb35182804d24cd464e900364062fd3aa56861`. Re-review a changed source/test blob.
   Do not push to the production branch as a validation shortcut; it may auto-deploy.

2. **Complete the isolated build gate above** at that exact release SHA. Retain test
   counts and full successful build evidence. No production fixture, cron invocation,
   provider request or delivery consumer belongs in this build verification.
3. **Reconfirm the release target and rollback reference immediately before release.**
   Use the known team/project above, inspect the active domain-to-deployment mapping,
   and record the then-current deployment ID/SHA. The observed rollback reference is
   `dpl_6UA75PcJQL9TTvrWL3gY8j2RKc8R`; replace it if production has legitimately advanced.
   Obtain normal deployment authorization for the exact release SHA and target.
4. **Build the approved production deployment without assigning domains first.** In a
   clean release checkout explicitly targeting this existing project, an authorized
   operator may use the staged production workflow:

   ```bat
   set VERCEL_ORG_ID=team_yzTvlVGW2KYvgKGdZOb1VDOo
   set VERCEL_PROJECT_ID=prj_eSOmhOMsFDscTZhVmvxfxRkXuISi
   vercel deploy --prod --skip-domain --scope team_yzTvlVGW2KYvgKGdZOb1VDOo
   ```

   Record the returned ID as `LUNA_DEPLOYMENT_ID`. Check READY state, project, production
   target and Git SHA against `LUNA_RELEASE_SHA`; stop on mismatch. Do not treat the
   staged URL as permission to invoke data-backed pages, cron or paid APIs. This is a
   separately authorized release build, not a replacement for isolated verification.

5. **Promote that exact production-target deployment** after the release gates pass:

   ```bat
   vercel promote %LUNA_DEPLOYMENT_ID% --scope team_yzTvlVGW2KYvgKGdZOb1VDOo
   vercel promote status stack-pulse --scope team_yzTvlVGW2KYvgKGdZOb1VDOo
   ```

   Confirm `www.stackpulse.work` and the apex alias now resolve to the recorded release
   ID. Promoting a Preview deployment creates a new production build; it does not prove
   that the previously tested artifact was released. Use the production-target staging
   workflow intentionally. [Vercel promotion documentation](https://vercel.com/docs/deployments/promoting-a-deployment)

6. **Observe ordinary production activity under the approved monitoring scope.** Verify
   disappearance of parameter-routing failures, valid summaries/advice, confirmed insert
   counts, AI attempts/retries, deferrals, latency and spend. Do not manually run cron,
   backfill or additional paid smoke tests. No environment, schema or scheduler change
   is required for the fix.

## Exact rollback checklist — operator only, not executed

1. Record the failing deployment ID/SHA and symptoms. Reconfirm the previous deployment
   is eligible and remains an appropriate rollback target; account plan/permissions and
   intervening releases can affect eligibility. Validate retained environment compatibility
   through the authorized operator without exporting credentials.
2. If an application regression requires immediate artifact rollback and the observed
   reference is still correct, the authorized command is:

   ```bat
   vercel rollback dpl_6UA75PcJQL9TTvrWL3gY8j2RKc8R --scope team_yzTvlVGW2KYvgKGdZOb1VDOo
   vercel rollback status stack-pulse --scope team_yzTvlVGW2KYvgKGdZOb1VDOo
   ```

3. Verify the production aliases and rollback status. No SQL/schema rollback is needed.
   **This target restores the old temperature-bearing Luna requests**; it is an exact
   artifact recovery reference, not a Luna-compatible fallback. Do not promise it fixes
   Luna availability.
4. If only reasoning-disabled quality regresses, prefer a separately reviewed corrective
   change retaining temperature omission and removing the optional reasoning setting.
   Prior smoke configuration B supports that request shape. Do not automatically change
   models, credentials, retries or scheduler settings.
5. Rollback restores an earlier build/environment snapshot and its cron definitions;
   it does not refresh that build with newly changed environment values. It also disables
   production-domain auto-assignment. Preserve the intended cron configuration and project
   disable state; do not toggle scheduling as part of this checklist.
   [Vercel rollback behavior](https://vercel.com/docs/instant-rollback)
6. When a corrected production-target deployment is approved, record its exact ID and
   promote it deliberately with `vercel promote <approved-deployment-id> --scope
team_yzTvlVGW2KYvgKGdZOb1VDOo` to restore release flow; verify aliases and auto-assignment.
   [Vercel rollback CLI](https://vercel.com/docs/cli/rollback)

## Remaining limits and stop condition

The code passes focused review and offline checks. Release remains blocked by a clean,
immutable candidate commit and a successful isolated full build. Production still runs
the base revision at the recorded observation time. The prior one-case-per-arm smoke
test does not establish broad reasoning-disabled quality or benchmark performance.

Verification stops here. No application change, production credential/data access,
paid inference, live cron execution, commit, push, deployment, rollback or infrastructure
mutation was performed. The only persisted addition from this verification is this report.
