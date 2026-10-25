# Skill Updates staging verification

**Status:** current · prepared 2026-10-21 · live checks await explicit approval

This is the operational source of truth for the remaining integration gates. The [feature contract](../features/agent-skill-updates.md) describes the MVP. An APPROVE code review does not verify hosted persistence, model compatibility, billing or deployment configuration.

## Current evidence and verdict

| Boundary                                | Result                                    | Evidence and remaining uncertainty                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neon HTTP cancellation / unknown commit | **NOT RUN on Neon; PASS locally**         | Actual installed Neon SDK, production `getDb`/store and Drizzle run through a loopback HTTP bridge into owned PostgreSQL. Abort before dispatch, controlled pre-execution failure, lost event/checkpoint acknowledgement, lost lease acknowledgement, stale fencing, interrupted analysis and retained completed writes pass. This does not prove Neon's hosted cancellation behavior or that abort rolls back SQL.             |
| Overlapping ingestion / real PostgreSQL | **PASS locally**                          | Eight existing integration tests use real leases/constraints/atomic statements, including interleaved old/new GitHub HEAD responses, lease expiry, valid force-push and recovery. Hosted Neon variant remains unrun.                                                                                                                                                                                                            |
| Configured OpenRouter strict schema     | **NOT RUN live**                          | Six offline contracts pass. Actual SDK mock tests preserve strict JSON Schema and routing requirements; advertised provider support is not a compatibility result. Local configuration has no override, so the configured default is `deepseek/deepseek-v4-flash-0731`.                                                                                                                                                         |
| Tokens / provider errors / cost         | **PASS offline; NOT RUN against billing** | Actual SDK plus production retry context verify HTTP 401/402/429/503, billable HTTP-200 errors, invalid/truncated output, cancellation, zero/absent usage, reasoning counts and partial/unknown charges. No actual OpenRouter invoice/usage reconciliation exists yet.                                                                                                                                                          |
| Migration / cron rollout                | **PASS local rehearsal; NOT RUN hosted**  | Drizzle journal through `0009`, then `0010`, then rerun passes in an isolated schema; synthetic legacy users/technologies remain identical and only two feature tables are added. Explicit `public` schema references are redirected for isolation. Production schema/journal, deployment plan and credentials have not been inspected remotely. Skill cron registration is absent from `vercel.json` pending rollout approval. |

**GO to approval of bounded disposable staging checks. NO-GO for production rollout or cron enablement.** Live boundaries must pass and reports must be reviewed before advancing. No deployment, production migration, cloud resource creation, paid inference, commit or push was performed in this preparation.

## Target safety and safe local commands

The checkout's `.env` contains a remote database URL with unverified ownership/isolation. It contains no configured GitHub token or OpenRouter key. Neither that URL nor the localhost application was used by these checks. `pnpm skills` and `pnpm db:migrate` load `.env`; do not use them for this test campaign.

Database tests accept only `SKILL_TEST_DATABASE_URL` and an explicit `SKILL_TEST_TARGET_FILE`. Before any DDL they check exact loopback host/port/database/user, a workspace-owned cluster directory and postmaster PID file, and PostgreSQL's actual data directory and system identifier. Search paths contain only a random test schema, with five-second statement and two-second lock timeouts. Teardown drops only schemas created by the current test. Tests never fall back to `DATABASE_URL` or load dotenv. Invalid ownership proofs fail closed.

Existing disposable infrastructure: PostgreSQL 18 at `127.0.0.1:55441/stackpulse_skill_test`, cluster directory `node_modules/.cache/skill-test-pg-isolated`. Its local ownership proof is in ignored `.env.skill-test-target.json`; it is not a portable credential/configuration to reuse on another machine. Obtain its system identifier from `pg_controldata` and compare the server identity before recreating that proof. Do not infer ownership from the word `test` or a local address.

