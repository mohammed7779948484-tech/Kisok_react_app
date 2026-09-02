# KioskRuntime — worklog

Evidence, by task ID. A checkmark with no command output is not evidence.

Append entries; do not rewrite history. If a gate failed and was then fixed,
both belong here — a task that failed twice is a signal worth keeping.

## Template

Record the scaffold before anything else: the command the Lead actually ran and
what it put on disk. That is what makes the chain checkable —
`plan command → command run → filesystem → task evidence`. Without it, nobody
can tell later whether a file was generated, hand-written, or left over.

The entry evidence depends on the task's declared mode, so record the mode
first. `behavior`, `bug` and `behavior-change` open with RED; `refactor` opens
with a named BASELINE shown green; `config` has no RED at all — run the thing
it configures and paste the result under VERIFICATION.

```
### T01 — <objective>
MODE: behavior | bug | behavior-change | refactor | config
ACCEPTANCE: AC-xx | Supporting AC-xx | N/A — <reason>

SCAFFOLD          (Lead, before delegating — omit only when genuinely N/A)
  $ <the exact generator command the Lead ran>
  created  : <paths>
  skipped  : <paths that already existed>
  replaced : <paths overwritten, and why that was safe>
  manual   : <planned artifacts no capability covers>

RED               (behavior | bug | behavior-change)
  $ <command>
  <the failure, and why it is the RIGHT failure — not a typo or bad import>

BASELINE          (refactor)
  $ <command naming the existing tests being preserved>
  <green, before any change>

IMPLEMENT
  <the smallest change that does it>

GREEN             (behavior | bug | behavior-change | refactor)
  $ <command>
  <pass>

VERIFICATION      (config)
  $ <the thing it configures, actually run>
  <output proving the configuration works — not that a file contains a string>

AFFECTED CHECKS
  $ <typecheck / lint / focused tests>
  <result>

DIFF
  <files touched, and anything surprising>

GATE: PASS | FAIL
```

Delete the lines that do not apply to the mode. An empty RED heading under a
`config` task is the fabricated evidence this shape exists to prevent.

## Entries

_None yet._

## Entries

### RESEARCH — five read-only evidence packets (2026-09-02)

