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
Current round     : 3
Current task      : T09
Current stage     : not started
Last gate         : T08 GATE: PASS
Next legal action : delegate T09 (tools/release/verify-release-apk.ts + tests — planned manual artifacts, no scaffold needed), then T10

Blocked by        : — (push credentials provided by the user; branch pushed and Draft PR #9 open — see Blocked below for what stays external)
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

| Task | Mode            | Acceptance                          | Objective                                                                    | Deps          | Stage       | Gate    |
| ---- | --------------- | ----------------------------------- | ---------------------------------------------------------------------------- | ------------- | ----------- | ------- |
| T01  | config          | Supporting AC-02, AC-01             | Expo local module + config plugin + app config wiring                        | —             | done        | PASS    |
| T02  | behavior        | Acceptance: AC-02                   | model schema + fail-closed derivation                                        | T01           | done        | PASS    |
| T03  | behavior        | Acceptance: AC-02                   | device-policy store (ephemeral maintenance session)                          | T02           | done        | PASS    |
| T04  | behavior        | Supporting AC-02                    | native policy source + sync hook                                             | T03           | done        | PASS    |
| T05  | behavior        | Acceptance: AC-03                   | kiosk mismatch screen + route                                                | T03           | done        | PASS    |
| T06  | behavior        | Acceptance: AC-05                   | maintenance UI (entry, unlock sheet, panel)                                  | T03           | done        | PASS    |
| T07  | behavior-change | Acceptance: AC-03, AC-04            | root guard resolver + app/\_layout.tsx integration + static lock-task search | T04, T05, T06 | done        | PASS    |
| T08  | config          | Supporting AC-07                    | release-signing config plugin + .gitignore                                   | —             | done        | PASS    |
| T09  | behavior        | Acceptance: AC-08, Supporting AC-01 | tools/release/verify-release-apk.ts + tests                                  | —             | not started | PENDING |
| T10  | config          | Supporting AC-07                    | android-release.yml workflow                                                 | T08, T09      | not started | PENDING |
| T11  | behavior        | Acceptance: AC-09                   | tools/mdm/upload-beta.ts + tests                                             | —             | not started | PENDING |
| T12  | config          | Supporting AC-09                    | mdm-beta-upload.yml workflow                                                 | T09, T11      | not started | PENDING |
| T13  | config          | Acceptance: AC-10                   | docs/mdm-operations.md operational contract                                  | T01–T12       | not started | PENDING |

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
- **Focused verification**: YAML parses; `pnpm verify` green (check:ci-scripts scans workflows); structural review against the design (dispatch-only, secret checks fail closed, verify step, artifact upload, permissions, persist-credentials, concurrency). The workflow must restore `package.json` after prebuild — prebuild mutates the android/ios scripts (the documented mitigation; T08-F04)

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
- **Focused verification**: script tests (RED first) — mocked `fetch` covering token exchange/masking, dry-run read-only, two-phase upload, app create/update payloads, monotonic versionCode refusal, group refusal (missing/production), silent_install association, rate-limit backoff, error envelope; self-contained for Node 24

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
- **Focused verification**: YAML parses; `pnpm verify` green; structural review (dispatch-only, dry-run default, artifact download by run id, re-verify before upload, secret checks, masking, permissions, persist-credentials, concurrency)

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
- **Focused verification**: `pnpm verify` green (check:docs); content review against the research packets (enrollment, kiosk profile, app config, silent install, updates/rollback, recovery, beta path, activation prerequisites, unverified list)

Round gates: Round 1 `PASS` · Round 2 `PASS` · Round 3 `PENDING`

## Feature gate

Every line is a box, and `pnpm verify` alone is not the authority — several of
these depend on an environment only CI has. See `review.md` for the review and
audit findings this checklist points at.

- [ ] Every Task Gate PASS
- [ ] Every Round Gate PASS
- [ ] Every AC verified
- [ ] `pnpm verify` PASS after the final local change
- [ ] required fast GitHub CI PASS on the final HEAD — **push now available (user-provided token): Draft PR #9 open, CI observed running on the PR; final-HEAD run still pending because rounds 2–3 continue**
- [ ] required runtime evidence recorded (web standard-path regression at tablet sizes)
- [ ] required native tier(s) PASS, N/A, or explicitly unverified (prebuild local PASS; Kotlin compile = CI label-gated, pending PR; physical kiosk = explicitly unverified)
- [ ] Reviewer findings dispositioned
- [ ] blocking/major fixes re-reviewed
- [ ] Quality Audit clean
- [ ] anything not verified explicitly recorded
- [ ] shared/core changes justified
- [ ] PR evidence matches the worklog — **Draft PR #9 (base develop) open at feature/kiosk-runtime; every Lead gate-commit is pushed to it; final HEAD match still pending**

FEATURE GATE: PENDING

## Blocked

What cannot proceed, and what it is waiting for. Empty is good.

- GitHub push credentials were provided by the user (session 2). Branch
  `feature/kiosk-runtime` is pushed; Draft PR #9 (base `develop`) is open and
  receives every Lead gate-commit. Still external/human-only:
  the live ManageEngine MDM dry-run (needs the customer's MDM tenant), and
  physical-kiosk verification (no physical tablet exists in this environment).