```bat
pnpm lint
pnpm typecheck
pnpm test:cron
pnpm skills:eval
pnpm skills:eval --plan-live
pnpm skills:verify:neon
set SKILL_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55441/stackpulse_skill_test
set SKILL_TEST_TARGET_FILE=.env.skill-test-target.json
pnpm test:skills
set SKILL_TEST_TARGET_FILE=
set SKILL_TEST_DATABASE_URL=
git diff --check
```

The two plan commands make zero requests. All local source/AI responses are synthetic. The HTTP bridge rejects remote endpoints. The cluster's existing public fixture data is outside test search paths. A normal app build can query `.env` and is deliberately excluded from these harness-only checks.

## Approval gate A: disposable Neon persistence

**A dedicated disposable Neon resource is required to close boundary 1.** Use an approved nonproduction project with no user data, a schema-only branch (copies structure, not rows), and a **new empty database** plus a dedicated new role. Do not create an ordinary branch from production/development: that copies user data. The test database must remain exclusive to this campaign. No application, cron or other writer may use it.

Approve the project, parent branch, region, 24-hour-or-shorter expiry and run ID first. Record the newly returned branch ID, endpoint ID, hostname, role and database from Neon management metadata. The manifest is an operator attestation tied to those approved resource records; a database URL cannot establish its own branch/project provenance. The runner validates their exact connection binding, then checks the server identity and that **no user tables/views/sequences exist** before any write. An existing/nonempty database is refused, even if the manifest says disposable. It never reads application user rows.

The installed CLI is `neonctl 2.24.2`; current documented safe `--no-secrets` output requires Neon CLI **4.9.0+**. Do not execute the following using the installed old CLI. After approval, use an approved current CLI installation, or the existing Neon connector for equivalent resource operations. No repository dependency is needed. These commands are templates whose IDs must be filled from approved resource records, not inferred from `.env`:

```bat
set SKILL_PROJECT_ID=APPROVED_NONPRODUCTION_PROJECT_ID
set SKILL_PARENT_ID=APPROVED_SCHEMA_SOURCE_BRANCH_ID
set SKILL_RUN_ID=APPROVED_32_CHARACTER_LOWERCASE_HEX_RUN_ID
set SKILL_EXPIRES_AT=APPROVED_UTC_TIMESTAMP_WITHIN_24_HOURS
neon branches create --project-id %SKILL_PROJECT_ID% --parent %SKILL_PARENT_ID% --schema-only --name skill-verification-%SKILL_RUN_ID% --cu 0.25 --suspend-timeout 300 --expires-at %SKILL_EXPIRES_AT% --no-secrets
set SKILL_BRANCH_ID=RETURNED_DISPOSABLE_BRANCH_ID
neon roles create --project-id %SKILL_PROJECT_ID% --branch %SKILL_BRANCH_ID% --name skill_staging_%SKILL_RUN_ID% > .env.skill-role-result.json
neon databases create --project-id %SKILL_PROJECT_ID% --branch %SKILL_BRANCH_ID% --name skill_staging_%SKILL_RUN_ID% --owner-name skill_staging_%SKILL_RUN_ID%
neon connection-string %SKILL_BRANCH_ID% --project-id %SKILL_PROJECT_ID% --database-name skill_staging_%SKILL_RUN_ID% --role-name skill_staging_%SKILL_RUN_ID% --ssl require > .env.skill-neon-url.txt
```

If no isolated nonproduction project exists, request approval to create one in the chosen region before the branch step. Never silently fall back to an existing application project. Do not print role-result contents: it can contain the new password. Obtain the dedicated role/database **direct**, TLS-required connection URL from the approved endpoint and store it only in ignored `.env.skill-neon` as `SKILL_STAGING_DATABASE_URL=...`. Do not overwrite `.env`. No AI/GitHub credential belongs in this file.

Create ignored `.env.skill-neon-target.json` from those management records:

```json
{
  "kind": "disposable-neon-skill-verification",
  "runId": "APPROVED_32_CHARACTER_LOWERCASE_HEX_RUN_ID",
  "projectId": "APPROVED_NONPRODUCTION_PROJECT_ID",
  "branchId": "br-RETURNED_DISPOSABLE_ID",
  "branchIsDefault": false,
  "endpointId": "ep-RETURNED_DISPOSABLE_ID",
  "host": "ep-RETURNED_DISPOSABLE_ID.REGION.aws.neon.tech",
  "database": "skill_staging_APPROVED_32_CHARACTER_LOWERCASE_HEX_RUN_ID",
  "role": "skill_staging_APPROVED_32_CHARACTER_LOWERCASE_HEX_RUN_ID",
  "expiresAt": "APPROVED_UTC_TIMESTAMP_WITHIN_24_HOURS",
  "dataPolicy": "new-empty-database-no-user-data"
}
```

After explicit approval for that manifest:

```bat
set SKILL_STAGING_APPROVED_RUN=%SKILL_RUN_ID%
node --env-file=.env.skill-neon scripts/verify-skill-neon.mjs --run --target=.env.skill-neon-target.json
set SKILL_STAGING_APPROVED_RUN=
```

Budget: **150 HTTP requests maximum, 10 seconds/request, 120 seconds overall, zero AI/GitHub requests**. The runner applies only migration `0010` to the proven empty database, seeds ten synthetic operational rows twice, tests overlapping leases, intentionally loses a successful HTTP acknowledgement, verifies one durable transition and its matching checkpoint after retry, cancels a slow hosted query, then interleaves actual ingestion with synthetic GitHub/AI boundaries. It does not replace the full deployment migration-journal rehearsal. Successful output includes all three `passed:true` stages. A cancellation must reject within two seconds; it never claims that abort rolled back server work.

Any failure stops the run. A partially populated database is not reusable by this runner. Preserve sanitized output, then clean up. No automatic resource deletion is performed by the script:

```bat
neon branches delete %SKILL_BRANCH_ID% --project-id %SKILL_PROJECT_ID%
```

Verify deletion against the approved disposable branch ID; delete a newly created dedicated project only if that separate project deletion was approved. Revoke residual test credentials and remove only this campaign's ignored credential/result/manifest files. Branch expiry is a backstop, not cleanup evidence. Keep the local PostgreSQL cluster intact; tests remove their own schemas.

## Approval gate B: six paid synthetic model evaluations

Approve exactly one model, the six checked-in fixtures and this budget per campaign. The prepared comparison has two separate campaigns: `deepseek/deepseek-v4-flash-0731` pinned to `digitalocean`, and `openai/gpt-6-luna` pinned to `openai`, both standard tier. Maximum twelve inference dispatches total only after separate approval; neither campaign is approved by preparing its plan. No release-model change or automatic model/provider switching. Only synthetic content is sent. No source repository, user data or database access is involved. See the [benchmark readiness audit](../audits/skill-phase-b-benchmark-readiness.md) for the common rubric, serialization checks and outstanding live boundaries. The [earlier partial evaluation](../audits/skill-openrouter-live-evaluation.md) failed; its one-time shared-key exceptions do not relax this runbook.

| Budget        | Limit                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP requests | At most 6 inference dispatches plus 1 read-only key preflight; serial, one SDK attempt/fixture; stop on the first provider/validation/billing failure                  |
| Input         | 12,000 native-token allowance/request, 72,000 campaign allowance; preflight refuses serialized requests over 11,000 UTF-8 bytes                                        |
| Output        | `max_tokens=3000`, at most 18,000 campaign output tokens                                                                                                               |
| Time          | 25 seconds/request; 180 seconds including key preflight and response processing                                                                                        |
| Routing price | At most $0.20/M input, $0.75/M output, $0/request; provider fallback disabled; strict schema and required parameters retained                                          |
| Spend         | $0.0279 token-price allowance per campaign, $0.0558 across two; **$0.25 maximum dedicated lifetime key cap** remains required (recommend $0.03 per fresh campaign key) |