Launched as fresh generic Super Z research contexts (no repository custom
research agent matches internet/platform scopes; the Flutter/Supabase/UI
researchers are explicitly N/A for this feature). Full packets were returned
in-session; the durable record is the synthesis in the feature's
`docs/plan.md` (the feature's plan) with per-finding primary-source URLs. Agent resume ids (Super Z coordination log):
R-A `agent-87081c68…`, R-B `agent-f1269dfd…`, R-C `agent-3967d83b…`,
R-D `agent-90263207…`, R-E `agent-10ed1c6b…`.

R-A Android Enterprise / Dedicated Devices / managed configurations /
lock-task — 22 findings, HIGH confidence. Key: DPC owns kiosk enforcement;
`android:lockTaskMode="if_whitelisted"` dual-role mechanism;
`android.content.APP_RESTRICTIONS` meta-data; restrictions read once and
cached; `ACTION_APPLICATION_RESTRICTIONS_CHANGED` → dynamically registered
receiver only (no listener API in the SDK — verified against live
reference); `KEY_RESTRICTIONS_PENDING`; defaults never appear in the
bundle; `isLockTaskPermitted` + `getLockTaskModeState()` (LOCKED ≠ PINNED)
as read-only corroboration.
Sources: developer.android.com/work/dpc/dedicated-devices (+lock-task-mode,
cookbook), /work/managed-configurations, RestrictionsManager/DevicePolicyManager/
ActivityManager/KeyguardManager references (2025-02 → 2026-08 footers).
R-B Expo SDK 54 / RN 0.81 / local modules / plugins / CNG / signing —
19 findings, HIGH. Key: `./modules` autolink; expo-module.config.json
shape; `requireOptionalNativeModule` (SDK 54 — no
`OptionalRequireNativeModule`); AsyncFunction/Events/OnStartObserving DSL;
`withAndroidManifest` + `addMetaDataItemToMainApplication(..., 'resource')` + `withDangerousMod` for res/xml; CNG regenerates android/ (template signs
release with debug keystore — e2e workflow depends on it); MYAPP*UPLOAD*_
guarded signing block; `android.versionCode` via app config (SDK 54);
apksigner/aapt2 verification. Verified against installed node_modules.
Sources: docs.expo.dev (modules/_, config-plugins/_, workflow/_,
versions/v54.0.0/_), reactnative.dev/docs/signed-apk-android,
expo-template-bare-minimum sdk-54.
R-C ManageEngine MDM Cloud product — 9 findings, HIGH. Key: QR-template →
Fully Managed; Single-App Kiosk needs Device Owner; in-house APK silent
install on DO without Play; managed app configurations supported for
in-house apps when the app declares the schema; updates silent on DO,
versionCode must increase, no downgrade; kiosk relaunch after reboot may
clear login sessions; recovery = pause kiosk / recovery key; Free edition
(25 devices) includes kiosk + AE + Enterprise Apps + REST APIs.
Sources: manageengine.com/mobile-device-management/help/\*\* (last updated
2026-07/08), edition-comparison-matrix.html (2025-04-03).
R-D ManageEngine REST API / Zoho OAuth — 10 findings, HIGH. Key: scopes
`MDMOnDemand.MDMDeviceMgmt.ALL` + `MDMInventory.READ` (no
`MDMCloud.MDMAPI`); base `https://mdm.manageengine.com/api/v1/mdm/_`     (9 data centres);`Authorization: Zoho-oauthtoken <token>`; two-phase
     `/emsapi/files`(Module: MDM_APP_MGMT, multipart key`file`) → fileID →
     poll status; `POST /api/v1/mdm/apps`app_type 2; labels/channels;
    `POST /api/v1/mdm/groups/{id}/apps`silent_install; device app status;
     approve/distribute_update (production — NOT automated); ~60/min rate
     limit + 5-min lock; error envelope; Zoho exposed-credentials policy
     counts logs as exposure → mask.
     Sources: manageengine.com/mobile-device-management/api/** + help/api/cloud/**,
     zoho.com/developer/oauth/** (2026).
  R-E GitHub Actions release safety — 17 findings, HIGH. Key: same-repo PRs DO
     receive secrets → gate by trigger; unset secret → "" (fail-closed env
     check primitive); environment secrets + required reviewers (public repo on
     Free — this repository is public, verified by anonymous clone); implicit
     environment creation hazard; workflow_dispatch runs only from default
     branch; concurrency groups; upload-artifact v7`if-no-files-found: error`;
permissions contents: read; persist-credentials: false; pull_request never
pull_request_target. Sources: docs.github.com/\*\* + actions READMEs
(fetched 2026-09-02).

### BASELINE — pre-implementation evidence (2026-09-02)

$ git clone https://github.com/mohammed7779948484-tech/Kisok_react_app.git
→ public repo (anonymous clone works); branch feature/kiosk-runtime
created from origin/main 80b8ac3cc6cc4a569e165c2bc5bdb72ddc9df618;
origin/develop = 80b8ac3 (equals main at session start).
$ pnpm install --frozen-lockfile → OK (pnpm 9.12.0 via corepack shim).
$ pnpm generate feature kiosk-runtime --role=shared
created : features/kiosk-runtime/index.ts, docs/{brief,plan,todo,worklog,review}.md
$ pnpm verify → PASS (generator smoke test last line:
"KISOK generator smoke test passed"); working tree afterwards:
only `?? features/kiosk-runtime/`.
Probe: jest cannot import `.mjs` tool modules (babel-jest leaves ESM
untransformed — scratch probe failed as expected) → tool scripts are
TypeScript, colocated `.test.ts`, executed by Node 24 native
type-stripping (`node <file>.ts` probe PASS on v24.19.0).
External dependency recorded: `git push --dry-run` fails — no GitHub
credentials in this environment. Branch push / Draft PR / GitHub CI /
live MDM dry-run are human/external actions (see plan Verification and
brief Evidence).

### T01 — SCAFFOLD (Lead, before delegating)

manual scaffold (no generator capability covers Expo local modules):
created : modules/kiosk-policy/expo-module.config.json
modules/kiosk-policy/package.json (main: src/index.ts)
modules/kiosk-policy/android/build.gradle (exact SDK-54
module shape copied from node_modules/expo-splash-screen)
modules/kiosk-policy/android/src/main/AndroidManifest.xml
modules/kiosk-policy/app.plugin.js (FULLY IMPLEMENTED —
structural config: APP_RESTRICTIONS meta-data via
AndroidConfig.Manifest.addMetaDataItemToMainApplication,
lockTaskMode=if_whitelisted via getMainActivityOrThrow,
res/xml written via withDangerousMod)
replaced : none
manual : KioskPolicyModule.kt + src/index.ts remain for the T01
implementer (task-owned files)
app.config.ts edited: added "./modules/kiosk-policy/app.plugin.js"

$ EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform android --no-install --clean
first run FAILED: "AndroidManifest.xml is missing the required MainApplication
element" — plugin bug (passed modResults.manifest to
getMainApplicationOrThrow instead of modResults root); fixed by using the
installed API shape (getMainActivityOrThrow / getMainApplicationOrThrow take
the AndroidManifest root object).
second run: ✔ Finished prebuild
generated-manifest checks (config-mode evidence):
android/app/src/main/AndroidManifest.xml:15
<meta-data android:name="android.content.APP_RESTRICTIONS"
                 android:resource="@xml/kiosk_restrictions"/>
android/app/src/main/AndroidManifest.xml:19
android:lockTaskMode="if_whitelisted" on .MainActivity
android/app/src/main/res/xml/kiosk_restrictions.xml exists with the three
planned restriction keys (kiosk_device_role [string — deviation from the
plan's "choice": string avoids res/values array resources; the MDM console
presents a text field and the app validates the value — derivation
unchanged], maintenance_unlock_code [string],
maintenance_unlock_timeout_seconds [integer])
prebuild side effect (documented risk, materialized): first run mutated
package.json (scripts android→run:android, + ios script); restored with
`git checkout -- package.json`. Tracked tree afterwards: only the intended
app.config.ts + features/kiosk-runtime/docs/todo.md changes.
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS
(after pnpm format fixed the new module files); pnpm test:ci → see
VERIFICATION entry added after the implementer run.
Kotlin compile: NOT possible locally (no Android SDK/gradle) — CI
label-gated android-build job is the compile evidence once the PR exists
(external dependency recorded).

### T01 — Expo local module `modules/kiosk-policy` (Kotlin + JS wrapper)

MODE: config
ACCEPTANCE: Supporting AC-02, Supporting AC-01

SCAFFOLD (Lead — recorded in the T01 SCAFFOLD entry above)

IMPLEMENT (fresh feature-implementer, agent-58c092d1)
modules/kiosk-policy/android/src/main/java/expo/modules/kioskpolicy/KioskPolicyModule.kt
— Name("KioskPolicy"); Events("onRestrictionsChanged");
AsyncFunction("getDevicePolicySnapshot") → { restrictions: Map (all keys
incl. restrictions_pending; null-valued keys treated as unset), lockTaskPermitted,
lockTaskModeState: none|locked|pinned }; dynamically registered receiver
(ACTION_APPLICATION_RESTRICTIONS_CHANGED, RECEIVER_NOT_EXPORTED, guarded
registration, unregister in OnStopObserving + OnDestroy); read-only (no
startLockTask/stopLockTask/DPM writes).
modules/kiosk-policy/src/index.ts
— requireOptionalNativeModule("KioskPolicy") typed surface, null on
web/test; no business logic.

GREEN / VERIFICATION (config mode — commands run by implementer and Lead)
$ EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform android --no-install --clean
✔ Finished prebuild (twice: after scaffold fix, and after implementation —
package.json mutation restored each time via git checkout)
generated manifest: APP_RESTRICTIONS meta-data (line 15) +
android:lockTaskMode="if_whitelisted" (line 19) + res/xml/kiosk_restrictions.xml
$ npx expo-modules-autolinking resolve --json --platform android
→ @kisok/kiosk-policy → modules/kiosk-policy/android →
expo.modules.kioskpolicy.KioskPolicyModule (no duplicates)
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS;
pnpm test:ci → 17 suites / 138 tests PASS
$ pnpm verify → PASS (check:docs green after F-01 fixes; generator smoke passed)

AFFECTED CHECKS
$ pnpm verify (full) → PASS (final line: "KISOK generator smoke test passed")
Static safety (AC-04): repository-wide rg for startLockTask|stopLockTask —
comments/docs only; module contains no DPM write calls.

DIFF
Untracked: modules/kiosk-policy/\*\* (7 files: 5 Lead-scaffolded + 2 implemented).
Tracked edits: app.config.ts (one plugin entry + comment) and the feature
control documents. Nothing else.

REVIEW (fresh code-reviewer, agent-077e8b21)
F-01 major — check:docs flagged 3 bare docs/<doc>.md references in control
docs → FIXED by Lead (rephrased with feature-local qualifiers).
F-02 major — worklog/todo not yet recording T01 implementation state →
FIXED by this entry + todo.md update.
F-03 minor — null-valued restriction keys would cross the bridge as null,
breaking the TS union and making T02's Zod boundary reject the WHOLE
snapshot (fail-open consequence) → REMEDIATED by the T01 implementer
(resumed): null-valued keys are dropped (Android semantics: explicit null
== unset) in Kotlin + doc comments updated in both files; Lead re-verified
(typecheck/lint/format/test green). Fresh full re-review not re-run for
this 2-line minor remediation — the Round 1 gate review (fresh context)
covers the accumulated diff; rationale recorded here.
F-04 minor — plan said kiosk_device_role "choice", shipped schema uses
"string" → plan text reconciled by Lead (Design decision 4 now documents
the choice→string rejection rationale).
Reviewer axes found clean: Kotlin DSL vs installed SDK-54 sources (all
symbols verified — nothing expected to fail compile), receiver lifecycle,
conversion/degradation direction, lock-task mapping, read-only invariant,
plugin correctness/idempotency, CNG compatibility, app.config.ts diff,
JS wrapper typing, autolink resolution, full check suite, scope discipline.

Kotlin compile: NOT provable locally (no Android SDK) — deferred to the
label-gated android-build CI job once the PR exists (external dependency;
documented plan risk; nothing in static contract review suggests failure).

GATE: PASS

### T02 — SCAFFOLD (Lead)

$ pnpm generate schema kiosk-runtime device-policy
created : features/kiosk-runtime/model/device-policy.schema.ts
features/kiosk-runtime/model/device-policy.schema.test.ts
skipped : none
replaced : none
manual : features/kiosk-runtime/model/derive-device-policy.ts (+ test) —
planned manual model artifact (pure derivation rules; the schema
capability covers the Zod boundary only)
Scaffold status: READY

### T02 — model: device-policy schema + fail-closed derivation

MODE: behavior
ACCEPTANCE: Acceptance: AC-02

SCAFFOLD (Lead — recorded in the T02 SCAFFOLD entry above)

RED (fresh feature-implementer, agent-825aa36f)
$ pnpm jest features/kiosk-runtime
derive suite: "Test suite failed to run — Cannot find module
'./derive-device-policy'" — the planned manual module does not exist yet
(the right failure: the subject is missing, not a typo/import error).
schema suite: 4 accept-side failures (placeholder {id: uuid} schema rejects
every real native snapshot) — the missing behavior.

IMPLEMENT
model/device-policy.schema.ts — real native-snapshot contract
(restrictions record of primitives, lockTaskPermitted boolean,
lockTaskModeState enum; z.strictObject; no defaults, no silent coercion).
model/derive-device-policy.ts — pure deriveDevicePolicy: role kiosk iff
!provisional && (explicit customer_kiosk || lockTaskPermitted); maintenance
code only on kiosk role (non-string/empty → null); timeout clamped
[15,600] default 90 (non-integer → default).

- the two colocated test files (43 tests).

GREEN
$ pnpm jest features/kiosk-runtime
Test Suites: 2 passed, 2 total; Tests: 43 passed, 43 total

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS
$ pnpm test:ci → 19 suites / 181 tests PASS
$ pnpm verify → PASS (generator smoke test passed)

DIFF
Untracked: features/kiosk-runtime/model/\*\* (4 files). Tracked: worklog/todo
updates only. features/kiosk-runtime/index.ts untouched.

REVIEW (fresh code-reviewer, agent-25298854)
No blocking or major findings. Two minors:
T02-R1 control-record lag → fixed by this entry + todo update.
T02-R2 brief/plan wording tension on "contradictory" → accepted with an
interpretation note in docs/review.md (Accepted risks).
Axes found clean: derivation vs binding rules (incl. pending suppression of
BOTH kiosk signals), maintenance semantics, schema trade-off (strict
top-level / open restriction keys), purity/auth-independence, test quality
(clamp boundaries, pending+allowlist, code-on-standard, drifted truthy
pending marker), pnpm verify exposure, scope discipline.

GATE: PASS

### T03 — SCAFFOLD (Lead)

$ pnpm generate store kiosk-runtime device-policy
created : features/kiosk-runtime/state/device-policy-store.ts
features/kiosk-runtime/state/device-policy-store.ts test
(features/kiosk-runtime/state/device-policy-store.test.ts)
skipped : none
replaced : none
note : the generated template is persistence-oriented (hydrate/clear/
persist through @/core/storage). This feature's device-policy
state is EPHEMERAL by plan (the maintenance credential and
unlock state must NEVER be persisted), so the task replaces the
template's persistence machinery with an in-memory store —
documented adaptation, same files.
Scaffold status: READY

### T03 — state: ephemeral device-policy store

MODE: behavior
ACCEPTANCE: Acceptance: AC-02 (AC-05 store-side semantics)

SCAFFOLD (Lead — recorded in the T03 SCAFFOLD entry above)

RED (fresh feature-implementer, agent-c10f46ad)
$ pnpm jest features/kiosk-runtime
Test Suites: 1 failed, 2 passed, 3 total; Tests: 15 failed, 43 passed
Failures: initial-state test "Expected: {role:"standard",…} Received:
undefined" (template placeholder state) and 14× "TypeError:
getState(...).applySnapshot|tryUnlock|isMaintenanceUnlocked|clearMaintenance
is not a function" — the ephemeral actions are MISSING from the template;
not a typo/import error (T02 model suites stayed green).

IMPLEMENT
state/device-policy-store.ts — ephemeral store: fail-closed default policy
(derived once via deriveDevicePolicy on the empty snapshot — remediation
R5, no hand-copied literal), LOCKED_MAINTENANCE frozen (R6);
applySnapshot (validate → derive → apply, session cleared unconditionally;
invalid → standard default + payload-free warn); tryUnlock (kiosk role +
non-null code + equality; failure = zero state change, zero logging);
isMaintenanceUnlocked (now < expiresAt, injectable now); clearMaintenance;
factory + singleton; NO storage import anywhere.
state/device-policy-store.test.ts — 15→16 tests (see GREEN).

GREEN
$ pnpm jest features/kiosk-runtime
Test Suites: 3 passed, 3 total; Tests: 59 passed, 59 total
(after remediation: +1 re-apply-re-locks test)

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS (after
Lead formatted the worklog scaffold entry); pnpm test:ci → 20 suites / 197
tests PASS; pnpm verify → PASS (generator smoke test passed)

DIFF
Untracked: features/kiosk-runtime/state/\*\* (2 files). Tracked: worklog/todo
only. index.ts untouched; no native/UI/auth/storage imports in the store.

REVIEW (fresh code-reviewer, agent-3678d2c9)
No blocking or major findings. Six minors:
T03-R1 control-record lag → fixed by this entry + todo update.
T03-R2 todo "Expected generated files" used dotted filename vs the
generator's NAME-store.ts dashed convention → todo reconciled by Lead.
T03-R3 missing same-snapshot re-lock test → FIXED (implementer resumed;
new test "re-applying the same snapshot re-locks an unlocked maintenance
session").
T03-R4 no-persistence assertion covered only read/write/remove → FIXED
(createJsonStorage + clearKisokStorage now asserted zero-call).
T03-R5 duplicated default literal → FIXED (default derived via
deriveDevicePolicy(empty snapshot)).
T03-R6 shared LOCKED_MAINTENANCE object mutable → FIXED (Object.freeze on
the shared locked session and the fail-closed default).
Axes found clean: store contract vs plan, ephemeral invariants (zero
storage surface, no value leakage), state ownership (Zustand right home,
no server-state mirroring), test quality, template adaptation honesty,
pnpm verify exposure, scope discipline.

GATE: PASS

### T04 — SCAFFOLD (Lead)

manual-only task (no generator capability covers platform IO wiring);
planned manual artifacts: features/kiosk-runtime/native/policy-source.ts
(+test), features/kiosk-runtime/native/use-device-policy-sync.ts (+test).
Scaffold status: N/A — no generator capability applies

### T04 — native policy source + sync hook

MODE: behavior
ACCEPTANCE: Supporting AC-02 (AC-05 wiring)

SCAFFOLD (Lead — manual-only task, recorded in the T04 SCAFFOLD entry)

RED (fresh feature-implementer, agent-6d82a36e)
$ pnpm jest features/kiosk-runtime
Test Suites: 2 failed, 3 passed; Tests: 59 passed — both new suites fail
with "Cannot find module './policy-source'" / "'./use-device-policy-sync'"
(the planned manual subjects do not exist; T01–T03 suites stayed green).
Implementer additionally ran private mutation probes (guard removal,
background-clear removal → dedicated tests fail; files restored
byte-identical) — corroborating that the tests catch behaviors, not just
file existence.

IMPLEMENT
native/policy-source.ts — the feature's ONLY import of
@/modules/kiosk-policy: readDevicePolicySnapshot (null when the module is
unavailable; rejections propagate), subscribeToRestrictionsChanges
(real unsubscribe / no-op when absent). Transport only: no validation,
derivation, or logging.
native/use-device-policy-sync.ts — root-mounted sync hook: read on mount;
restrictions-change re-read; AppState active → re-read, non-active →
clearMaintenance; in-flight guard collapses a burst of re-entrant events
into exactly one follow-up read (remediation T04-R3); read rejection →
one payload-free error, last-known-good retained; both subscriptions
removed on unmount.

- the two colocated test files.

GREEN
$ pnpm jest features/kiosk-runtime
Test Suites: 5 passed, 5 total; Tests: 73 passed, 73 total
(after R3 remediation: burst test replaced by two focused tests)

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS (after
Lead formatted the worklog scaffold entry — reviewer T04-R1);
$ pnpm test:ci → 22 suites / 211 tests PASS; pnpm verify → PASS

DIFF
Untracked: features/kiosk-runtime/native/\*\* (4 files). Tracked: worklog/
review/todo only (Lead). index.ts untouched; no store/model/module edits.

REVIEW (fresh code-reviewer, agent-4a4f5e23)
No blocking or major findings. Three minors:
T04-R1 worklog scaffold entry unformatted → fixed by Lead (pnpm format).
T04-R2 control-record lag → fixed by this entry + todo update.
T04-R3 in-flight guard drops the LAST re-entrant event (stale snapshot on
an all-day-foregrounded kiosk) → FIXED (implementer resumed): rerun flag +
one follow-up read per burst, two focused tests (burst collapse; no
spurious re-run).
Axes found clean: source boundary passthrough semantics, hook behaviors
(incl. StrictMode double-mount and post-unmount apply examined —
harmless), listener/resolver separation vs core/auth pattern, test quality
(AppState spied not module-mocked — documented strengthening; mutation
probes credible), value-leak safety (assertions that code/role values
never reach logs), verify exposure, scope discipline (feature's only
runtime import of the module confirmed by repo-wide grep).

GATE: PASS

### ROUND 1 GATE — device-policy foundation

Round content: T01 (module + CNG wiring), T02 (model), T03 (store), T04
(source + sync). All four task gates PASS (commits 046de87, b09b210,
60ad912, a20e610 + this gate's R1-1 remediation).

ROUND REVIEW (fresh round-scope code-reviewer, agent-50885851)
Seams examined — ALL CLEAN except one minor:

- type/contract chain Kotlin → JS types → Zod → derive → store (key
  spellings, value unions incl. null-drop, enum; bridge serialization
  verified against installed expo-modules-core converters; build-graph
  check: androidx.core reaches the module transitively — no compile hazard)
- event chain (bursts collapse to one follow-up; applies serialized;
  duplicates idempotent; unmount/re-mount clean)
- lifecycle interplay (OnStartObserving guard, OnDestroy unregister,
  effect deps stable, conservative non-active clear)
- failure-mode coherence end-to-end (missing services/module → standard;
  read rejection keeps last-known-good; schema rejection → standard; the
  documented rejection-vs-invalid asymmetry is absence-of-data vs
  invalid-data, both individually safe)
- read-only invariant AC-04 across the whole round diff (comments only)
- round-level verify green; generated android/ tree corroborates the
  prebuild evidence; package identity com.kisok.kiosk unchanged (AC-01)
- combined behavior story: kiosk tablet / standard tablet / web all end
  where the plan says
  R1-1 minor — subscribe-after-read-dispatch ordering window → FIXED by the
  T04 implementer (subscription registered before the initial read; two-line
  swap + comment; all 73 tests stay green). Recorded in docs/review.md.

ROUND CHECKS
$ pnpm verify → PASS (all 22 suites / 211 tests + guards; generator smoke)
$ git diff 2414763..HEAD → 23 files: modules/kiosk-policy/\*\*, the feature's
model/state/native layers, app.config.ts (+6 lines, plugin entry), and
the feature control documents. No other shared files.

ROUND GATE: PASS

### T05 — SCAFFOLD (Lead)

$ pnpm generate screen kiosk-runtime kiosk-mismatch
created : features/kiosk-runtime/screens/kiosk-mismatch/kiosk-mismatch-screen.tsx
features/kiosk-runtime/screens/kiosk-mismatch/kiosk-mismatch-screen.test.ts
(screen-private components/ dir available beside them)
$ pnpm generate route kiosk-runtime kiosk-mismatch --role=shared --screen=kiosk-mismatch
created : app/kiosk-mismatch.tsx (top-level route; nothing occupied the
path — no --force needed)
appended : features/kiosk-runtime/index.ts — export { KioskMismatchScreen }
Scaffold status: READY

### T05 — kiosk mismatch screen + route

MODE: behavior
ACCEPTANCE: AC-03 (AC-06 wiring for the screen's action)

SCAFFOLD (Lead — generator screen + route; commit ae8f9ca; see the T05
SCAFFOLD entry above)

RED (fresh feature-implementer, agent-f7d5e464)
$ pnpm jest features/kiosk-runtime
Test Suites: 1 failed, 5 passed; Tests: 4 failed, 73 passed — the new tests
cannot find "This is a customer tablet" or the
"Sign out and return to customer sign-in" button (the generator placeholder
renders instead; T01–T04 suites stayed green). Right failure: behaviour
missing, not an import/typo error.

IMPLEMENT
screens/kiosk-mismatch/kiosk-mismatch-screen.tsx — Screen (all edges) →
centered ScrollView → max-w-md column: Text h2 "This is a customer tablet",
Text lead muted explanation (jargon-free), Button size="large" block labeled
exactly "Sign out and return to customer sign-in" wired to
useSignOutAction() from @/core/auth (AC-06 — no parallel sign-out logic);
disabled={pending}; the pipeline's message rendered verbatim in
Alert variant="warning" (accessibilityRole="alert" +
accessibilityLiveRegion="polite" — announced, retryable). No store import,
no Supabase, no visibility re-derivation (T07 owns routing); no component
extraction (45-line screen).

GREEN
$ pnpm jest features/kiosk-runtime
Test Suites: 6 passed, 6 total; Tests: 77 passed, 77 total
First green attempt exposed an RNTL v14 limitation — getByRole("alert")
cannot match the design-system Alert (plain View is not an accessibility
element); the test pins the announcement contract on the Alert's own props
(toHaveProp accessibilityRole/liveRegion) with a comment explaining why.
Implementer mutation probes (restored byte-identical): Alert → plain
destructive Text fails the blocked test; removing disabled={pending} fails
the pending test.

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS
(implementer formatted its test file); $ pnpm test:ci → 23 suites / 215
tests PASS.

DIFF
Tracked: the screen + test (implementer), todo.md board catch-up (Lead,
reviewer T05-R2). Route file + index.ts untouched from generator output
(reviewer verified byte-identical via git hash-object + template match).

REVIEW (fresh code-reviewer, agent-598c15c7)
No blocking or major findings. Two minors:
T05-R1 plan's test strategy promises "blocked/failed message surfaced" but
only the blocked outcome was tested at the screen seam → FIXED (implementer
resumed): one failed-outcome test (mock signOut returns error + session
retained → pipeline's failed reason in the announced Alert, exactly one
signOut call with scope "local"); seam-sensitivity probe: flipping
sessionAfterSignOut to null makes exactly this test fail — pins the failed
mapping, not "a signOut call happened".
T05-R2 control-record contradiction: committed todo.md status board said
"not started/PENDING" for T01–T04 while the worklog recorded GATE: PASS
(previous session's lag) → fixed by THIS commit (board catch-up included;
board+checkpoint updated in the same commit as the gate from now on).
Axes found clean: contract fidelity (message/action/pipeline-reuse/state
honesty), design-system discipline (primitives only, semantic tokens,
h-14 ≥ 48dp, accessible name, announced message, no colour-only meaning),
screen purity (no store/Supabase/auth-context beyond useSignOutAction;
route byte-identical to generator output), test quality (real-pipeline
seam per sign-out-semantics pattern; RNTL v14 role-query rationale verified
against installed RNTL/test-renderer source), scaffold integrity, pnpm
verify exposure (six affected checks re-run green), scope discipline.

PRE-COMMIT ADJUSTMENT (Lead)
lint-staged runs `eslint --max-warnings=0` on staged files, which is
stricter than `expo lint` on JSX apostrophes (react/no-unescaped-entities;
the pre-existing unauthorized-screen.tsx carries the same latent error).
The muted description moved to a JS string constant rendered via
{DESCRIPTION} — the repo's own passing pattern (unauthorized-screen line
22). Rendered text unchanged; all 78 tests stay green.

GREEN AFTER REMEDIATION
$ pnpm jest features/kiosk-runtime → 6 suites / 78 tests PASS;
$ pnpm test:ci → 23 suites / 216 tests PASS; typecheck/lint/format:check
re-run by the Lead → PASS; eslint on the screen file → clean.

GATE: PASS
