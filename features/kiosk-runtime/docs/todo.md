# KioskRuntime — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at the
end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

```
Current round     : REMEDIATION (post-gate independent review)
Current task      : —
Current stage     : FEATURE GATE REOPENED by independent remediation review (IR-01..IR-09). Seven read-only current-documentation researchers pending (batches 3+2+2); NO implementation before all seven packets return and the Plan is READY again.
Last gate         : (historical) FEATURE GATE: PASS @ b71c828 — REOPENED 2026-09-04, not current approval
Next legal action : Lead: launch research BATCH A (R1 Android policy / R2 Expo-RN routing / R3 MDM Files API), then B (R4, R5), then C (R6, R7); synthesize IR verdicts; Plan DRAFT → Lead Planning Review → READY; only then remediation tasks.

REMEDIATION_START_FEATURE_SHA=b71c8285c6e26fb6fd1463c4b0a81cd8ae1afe31
REMEDIATION_START_DEVELOP_SHA=3a25640b602a685c690a4b467b6e900625484c89 (develop advanced past the earlier integration point 6161a4c — PR #12 cart hardening; re-integration required before final verification)

FINAL CODE HEAD: ae1a982 (code) → b149f16 (closing records) → the FEATURE GATE commit (docs-only; CI re-verified on b149f16: fast tier run 33830212176 + Android build run 33830212185, both SUCCESS) — all HISTORICAL evidence; invalid for the reopened gate on any new HEAD

Blocked by        : — (push credentials verified; workflow scope present; PR #9 open/draft/base=develop at b71c828)
```

## Rules

- A task is **DONE only at `GATE: PASS`**.
- **Task N+1 does not start until every dependency is `PASS`.**
- A failed gate is fixed **in that task**, not compensated in a later one.
- Every task declares a **verification mode** first — see the
  `test-driven-development` skill. The mode decides the entry evidence:
  `behavior` / `bug` / `behavior-change` need a failing test, `refactor` needs a
  named green baseline, `config` needs the command that exercises the artifact.
- **No task starts while `plan.md` is `DRAFT`.** (It is `READY`.)
- **The Lead runs the scaffold**, immediately before delegating the task. The
  implementer starts only once `Scaffold status` is `READY`.

## Status board

Scan this first. Detail is below.

| Task | Mode            | Acceptance                          | Objective                                                                    | Deps          | Stage | Gate |
| ---- | --------------- | ----------------------------------- | ---------------------------------------------------------------------------- | ------------- | ----- | ---- |
| T01  | config          | Supporting AC-02, AC-01             | Expo local module + config plugin + app config wiring                        | —             | done  | PASS |
| T02  | behavior        | Acceptance: AC-02                   | model schema + fail-closed derivation                                        | T01           | done  | PASS |
| T03  | behavior        | Acceptance: AC-02                   | device-policy store (ephemeral maintenance session)                          | T02           | done  | PASS |
| T04  | behavior        | Supporting AC-02                    | native policy source + sync hook                                             | T03           | done  | PASS |
| T05  | behavior        | Acceptance: AC-03                   | kiosk mismatch screen + route                                                | T03           | done  | PASS |
| T06  | behavior        | Acceptance: AC-05                   | maintenance UI (entry, unlock sheet, panel)                                  | T03           | done  | PASS |
| T07  | behavior-change | Acceptance: AC-03, AC-04            | root guard resolver + app/\_layout.tsx integration + static lock-task search | T04, T05, T06 | done  | PASS |
| T08  | config          | Supporting AC-07                    | release-signing config plugin + .gitignore                                   | —             | done  | PASS |
| T09  | behavior        | Acceptance: AC-08, Supporting AC-01 | tools/release/verify-release-apk.ts + tests                                  | —             | done  | PASS |
| T10  | config          | Supporting AC-07                    | android-release.yml workflow                                                 | T08, T09      | done  | PASS |
| T11  | behavior        | Acceptance: AC-09                   | tools/mdm/upload-beta.ts + tests                                             | —             | done  | PASS |
| T12  | config          | Supporting AC-09                    | mdm-beta-upload.yml workflow                                                 | T09, T11      | done  | PASS |
| T13  | config          | Acceptance: AC-10                   | docs/mdm-operations.md operational contract                                  | T01–T12       | done  | PASS |