The byte check applies to the final serialized request, reserves framing room and is not a native tokenizer proof. Actual returned tokens are checked after each call; excess/missing usage halts the campaign. The dedicated provider-enforced key cap is the financial backstop for unknown charges/timeouts. Price filtering can exclude a provider; failure under that restriction is not proof the model works elsewhere. No cache discount is assumed. Provider-internal accounting and a timed-out request's final charge require reconciliation. Both campaigns use `service_tier: default`, usage accounting and routing metadata; unexpected BYOK stops execution.

Create an unshared, unused evaluation key with a lifetime limit of **$0.25**, no reset, and Include BYOK enabled. Allow only the approved model and disable BYOK for this key/campaign in the provider controls. The harness verifies key limit/reset/remaining balance and zero prior usage through `GET /api/v1/key` before inference. Put only `SKILL_EVAL_OPENROUTER_API_KEY=...` in ignored `.env.skill-eval`; it intentionally ignores an ambient application OpenRouter key.

```bat
pnpm skills:eval --plan-live
pnpm skills:eval --plan-live --model=openai/gpt-6-luna
set SKILL_EVAL_APPROVED=skill-benchmark:deepseek/deepseek-v4-flash-0731:six-fixtures
node --env-file=.env.skill-eval node_modules/tsx/dist/cli.mjs scripts/evaluate-skill-updates.ts --live --model=deepseek/deepseek-v4-flash-0731 > .env.skill-eval-results.jsonl
set SKILL_EVAL_APPROVED=
```

For Luna, after its separate approval and a fresh campaign key, use `SKILL_EVAL_APPROVED=skill-benchmark:openai/gpt-6-luna:six-fixtures`, `--model=openai/gpt-6-luna`, and a separate ignored output file. Do not run both concurrently or repeat a failed fixture. The same fixture file, evidence, prompt, schema and four-item `SKILL_EVAL_RUBRIC` apply to both. Preserve raw model reports separately from server-normalized reports; a server correction is not a model-quality pass. All four rubric criteria must pass for each human-accepted report. The fixed expected recommendation is diagnostic: a policy-consistent alternative needs an explicit human rationale, not automatic acceptance. Freeze the rubric and source revision before either run.

Expected: six validated reports using the exact production schema and analyzer, returned model/provider, tokens, known reported cost, latency and generation IDs. Exit 0 means schema/citation/budget checks passed, **not human acceptance**. Review every inference for unsupported assertions, evidence relevance and useful recommendations. Record accepted count separately. The summary includes known cost from successful and failed analyzed responses; missing response charges remain unknown. Reconcile generation IDs and dedicated-key usage with OpenRouter activity before declaring billing accurate. If zero reports are human-accepted, cost/accepted-report is undefined. Otherwise divide **all** campaign charges, including failures, by accepted reports; never divide only successful-call spend.

Cleanup: revoke the evaluation key immediately after reconciliation, remove `.env.skill-eval`, retain only sanitized fixture/audit output. A rerun needs a fresh key and renewed campaign approval; never reset failed jobs on a live application as part of this benchmark.

## Estimated staging resource cost

Local/offline preparation spent **$0 on inference and created no cloud resources**. For a disposable Neon compute at 0.25 CU for 30 active minutes: approximately $0.01325 on Launch, or $0.02775 on Scale, plus small storage/history/egress and any extra-branch charge (~$0.002/branch-hour beyond included branches). Existing free allowances may cover it; account eligibility is unverified. Target a **$1 total staging resource envelope**, including the $0.25 AI key cap and a short preview deployment, with actual hosting-plan cost checked before approval. This is an estimate, not a provider-enforced aggregate cap. Delete the branch promptly and retain the 24-hour expiry.