Stage is one of: `not started` · `scaffolding` · `red/baseline` ·
`implementing` · `green` · `checks` · `diff review` · `done`.

This board is the only summary. Do not add a second task-checkbox list beside
it — two summaries disagree the moment one is updated and the other is not.

## Round 1 — Device-policy foundation

### T01 — Expo local module + config plugin + app config wiring

- **Mode**: config
- **Acceptance**: Supporting AC-02, AC-01
- **Depends on**: —
- **Skills**: test-driven-development, expo-dev-client
- **Lead scaffold**: manual (planned) — `modules/kiosk-policy/{expo-module.config.json, package.json, android/build.gradle, android/src/main/AndroidManifest.xml, app.plugin.js (fully implemented — it is structural config)}`; edit `app.config.ts` (add plugin reference). Reason: no KISOK generator capability covers Expo local modules; `create-expo-module` is interactive and over-scaffolds.
- **Expected generated files**: none (generator N/A for this task)
- **Allowed manual files**: `modules/kiosk-policy/android/src/main/java/expo/modules/kioskpolicy/KioskPolicyModule.kt`, `modules/kiosk-policy/src/index.ts` (the native implementation the task owns)
- **Scaffold status**: `N/A — no generator capability applies; Lead scaffolds the planned module structure + plugin`
- **Allowed file scope**: `modules/kiosk-policy/**`, `app.config.ts`
- **Focused verification**: `npx expo prebuild --platform android --no-install --clean` (with `EXPO_NO_GIT_STATUS=1`, then `git status` to prove no tracked file changed); generated manifest contains `android.content.APP_RESTRICTIONS` meta-data + `android:lockTaskMode="if_whitelisted"`; `android/app/src/main/res/xml/kiosk_restrictions.xml` exists with the three planned restriction keys; `pnpm typecheck && pnpm lint && pnpm test:ci && pnpm format:check`