References checked 2026-10-21: [Neon pricing](https://neon.com/pricing), [schema-only branches](https://neon.com/docs/guides/branching-schema-only), [Neon CLI branches](https://neon.com/docs/cli/branches), [databases](https://neon.com/docs/cli/databases), [OpenRouter strict output](https://openrouter.ai/docs/guides/features/structured-outputs), [routing price limits](https://openrouter.ai/docs/guides/routing/provider-selection#max-price), [key limits](https://openrouter.ai/docs/api_reference/limits), [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

## Safe staging and later production sequence

1. Obtain approval and resource provenance; run gates A and B; retain sanitized results and human report scores. Do not proceed on unknown charges or unexplained persistence outcomes.
2. Obtain separate approval for a hosted staging preview and scoped staging credentials. Use a fresh schema-only database with synthetic fixtures. Bind its exact endpoint to the preview environment; inspect effective environment assignments before build. Leave skill scheduling absent. No production credentials or production OAuth accounts belong here.
3. On that approved staging database, rehearse the **actual deployment migrator** and journal through `0010`, then seed exactly ten skills using an explicit staging environment. Existing package `skills` scripts load `.env`, so invoke `node --env-file=.env.skill-preview node_modules/tsx/dist/cli.mjs scripts/skill-updates.ts --seed` directly instead. Run the migrator only in a clean process with an explicit approved `DATABASE_URL`; ensure the config's dotenv import cannot supply an absent value from `.env`. Verify journal hashes/timestamps, tables/indexes/constraints and unchanged synthetic legacy rows. Do not run schema push.
4. After hosted deployment approval, use `curl --fail-with-body --max-time 15 -H "Authorization: Bearer %SKILL_PREVIEW_CRON_SECRET%" "%SKILL_PREVIEW_URL%/api/cron/fetch-skill-updates?dryRun=1"`. Expect authenticated read-only preview; an unauthenticated request must return 401 before DB/GitHub/AI work. Deploy protection may also require the preview's approved bypass credential; keep it scoped and out of logs.
5. For a **fresh, verified empty skill registry**, use one approved manual `curl --fail-with-body --max-time 300 -H "Authorization: Bearer %SKILL_PREVIEW_CRON_SECRET%" "%SKILL_PREVIEW_URL%/api/cron/fetch-skill-updates"`. Expect ten baselines, zero update reports, zero AI attempts and no notifications; inspect persistence and logs, not counters alone. If any prior baseline/event exists, stop: this invocation may spend. Concurrent live source ingestion needs its own AI spending approval; use the synthetic persistence runner for overlap checks first.
6. Inspect signed-out skills/history/report routes, 404/error handling and pending/failed/complete data on the hosted preview. Trigger no real notification flow. Check cold starts, function timeout (300 seconds), 270-second app budget, six-minute leases, new invocation recovery and billing reconciliation. No externally hosted check above has been run in this preparation.
7. **Only after staging passes, request separate production migration/deployment approval.** Inspect actual production migration history; expected pending set is only reviewed `0010`. Stop on any additional pending migration or schema drift. Take an approved backup/recovery point. Apply the reviewed versioned migration before deploying code that reads new tables; seed ten approved identities. Avoid public requests/builds requiring the new tables before migration. Verify existing auth/releases/votes remain healthy.
8. Deploy code with skill cron registration still absent. Run approved dry-run and a controlled baseline ingestion; verify zero AI work for clean baselines. Existing release/digest cron registrations remain unchanged. Confirm other manual callers cannot race rollout.
9. After a separate cron-enable approval, add `{ "path": "/api/cron/fetch-skill-updates", "schedule": "30 0,12 * * *" }` to `vercel.json` and deploy that reviewed configuration. Inspect actual schedule registration and auth. Observe at least two polls for pending age, errors, event uniqueness, provider charges and preserved release/digest operation before declaring rollout successful. Vercel schedules run on production deployments; preview checks cannot establish production cron registration.
10. Rollback: remove only the skill schedule and disable skill tracking through the approved operator procedure, then roll back application code if needed. Let current requests settle; leases expire after six minutes. Retain additive tables, events and telemetry; no destructive down migration. Reconcile possible unknown writes/charges before any retry/reset.

Hosted migration commands, deployment credentials and cron calls remain approval-gated. A prepared sequence is not evidence that production is ready.

After approval for the exact preview database, `.env.skill-preview` must contain a nonempty `DATABASE_URL` matching its independently verified endpoint, database and dedicated role, plus scoped application configuration. Clear inherited `DATABASE_URL` first so Node's environment-file precedence cannot retain a different target. Then the exact migration/seed commands are:

```bat
set DATABASE_URL=
node --env-file=.env.skill-preview node_modules/drizzle-kit/bin.cjs migrate
node --env-file=.env.skill-preview node_modules/tsx/dist/cli.mjs scripts/skill-updates.ts --seed
```

Do not run these if the file is missing its approved URL; otherwise `drizzle.config.ts` could fill the gap from `.env`. The automatic persistence runner is safer for gate A because it has no such fallback.

For a separately approved hosted preview, use the installed Vercel CLI with an approved **staging checkout** containing the reviewed candidate, and an existing approved staging Vercel project/team. Do not relink the main checkout. That project's Preview variables must already bind the verified disposable application database and scoped credentials, with the 300-second function limit supported. Validate the effective environment and domain against the approved records before upload/build. Exact commands from that staging checkout:

```bat
vercel link --yes --project %SKILL_PREVIEW_PROJECT_NAME% --scope %SKILL_PREVIEW_TEAM_SLUG%
vercel deploy --yes --target=preview --scope %SKILL_PREVIEW_TEAM_SLUG% > .env.skill-preview-url.txt
```

Expected: a successful **Preview** deployment URL on the approved staging project, no production promotion or skill schedule registration. Use that exact URL for the authenticated checks above; approve any deployment-protection bypass credential separately. After retaining sanitized evidence, remove only that approved preview deployment:

```bat
vercel remove %SKILL_PREVIEW_URL% --yes --scope %SKILL_PREVIEW_TEAM_SLUG%
```

Revoke scoped preview credentials and remove this campaign's credential files; delete the disposable database branch separately. Do not delete the hosting project or relink/modify the production checkout during cleanup. These [CLI deployment commands](https://vercel.com/docs/cli/deploy) are prepared only; they were not executed.

Preparation review overlay: **Approve with follow-ups**. Isolation, budgets, recovery tests and disabled skill scheduling address the scoped risks; hosted evidence remains a required follow-up. Launch-check verdict: **Needs manual verification / NO-GO for production**. The core hosted persistence/model/billing and migration/cron gates above are unverified.

## Local verification record · 2026-10-21

| Check                                                                   | Actual result                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:skills` with pinned local ownership proof                    | **56 passed**, zero skipped; eight SQL integration cases, four HTTP recovery cases plus guard, one migration-journal rehearsal, SDK/budget/target tests and existing domain/review cases |
| `pnpm test:cron`                                                        | **118 passed**, zero skipped; default three-attempt behavior retained                                                                                                                    |
| `pnpm typecheck`, `pnpm lint`, `git diff --check`                       | **PASS**                                                                                                                                                                                 |
| `pnpm skills:eval`                                                      | **6 offline fixtures passed**; no live model quality claim                                                                                                                               |
| Both plan commands                                                      | **PASS**, zero requests                                                                                                                                                                  |
| Hosted Neon, paid evaluation, hosted preview, production migration/cron | **NOT RUN**, require approval                                                                                                                                                            |

Saved local test output: `node_modules/.cache/skill-staging-tests.log` and `node_modules/.cache/skill-staging-cron-tests.log` (ignored). The normal sandbox denied loopback sockets; the owned local tests passed with the sandbox exception. No remote test target or inference credential was used.