### T02 — model schema + fail-closed derivation

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-02
- **Depends on**: T01
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate schema kiosk-runtime device-policy`
- **Expected generated files**: `features/kiosk-runtime/model/device-policy.schema.ts` + `device-policy.schema.test.ts`
- **Allowed manual files**: `features/kiosk-runtime/model/derive-device-policy.ts` + `derive-device-policy.test.ts` (pure derivation — the schema capability covers the Zod boundary only)
- **Scaffold status**: PENDING
- **Allowed file scope**: `features/kiosk-runtime/model/**`
- **Focused verification**: derivation tests (RED first); affected checks green

### T03 — device-policy store

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-02
- **Depends on**: T02
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate store kiosk-runtime device-policy`
- **Expected generated files**: `features/kiosk-runtime/state/device-policy-store.ts` + `device-policy-store.test.ts` (generator naming: NAME-store.ts — dashed, not dotted; reconciled at T03 review)
- **Allowed manual files**: none beyond the generated pair (adapted in place)
- **Scaffold status**: PENDING
- **Allowed file scope**: `features/kiosk-runtime/state/**`
- **Focused verification**: store tests (RED first) incl. no-persistence assertion (mocked `@/core/storage` surface)

### T04 — native policy source + sync hook

- **Mode**: behavior
- **Acceptance**: Supporting AC-02
- **Depends on**: T03
- **Skills**: test-driven-development, kisok-react-native-rules
- **Lead scaffold**: none (manual-only task)
- **Expected generated files**: none
- **Allowed manual files**: `features/kiosk-runtime/native/policy-source.ts` + `.test.ts`, `features/kiosk-runtime/native/use-device-policy-sync.ts` + `.test.ts` (platform IO boundary + wiring; planned manual artifacts)
- **Scaffold status**: `N/A — no generator capability covers platform IO wiring`
- **Allowed file scope**: `features/kiosk-runtime/native/**`
- **Focused verification**: source/sync tests (RED first; native module mocked; AppState mocked)

## Round 2 — Kiosk safety UI and maintenance

### T05 — kiosk mismatch screen + route

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-03
- **Depends on**: T03
- **Skills**: test-driven-development, kisok-design-system
- **Lead scaffold**: `pnpm generate screen kiosk-runtime kiosk-mismatch` then `pnpm generate route kiosk-runtime kiosk-mismatch --role=shared --screen=kiosk-mismatch`
- **Expected generated files**: `features/kiosk-runtime/screens/kiosk-mismatch/kiosk-mismatch-screen.tsx` + test (+ `components/` dir); `app/kiosk-mismatch.tsx`; `features/kiosk-runtime/index.ts` export appended by the route generator
- **Allowed manual files**: none beyond generated
- **Scaffold status**: READY (2026-09-02 — generator screen + route run by Lead; committed ae8f9ca; 23 suites / 212 tests green incl. template)
- **Allowed file scope**: `features/kiosk-runtime/screens/kiosk-mismatch/**`, `features/kiosk-runtime/index.ts`, `app/kiosk-mismatch.tsx`
- **Focused verification**: screen test (RED first) — renders for preparation-on-kiosk, sign-out control wired to `useSignOutAction`, blocked/failed message surfaced

### T06 — maintenance UI

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-05
- **Depends on**: T03
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component kiosk-runtime maintenance-entry`; `pnpm generate component kiosk-runtime maintenance-sheet`; `pnpm generate component kiosk-runtime kiosk-maintenance-overlay`
- **Expected generated files**: three components + tests under `features/kiosk-runtime/components/`
- **Allowed manual files**: none beyond generated
- **Scaffold status**: READY (2026-09-02 — three components generated by Lead; component capability emits no test files, so RED tests are the implementer's first step, per the generator's own Next-steps guidance)
- **Allowed file scope**: `features/kiosk-runtime/components/**`
- **Focused verification**: component tests (RED first) — entry visible only on kiosk; long-press opens unlock; wrong code retry state; unlock expiry; switch-account uses the shared sign-out action; a11y labels; managed code never rendered/logged

### T07 — root integration

- **Mode**: behavior-change
- **Acceptance**: Acceptance: AC-03, AC-04
- **Depends on**: T04, T05, T06
- **Skills**: test-driven-development, expo-router, kisok-react-native-rules
- **Lead scaffold**: none (manual edits)
- **Expected generated files**: none
- **Allowed manual files**: `features/kiosk-runtime/model/root-guard.ts` + `.test.ts` (+ optional `root-guard-lock-task.test.ts`); `features/kiosk-runtime/state/use-root-target.ts` + `.test.ts`; edits to `app/_layout.tsx` and `app/index.tsx` (the two planned shared changes — see plan Design decision 6 as amended pre-T07); `features/kiosk-runtime/index.ts` export widening (useRootTarget, useDevicePolicySync, KioskMaintenanceOverlay ONLY)
- **Scaffold status**: `N/A — integration wiring; resolver + hook are planned manual files`
- **Allowed file scope**: `features/kiosk-runtime/model/root-guard*`, `features/kiosk-runtime/state/use-root-target*`, `features/kiosk-runtime/index.ts`, `app/_layout.tsx`, `app/index.tsx`
- **Focused verification**: resolver tests (RED for the NEW behavior; standard rows equal today's routing); all existing auth/routing tests stay green; repository-wide static search for app-owned `startLockTask`/`stopLockTask` returns nothing; web runtime regression at tablet sizes

## Round 3 — Signed release delivery

### T08 — release-signing config plugin

- **Mode**: config
- **Acceptance**: Supporting AC-07
- **Depends on**: —
- **Skills**: test-driven-development, expo-dev-client
- **Lead scaffold**: none (manual)
- **Expected generated files**: none
- **Allowed manual files**: `plugins/with-android-release-signing.ts`; edits to `app.config.ts` (plugin reference) and `.gitignore` (`*.keystore`)
- **Scaffold status**: `N/A — no generator capability covers release plumbing`
- **Allowed file scope**: `plugins/**`, `app.config.ts`, `.gitignore`
- **Focused verification**: prebuild WITH env vars → generated `android/app/build.gradle` contains the guarded `signingConfigs.release` block and `android/gradle.properties` contains the `MYAPP_UPLOAD_*` entries; prebuild WITHOUT env → neither present (e2e workflow compatibility); no tracked file changed by prebuild runs

### T09 — release APK verification script

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-08, Supporting AC-01
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: none (manual)
- **Expected generated files**: none
- **Allowed manual files**: `tools/release/verify-release-apk.ts` + `verify-release-apk.test.ts`
- **Scaffold status**: `N/A — no generator capability covers repo tooling`
- **Allowed file scope**: `tools/release/**`
- **Focused verification**: script tests (RED first) — env fail-closed, badging parsing, version matching, debug-cert rejection, bundle presence; self-contained (node-builtin imports only) for Node 24 execution

### T10 — android-release workflow

- **Mode**: config
- **Acceptance**: Supporting AC-07
- **Depends on**: T08, T09
- **Skills**: test-driven-development
- **Lead scaffold**: none (manual)
- **Expected generated files**: none
- **Allowed manual files**: `.github/workflows/android-release.yml`
- **Scaffold status**: `N/A — workflow file`
- **Allowed file scope**: `.github/workflows/android-release.yml`
- **Focused verification**: YAML parses; `pnpm verify` green (check:ci-scripts scans workflows); structural review against the design (dispatch-only, secret checks fail closed, verify step, artifact upload, permissions, persist-credentials, concurrency). The workflow must restore `package.json` after prebuild — prebuild mutates the android/ios scripts (the documented mitigation; T08-F04). The workflow's verify step must assert the script's success line (`APK verification passed`) in its captured output — a mis-invoked or renamed script must not pass the delivery gate silently (T09-F02)

### T11 — MDM upload script

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-09
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: none (manual)
- **Expected generated files**: none
- **Allowed manual files**: `tools/mdm/upload-beta.ts` + `upload-beta.test.ts`
- **Scaffold status**: `N/A — no generator capability covers repo tooling`
- **Allowed file scope**: `tools/mdm/**`
- **Focused verification**: script tests (RED first) — mocked `fetch` covering token exchange/masking, dry-run read-only, two-phase upload, app create/update payloads, monotonic versionCode refusal, group refusal (missing/production), silent_install association, rate-limit backoff, error envelope; self-contained for Node 24. Contract per the 2026-09-03 research revalidation (plan research synthesis): upload completion confirmed from the upload response's `fileStatus` (no polling endpoint in current docs); app create carries the documented Required `app_category_id` + Beta `release_label_id`; the monotonic pre-check compares versions via the documented string `version`/`release_labels[].app_version` fields; multipart key `file` per the docs prose

### T12 — mdm-beta-upload workflow

- **Mode**: config
- **Acceptance**: Supporting AC-09
- **Depends on**: T09, T11
- **Skills**: test-driven-development
- **Lead scaffold**: none (manual)
- **Expected generated files**: none
- **Allowed manual files**: `.github/workflows/mdm-beta-upload.yml`
- **Scaffold status**: `N/A — workflow file`
- **Allowed file scope**: `.github/workflows/mdm-beta-upload.yml`
- **Focused verification**: YAML parses; `pnpm verify` green; structural review (dispatch-only, dry-run default, artifact download by run id, re-verify before upload, secret checks, masking, permissions, persist-credentials, concurrency). Per T11-F02 (Lead disposition, as implemented): optional dispatch inputs (production-group-id / app-category-id / redirect-uri) reach the tool ONLY when non-empty — implemented as conditional CLI FLAGS at the upload step (strictly stronger than conditional env export; no set-but-empty value ever reaches the tool as a flag or env); the required MDM_CLIENT_ID / MDM_CLIENT_SECRET / MDM_REFRESH_TOKEN are always exported as step env

### T13 — ManageEngine operational contract

- **Mode**: config
- **Acceptance**: Acceptance: AC-10
- **Depends on**: T01–T12 (evidence references)
- **Skills**: test-driven-development
- **Lead scaffold**: none (manual)
- **Expected generated files**: none
- **Allowed manual files**: `features/kiosk-runtime/docs/mdm-operations.md`
- **Scaffold status**: `N/A — documentation`
- **Allowed file scope**: `features/kiosk-runtime/docs/mdm-operations.md`
- **Focused verification**: `pnpm verify` green (check:docs); content review against the research packets (enrollment, kiosk profile, app config, silent install, updates/rollback, recovery, beta path, activation prerequisites, unverified list); MUST also cover the android-release dispatch contract per T10-F02 — who may dispatch, that the human must create the four ANDROID*KEYSTORE*\* repository Actions secrets first (naming names, never values), that `workflow_dispatch` only lists/needs the workflow file on the default branch before the first dispatch, and that the MDM upload workflow downloads the `kisok-release-apk` artifact by name + run id within its 30-day retention window

Round gates: Round 1 `PASS` · Round 2 `PASS` · Round 3 `PASS` (recovered; fresh round review, agent-95fd66ea; R3-1/R3-2/R3-3 fixed)

## Feature gate

Every line is a box, and `pnpm verify` alone is not the authority — several of
these depend on an environment only CI has. See `review.md` for the review and
audit findings this checklist points at.

- [x] Every Task Gate PASS (T01–T09 durable pre-recovery, re-baselined green at the recovery checkpoint; T10–T13 recovered with fresh evidence, each with a fresh task review)
- [x] Every Round Gate PASS (Round 1/2 durable; Round 3 recovered — fresh round review agent-95fd66ea, R3-1/2/3 fixed)
- [x] Every AC verified (AC-01…AC-10 — see the worklog's final review entry; on-hardware rows explicitly unverified, never claimed)
- [x] `pnpm verify` PASS after the final local change (68 suites / 798 tests at ae1a982, integrated with current develop)
- [x] required fast GitHub CI PASS on the final HEAD — Verify / Web bundle / Expo doctor all SUCCESS on ae1a982
- [x] required runtime evidence recorded (browser standard-path at tablet landscape + portrait from the CI-equivalent static export; zero errors; no kiosk surfaces; /kiosk-mismatch fail-closed — re-collected at the final HEAD after the FR-02 fix)
- [x] required native tier(s) PASS, N/A, or explicitly unverified — prebuild local PASS; **Kotlin/native compile: Android build job PASS on ae1a982** (label-gated run; the FR-01 failure was diagnosed and fixed in the fix-in-task loop); physical kiosk = explicitly unverified
- [x] Reviewer findings dispositioned (T01…T13, R2/R3, FR-01/FR-02, FRR-01 — every row in review.md dispositioned)
- [x] blocking/major fixes re-reviewed (FR-01 blocking → fresh re-review agent-c73d726b verified the fix AND the compile re-gate; FR-02 → same re-review, RED empirically re-verified)
- [x] Quality Audit clean — PASS (fresh auditor agent-a4f4d55f: "the delivery is sound"; no not-delivered / not-planned findings; not-evidenced items settled with run ids; recorded in review.md)
- [x] anything not verified explicitly recorded (the brief's Evidence section + mdm-operations.md §9: physical kiosk behavior, live MDM dry-run, first real upload, hardware/live-tenant items — first-class unverified lists)
- [x] shared/core changes justified (the plan's "Files expected to change" list; core/** and components/** untouched)
- [x] PR evidence matches the worklog — Draft PR #9 (base develop) head = ae1a982 = the final HEAD; every gate commit pushed and verified on the PR

FEATURE GATE: PASS — **historical; REOPENED 2026-09-04 by an independent
post-gate review (IR-01..IR-09; see review.md "Post-gate independent
remediation review"). The checklist above describes the evidence that earned
the PRIOR pass, not a current approval. A NEW gate must be earned on the
remediated HEAD after: seven current-documentation research packets,
remediation task gates, current-develop re-integration, fresh final review,
fresh quality audit.**

## Remediation (post-gate review)

The prior pass is reopened. New bounded remediation tasks (stable new IDs,
appended after T13, never renumbering T01–T13) will be defined in `plan.md`
AFTER the seven read-only researchers return and the Lead synthesis produces
the IR-01..IR-09 verdict matrix. No remediation implementation may start while
`plan.md` is DRAFT.

## Blocked

What cannot proceed, and what it is waiting for. Empty is good.

- GitHub push credentials were provided by the user (session 2). Branch
  `feature/kiosk-runtime` is pushed; Draft PR #9 (base `develop`) is open and
  receives every Lead gate-commit. Still external/human-only:
  the live ManageEngine MDM dry-run (needs the customer's MDM tenant), and
  physical-kiosk verification (no physical tablet exists in this environment).
