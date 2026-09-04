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

### T06 — SCAFFOLD (Lead)

$ pnpm generate component kiosk-runtime maintenance-entry
created : features/kiosk-runtime/components/maintenance-entry.tsx
$ pnpm generate component kiosk-runtime maintenance-sheet
created : features/kiosk-runtime/components/maintenance-sheet.tsx
$ pnpm generate component kiosk-runtime kiosk-maintenance-overlay
created : features/kiosk-runtime/components/kiosk-maintenance-overlay.tsx
Note: the component capability emits the component only (no test template —
unlike screen). RED tests are the implementer's entry evidence by design.
Scaffold status: READY

### T06 — maintenance UI

MODE: behavior
ACCEPTANCE: AC-05 (AC-06 wiring for switch-account)

SCAFFOLD (Lead — three generator components; see the T06 SCAFFOLD entry
above; the component capability emits no test files — RED tests are the
implementer's entry evidence)

RED (fresh feature-implementer, agent-0094cbe8)
$ pnpm jest features/kiosk-runtime
Test Suites: 3 failed, 6 passed, 9 total; Tests: 21 failed, 81 passed —
the new suites cannot find the Maintenance entry button / sheet contents
(generator placeholders render instead; T01–T05 suites stayed green).
Three tests passed trivially at RED ("renders nothing on a standard
device", "renders no sheet content while closed", "renders nothing when
not visible" — post-contract absence pins, each would fail if the real
component wrongly rendered; count corrected per reviewer T06-R1, the
implementer's report said two). The reviewer re-ran the RED state
empirically on a scratch copy with placeholder components restored:
21 failed / 3 passed — confirmed.

IMPLEMENT
components/maintenance-entry.tsx — presentational corner affordance:
ghost/icon Button (h-touch w-touch ≥ 48dp), muted Wrench icon,
accessibilityLabel "Maintenance" + long-press hint, NO onPress (tap does
nothing — deliberate difficulty), visible/onLongPress props, absolute
top-right with safe-area inset.
components/maintenance-sheet.tsx — AdaptiveSheet: LOCKED = labelled
masked Input + Unlock/Close; wrong code → one fixed retry sentence
("That code didn't work.") through Input's announced errorMessage slot
(no code-existence signal); UNLOCKED panel = "Switch customer account"
wired to useSignOutAction() from @/core/auth (AC-06; pending disables
primary AND Close — T06-R2; message verbatim in announced Alert per the
T05 pattern); typed code cleared on unlock/close; onAccountSwitched
reports full success upward (justified contract addition — reviewer
judged placement sound: the sheet owns the hook, only it can observe
completion; the store-free sheet needs a callback bridge).
components/kiosk-maintenance-overlay.tsx — the ONLY store reader:
renders nothing when policy.role ≠ customer-kiosk; owns sheetOpen; passes
tryUnlock to the sheet; owns the expiry timer (setTimeout(clearMaintenance,
expiresAt − now) with Math.max(0,·), re-armed on new expiresAt, cleared on
unmount); clears the session + closes the sheet on account switch; NO
AppState logic (T04 owns background clearing).

GREEN
$ pnpm jest features/kiosk-runtime
Test Suites: 9 passed, 9 total; Tests: 102 passed, 102 total
(includes the T06-R2 regression test: Close disabled mid-flight,
re-enabled after settle)

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS;
$ pnpm exec eslint features/kiosk-runtime/components/ → clean (the
T05 pre-commit lesson applied: every user-facing string is a JS constant);
$ pnpm test:ci → 26 suites / 240 tests PASS.

DIFF
Untracked: features/kiosk-runtime/components/\*\* (6 files: 3 components +
3 test files). Tracked: todo.md/worklog.md (Lead scaffold records only).

REVIEW (fresh code-reviewer, agent-43378a8a)
No blocking or major findings. Two minors:
T06-R1 RED record said "2 trivially-passing tests"; the reviewer's
empirical RED re-run (scratch copy, placeholders restored) shows 3 →
record corrected in this entry (nothing to change in the tests — all
three are honest post-contract absence pins).
T06-R2 Close button not disabled while signOut.pending → FIXED
(implementer resumed, regression RED reproduced exactly then green):
Close now mirrors the primary action's disabled state; in-flight test
extended to cover both controls.
Axes found clean: AC-05 credential safety (managed code never
rendered/logged/persisted — proven via captured sink + multiSet seam
probe; entered code masked, never logged/persisted, cleared on
unlock/close; retry reveals nothing — tryUnlock returns false
identically for no-code and wrong-code), entry presentational purity +
long-press-only + 48dp + tokens, sheet AdaptiveSheet usage + transitions

- shared-pipeline-only sign-out + T05 alert pattern, overlay store
  sole-reader + timer semantics (expiry instant + dead-after-unmount
  proven with fake timers; Math.max(0,·) frozen-app guard) + no T04
  duplication, test quality (real store via applySnapshot fixtures
  byte-identical to T03's; real pipeline seam; lucide stub scoped to the
  two icon-rendering files; zero console output; teardown hygiene), verify
- pre-commit exposure, scope discipline.
  Reviewer judgments: onAccountSwitched placement sound; lucide ESM
  jest stub sound and deferring the repo-level transformIgnorePatterns fix
  to the Lead correct; RNTL v14 notes (async unmount, userEvent-only on
  Pressable Button) sound and documented.
  Forward note for T07 (recorded, not a defect): the overlay's absolutely
  positioned entry must sit in a full-screen positioned container as a
  sibling of the root Stack in app/\_layout.tsx; the existing PortalHost
  covers the sheet's portal.

LEAD FOLLOW-UPS RECORDED

- jest.config.js lucide-react-native transformIgnorePatterns gap: shared
  file outside this task's scope (not in plan's Files-expected-to-change)
  → left as a tracked follow-up for the next lucide consumer; do NOT
  hot-fix mid-feature without a plan amendment.
- onAccountSwitched is a justified small contract addition (reviewer
  sound) — recorded here per the review request.

GATE: PASS

### T07 — PLAN AMENDMENT (Lead, pre-delegation)

Design decision 6 refined and the planned-change list extended BEFORE
delegating T07 (the workflow's stop-and-report duty discharged by the Lead
instead of the implementer):

1. `app/**` may not import Zustand (eslint no-restricted-imports;
   `.claude/rules/routes.md`: "Own the store inside the feature and expose
   a hook") → the plan's "app/\_layout.tsx consumes resolveRootTarget"
   needs a feature-exposed HOOK: new planned manual file
   `state/use-root-target.ts` (`useRootTarget()` = store policy-role
   subscription + useAuth() + the pure resolver). The barrel exports
   `useRootTarget`, `useDevicePolicySync`, `KioskMaintenanceOverlay` ONLY —
   the raw store stays feature-private.
2. `app/index.tsx` (previously in the plan's NOT-changed list) must become
   target-driven: with the `(preparation)` group unregistered on a kiosk
   (the resolver's whole point), today's unconditional role redirect would
   land a preparation session on `+not-found` instead of the mismatch
   screen — violating AC-03. Routing-only diff; the same hook is the source
   of truth for both the layout guards and the index redirect.

Amendments recorded in plan.md (Design decision 6, Allowed manual files,
Files-expected-to-change, task table T07 row) and the todo T07 block.

### T07 — root integration

MODE: behavior-change
ACCEPTANCE: AC-03, AC-04

PLAN AMENDMENT (Lead, pre-delegation — see the "T07 — PLAN AMENDMENT"
entry above: feature-exposed useRootTarget hook instead of app-side store
imports; app/index.tsx target-driven redirect)

RED (fresh feature-implementer, agent-74abb2e8)
Baseline pinned first: 9 suites / 102 tests green at a8ae85c.
$ pnpm jest features/kiosk-runtime
Test Suites: 2 failed, 10 passed — root-guard.test.ts and
use-root-target.test.tsx both fail "Cannot find module './root-guard'" /
"'./use-root-target'" (the planned manual subjects are absent; the new
behavior is missing; all pre-existing suites stayed green; the lock-task
pin passes trivially BY DESIGN — permanent regression pin, not a RED case).
Implementer disclosed two RED-scaffolding fixes made BEFORE treating RED as
valid: hook test renamed .ts → .tsx (JSX parse error was a wrong-kind
failure); lock-task regex constructed from split string pieces so the
sentinel file's own comment cannot self-match while still being scanned.

IMPLEMENT
model/root-guard.ts — pure resolveRootTarget(status, role, policyRole) →
RootTarget ("startup" | "sign-in" | "unauthorized" | "customer" |
"preparation" | "kiosk-mismatch"); type-only imports; full mapping table
(18 rows); defensive ready+undefined/admin → "unauthorized" rows
documented unreachable via useAuth (core/auth resolves non-tablet roles to
unauthorized before ready).
state/use-root-target.ts — useRootTarget(): live store subscription
(policy.role) + useAuth() + the pure resolver; subscription/derivation
only.
index.ts — export widening: useDevicePolicySync, useRootTarget,
KioskMaintenanceOverlay (+ the pre-existing KioskMismatchScreen); raw
store stays feature-private; comment updated with the Zustand-ban
rationale.
app/\_layout.tsx — useDevicePolicySync() mounted first (before every early
return); target-driven guards incl. the NEW kiosk-mismatch guard;
KioskMaintenanceOverlay as a Stack sibling in a fragment; everything else
byte-identical to a8ae85c (RootLayout/providers/PortalHost/(dev)/index/
startup early-return untouched; profile destructure dropped — no longer
needed).
app/index.tsx — routing-only: exhaustive switch over the target;
unreachable "startup" case documented; standard redirects
meaning-equal to the baseline ternary.
model/root-guard-lock-task.test.ts — AC-04 permanent pin: fs scan of
app/core/components/features source files for call-shaped
start/stopLockTask — asserts none (115 files scanned, 0 offenders).

GREEN
$ pnpm jest features/kiosk-runtime → 12 suites / 128 tests PASS
(one disclosed mock fix: installMockAuth defaults to signed-in customer;
the signed-out tests now pass { profile: null } — intent unchanged, no
assertion weakened)

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS;
$ pnpm exec eslint app/ + the five files → clean (app/\*\* Zustand-ban
proof); $ pnpm test:ci → 29 suites / 266 tests PASS; pnpm verify → PASS.

RUNTIME EVIDENCE (Lead, at the gate)

1. Standard-path web regression (policy source = real web behavior —
   module unavailable → fail-closed standard): expo web (SDK 54 Metro) at
   800×1280 AND 1280×800 — / → target "sign-in" → /sign-in renders the
   full sign-in screen exactly as before; NO maintenance entry; zero page
   errors; screenshots download/t07-web-regression-signin-{tablet,landscape}.png.
2. Kiosk-stubbed web preview (T07-R1 remediation, recorded per the
   reviewer's request): temporary UNCOMMITTED stub of
   getKioskPolicyModule (kiosk_device_role=customer_kiosk, demo code
   7410, timeout 90s; demo values only) → reverted byte-identical after
   capture (git diff clean on modules/). Observed at 800×1280, zero page
   errors: sign-in STILL renders (policy never blocks sign-in) WITH the
   Maintenance corner entry; long-press (mouse down 1s) opens the unlock
   sheet; wrong code 0000 → "That code didn't work." retry state, sheet
   open, code masked (••••); right code 7410 → UNLOCKED panel with
   "Switch customer account" + Close; after 90s the OPEN sheet
   auto-returned to the LOCKED code-entry state (the overlay's expiry
   timer firing end-to-end in a browser). Screenshots
   download/t07-kiosk-stub-{sheet-locked,sheet-retry,panel-unlocked,expired-relocked}.png.
   NOT observable in this environment (honest supersession note, T07-R1):
   the preparation-session mismatch ROUTING itself — no preparation
   credentials exist for the shared TEST backend and none may be invented;
   that row is pinned by the resolver table, the hook live-flip test, and
   the 12-suite feature coverage, and remains verifiable on hardware at
   MDM enrollment (already on the unverified list).

DIFF
New: model/root-guard.ts (+2 test files), state/use-root-target.ts (+
test). Modified: index.ts (export widening), app/\_layout.tsx,
app/index.tsx (the two planned shared changes). Control docs (Lead):
plan amendment + this entry.

REVIEW (fresh code-reviewer, agent-65564a96)
No blocking or major findings. One minor:
T07-R1 brief AC-03 lists a runtime web preview with the policy source
stubbed to kiosk as an observable mode, but the Lead's recorded runtime
evidence covered only the standard path → RESOLVED AT THIS GATE: the
kiosk-stubbed web preview above (entry → long-press → sheet → wrong/right
code → panel → 90s expiry re-lock, zero errors, stub reverted
byte-identical) plus the honest supersession note for the
session-dependent routing (no credentials; test-pinned; hardware at
enrollment).
Axes found clean: resolver correctness + totality (guard-by-guard
baseline comparison via git show; the ONLY semantic addition on reachable
inputs is preparation+kiosk → kiosk-mismatch; defensive rows verified
unreachable in core/auth/context.tsx), hook subscription discipline +
live-flip test, barrel exactly-four exports + truthful comment, layout
diff discipline (RootLayout byte-identical; every guard maps a real route
name — LS-verified), index routing-only exhaustive switch, lock-task pin
scope + self-clean sentinel + call-shaped matching (reviewer replicated
the scan: 115 files, 0 offenders), test quality (arithmetic 266 = 240+26
consistent; explicit mock args — no default reliance; zero console
output), verify + pre-commit gates, scope discipline. Amendment soundness:
confirmed correct (the Zustand ban is mechanically real; the +not-found
argument holds).

GATE: PASS

### ROUND 2 GATE — kiosk safety UI and root routing

Round content: T05 (mismatch screen + route), T06 (maintenance UI), T07
(root integration). All three task gates PASS (commits ae8f9ca scaffold,
531a13e, a8ae85c, 801f48c).

ROUND REVIEW (fresh round-scope code-reviewer, agent-2f6b2304)
No blocking or major findings. Two minors:
R2-1 the sheet's onOpenChange passed the overlay's handler through
UNGATED — the dialog primitive's built-in dismissal paths (scrim tap,
Android hardware back, a11y escape) could dismiss the sheet
mid-sign-out-flight, hiding a blocked/failed outcome (residual of the
T06-R2 hazard class: that fix gated only the Close button) → FIXED
(T06 implementer resumed): handleOpenChange wrapper ignores false while
signOut.pending — one gate covering all three built-in paths; regression
RED reproduced exactly (scrim press dismissed mid-flight,
onOpenChange(false) called) then GREEN (12 feature suites / 129 tests).
R2-2 brief.md's out-of-scope clause not reconciled with the pre-T07 plan
amendment (still claimed only \_layout + route as app/ changes while
app/index.tsx was also edited) → fixed by the Lead (one-line brief
amendment naming app/index.tsx and pointing at plan Design decision 6).
Seams examined — ALL CLEAN: sign-out reuse chain (both consumers wired
identically; no parallel sign-out repo-wide), store consumption topology
(overlay sole component reader; useRootTarget/useDevicePolicySync only
other subscribers; zero zustand under app/; barrel exactly four exports),
guard consistency chain (every target → existing route; standard flow
meaning-equal to the 5aa440a baseline guard-by-guard; mismatch flow
coherent end-to-end), maintenance session lifecycle (all four clear paths
converge on the frozen LOCKED_MAINTENANCE via clearMaintenance —
idempotent, no double-clear, no gap; timer keyed [expiresAt] re-armed/
disarmed/cleaned correctly incl. Math.max(0,·)), ephemerality invariant
across the round (no logger/console/storage in any round file; the
assertions are real), read-only invariant (call-shaped grep zero; the
lock-task pin's scope covers every round file), round-level verify +
test arithmetic (22/211 → 23/216 → 26/240 → 29/266; every delta matches
per-file counts; now 29/267 after R2-1's regression test), combined
behavior story (kiosk customer / preparation-on-kiosk / standard / web
all walk to the plan's endpoints; the Lead's runtime evidence
corroborates), overlay mount seam (forward note satisfied as written;
provider chain bare → absolute entry anchors to GestureHandlerRootView;
PortalHost paints above).

ROUND CHECKS
$ pnpm verify → PASS (29 suites / 267 tests + guards; generator smoke)
$ git diff 5aa440a..HEAD → the round's 21 files + this gate's two
remediation files; no other shared files.

ROUND GATE: PASS

### T08 — release-signing config plugin

MODE: config
ACCEPTANCE: Supporting AC-07 (app-side half; workflow-side fail-closed
checks are T09/T10)

SCAFFOLD (Lead — none: the plugin IS the task's manual artifact; plugins/
is the planned Expo local-plugin path)

CONFIG-MODE EVIDENCE (fresh feature-implementer, agent-d3d973ec — the
prebuild runs ARE the entry evidence; no RED for config mode)
WITH env (DEMO values only, never real secrets):
MYAPP*UPLOAD_STORE_FILE=kisok-upload.keystore MYAPP_UPLOAD_KEY_ALIAS=
kisok-upload MYAPP_UPLOAD_STORE_PASSWORD=demo-store-pass
MYAPP_UPLOAD_KEY_PASSWORD=demo-key-pass
$ npx expo prebuild --platform android --no-install --clean → finished;
grep android/gradle.properties → all four MYAPP_UPLOAD*_ entries present;
android/app/build.gradle → guarded signingConfigs.release block present,
buildTypes.release → signingConfig signingConfigs.release, sentry counts
exactly 1 (no duplication); T01 outputs still generated (APP*RESTRICTIONS
meta-data, lockTaskMode="if_whitelisted", res/xml/kiosk_restrictions.xml).
Idempotency: non-clean re-run WITH env → md5sum -c OK for both files.
WITHOUT env (run last): clean prebuild → grep BOTH files → NO MYAPP_UPLOAD*_
entries, NO release block; template's debug-signed release default intact.
Control proof: a prebuild with the plugin reference temporarily removed
(restored immediately) produced BYTE-IDENTICAL output (md5 match) — the
plugin's no-env output is indistinguishable from a build where it does
not exist, which is exactly the property android-e2e.yml depends on.
git status after all runs → no tracked changes beyond the intentional
three files (prebuild's recurring package.json script mutation restored
via git checkout per the plan's documented risk mitigation).

IMPLEMENT
plugins/with-android-release-signing.ts — typed ConfigPlugin; reads the
four MYAPP*UPLOAD*_ env vars at prebuild time with STATIC member access
(all-four-or-nothing; partial = absent → NO mod registration at all);
with env: withGradleProperties writes the four entries (+ idempotency
key-existence check) and withAppBuildGradle adds the documented
hasProperty-guarded signingConfigs.release block + repoints
buildTypes.release (brace-scoped — the debug build type is never touched;
precise named fail() on template drift; sentries for insertion safety).
Zero logging (values never echoed — they travel only into the generated,
gitignored, ephemeral android/ tree).
app.config.ts — one plugins-array entry + comment (inert without env;
fail-closed presence checks live in the release workflow).
.gitignore — _.keystore added to the signing-material block (covers
root-level and nested; corroborated by the reviewer with git check-ignore).

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS;
$ pnpm test:ci → 29 suites / 267 tests PASS (unchanged counts — config
change, no behavior).

REVIEW (fresh code-reviewer, agent-d0a97366)
One blocking, three minors:
T08-F01 BLOCKING: process.env[KEY] computed access violates
expo/no-dynamic-env-var (eslint-config-expo, global in the flat config) —
pnpm lint passes only because expo lint scans src/app/components, but the
pre-commit lint-staged gate (eslint --max-warnings=0 on every staged
_.ts) hard-fails; reviewer independently executed the plugin in-memory
against the real template first (gating/gradle/CNG all clean) → FIXED
(implementer resumed): static member access (behavior-identical; the
_\_KEY constants remain for the gradle keys/sentry) + [string, string][];
eslint gate reproduced failing BEFORE the fix and clean AFTER (exit 0,
--fix-dry-run has nothing to touch).
T08-F02 minor: the .js import suffix (extensionless fails under Node 24
type-stripping — reviewer probed both forms; expo has no exports map)
sound but undocumented → FIXED: 3-line comment at the import + this
entry's rationale.
T08-F03 minor: config-mode evidence trail must land in the gate commit
(not only in the handoff) → fixed by THIS entry (full prebuild matrix,
md5 idempotency, control-run byte-identity, package.json restoration
recorded above).
T08-F04 minor: the T10 heads-up (release workflow must restore
package.json after prebuild — prebuild mutates the android/ios scripts)
lives only in the handoff → fixed by a one-line addition to todo.md's
T10 focused verification.
Axes found clean (independently executed via an in-memory harness against
the real template): env gating (all-four/partial/no-env — NO mods
registered on partial or absent, by construction), gradle correctness
(block verbatim the documented RN pattern; repoint brace-scoped to
release only; idempotent second application byte-identical), CNG
discipline (git check-ignore proves \*.keystore coverage), app.config
diff (single hunk), generated-tree corroboration (no-env state + T01
outputs intact), scope discipline.
Judgments: .js suffix SOUND (hard evidence); config-mode no-test decision
AGREED (matches plan — a string-assertion unit test would assert on
regenerated template content); T10 heads-up adequate once recorded (F-04).

GATE: PASS

### T09 — release APK verification script

MODE: behavior
ACCEPTANCE: AC-08 (Supporting AC-01, AC-07)

SCAFFOLD (Lead — none: tools/release/ is the planned manual tool path)

RED (fresh feature-implementer, agent-c909d9d8)
$ pnpm jest tools/release
Cannot find module './verify-release-apk' — the planned manual subject is
absent (jest found the test file; the only unmet dependency is the script).

IMPLEMENT
tools/release/verify-release-apk.ts — the release verify-before-delivery
CLI: fail-closed input validation (apk/package/versionCode/versionName +
tool paths, each missing/empty → non-zero + the NAMED variable, BEFORE any
command; unknown flags rejected); aapt2 badging parse + three-way compare
(expected-vs-actual messages; malformed output fails precisely); apksigner
cert check (multi-signer safe — ANY debug cert rejected with the
release-cert message; release DN passes; missing cert fails);
assets/index.android.bundle exact-token presence check; injectable
CommandExecutor seam (pure exported functions; CLI wires execFile;
ENOENT → named tool-path failure); node-builtin imports only; exit-code
contract 0/1; direct-run guard via argv[1] basename (import.meta is
unavailable under babel's jest transform — probed; guard proven inert
under jest).
tools/release/verify-release-apk.test.ts — 34 tests (33 original + F03),
all through a fake recorded executor (zero real commands).

GREEN
$ pnpm jest tools/release → 1 suite / 34 tests PASS
Local Node-24 fail-closed smoke: $ node
tools/release/verify-release-apk.ts → exit 1 + the four named-variable
messages (Lead re-verified the exit code directly); --help → exit 0.
Reviewer's real-executor absence probe: all inputs + nonexistent APK →
named AAPT2_PATH/APKSIGNER_PATH failures; real unzip exit 9 handled.

AFFECTED CHECKS
$ pnpm typecheck → PASS; pnpm lint → PASS; pnpm format:check → PASS;
$ pnpm exec eslint --max-warnings=0 tools/release/ → clean (T08-F01
lesson proactively applied: no computed process.env access);
$ pnpm test:ci → 30 suites / 301 tests PASS.

DIFF
Untracked: tools/release/\*\* (2 files). Tracked: todo.md (Lead checkpoint
only).

REVIEW (fresh code-reviewer, agent-e947f3a7)
No blocking or major findings. Three minors:
T09-F01 green-path main test did not inject outputSink → the success line
leaked to stdout during test:ci AND was unpinned → FIXED (implementer
resumed): sink injected + the line asserted to name package/versionName/
versionCode/non-debug certificate/JS bundle; leak grep now 0; mutation
probe (dropped "non-debug" on a scratch copy) failed exactly the green
test, then restored byte-identical.
T09-F02 --help exits 0 and the direct-run guard is rename-coupled
(SCRIPT_FILENAME hardcoded) — a mis-invoked or renamed script could pass
the workflow gate silently → recorded as a T10 requirement (todo.md T10:
the workflow's verify step must assert the success line in its output).
T09-F03 parseFlags "flag requires a value" path untested → FIXED
(implementer resumed): new test — --apk without a value → non-zero,
"--apk requires a value", zero executor calls.
Axes found clean: fail-closed discipline (validated before any command;
exit contract on every reachable path), badging parser (real aapt2
format + precise malformed failures), cert verification (multi-signer
safe direction; robust DN matching), bundle exact-token presence,
testability structure (pure exports; injectable executor; faithful
fixtures), self-containment + Node 24 execution (node-builtin only; smoke

- help + absence probe all live-run by the reviewer), verify/pre-commit
  gates, scope discipline.
  Judgments: MODULE_TYPELESS_PACKAGE_JSON warning ACCEPTED as cosmetic
  (recommend accepting the one log line in T10 over --no-warnings);
  argv[1]-basename guard SOUND (proven inert under jest; harden at the
  workflow, not the guard); no fs.existsSync pre-check AGREED (tools'
  own diagnostics are precise; a pre-check adds TOCTOU + a second path).

GATE: PASS

### T10 — android-release workflow (RECOVERY — fresh workspace, fresh evidence)

MODE: config
ACCEPTANCE: Supporting AC-07 (workflow-side fail-closed half; AC-08's
verify-before-delivery is exercised by this workflow's verify step)

SCAFFOLD (Lead — none: the workflow file IS the planned manual artifact;
`N/A — workflow file`; no generator command run)

RECOVERY CONTEXT (Lead): prior local T10 was lost with the disposable
sandbox (workflow-file push was credential-blocked then). Reconstructed
from the durable Plan (design decisions 8/9/11/12) + retained context as
guidance only. This entry records ONLY fresh evidence from the recovered
workspace at 23a4222. Push credential: token workflow scope verified in
advance via OAuth scope header (repo, workflow, write:packages).

LEAD VERIFIED FACTS FED TO THE TASK (all fresh):
expo config --json → version 1.0.0, android.versionCode absent → Expo
default 1 (checked against the installed @expo/config-plugins
android/Version.js: getVersionCode = android?.versionCode ?? 1,
getVersionName = android?.version ?? version); local prebuild →
android/app/build.gradle `versionCode 1` / `versionName "1.0.0"`; prebuild
mutates package.json (android script + ios script added) → restored via
git checkout (T08-F04 fact revalidated, working tree clean); Node 24.19
runs the full pnpm verify green; verify script CLI contract re-read
(INPUT_SPECS + success line).

IMPLEMENT (fresh feature-implementer, agent-4802d768)
.github/workflows/android-release.yml (228 lines + remediation, 238 final)
— workflow*dispatch ONLY; permissions contents:read; checkout@v7 with
persist-credentials:false; release-scoped concurrency
(group: workflow name, cancel-in-progress: false — serialized, an
in-flight signing build is never cancelled); fail-closed secret presence
check as the FIRST work step (four ANDROID_KEYSTORE_BASE64/
ANDROID_KEYSTORE_PASSWORD/ANDROID_KEY_ALIAS/ANDROID_KEY_PASSWORD as step
env, non-empty loop via ${!name}, exit 1 naming only the missing NAME);
Node 24 job (native TS for the T09 tool); expected APK identity DERIVED
from `npx expo config --json` with Expo's exact defaulting and every
derived value validated as a simple token (package/versionName
`[A-Za-z0-9.*+-]+`, versionCode `^[0-9]+$`) BEFORE any $GITHUB_ENV write;
prebuild with all four MYAPP_UPLOAD_* (STORE_FILE=kisok-upload.keystore
literal + three secrets) and EXPO_PUBLIC_* placeholders scoped to the
prebuild STEP only — gradle's `expo export:embed`loads the committed .env
(hosted TEST project) and process env would win over it, so job-level
placeholders would have baked ci-placeholder values into the shipped APK
(reviewer verified @expo/env precedence in the installed toolchain);`git checkout -- package.json`restore (T08-F04); keystore base64-decoded
AFTER prebuild into gitignored android/app/ with an empty-output fail;`./gradlew assembleRelease --no-daemon`(no ABI override — tablet ABIs from
expo-build-properties); aapt2/apksigner located from $ANDROID_HOME/
build-tools (newest, explicit --aapt2/--apksigner, named error if absent);
verify step (shell: bash, set -o pipefail) runs`node tools/release/verify-release-apk.ts`with the derived identity and
tee-captures the log, then asserts the`APK verification passed` success
line (T09-F02); upload-artifact@v7 name kisok-release-apk, exact APK path,
if-no-files-found: error, retention 30 days (human inspection gap before
the separate manual MDM upload; T12 downloads by name + run id).

GREEN (implementer + Lead re-ran independently)
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/android-release.yml'))" → YAML_OK
$ pnpm exec prettier --check <file> → clean
$ pnpm check:ci-scripts → 4 workflows, 10 checks, pass (now scans the new file)
$ pnpm check:docs → 63 files pass
$ pnpm verify → exit 0 (30 suites / 301 tests unchanged — no TS/TSX touched)
$ git status --porcelain → exactly `?? .github/workflows/android-release.yml`
Implementer embedded-script diligence (mock envs outside the repo): secret
check fails closed naming the missing secret; identity derivation against
the real evaluated config (com.kisok.kiosk / 1.0.0 / 1); tool-locate picks
newest build-tools; verify-step logic propagates exit codes through tee
under pipefail and the no-success-line case fails; keystore decode
roundtrip + empty-secret failure; real T09 script under Node 24 fails
closed with no inputs, --help exits 0 (and --help is correctly REJECTED by
the success-line grep — reviewer verified).

AFFECTED CHECKS
$ pnpm verify → PASS (Lead re-ran after remediation; exit 0).

REVIEW (fresh code-reviewer, agent-cb06c837)
No blocking, no major. Two minors:
T10-F01 minor: EXPECTED_VERSION_CODE lacked token validation before the
$GITHUB_ENV write (GITHUB_ENV line-injection class; defense-in-depth since
app.config.ts is trusted repo content) → FIXED (implementer resumed):
String(versionCode) tested against ^[0-9]+$ with a named single-line error;
the env write and final log use the validated token; /tmp mock matrix
proves 1/"12"/7 pass, "7a"/newline/"1.5"/"" fail with the env file NOT
written; Lead re-read the diff and re-ran YAML/prettier/verify. Fresh full
re-review not re-run for this ~10-line minor defense-in-depth remediation
(T01-F03 precedent) — the Round 3 gate review covers the accumulated diff.
T10-F02 minor: the dispatch contract (who may dispatch, human must create
the four repo secrets first, workflow_dispatch needs the file on the
default branch before first dispatch, 30-day artifact window T12 uses) has
no durable documentation; T10's scope was exactly one file → recorded as a
T13 requirement in todo.md (T09-F02 precedent: the todo's T13 focused
verification now pins it).
Reviewer-verified clean: AC-07 fail-closed ordering (before any toolchain
work; all-four-or-nothing matches the plugin contract; the T09 debug-cert
rejection makes a debug-signed published artifact impossible); AC-08
wiring (flags match INPUT_SPECS; artifact path matches the ABI story);
T08-F04 restore present; secrets hygiene (keystore only into gitignored
tree; artifact carries only the APK; nothing echoes values); structural
safety (permissions/persist-credentials/concurrency/timeout/
if-no-files-found); conventions (action versions, pnpm-before-node, Java
17; Node 24 documented plan-backed deviation); scope discipline; every
failure path traced to a job failure before publish. EXPO_PUBLIC step
scoping verified CORRECT against @expo/cli exportEmbedAsync + @expo/env
precedence in node_modules.

GATE: PASS

### RECOVERY RESEARCH (2026-09-03) — targeted MDM API revalidation for T11

READ-ONLY researcher (agent-89756a09), fresh context, current official
manageengine.com/mobile-device-management/api/\* pages fetched live (no
credentials, no tenant access; 638-entry docs searchindex enumerated to rule
out missed pages). Purpose: resolve the ONE genuinely ambiguous T11
contract (reading an existing app's version for the monotonic pre-check)
and confirm the pinned plan endpoints. Full Evidence Packet returned to the
Lead; load-bearing conclusions:

R-01 App Repository reads document only STRING versions: GET
/api/v1/mdm/apps list (paginated 50/page, oauthscope
MDMOnDemand.MDMDeviceMgmt.READ) returns apps[] with app_id, app_name,
app_type, version (string) and release_labels[]{release_label_id,
release_label_name, app_version (string)}; Get App Details exists (docs
internally inconsistent between /apps/{app_id} and
/apps/{app_id}/labels/{label_id} paths). No integer versionCode field is
documented on any repository read; app_version_code appears only on the
device-scoped GET /api/v1/mdm/devices/{id}/apps and in the PUT
update-an-app response example. → T11's pre-check compares the incoming
version against the documented string version fields; the server stays the
authority on the Android versionCode increase.
[manageengine.com/mobile-device-management/api/apps/, api/devices/,
api/pagination/]

R-02 Two-phase upload: POST /emsapi/files with Module: MDM_APP_MGMT header
(.apk supported) → response carries fileID, fileName, customerID,
expiryDate AND fileStatus: 2 already. NO /emsapi/fileupload/status polling
endpoint exists anywhere in current docs (0 hits across the search index);
the deprecated /api/v1/mdm/files is banner-marked. Multipart key: prose
says "file", code examples say "fileName" (docs self-contradiction; the
written prose contract is used, discrepancy recorded). → T11 confirms
upload completion from the upload response's fileStatus instead of a
polling loop. [api/files/]

R-03 App create POST /api/v1/mdm/apps — current docs mark app_name,
app_type (2 = Enterprise per example), app_file ("File ID of the app
package file uploaded … with MDM_APP_MGMT module"), app_category_id,
supported_devices (3 = Both), release_label_id as Required (the latter two
are additions vs the 2026-09-02 synthesis); optional bundle_identifier,
description, etc. Add version PUT /api/v1/mdm/apps/{app_id}/labels/
{release_label_id} with app_file + force_update_in_label confirmed.
Channels POST /api/v1/mdm/labels {"channel_name":"Beta"} →
{"release_label_id":...} confirmed. Approve POST /api/v1/mdm/apps/{app_id}/
labels/{label_id}/approve with silent_install/retire_old_version/
notify_user_via_email + version_label + distribute_update confirmed —
never called by our automation. [api/apps/]

R-04 Group association POST /api/v1/mdm/groups/{group_id}/apps with
{"app_details":[{app_id, release_label_id}],"silent_install":true}
confirmed verbatim on the Groups page (the Apps-page variant is
unprefixed/ambiguous — the Groups-page form is used).
[api/groups/#associate-apps-to-a-group]

R-05 OAuth refresh exchange POST https://accounts.zoho.<dc>/oauth/v2/token
with refresh_token, client_id, client_secret, redirect_uri ("should be
same redirect url mentioned while registering Client"),
grant_type=refresh_token confirmed; access_token 1 h; max 10 access tokens
per refresh token per 10 min. Exact response JSON body not shown on the
page (fields in prose: access_token, expires_in). [api/oauth/]

R-06 429 / COM0002 "API Limit Exceeded" / error envelope
{error_code, error_description, localized_error_description} confirmed;
the numeric 60/min + 5-min-lock figures are NOT in current docs (legacy
help/api/cloud pages 403; archive unreachable) → conservative soft limits
for backoff only. [api/oauth/#errors]

Disposition (Lead): plan research synthesis + design decision 10 amended
in place with dated revalidation notes; no AC, feature-shape, or
task-graph change; plan remains READY after Lead consistency re-check of
the changed lines. Research packet summary only recorded here — the
researcher's full transcript stays out of the control documents.

### T11 — MDM upload script (RECOVERY — fresh workspace, fresh evidence)

MODE: behavior
ACCEPTANCE: AC-09

SCAFFOLD (Lead — none: tools/mdm/ is the planned manual tool path; `N/A —
no generator capability covers repo tooling`)

RECOVERY CONTEXT (Lead): prior local T11 was lost with the disposable
sandbox. Reconstructed from the durable Plan (design decision 10, as
amended by the 2026-09-03 research revalidation) + retained context as
guidance only. Contract-driven: the plan's revalidated synthesis is the
authority (upload completion from the response's fileStatus; create
carries app_category_id + release_label_id; documented string versions;
multipart key `file` per docs prose).

RED (fresh feature-implementer, agent-3557f547)
$ pnpm jest tools/mdm
Cannot find module './upload-beta' from 'tools/mdm/upload-beta.test.ts'
However, Jest was able to find: './upload-beta.test.ts'
(76-test spec found; the only unmet dependency was the script — the
honest T09-pattern RED. Fresh-reviewer note: reproducing the RED now
would require deleting the implementation, which the reviewer's
read-only mandate forbids; the pattern is identical to T09's recorded
RED and matches todo.md's planned entry evidence.)

IMPLEMENT
tools/mdm/upload-beta.ts (1604 lines after remediations) — the
Beta-only, non-production-first MDM Cloud upload CLI: pure exported
functions + injectable seams (fetchImpl/readFile/sleep/errorSink/
outputSink); thin CLI main(); argv[1] direct-run guard (T09 pattern,
inert under jest); node-builtin imports only (node:buffer,
node:fs/promises, node:path, node:process) — self-contained Node 24
native TS; exit codes 0/1; --help lists every flag/env pair. Flow: ONE
Zoho OAuth refresh-token exchange (urlencoded params incl. optional
redirect_uri; one exchange per run per the 10-token/10-min throttle) →
paginated app list read (50/page, short-page stop, 100-page bound,
match by app_name) → monotonic version pre-check (numeric per
component; Beta-label app_version preferred over top-level version;
unparsable/missing → fail closed; refusal BEFORE any upload and in
dry-run too) → two-phase upload POST {mdm}/emsapi/files (Module:
MDM_APP_MGMT header, multipart key `file` — docs prose contract, the
docs' own `fileName` examples recorded as a discrepancy; completion
from the response's fileStatus == 2; any other status fails closed
with the actual value) → create POST /api/v1/mdm/apps {app_name,
app_type: 2, app_file, app_category_id, supported_devices: 3,
release_label_id} OR add-version PUT /api/v1/mdm/apps/{app_id}/labels/
{label_id} {app_file, force_update_in_label: true} → Beta label
POST /api/v1/mdm/labels {"channel_name":"Beta"} (label name must be
exactly "Beta"; others refused) → associate POST /api/v1/mdm/groups/
{group_id}/apps {"app_details":[{app_id, release_label_id}],
"silent_install": true} (exactly one group; missing/empty group id
refused; production-group-id equality refused before any network).
Backoff: 429/COM0002/5xx retried bounded (3 attempts, 1s/2s; sleeps
injected, fake-timer-pinned); non-retryable 4xx immediate. Error
envelope {error_code, error_description} surfaced, never raw dumps.
9 documented data centres with paired accounts/mdm hosts (us default).
Masking: every emitted line passes redaction of the known secret
values (see T11-F01 remediation for the pre-emission hardening); the
token is registered before any MDM call that could echo it. NO call to
approve/distribute_update/retire_old_version anywhere (grep + happy-
path sequence assertion).
tools/mdm/upload-beta.test.ts (1521 lines after remediations) — 90
tests, all through a fake recorded fetch (zero network, zero
filesystem, all sinks injected → zero console output).

GREEN
$ pnpm jest tools/mdm → 1 suite, 90 tests PASS (76 original + 6 T11-F01

- 8 T11-R1; one strengthened)
  $ pnpm test:ci → 31 suites / 391 tests PASS (was 30/301; +1 suite, +90)
  $ pnpm typecheck / pnpm lint / pnpm format:check / pnpm exec eslint
  --max-warnings=0 tools/ → all clean (T08-F01 lesson held: static
  process.env member access only)
  $ pnpm verify → exit 0
  Local Node-24 fail-closed smoke: no-inputs → exit 1 + the 7
  named-variable messages (no network); --help → exit 0 (Lead re-verified
  exit codes directly); production-group equality → exit 1; non-Beta
  label → exit 1 named.

AFFECTED CHECKS
$ pnpm verify → PASS (Lead re-ran after each remediation; exit 0,
31 suites / 391 tests).

REVIEW (fresh code-reviewer, agent-c2ef160a)
One major, one minor:
T11-F01 MAJOR: input-resolution failure lines bypassed the redaction
wrapper — a positional argv token (e.g. a pasted secret from a dropped
flag) was echoed verbatim through the RAW errorSink before the
redacting context existed; same gap in the direct-run catch (reviewer
live-reproduced it) → FIXED (implementer resumed): collectSecretValues
(argv+env, both flag forms) built before any emission; resolution
failures routed through redactSecrets; the positional message drops
the raw value; formatDirectRunFailure (exported, unit-tested) replaces
the raw catch write; success-path secret list is the union incl. the
losing side of overrides; 6 new masking tests. Lead re-ran the
reviewer's exact reproduction: exit 1, secret value ABSENT from all
output.
T11-F02 minor: optional inputs hard-fail when set-but-empty (Actions
unset-var renders "") — fail-closed direction but a realistic T12
wiring trap → DISPOSITIONED to T12 (todo.md T12 focused verification:
export optional env only when non-empty).
FRESH RE-REVIEW (new code-reviewer, agent-06acbd9f) of the T11-F01
remediation: verdict "adequately fixed as filed" — no raw-sink bypass
remains; all seven remediation claims verified; prior clean areas
re-verified intact; two new minors:
T11-R1 minor: residual paste-leak class — a credential-shaped value
existing ONLY in a non-credential argv slot is quoted verbatim by
typed-validation messages (narrow: the wired T12 case is fully
redacted; leak needs a manual mis-paste with the credential nowhere
correct) → FIXED (implementer resumed): typed validations of
non-credential inputs (data-centre enum, numeric ids, MDM_DRY_RUN)
stop quoting the received value entirely (structurally closed —
nothing to leak); free-form echoes (app name/version/APK path/label)
kept as diagnostics and union-redacted when matching a known secret;
collectSecretValues doc comment rewritten to the precise guarantee;
8 new tests with a PASTED_SECRET that exists nowhere else. Lead
live-re-verified with env -i: --data-centre/--group-id <secret> →
exit 1, secret ABSENT (grep count 0), messages name variable + shape.
T11-R2 minor: control-record state (no T11 worklog/review rows at
re-review time) → resolved by THIS gate commit (this entry + the
review.md rows). Unknown-flag name echo kept deliberately (the name is
the typo diagnostic; embedded-secret case is redacted by the union —
test-pinned; judgment recorded per the re-reviewer's "your judgment").
Axes found clean across the review pair: AC-09 scope (Beta-only,
non-production-only, dry-run read-only, zero production operations —
sequence-asserted), fail-closed ordering (all validation before any
network; requests length 0 asserted), contract fidelity to the
2026-09-03 research packet (endpoints, params, bodies, pagination,
fileStatus, force_update_in_label, silent_install, app_type 2,
supported_devices 3, 9 data centres, one exchange per run), monotonic
semantics (1.0.10 > 1.0.9; label-version preference; unparsable →
refuse), backoff bounds, test quality (behavior-named, exact payload
assertions, zero console output), self-containment, T09 structural
parity, scope discipline.

GATE: PASS

### T12 — mdm-beta-upload workflow (RECOVERY — fresh workspace, fresh evidence)

MODE: config
ACCEPTANCE: Supporting AC-09 (workflow half; the client half was T11)

SCAFFOLD (Lead — none: the workflow file IS the planned manual artifact;
`N/A — workflow file`)

LEAD VERIFIED FACTS FED TO THE TASK: actions/download-artifact@v8 (latest
v8.0.1, action.yml fetched and verified: name/path/run-id/github-token,
digest-mismatch defaults to error, node24 runtime; cross-run download
needs `actions: read`); the T11 tool's actual flag surface (including
--app-version, the packet's --version corrected to the tool interface);
artifact layout kisok-release-apk → app-release.apk at root.

IMPLEMENT (fresh feature-implementer, agent-0df1f0ae)
.github/workflows/mdm-beta-upload.yml (336 lines after follow-ups) —
workflow*dispatch ONLY with inputs: run-id (required, string), dry-run
(boolean, DEFAULT TRUE — a real upload is always a deliberate act),
group-id (required), production-group-id / app-category-id /
redirect-uri (optional, forwarded ONLY when non-empty), app-name
(default KISOK), data-centre (default us). permissions: contents: read +
actions: read (minimal sufficient for checkout + cross-run artifact
download); checkout persist-credentials: false; release-scoped
concurrency with cancel-in-progress: false (an in-flight upload is never
cancelled); timeout 30. Steps: checkout → early validation of run-id
(numeric, non-empty — API dispatch can bypass the UI's required check)
and group-id (non-empty, T12-F01) → MDM secret presence check (three
secrets, fail closed, names only, before any toolchain work) →
actions/download-artifact@v8 (name kisok-release-apk, run-id, explicit
github-token, path downloaded-release-apk; digest-mismatch left at its
error default; a missing artifact fails loudly) → pnpm setup → Node 24
→ setup-java@v5 temurin 17 (Lead-directed follow-up: pinned JVM for
apksigner, matching the three sibling workflows) → pnpm install
(for the identity derivation's expo CLI; the tools themselves are
node-builtin-only) → identity derivation from `npx expo config --json`
with Expo's exact defaulting + token validation before GITHUB_ENV writes
(byte-identical to android-release.yml's step — extraction + diff) →
aapt2/apksigner located from $ANDROID_HOME/build-tools (byte-identical
step) → RE-VERIFY the downloaded APK with the T09 script (pipefail +
tee + `APK verification passed` grep, T09-F02; BEFORE anything touches
the MDM tenant) → upload via `node tools/mdm/upload-beta.ts` with
conditional optional FLAGS only when non-empty (T11-F02 wiring — an
unset Actions input renders "" and the tool hard-fails on
set-but-empty optionals; strictly stronger than conditional env export),
--dry-run mapped from the boolean input, required secrets as STEP env
only, and every dispatch input reaching bash through UPLOAD*_ /
RUN*ID/GROUP_ID intermediate env vars (no inline ${{ }} in any run:
script — no script-injection surface; names collide with nothing either
tool reads). No build, no artifact upload, no EXPO_PUBLIC*_ env
(anything bundled here; the APK arrives already built and verified).

GREEN (implementer + Lead re-ran independently)
$ python3 -c "import yaml; ...safe_load(...)" → YAML_OK
$ pnpm exec prettier --check <file> → clean
$ pnpm check:ci-scripts → 5 workflows, 10 checks, pass
$ pnpm check:docs → 63 files pass
$ pnpm verify → exit 0 (31 suites / 391 tests unchanged — no TS/TSX)
$ git status --porcelain → exactly `?? .github/workflows/mdm-beta-upload.yml`
Embedded-script diligence (/tmp, outside the repo): run-id validation
rejects empty/non-numeric/injection-shaped values without echoing them;
group-id empty → named dispatch-input error; upload argv built correctly
for defaults/dry-run, all-optionals, mixed, spaced values (one argv
element); tool --help smokes exit 0; every emittable flag mechanically
confirmed against the tool interface; no-network argv-shape replays
against the real tool parse cleanly.

AFFECTED CHECKS
$ pnpm verify → PASS (Lead re-ran after each follow-up; exit 0).

REVIEW (fresh code-reviewer, agent-5556ddac)
No blocking, no major. One minor:
T12-F01 minor: belt-and-braces asymmetry — run-id validated early but
group-id (also required, also API-bypassable as "") only caught by the
tool's last-step refusal after download/re-verify work had already run
(not a fail-open: the tool refuses pre-network with a named error) →
FIXED (implementer resumed): the early validation step now also rejects
an empty group-id dispatch input (env-indirection pattern, names the
dispatch input, never echoes the value); mock replays prove both
branches. Lead re-read the diff and re-ran YAML/prettier/verify.
Reviewer-verified clean: dispatch-only trigger (parsed); re-verify
strictly precedes upload; the only MDM operation is the T11 tool; no
label-name dispatch surface (Beta-only default + refusal unbypassable);
--app-version fed from the re-verified artifact identity (a dispatcher
cannot lie to the monotonic pre-check); zero workflow-owned
production-promotion operations; permissions minimal sufficient; secret
hygiene (the three secrets in exactly two step env blocks; ${!name}
indirection; no ${{ }} in any run: script; UPLOAD\_\* names collide with
nothing either tool reads); artifact handling (digest-mismatch error
default; both consumers match the single-file-at-root layout; the
re-verify gate independently rejects wrong-run-id confusion);
byte-identical derivation/locate steps (reviewer's own extraction +
diff); T11-F02 wiring satisfied (flags only when non-empty; mock-replayed
argv shapes parse cleanly against the real tool); sibling conventions;
scope discipline; every failure path fails the job (no
continue-on-error, no || true, no if: skips).
Notes: `actions: read` addition to design decision 11's literal
`contents: read` is required by T12's own cross-run download design and
documented in-file (minimal sufficient). Dispatch-contract documentation
pinned to T13 per the T10-F02 precedent.

GATE: PASS

### T13 — ManageEngine operational contract (RECOVERY — fresh workspace, fresh evidence)

MODE: config
ACCEPTANCE: AC-10

SCAFFOLD (Lead — none: documentation is the planned manual artifact;
`N/A — documentation`)

IMPLEMENT (fresh feature-implementer, agent-c904abfa)
features/kiosk-runtime/docs/mdm-operations.md (518+ lines) — the durable
operational contract, grounded in the feature's research evidence and the
actual artifacts: §1 purpose/scope (production deployment NOT automated;
dispatch-only, no push triggers); §2 enrollment (QR template → Fully
Managed/Device Owner; kiosk needs DO; employee tablets never enrolled
this way); §3 Single-App Kiosk (MDM-owned lock task + DPC allowlist;
if*whitelisted same-APK dual role; app never calls startLockTask/
stopLockTask, read-only corroboration; offline stays locked; recovery =
Pause Kiosk / recovery key / chat commands; relaunch-after-reboot may
clear login sessions — plan for the sign-in screen); §4 in-house upload
without Google Play + managed app configuration (the Configurations tab
appears on upload; the three restriction keys from T01's app.plugin.js
with types/semantics: kiosk_device_role string with fail-closed
derivation and the allowlist-contradiction asymmetry,
maintenance_unlock_code string visible-to-admins never-logged/persisted,
maintenance_unlock_timeout_seconds integer clamped 15–600 default 90);
§5 silent install prerequisites (DO; silent_install true to exactly ONE
non-production group; Beta label); §6 update/rollback (Add new
version/Upgrade silent on DO; strict versionCode with the T11 pre-check
before upload and the server the authority; signature NEVER changes —
the four ANDROID_KEYSTORE*_ / ANDROID*KEY*_ secrets; no downgrade —
remove+re-distribute erases data; kiosk profile pins the app version);
§7 the release path with BOTH dispatch contracts (7a one-time setup:
four signing secret NAMES + three MDM secret NAMES, console ids, and the
workflow_dispatch default-branch-before-first-dispatch fact — the
T10-F02 requirement; 7b android-release: write-access boundary,
identity derivation, T09 verify gate + success line, 30-day retention;
7c the human artifact inspection; 7d mdm-beta-upload with all 8 dispatch
inputs, dry-run DEFAULT true, re-verify before the tenant, refusal
rules; 7e live dry-run/first upload as deliberate human actions);
§8 activation prerequisites for any future automatic production
deployment (approve + distribute_update documented but never called;
five explicit prerequisites: physical verification, recorded human
decision, secrets/environment review, accepted fix-forward-only reality,
proven live Beta path); §9 the first-class unverified list (all five
hardware items + live-tenant items + console field rendering — and, post
T13-F01, the channels-endpoint duplicate-name behavior); §10 edition
note (Free edition 25 devices/1 technician includes kiosk+AE+Enterprise
Apps+REST APIs; not edition-blocked); Source index with every citation.
Research unknowns handled honestly: numeric rate-limit figures and the
create-response app_id omitted; the multipart file/fileName discrepancy
recorded as recorded; no workflow-dispatched-on-GitHub claim.

GREEN
$ pnpm check:docs → 64 files checked, pass (the new doc is scanned)
$ pnpm exec prettier --check <file> → clean
$ pnpm verify → exit 0 (31 suites / 391 tests unchanged — no code
touched)
$ git status --porcelain → exactly `?? features/kiosk-runtime/docs/mdm-operations.md`

AFFECTED CHECKS
$ pnpm verify → PASS (Lead re-ran after remediation; exit 0).

REVIEW (fresh code-reviewer, agent-05e7557d)
No blocking, no major. Two minors:
T13-F01 minor: §5's parenthetical "(creating the channel if it does not
exist)" asserted idempotent semantics for POST /api/v1/mdm/labels that
no research record supports — the tool POSTs unconditionally; if the API
rejects a duplicate channel name, later uploads fail closed at that step
→ FIXED (implementer resumed): reworded to the recorded contract
("resolves the Beta release label id through the documented channels
endpoint") AND the duplicate-channel behavior added to §9's unverified
list (a human resolves it in the console on first encounter).
T13-F02 minor: §6's "(the ANDROID*KEYSTORE*_ secrets, Section 7a)" glob
reading omits the ANDROID*KEY*_ alias pair that identifies the key →
FIXED (implementer resumed): the complete §7b formulation "the four
ANDROID*KEYSTORE*_ / ANDROID*KEY*_ signing secrets".
Lead re-verified both edits + re-ran check:docs/prettier/verify.
Reviewer-verified clean: AC-10 coverage complete (all seven topics);
T10-F02 fully covered (who may dispatch, four signing secret names,
default-branch-before-first-dispatch, 30-day window + download by name
and run id); the workflows-as-implemented match exact (inputs, defaults,
step ordering, refusal rules, zero production operations — grep
verified); restriction keys match app.plugin.js + the derivation tests
(including the clamp and never-rendered pins); honesty clean (§9
first-class, matches the brief's Evidence item-for-item + the justified
console-rendering superset; no hardware/live-tenant claims; secret
values absent); citations all traceable to the research with matching
dates; style compliance (check:docs patterns, feature-local references);
scope discipline.

GATE: PASS

## Round 3 — GATE (RECOVERY — fresh evidence)

ROUND SCOPE: signed release delivery — T08–T13 (accumulated diff
57f08c3..HEAD: 7 commits, 14 files, ~6300 insertions; T08/T09 durable
from the previous session, T10–T13 recovered in this session with fresh
evidence and fresh task reviews).

LEAD ROUND CHECKS
$ pnpm verify → exit 0 (31 suites / 391 tests; check:docs 64 files;
check:ci-scripts 5 workflows; generator smoke)
Cross-task contract validation (Lead): T08 plugin MYAPP*UPLOAD*_ env ↔
T10 prebuild step (names match; STORE_FILE=kisok-upload.keystore ↔
android/app/ decode path); T08 _.keystore ignore ↔ decode path
(double-covered, git check-ignore); T09 CLI flags + success line ↔ BOTH
workflows' verify steps; T10 artifact name/retention ↔ T12 download
(name + run-id + 30-day window); T11 flag/env surface ↔ T12 invocation;
T01 restriction keys ↔ T13 doc §4; one consistent secret-name set
across brief/workflows/tools/doc; the full chain
secrets→signed build→T09 verify→artifact→human inspection→re-verify→
Beta-only non-production-only dry-run-default upload→documented
operations.

ROUND REVIEW (fresh code-reviewer, agent-95fd66ea — round scope, did not
watch any implementation)
Verdict: PASS with 3 minor findings. All cross-task seams examined and
found clean: env names, ignore coverage + e2e inertness (byte-identity
control), CLI/success-line/live-gate semantics in both workflows
(shell: bash gives -e -o pipefail — both the node exit code AND the grep
are live gates), a config bump between build and upload fails the T12
re-verify (no silent drift), artifact layout/digest/permissions,
flag surface + conditional optionals + no label-name dispatch surface +
--app-version from the re-verified identity (dispatcher cannot lie to
the pre-check), restriction keys/clamp/never-rendered pins, secret-name
census, zero production operations (grep), convention consistency,
round coherence (the 2026-09-03 plan amendment matches the T11
implementation clause-for-clause; the two workflows' shared steps
byte-identical by extraction; no file outside the plan's expected-change
list; no lock-task code). Re-verified every prior task finding's
"fixed" claim factually accurate at HEAD. Residual noted for the record
(not a finding): the non-debug cert check does not pin the upload-key
fingerprint — AC-08/decision 9 promise only "non-debug"; a wrong-but-
valid non-debug keystore secret would pass verify (a secrets-management
risk the pipeline was not promised to catch).
R3-1 minor: the doc never tells the operator the repo's versionCode
comes from app.config.ts (unset → every build defaults to 1) while the
server enforces the versionCode increase — the second-release procedure
was incomplete at the exact field the server checks → FIXED (T13
implementer resumed): §6 now has "Bump BOTH version fields in
app.config.ts for the next release" (version AND android.versionCode;
the tool-vs-server asymmetry; the first update requires setting
android.versionCode to 2+).
R3-2 minor: mid-flight failure recovery undocumented → FIXED (T13
implementer resumed): §7d "If an upload run fails mid-flight" — the
mutation order, the guaranteed-safe same-version retry refusal BEFORE
any new mutation, and the two completion paths (console-side
association or fix-forward; no downgrade).
R3-3 minor: plan design decision 11 still literally said
`permissions: contents: read` for both workflows while the MDM upload
workflow carries + actions: read (required by its cross-run download,
documented in-file) → FIXED (Lead): decision 11 reconciled with the
shipped workflow (one clause) and the mdm-operations.md reference made
feature-local.

ROUND CHECKS (after remediation)
$ pnpm verify → exit 0 (31 suites / 391 tests unchanged)

ROUND GATE: PASS

## FINAL REVIEW + REMEDIATION (RECOVERY — fresh evidence)

FINAL HEAD CANDIDATE: d468afc (Round 3 gate + develop integration merge:
origin/develop 6161a4c merged non-destructively; zero file overlap with the
feature diff; post-merge pnpm verify green — 68 suites / 796 tests; pushed;
fast CI green: Verify / Web bundle / Expo doctor SUCCESS).

DEVELOP INTEGRATION CHECK (Lead): origin/develop advanced 62f3634 → 6161a4c
(catalog-cart-integration PR #11). Merged with --no-edit; no conflicts (zero
overlap); stale final evidence invalidated and re-collected at the
integrated HEAD (verify, CI, runtime — below).

FINAL VERIFICATION (Lead, at d468afc):
$ pnpm verify → exit 0 (68 suites / 796 tests, integrated)
$ GitHub CI on d468afc → Verify / Web bundle / Expo doctor all SUCCESS
Runtime (browser, agent-browser at tablet sizes, from the CI-equivalent
static export `pnpm export:web` + a local static server with clean-URL
fallback): / → /sign-in at BOTH 1280×800 landscape and 800×1280 portrait;
sign-in renders (Email/Password/Sign in); ZERO console/page errors; no
kiosk overlay, no maintenance affordance (standard path);
/kiosk-mismatch registered + exported and the root guard redirects
standard-path visitors to /sign-in (fail-closed — the mismatch screen
renders only for preparation-on-kiosk per its tests). Screenshots captured.
Native tier: prebuild local PASS (this session, twice); the label-gated
android-build job triggered on the PR by the Lead adding the `android-build`
label (the plan's documented native compile gate — previously
pending-credentials).

FINAL CODE REVIEW (fresh code-reviewer, agent-5a082a39 — full feature,
fresh context, did not watch any implementation)
Verdict: NOT ready for the Feature Gate — one blocking, one minor.
FR-01 BLOCKING: the label-gated Android build run 33825189511 on d468afc
FAILED. The Lead fetched the run log (GitHub API): :app:
processDebugResources → AAPT error — the generated res/xml/
kiosk*restrictions.xml's android:description carried a LITERAL string,
incompatible with the attribute's reference-only format. Root cause: T01's
plugin wrote literal display strings; T01's config-mode gate ran prebuild +
inspection only (no gradle/AAPT — no local Android SDK exists here), and
the label-gated compile job had never run before (the previous session had
no push credentials). This is exactly the plan's documented risk
("android-build CI compiles it once PR CI runs; failure = fix-in-task
loop") activating. The reviewer's own read-only diagnostics found no other
static cause (autolinking resolves the module; Kotlin DSL matches the
installed expo-modules-core; only native-touching change since the last
passing build).
→ FIXED (fix-in-task loop; fresh implementer agent-5974f4f2, T01 scope):
the plugin's dangerous mod now ALSO writes res/values/
kiosk_policy_strings.xml (four kiosk_policy*\*-prefixed strings, values
byte-equal to the old literals) and the restrictions XML references them
(@string/kiosk_policy_role_title / role_description / unlock_code_title /
unlock_timeout_title; keys/types/comments byte-identical; no literal
display string remains — the official managed-configurations pattern).
Config-mode verification: prebuild regenerates both files; python3
ElementTree parse + cross-link check (referenced set == defined set);
APP_RESTRICTIONS meta-data + lockTaskMode intact; no tracked file changed
after the documented package.json restore; typecheck/lint/format/test:ci
green (68/796); eslint --max-warnings=0 modules/ clean. Lead re-verified
the diff + generated files + checks. Compile re-gate: the fix commit's
synchronize push re-triggers the android-build job (label present) —
outcome recorded below.
FR-02 minor: the sheet's blocked/failed outcome Alert rendered only in
the unlocked branch; a mid-flight session clear (expiry/background/
snapshot) flipped the sheet to the locked form and swallowed the outcome
(T06-R2/R2-1 fixed the close-path variants; the ephemeral-clear paths were
missed).
→ FIXED (fresh implementer agent-6019068c, T06 scope): RED first — two
failing tests (blocked + failed settles landing while the sheet shows the
locked code form; pre-settle assertions prove the in-flight × cleared
intersection is genuinely exercised) — then the outcome Alert extracted
and rendered in BOTH branches (settle effect, in-flight dismissal gates,
and success path byte-identical); +2 regression tests; 14/14 sheet tests;
68 suites / 798 tests total; zero console output; typecheck/lint/format
green. Lead re-ran the suites + checks.
Axes the final reviewer examined and found clean: complete AC-01…AC-10
coverage (with on-hardware rows honestly unverified), architecture/
boundaries (diff exactly the plan's expected-change list; routes thin;
barrel minimal; no core→feature import; no Supabase sneaked in), all
safety invariants (fail-closed derivation auth-independent by type; no
startLockTask call sites repo-wide; session ephemerality with idempotent
clear paths; code never rendered/logged/persisted — negative assertions;
sign-out reuse structural), RN runtime (listener registration/cleanup,
re-entrancy guard, timer re-arm with Math.max(0,·)), accessibility (labels,
announced failures, live regions, 48dp), UI states (only reachable ones),
test quality (behavior-named, real pipeline, captured sinks), release/MDM
chain sanity, control-document coherence (brief↔plan↔diff; worklog counts
reproduce; review.md honest).

### FR-01 compile re-gate + FINAL_HEAD evidence (recovery session)

Android build re-run on ae1a982 (synchronize-triggered, label present):
**SUCCESS** — the fix-in-task loop is complete (failure diagnosed from the
run log → @string resource remediation → compile re-gated green). Full
check-run state on ae1a982: Verify SUCCESS · Web bundle SUCCESS · Expo
doctor SUCCESS · Android prebuild check SUCCESS (the native compile tier,
now GREEN with the kiosk-policy module compiled) · Maestro flows skipped
(no e2e label — per the plan's Verification, Maestro is N/A for this
feature: no new normal-device user journey; kiosk journeys cannot run on
an unmanaged emulator).

FINAL HEAD: ae1a982 (= d468afc + FR-01 fix b7b6529 + FR-02 fix ae1a982).

Final evidence re-collected at the FINAL HEAD (the FR-02 fix touched
kiosk-only UI; the standard-path runtime was re-verified):
$ pnpm verify → exit 0 (68 suites / 798 tests, incl. the two FR-02
regression tests)
$ pnpm export:web → exit 0 (CI-equivalent static export)
Runtime (browser, agent-browser, 1280×800 landscape + 800×1280 portrait):
/ → /sign-in; sign-in renders; zero console/page errors; no kiosk overlay
or maintenance affordance (standard path); screenshot captured.
GitHub CI on ae1a982: all five checks as above (the fast tier + the
native compile tier).

## QUALITY AUDIT + FEATURE GATE (RECOVERY — closing)

QUALITY AUDIT (fresh quality-auditor, agent-a4f4d55f — full delivery-truth
audit; did not watch any implementation)
Verdict: **the delivery is sound.** No "not delivered", no "not planned",
zero scope drift. Every AC-01…AC-10 delivered (the audit re-verified the
observables: package unchanged, the repo-wide lock-task grep, the
storage/log negative assertions, both workflows' fail-closed first steps,
the 90-test MDM client with zero production operations, the 551-line
operational contract); all 13 task gates + 3 round gates real (every
worklog entry carries mode, scaffold paths that all exist, honest RED,
GREEN, affected checks, fresh-reviewer findings; the test-count chain
17/138 → 68/798 reproduces); feature shape matches the plan exactly (all
7 generator commands map to existing files; no unplanned capability; no
api/queries/realtime — all NO in the matrix); all 49 diff files map 1:1 to
the plan's generated outputs, allowed-manual list, or expected shared
changes (core/ and components/ untouched); review findings fully
dispositioned; DoD met with the honest exceptions the record carries.
The audit RE-RAN: pnpm verify (PASS), test:ci (68/798), both tools'
no-input fail-closed smokes (messages reproduced byte-for-byte), the
lock-task grep, the FINAL_HEAD chain (d468afc merge → b7b6529 FR-01 fix →
ae1a982 FR-02 fix → b149f16 docs-only), and the suppression scan (no
@ts-expect-error / eslint-disable / any).
Not-evidenced items (settled by the Lead): the ae1a982 CI run ids are
now recorded — fast tier CI run 33827690769 (Verify job 100883777382,
Expo doctor job 100883777285, Web bundle job 100883777099), Android
build run 33827690789 (job 100883771787 — the native compile PASS), all
SUCCESS, verified through the GitHub API; PR #9 verified open/Draft/base
develop/head = the branch HEAD. The never-dispatched workflows remain the
documented human follow-ups (mdm-operations.md §7a/§7e/§9; todo Blocked).
Stale-record items: the one-behind FINAL HEAD label (inherent to closing
commits) and two process observations (AC-06's terse task-table column;
the plan-amendment DRAFT-cycle letter) — recorded in review.md's audit
table with no code change.

CI ON THE CLOSING DOCS COMMIT b149f16 (verified through the API):
Verify / Web bundle / Expo doctor all SUCCESS (CI run 33830212176) AND
the Android prebuild check SUCCESS (run 33830212185 — the synchronize +
label re-trigger re-compiled the native tier on the final HEAD).
Maestro flows: skipped (N/A per the plan's Verification — no new
normal-device user journey; kiosk journeys cannot run on an unmanaged
emulator).

FEATURE GATE (the checklist in todo.md, every item evidence-backed):

- Every Task Gate PASS: T01–T09 durable + re-baselined green at the
  recovery checkpoint; T10–T13 recovered with fresh evidence + fresh task
  reviews (T11-F01 major fixed + fresh re-review; all minors fixed or
  dispositioned).
- Every Round Gate PASS: Round 1/2 durable; Round 3 recovered (fresh
  round review; R3-1/2/3 fixed).
- Every AC verified: AC-01…AC-10 (the audit's independent re-verification
  above; on-hardware rows explicitly unverified, never claimed).
- pnpm verify PASS after the final local change: exit 0 at the final HEAD
  (68 suites / 798 tests, integrated with current develop).
- Required fast GitHub CI PASS on the final HEAD: Verify / Web bundle /
  Expo doctor SUCCESS on b149f16.
- Required runtime evidence: browser standard-path at tablet landscape +
  portrait from the CI-equivalent static export, zero errors, no kiosk
  surfaces, /kiosk-mismatch fail-closed (re-collected at the final code
  HEAD after the FR-02 fix).
- Required native tiers: prebuild local PASS; Android build (Kotlin
  compile) PASS on ae1a982 AND re-run PASS on b149f16; physical kiosk
  explicitly unverified.
- Reviewer findings dispositioned: every row in review.md (T01…T13, R2/R3,
  FR-01/FR-02, FRR-01) dispositioned; blocking/major fixes re-reviewed by
  a fresh reviewer with the compile re-gate confirmed.
- Quality Audit: PASS (recorded in review.md; delivery sound).
- Anything not verified explicitly recorded: the brief's Evidence section
  - mdm-operations.md §9 (hardware, live tenant, first dispatch/live
    dry-run — first-class unverified lists).
- Shared/core changes justified: the plan's expected-change list only.
- PR evidence matches the worklog: PR #9 (base develop, Draft) head = the
  branch HEAD; every gate commit pushed and verified on the PR.

FEATURE GATE: PASS

---

## T14 — policy readiness verdict + routing startup hold + LOCKED corroboration (remediation Round 4, IR-01)

**Mode**: behavior-change · **Acceptance**: AC-03 (amended 2026-09-04), AC-04 ·
**Deps**: — · **Scaffold**: N/A (no generator capability; JS/TS-only change in
existing planned surfaces — plan remediation amendment RD-01/RD-02)

- **Research basis**: packets R1/R2 (agent-805fa0cb / agent-d268378d), Lead
  spot-checked — Android documents the restrictions read as disk I/O that "may
  take several seconds" with no ordering guarantee vs auth; KEY_RESTRICTIONS_PENDING
  means "not available yet" (undetermined — never affirmative); Expo Router
  `Stack.Protected` (installed v6.0.24: `Protected = primitives.Group`) is
  removal-after-change, so gating must live in the resolver inputs.
- **RED** (fresh implementer agent-bf55104c): model suites 4 failed / 53
  passed — new resolver row `Expected "startup" / Received "preparation"` + 3
  LOCKED derive rows; state/native suites 14 failed / 31 passed — headline race
  (`Expected "startup" / Received "preparation"`), provisional hold, 8 store
  readiness assertions (`readiness` undefined / `markModuleAbsent is not a
function`), 3 sync transitions. All pre-existing rows green throughout.
- **IMPLEMENT** (11 files, exactly the allowed scope): store `readiness`
  ("pending" | "resolved") at the store root with the RD-01 transitions
  (valid+non-provisional → resolved; provisional → pending; schema-rejected →
  fail-closed policy + pending; read rejection → untouched; module-absent →
  `markModuleAbsent()` resolves); `resolveRootTarget` 4th param with exactly one
  new row (`ready+preparation+standard+pending → startup`), every prior row
  byte-identical; `deriveDevicePolicy` gains `lockTaskModeState === "locked"`
  OR-ed OUTSIDE the provisional suppression (live OS evidence; "pinned" never
  kiosk); `useRootTarget` passes both inputs; sync hook resolves
  module-absent; `app/index.tsx` startup-case comment corrected (comment-only).
- **GREEN**: 5 suites / 108 tests; `pnpm test:ci` → 68 suites / 822 tests;
  typecheck/lint/prettier all exit 0 (Lead re-ran independently).
- **AC-04 static search**: repo-wide `(start|stop)LockTask\(` in app-owned
  code → zero matches; `root-guard-lock-task.test.ts` green.
- **Fresh review** (agent-8c75e30c): **0 blocking / 0 major / 3 minor**
  (T14-R1 provisional+LOCKED maintenance-code row unpinned; T14-R2 non-gating
  decision unpinned; T14-R3 race composed in two halves). Implementer resumed:
  all three fixed test-only (+6 tests); **empirical RED re-verification** —
  the resolver gate temporarily reverted on the uncommitted tree made the
  composed race test fail exactly `Expected "startup" / Received
"preparation"`, then restored byte-identical (diff-verified) and re-run
  green. Incidental discovery recorded: RNTL v14 registers its own AppState
  listener per render (AppState call-counts cannot prove sync-hook mounts;
  the composed test asserts the policy-source seam counts instead).
- **GATE: PASS** — invariant holds through every unresolved path (initial /
  provisional / schema-rejected / first-read rejection / module-absent /
  failure-after-success); standard-device rows byte-identical; web/jest
  resolve immediately (never hang).

---

## T15 — MDM read-path contract remediation (remediation Round 4, IR-03/04/05)

**Mode**: bug · **Acceptance**: AC-09 · **Deps**: — · **Scaffold**: N/A (repo
tooling; no generator capability)

- **Research basis**: packet R4 (agent-342d50a3), Lead spot-checked — pagination
  = limit/offset + paging.next + metadata.total_record_count (50-default,
  `?page=` documented nowhere); groups = `name` field + GET /groups/{id}
  details; labels = per-app release_labels[] lookup, POST create-only,
  duplicate behavior undocumented.
- **RED** (fresh implementer agent-2a8ecf7f): 25 failed / 81 passed — group
  missing still mutates (4 MDM mutations), dry-run exits 0 on missing group,
  unconditional label POST, `?page=1/2` requests, `>50`-no-envelope walks to
  the bound, `--expected-group-name` unknown. (Mismatch tests drive the name
  via env — the unknown-flag rejection would mask the real failure; flag form
  covered by resolveInputs tests.)
- **IMPLEMENT** (3 files exactly in scope): `fetchAppPages` rewritten to the
  documented precedence (paging.next verbatim → accumulated total → short
  page → limit/offset stepping → >50-no-usable-envelope fail-closed; MAX
  bound retained; `?page=` never sent); `fetchGroupDetails` +
  `validateTargetGroup` (GET /api/v1/mdm/groups/{id}; documented `name`
  field; flat OR wrapped body tolerated; non-200/unparseable = missing) with
  NEW required input `--expected-group-name`/`MDM_EXPECTED_GROUP_NAME` —
  validated read-only BEFORE any mutation in BOTH flows; dry-run exits
  NON-ZERO on missing/mismatch; `fetchGroupList`/`group_name` parsing
  deleted (drift); Beta-label reuse from `release_labels[]` (name === "Beta";
  first entry) before POST — one POST per run at most, POST error fails
  closed; workflow `group-name` required dispatch input + early validation +
  unconditional flag forward (env-indirection).
- **GREEN**: 1 suite / 106 tests → after review remediation 114 tests;
  `pnpm test:ci` 68 suites / 846 tests; verify exit 0; typecheck/lint/prettier
  clean; plain-Node smoke (Node 24) lists the new flag.
- **Fresh review** (agent-70888e64): **0 blocking / 0 major / 3 minor**
  (T15-R1 paging.next had no origin guard — bearer exfiltration hardening
  gap; T15-R2 expected-group-name echo lacked a union-redaction pin;
  T15-R3 four edge shapes unpinned). Implementer resumed: origin guard added
  (RED → GREEN; pre-fix vulnerability quantified: 99 foreign requests each
  carrying the Zoho-oauthtoken; post-fix zero), union-redaction pin +
  expectMasked on the two omission sites, 4 characterization rows (wrapped
  details, string/non-numeric total, two-Beta-entries first-match, empty/blank
  next). 114 tests green.
- **GATE: PASS** — documented read path (pagination/groups/labels), truthful
  dry-run, pre-mutation group+name validation, label reuse; production-group
  denylist + masking discipline retained.

---

## T16 — MDM auth/error contract remediation (remediation Round 4, R5 drifts)

**Mode**: bug · **Acceptance**: Supporting AC-09 · **Deps**: T15 (PASS) ·
**Scaffold**: N/A (repo tooling)

- **Research basis**: packet R5 (agent-0a11aa0c), Lead spot-checked against
  the live serverinfo endpoints — `ca` accounts host =
  `accounts.zohocloud.ca`, `cn` = `accounts.zoho.com.cn` (both previous
  hosts DNS-dead); documented error envelope example carries a NUMERIC
  `error_code` (1002) while the codes table maps strings; the token throttle
  JSON carries `error_description` alongside `{"error": ...}`.
- **RED** (fresh implementer agent-67c4199b): **3 failed / 115 passed** —
  ca host (`Expected accounts.zohocloud.ca / Received accounts.zoho.ca`),
  token description dropped (`Expected "too many requests" / Received "error:
Access Denied — check MDM_CLIENT_ID…"`), numeric code fell to the raw
  first line. One additional row was delivered as a CHARACTERIZATION, not
  RED: the plan's third RED item ("429-with-numeric-code still retries") was
  a plan-time mislabel — the HTTP-429 status branch already fired on the old
  code, so that case passed before and after (reviewer T16-R4; the delivered
  characterization pins HTTP 500 + numeric code via the status check, and
  429 is pinned by the pre-existing tests).
- **IMPLEMENT** (2 files, surgical): DATA_CENTRES ca/cn hosts fixed;
  `errorCodeText()` (string|number) used in `describeErrorBody` AND the
  COM0002 retry check; the `{"error": ...}` token branch surfaces
  `error_description` (redaction unchanged); MASKING header comment
  provenance reworded to engineering discipline.
- **GREEN**: 118 tests (114 + 4); `pnpm test:ci` 68 suites / 850 tests;
  typecheck/lint/prettier clean.
- **Fresh review** (agent-1c8afa52): **0 blocking / 0 major / 4 minor** —
  T16-R1 USAGE string still carried the retracted provenance (implementer
  resumed: one-clause reword, 118 tests green); T16-R2/T16-R3 are
  mdm-operations.md provenance + ca/cn host-template inconsistencies
  (assigned to T20's scope); T16-R4 record accuracy (this entry's
  characterization note).
- **GATE: PASS** — documented DC hosts, both documented error-envelope
  shapes, token error descriptions surfaced; T15 surfaces byte-identical.

---

## T17 — release verifier certificate SHA-256 pinning (remediation Round 4, IR-06)

**Mode**: behavior-change · **Acceptance**: AC-08 · **Deps**: — · **Scaffold**:
N/A (repo tooling + workflows)

- **Research basis**: packet R6 (agent-776a5ce2), Lead spot-checked against
  AOSP ApkSignerTool.java — per signer: `<label> certificate DN:`,
  `<label> certificate SHA-256 digest: <lowercase contiguous hex>`; label
  shapes vary (`Signer #1`, rotated `Signer (minSdkVersion=…,
maxSdkVersion=…)`, `Source Stamp Signer`) → parse by line SUFFIX. Android
  enforces byte-level certificate equality on updates; DN is not identity.
  The digest is PUBLIC (computable from the shipped APK) → Actions VARIABLE,
  never a secret.
- **RED** (fresh implementer agent-4a2a8884): 21 failed / 33 passed — the
  IR-06 hole fails-to-fail (plausible non-debug DN + wrong digest PASSES
  today, `Expected: false / Received: true`), absent-input unnamed,
  `checkCertificateDigests` missing.
- **IMPLEMENT** (4 files, exactly in scope): REQUIRED input
  `--cert-sha256`/`EXPECTED_CERT_SHA256` (INPUT_SPECS); exported pure
  `checkCertificateDigests` (suffix-anchored parse, hex normalization both
  sides, DISTINCT-digest set = signer set — the same cert on two block
  shapes is one signer; more than one distinct digest fails closed as
  multi-signer; mismatch message quotes 12-char prefixes only); debug-DN
  rejection retained (both failures now reported); both workflows pass
  `vars.ANDROID_UPLOAD_CERT_SHA256` via env indirection with a fail-closed
  presence check naming the variable + both documented computation
  procedures (apksigner / keytool|sha256sum).
- **GREEN**: 54 tests; test:ci 68/870; verify exit 0; real-CLI smoke (wrong
  digest → named mismatch; keytool spelling → pass).
- **Fresh review** (agent-3c5d09c6): **0 blocking / 0 major / 2 minor**
  (T17-R1 no pin shape validation — a sha256sum paste (`<hex>  -`) produced
  an IDENTICAL-prefix unactionable mismatch; T17-R2 three parse rows
  unpinned). Implementer resumed: `^[0-9a-f]{64}$` shape check with a named
  actionable failure (RED reproduced verbatim), +8 tests incl. source-stamp
  block / actual-side-colon / SHA-1-ignored pins; one disclosed fixture
  correction (a pre-existing key-digest fixture was 65-hex — now a real
  64-hex, making the key-line test MORE discriminating). 65 tests; test:ci
  68/881; verify exit 0.
- **GATE: PASS** — the delivery gate now rejects any wrong non-debug key
  (IR-06 closed); operators get actionable shape failures.

---

## T18 — explicit versionCode + fail-closed derivation (remediation Round 4, IR-08)

**Mode**: config · **Acceptance**: Supporting AC-08 · **Deps**: T17 (PASS) ·
**Scaffold**: N/A (config files)

- **Research basis**: packet R6 — installed @expo/config-plugins Version.js
  `?? 1` default means every release would ship versionCode 1 forever;
  Android enforces >= (downgrade protection), Expo/MDM guidance says
  increase per release.
- **IMPLEMENT** (3 files, exactly in scope): `app.config.ts` gains
  `android.versionCode: 1` with the bump-contract comment; BOTH workflows'
  derivation steps replace `android.versionCode ?? 1` with a named failure
  (exit 1 BEFORE any $GITHUB_ENV write) when the field is absent; the
  stale `?? 1` comment above each step corrected (reviewer-endorsed
  judgment call).
- **Config-mode evidence** (fresh implementer agent-f61e36aa; derivation
  scripts programmatically EXTRACTED from the committed YAML, /tmp
  replays): field absent → exit 1 + named message + no env write;
  `versionCode: 1` / `"12"` → pass; `"7a"` / `null` / `""` → exit 1; the
  REAL config → pass with 1; `expo config --json` carries versionCode 1;
  `expo prebuild --clean` → build.gradle `versionCode 1` (byte-identical to
  the old default's output; no tracked file changed after the documented
  package.json restore).
- **Fresh review** (agent-b4a6188c): **0 blocking / 0 major / 1 minor**
  (T18-R1: mdm-operations.md still documents the removed `?? 1` default as
  current behavior — folded into T20's checklist with the T16-R2/R3 items).
  Reviewer independently re-extracted and re-ran the replays, verified
  byte-consistency of both steps, and re-ran prebuild (byte-identical
  output).
- **GATE: PASS** — the bump contract can no longer be silently skipped.

---

## T19 — actions SHA pinning + environment references (remediation Round 4, IR-07)

**Mode**: config · **Acceptance**: Supporting AC-07, AC-09 · **Deps**: T17,
T18 (PASS) · **Scaffold**: N/A (workflow config)

- **Research basis**: packet R7 — "Pin actions to a full-length commit SHA …
  currently the only way to use an action as an immutable release"
  (documented good practice, not required absent an org policy);
  environments available on public repos; required reviewers; typo/auto
  -creation is fail-safe here (empty env → repo-scope secrets still
  resolve → existing fail-closed checks guard).
- **IMPLEMENT** (fresh implementer agent-a792f5df; 2 files, exactly in
  scope): all 10 `uses:` lines across the two SECRET-BEARING workflows
  pinned to full 40-char commit SHAs with `# vX.Y.Z` comments (6 distinct
  actions); `environment: android-signing` (release job) / `environment:
mdm-upload` (upload job) with the human-migration follow-up comments.
  The three CI workflows (no secrets) keep tag pins per the Lead scope
  decision.
- **Pin resolution proof (implementation time, git ls-remote)**:
  actions/checkout v7.0.1 → 3d3c42e5aac5ba805825da76410c181273ba90b1
  (lightweight); pnpm/action-setup v6.0.10 → tag object ff378ebe… peels to
  COMMIT 0977fd99725f1db4007ccb2928dbb4e90d06cc86 (annotated — the executed
  commit is pinned, not the tag object); actions/setup-node v7.0.0 →
  820762786026740c76f36085b0efc47a31fe5020; actions/setup-java v5.7.0 →
  b6effb05e454b25005698d916606bdc6ffcbf961; actions/upload-artifact
  v7.0.1 → 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a;
  actions/download-artifact v8.0.1 →
  3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c. Structural before/after diff
  clean (only uses values + environment keys); `pnpm verify` exit 0
  (check:ci-scripts scans both edited workflows); prettier clean.
- **Fresh review** (agent-07bb0f62): **0 blocking / 0 major / 0 minor —
  clean.** All six pins independently re-resolved (annotated-tag peel
  verified); 10/10 uses pinned; structural byte-identity confirmed via
  parsed-YAML comparison; CI workflows untouched; only these two workflows
  consume secrets (rg `secrets.` across all five).
- **GATE: PASS** — the documented supply-chain hardening for the two
  secret-bearing workflows, with the environment migration recorded as the
  human follow-up (T20 documents the procedure).

---

## T20 — mdm-operations.md remediation alignment (remediation Round 4, FINAL task)

**Mode**: config · **Acceptance**: Supporting AC-10 · **Deps**: T15–T19
(PASS) · **Scaffold**: N/A (documentation)

- **IMPLEMENT** (fresh implementer agent-266c9ca5; ONE file — 216
  insertions / 73 deletions): all 11 checklist items landed — the three
  assigned rewords (T16-R2 Zoho-policy provenance → engineering
  discipline; T16-R3 ca/cn token-host exception; T18-R1 versionCode
  reality + the "Expo's exact defaulting" clause), the required group-name
  dispatch input, the ANDROID_UPLOAD_CERT_SHA256 PUBLIC-variable
  procedure (cross-referenced from §7a/§7b/§7d), the environment
  migration human follow-up (android-signing + mdm-upload, seven
  secrets, SHA-pinned actions note), Beta-label reuse semantics, the
  documented pagination + pre-mutation group validation read-path notes,
  the IR-02 verdict (single-phase fileStatus; the 2026-09-04 zero
  -occurrence sweep), five new live-tenant unknowns (duplicate-label POST,
  groups/{id} error shape, actual app-list envelope, actual /emsapi/files
  values, restrictions_pending / kiosk_device_role push behavior), and
  the original unverified items byte-identical.
- **GREEN**: `pnpm verify` exit 0 (68 suites / 881 tests; check:docs 79
  files); prettier clean.
- **Fresh review** (agent-3f51934d): **0 blocking / 0 major / 1 minor**
  (T20-R1: "before any checkout" over-claim — the validation step runs
  after checkout). Implementer resumed: both sentences reworded to
  "immediately after checkout, before any toolchain…". Reviewer verified
  11/11 checklist items against the SHIPPED CODE (pagination precedence,
  group validation, label reuse, DC hosts, versionCode, dispatch inputs,
  cert wiring, environments, pins) — all accurate; stale-claim sweep
  clean; no invented contracts.
- **GATE: PASS** — the operational contract matches the remediated
  pipeline. ALL SEVEN remediation tasks (T14–T20) are now gated PASS.

---

## Round 4 gate — post-review remediation (T14–T20)

- **Subsystem checks**: `pnpm verify` exit 0 — 68 suites / 881 tests; all
  guards green (run on the clean tree at the round head before review).
- **Accumulated round diff**: 8604a51..8354b5a — 22 files, +2958/−429
  (the seven task commits 1a30a5a..8354b5a + the review-row commit).
- **Fresh round reviewer** (agent-5dd85f16): **0 blocking / 0 major /
  1 minor** — R4-1: mdm-operations.md §4/§9 still described the TWO-signal
  kiosk derivation, missing T14's RD-02 third signal (`lockTaskModeState
=== "locked"`, exempt from provisional suppression). Fixed in-task by the
  T20 implementer (two passages rewritten to the three-signal derivation +
  precise pending semantics, matched to the derive code's doc comment).
  Round reviewer's cross-task seams examined CLEAN: runtime isolation
  (T14 × tools), T15×T16 retry/error interaction (404+numeric-code → group
  missing, not retried), T17×T18 step coherence, T19 pins × with-inputs,
  the combined MDM flow (all read-only validation precedes the first
  mutation; every step fail-closed), docs-vs-code message quotes, AC-01…
  AC-10 end-to-end.
- **ROUND 4 GATE: PASS** — IR-01/03/04/05/06/07/08 closed at code level
  with fresh evidence; IR-02 documented REJECTED; R5 drifts fixed. IR-09
  (develop integration) remains, scheduled next per the plan.

---

## Final verification — develop integration (IR-09) + runtime regression (remediation)

- **develop integration (IR-09)**: `git fetch origin --prune` —
  origin/develop = 3a25640 (unchanged since the amendment; PR #12's cart
  pre-checkout hardening, 15 commits ahead of the feature's earlier
  integration base 6161a4c). Merged non-destructively:
  `git merge origin/develop --no-edit` → **zero conflicts** (cart surfaces
  disjoint from kiosk-runtime); merge commit **db3a50d** pushed; PR #9
  head = db3a50d, state open/draft/base develop, mergeable_state clean.
- **Post-merge verification**: `pnpm verify` EXIT 0 — 68 suites /
  **894 tests** (881 + 13 from the merged cart hardening).
- **Runtime browser regression (db3a50d, CI-equivalent static export,
  agent-browser, tablet landscape 1280×800 + portrait 800×1280)**:
  - signed-out root → `/sign-in` **immediately** (the T14 readiness hold
    is invisible on web — module absent resolves instantly; no hang);
  - Customer journey: signed in with the committed disposable test account
    → the customer experience renders (Demo Store / Brands / Products /
    Categories / Search), zero console errors, zero page errors;
  - Preparation journey: signed in with the disposable preparation account
    → the preparation experience renders (Sign out control) immediately —
    AC-04 behavior through the readiness change, no hang;
  - `/kiosk-mismatch` direct visit (unauthenticated): fail-closed — the
    sign-in experience renders, NO mismatch content leaks;
  - no kiosk surfaces (no maintenance affordance) anywhere on the standard
    path; both viewports.
- **Native tier**: the `android-build` label was added to PR #9 (API),
  triggering the label-gated Android build on db3a50d — outcome recorded
  below at completion. Maestro/E2E: N/A per plan (skipped, not PASS).
- **Fast CI on db3a50d**: Verify / Web bundle / Expo doctor / Android
  prebuild — outcome recorded below at completion.

- **Fast CI + native tier on the EXACT final HEAD 7d6702d** (FR2-01
  remediation — recorded with run ids; the db3a50d runs were CANCELLED as
  superseded by the evidence commit's synchronize events, and the build
  label's outcome landed on the final HEAD): **CI run 33857102917
  SUCCESS** (fast tier: Verify / Web bundle / Expo doctor / Android
  prebuild check all success, check-suite runs 91755501768/91755501769);
  **Android build run 33857102920 SUCCESS** (label-gated native compile
  tier, completed on 7d6702d); Maestro flows skipped (N/A per plan);
  Android E2E skipped (run 33857103028 — never claimed PASS).

## Final full-feature review (fresh, post-remediation) — FR2 series

Fresh final reviewer (agent-49d1b14b, HEAD 7d6702d): **0 blocking / 1 major
/ 2 minor.** FR2-01 (major, records): the final-verification entry's CI
outcomes were dangling promises — the reviewer independently verified the
7d6702d runs green (ids above) and required the record + attribution fix
(this commit). FR2-02 (minor): todo.md checkpoint one step behind (fixed in
this commit). FR2-03 (minor): the identity-derivation script is duplicated
byte-for-byte in both secret-bearing workflows — ACCEPTED with rationale:
the duplication is the documented plan design (byte-identical by contract,
reviewed in T18); a desync fails CLOSED (the MDM re-verify compares against
a different expected identity and exits 1), so it is a maintenance cost,
not a fail-open hazard; if ever extracted to a shared script, that is a
deliberate future change with its own task. Coverage: all ACs verified
clean, all remediation closures verified, no regression against T01–T13,
scope clean (49-file expected list), pins re-resolved, 68/894 re-run by the
reviewer.

---

## NEW FEATURE GATE — kiosk-runtime remediation complete (2026-09-04)

- **Quality audit (fresh, agent-956ddd2f)**: "the delivery is sound" — no
  not-delivered / not-planned findings; not-evidenced and stale-record items
  closed (the FR2 re-review convergence recorded in review.md; the todo
  checkpoint refreshed; the PR body rewritten at this gate). The auditor
  independently re-ran: `pnpm verify` exit 0 (68/894), `pnpm test:ci`, the
  browser standard-path regression, both tools' fail-closed smokes, the
  static greps, and the GitHub API evidence chain (runs 33857102917 /
  33857102920 on 7d6702d SUCCESS; the db3a50d cancellations exactly as
  recorded; PR #9 state). Remediation integrity verified clean: new
  evidence per commit, T01–T13 preserved as history, no backfilled PASS.
- **cfc7a10 (docs-only) CI**: CI run 33858954820 SUCCESS; Android build
  run 33858954741 SUCCESS (completed after the audit's in-progress
  observation).
- **Gate checklist**: every line evidence-backed (todo.md "Feature gate
  (the NEW gate)"). `pnpm verify` re-run green on the gate-commit tree
  before this commit.
- **FEATURE GATE: PASS** (the NEW gate) — the prior b71c828 pass remains
  historical/reopened context in review.md. PR #9 stays DRAFT for the
  human review; the agent never merges.
- **Terminal state: HUMAN_HANDOFF.**

## ROUND 5 REOPENING — kiosk-runtime (2026-09-04)

### Workspace restoration (prior Super Z sandbox lost)

- Prior sandbox gone: no repos/, no worklog, no scripts. Cloned
  `mohammed7779948484-tech/Kisok_react_app` ONCE into
  `/home/z/my-project/repos/Kisok_react_app`; `git fetch origin --prune`;
  checked out EXISTING `feature/kiosk-runtime` (tracking origin). Clean tree,
  no uncommitted/unpushed work to preserve.
- Durable checkpoint verified vs GitHub: PR #9 open/Draft/base develop/head
  527a7e6d3d07781c5cb125b1e205912f8daa1025/mergeable clean/49 files/39 commits;
  origin/develop = 3a25640b602a685c690a4b467b6e900625484c89; ahead 39 / behind 0
  — exactly the reviewer's checkpoint. Current GitHub wins; no reset performed.
- Skills re-synced (cp -rL) from `.claude/skills/` into the Super Z live
  registry; KISOK skills visible (12 present).
- Fresh baseline on the restored HEAD: `pnpm install --frozen-lockfile` OK;
  **`pnpm verify` EXIT 0 — 68 suites / 894 tests** (reproduces the Round 4
  final record exactly).

### GATE REOPENED

- **FEATURE GATE REOPENED — ROUND 5 INDEPENDENT REVIEW** (R5-01…R5-13; see
  review.md's Round 5 reopening section). The Round 4 PASS at 527a7e6 is
  historical evidence only. Plan status returned to `DRAFT` for the Round 5
  amendment; todo checkpoint updated; NO backfilled PASS results.
- Control docs updated at the local reopening commit. GitHub push credentials
  are absent from this restored sandbox (dry-run push failed with no
  credentials); local commits are preserved and the push prerequisite is
  recorded — first push attempt happens at the research-synthesis commit; the
  human may supply a token at any time to un-block remote durability.
- Next: SEVEN read-only researchers (batches A=3, B=2, C=2 — concurrency ≤ 3),
  then Lead synthesis + R5 verdict matrix + Lead Planning Review, then T21+.

## ROUND 5 RESEARCH GATE — complete (2026-09-04)

### Seven read-only Evidence Packets (batches A=3, B=2, C=2; concurrency ≤ 3)

- Batch A: R5-A1 `agent-fae96c2e…` (Android policy boundary), R5-A2
  `agent-ef8a0443…` (Expo/RN state machine), R5-A3 `agent-fad0415e…`
  (ManageEngine Files/status).
- Batch B: R5-B1 `agent-5421d4be…` (mutation schemas), R5-B2
  `agent-695fd6e9…` (group-target safety).
- Batch C: R5-C1 `agent-87f8ae5a…` (retry/idempotency cross-audit),
  R5-C2 `agent-0ba18835…` (GitHub provenance).
- Full synthesis, verdict matrix R5-01…R5-13, contradictions, and
  live-tenant residuals: review.md "Round 5 research synthesis". The Lead
  personally re-opened every load-bearing first-party page (ManageEngine
  cloud help tree ×7 pages; Android Intent/Context refs; Zoho token-limits;
  GitHub secure-use/environments; action pins via git ls-remote) and
  confirmed the quoted contracts.
- **IR-02 contradiction RESOLVED**: the Round 4 "no polling endpoint"
  conclusion swept the edition-general `/api/` tree; the cloud help tree
  (KISOK's actual deployment) documents POST /emsapi/fileupload/status —
  verdict overturned; R5-03 CONFIRMED.

### Plan amendment + Lead Planning Review

- plan.md: "Round 5 remediation amendment" appended — design decisions
  RD5-01…RD5-10, tasks T21–T29 (see todo.md status board), file scopes,
  skills, test strategy, risks, verification, DRAFT→READY checklist, and the
  Lead Planning Review PASS (2026-09-04).
- brief.md: AC-03 minimally amended (module-absent-on-Android and
  event-invalidation windows — evidence-cited; stable AC IDs preserved).
- todo.md: Round 5 status board + refreshed checkpoint.
- Plan is READY for T21. No implementation started before this point
  (research-before-code rule honored).

### T21 — platform-discriminated module absence + event-driven invalidation (Round 5)

RED (fresh feature-implementer, agent-eae39dc5, behavior-change):
`pnpm jest features/kiosk-runtime/native/policy-source.test.ts
features/kiosk-runtime/native/use-device-policy-sync.test.ts
features/kiosk-runtime/state/device-policy-store.test.ts`
→ 3 suites failed / 14 tests failed (42 passed): android+null called
markModuleAbsent (Expected 0 / Received 1 — the permissive resolution);
synchronous event invalidation Expected "pending" / Received "resolved";
post-event failed re-read kept resolved; kiosk maintenance session survived
the event; `isPolicyModuleAbsenceExpected`/`onRestrictionsChanged` not
functions. Lead independently re-verified RED by stashing the three
implementation files and re-running the suites (9 failures remain — the RED
premise is real).

IMPLEMENT: `policy-source.ts` gains `isPolicyModuleAbsenceExpected()`
(`Platform.OS !== "android"` — the sanctioned discriminator;
requireOptionalNativeModule's null carries no reason code);
`device-policy-store.ts` gains `onRestrictionsChanged()` (resolved+standard →
pending + unconditional maintenance clear, one atomic set; kiosk role never
touched); `use-device-policy-sync.ts` calls markModuleAbsent ONLY on
non-Android null (android null ⇒ hold pending, deliberately silent) and
calls the store action synchronously in the restrictions listener before the
re-read. Platform.OS mocked by direct assignment (writable property under
jest-expo; restored in afterEach; mechanism documented in the test file).

REVIEW (fresh code-reviewer, agent-1159215c): 1 MAJOR (T21-R1) — an event
landing while a read is in flight can be re-defeated by the stale read's own
resolution (empirical repro: cold standard → re-read held → event
invalidates → stale pre-change snapshot re-resolves resolved → queued re-read
rejects → stale permissive verdict stands). 0 blocking.

T21-R1 REMEDIATION (same implementer resumed): epoch/generation guard in the
hook — `epoch += 1` synchronously in the listener (before the re-read
dispatch); `refresh()` captures the epoch before the await and DISCARDS the
result on all paths (apply/markModuleAbsent/log) when superseded; the
re-entrant queued re-run is guaranteed and captures the new epoch;
AppState-active does not bump the epoch (retained semantics). RED for the
remediation rows reproduced the reviewer's repro exactly (Expected
"pending" / Received "resolved"; apply count Expected 1 / Received 2). The
burst row was amended (its interleaving IS event-driven — the old
stale-apply-first expectation WAS the bug; now pins standard-only apply for
the burst and 2 applies with the trailing AppState re-read). A final pin row
(superseded-rejection silence: zero error logs; recovery intact) was added
as delivered-behavior documentation.

RE-REVIEW (NEW fresh code-reviewer, agent-5a5fbfd3): **T21-R1 resolved; 0
blocking / 0 major / 1 minor** (control-docs recording at gate time — this
entry). The epoch guard verified airtight (no interleaving point between
guard-check/apply and finally; multiple events collapse into one re-run
capturing the latest epoch; post-unmount in-flight apply shape predates T21
and is unchanged; listener-before-initial-read holds).

GREEN: the three suites 58/58 (+ the final pin row) → hook suite 21 tests;
`pnpm test:ci` **68 suites / 911 tests PASS** (reopen baseline 894 + 17 new
rows: 5 policy-source, 8+1+1 hook, 4 store). `pnpm typecheck` exit 0;
`pnpm lint` 0 issues; `pnpm format:check` clean. Scope: exactly the six
planned files (Lead-verified via git status/diff --stat; nothing outside
features/kiosk-runtime).

GATE: PASS (R5-01/R5-01 remediation closed with independently verified RED,
fresh review, bounded remediation, and a fresh re-review converging 0
blocking / 0 major). Commit + push attempt follows (push requires the
human's GitHub token in this restored sandbox — recorded prerequisite).

### T22 — policy readError + PolicyStartupGate with manual retry (Round 5)

RED (fresh feature-implementer, agent-7ea74aa5, behavior-change): store
suite 8 failed/27 passed (`readError` undefined; `setReadError is not a
function`); sync suite 7 failed/18 passed (readError wiring rows Received
null; `requestDevicePolicyRead is not a function`); gate suite 5 failed
(alert/button/label not found — behavior-less stub mounted first). All T21
rows green through RED. 16 new rows total.

IMPLEMENT: store gains root `readError: {reason: "module-absent" |
"read-failed"} | null` (UI-only; `setReadError` enforces the
pending-only invariant AT THE STORE; cleared by applySnapshot-success,
markModuleAbsent, retry dispatch; schema-rejected path deliberately leaves
it — see review.md accepted boundaries); the sync hook wires android+null →
module-absent, epoch-guarded current rejections while pending →
read-failed, and exports `requestDevicePolicyRead(): boolean`
(module-scoped callback; clears readError then re-invokes the SAME
single-flight refresh; false when unmounted); NEW manual artifact
`components/policy-startup-gate.tsx` (no-error → composes StartupScreen
from @/features/auth; error → Screen + ErrorState with static module-level
retryable AppErrors — kind server, generic copy, no native-reason leakage);
`index.ts` widened; `app/index.tsx` startup case renders the gate (comment
updated). Plan's artifact name reconciled (policy-error-surface →
policy-startup-gate; Lead amendment, same commit).

REVIEW (fresh code-reviewer, agent-e4f929bb): **0 blocking / 0 major / 2
minor** — T22-R1 comment-gloss tightening (folded into T23, which touches
the store file); T22-R2 gate-time bookkeeping (this entry). Contract
verified point-by-point: fail-closed by construction (readError ⇒ pending ⇒
the one reachable row is the startup hold), pending-only store enforcement,
epoch-guarded non-supersession, single-flight manual retry with unmount
safety + double-tap collapse, static leak-free AppError construction
(technicalMessage grep clean), web rows byte-identical, scope exact
(root-guard/use-root-target untouched, no T23 leakage). Reviewer verdicts:
schema-rejected boundary ACCEPTED (recorded in review.md);
onRestrictionsChanged-not-touching-readError CORRECT; naming deviation
RECONCILED. a11y alert-role workaround verified against RNTL v14 source
(View without `accessible` is unmatchable by role queries; in-repo
precedent; retry button properly queried by role+name).

GREEN: 3 suites 65/65; `pnpm test:ci` **69 suites / 927 tests** (911+16);
typecheck/lint/format all clean (Lead re-run).

GATE: PASS (R5-08 remediation closed). Commit + push attempt follows (push
still requires the human's GitHub token — recorded prerequisite).

### T23 — settled-restrictions maintenance gating + sheet lifecycle (Round 5)

RED (fresh feature-implementer, agent-00b6a155, behavior-change): derivation
suite 9 failed (restrictionsSettled undefined); store suite 8 failed —
primary: `tryUnlock(KIOSK_CODE)` on provisional+LOCKED Expected false /
Received true (the RD-02 corollary being superseded); overlay suite 3
failed — the sheet still OPEN after kiosk→standard→kiosk (the R5-10 bug) +
settling state missing; sheet suite 1 failed (settling note missing).
Reviewer later confirmed RED-by-construction against HEAD for all three
failure families.

IMPLEMENT: `DevicePolicy.restrictionsSettled: boolean` (top-level, =
`!isProvisionalSnapshot`, one definition shared with the store's readiness
logic; code extraction UNCHANGED — the policy self-describes; the pinned
RD-02 row honestly amended recording the supersession); `tryUnlock` gains
the settled-ness gate (silent same-shape false; nothing changes; nothing
logged — a failed attempt must not reveal whether a code exists); the
overlay gains the sheetOpen reset effect (before the early return) and
passes settled-ness to the sheet; the sheet gains the settling variant
(announced info Alert "Managed settings are updating…", disabled
input/Unlock, Close stays enabled; settle-back flips without closing). A
Lead re-scope extension (explicit) covered the mechanical compile ripple:
`restrictionsSettled: true` in two beforeEach fixtures + 4 toEqual policy
assertions (same class), plus the hook catch-comment half of the T22-R1
fold-in (comment-only).

REVIEW (fresh code-reviewer, agent-1cacb098): **0 blocking / 0 major / 2
minor** — T23-R1 stale-rejection-message-on-settling-flip ACCEPTED as
cosmetic (stale-but-truthful, non-actionable, self-healing, discloses
nothing — recorded in review.md; optional one-liner documented); T23-R2
gate-time bookkeeping (this entry). Routing verified byte-identical
(root-guard/use-root-target untouched; settled-ness never enters the
resolver — consumers grepped); unreachable-state check (unlocked &&
!settled cannot coexist — every policy-changing path clears the session);
the sync-source change verified comment-only; the RD-02 supersession
recorded in test names + source docs + plan + review.

GREEN: 4 suites 109 tests; `pnpm test:ci` **69 suites / 942 tests**
(927+15); typecheck exit 0 (after the re-scoped fixture fixes); lint clean;
format clean (Lead re-ran test:ci/typecheck).

GATE: PASS (R5-10/R5-11 closed; the RD-02 credential corollary superseded
with evidence). Commit + push attempt follows (push still blocked —
human token prerequisite recorded).

### T24 — file-upload two-phase lifecycle + documented headers (Round 5)

RED (fresh feature-implementer, agent-95ab4e2e, mode bug; baseline 118
passed pinned first): 10 failed — the poll-success row `Expected: 0 /
Received: 1` (the R5-03 terminal-failure bug); Accept rows `Expected
"application/json" / Received: undefined`; the lifecycle shape rows (zero
status calls). The fresh reviewer independently reproduced the RED against
HEAD in a /tmp scratch copy (exactly 10 failures for the intended reasons).

IMPLEMENT: `authHeaders()` carries `Accept: application/json` (every MDM
JSON call; the Zoho token exchange keeps its own set — pinned); constants
FILE_PENDING_STATUS/FILE_FAILED_STATUS/FILE_STATUS_POLL_MAX_ATTEMPTS(20)/
FILE_STATUS_POLL_INTERVAL_MS(3000) marked ENGINEERING choices (no
documented interval/timeout; 500/min threshold noted);
`pollFileUploadStatus()` — exact body `{"fileIDs":["<string id>"]}`,
Authorization+Content-Type+Accept, entry matched by String(file_id),
file_availability_status 2 = ready, missing entry/non-array/malformed →
named fail-closed, remarks never parsed (lying-remarks row pins this),
bounded 20 attempts × 3s; `uploadApkFile` owns the lifecycle (2 → fast
path NO status call; 3 → immediate documented-FAILED failure; 1 → poll;
undocumented → named fail-closed). Stale "no polling endpoint" comments in
the tool + test header replaced with the two-phase contract + the IR-02
resolution pointer. One old single-phase row honestly amended (in-file
comment records the behavior change).

REVIEW (fresh code-reviewer, agent-12da44d8): **0 blocking / 0 major / 2
minor** — T24-F01 (three thin fail-closed branches unpinned; (a) the
status-poll HTTP-failure abort-vs-attempt semantics was the one real
choice) → resolved by two added pin rows (a: failed poll ⇒ run failure,
3 status POSTs, no PUT; b: unusable file_availability_status ⇒ named
fail-closed); T24-F02 (success-summary field attribution "fileStatus 2"
after a poll success) ACCEPTED cosmetic — folded into T25 (which touches
the same file). Reviewer verified: byte-exact status body, dual-shape
tolerance, bounded loop with retry interplay (20×3=60 max status calls ≪
500/min), sleep discipline (19 intervals, first check immediate), masking
held in every new row, RED reproduced independently.

GREEN: focused suite 130/130 (128+2); `pnpm test:ci` **69 suites / 954
tests** (942+10+2); typecheck/lint/format clean; native Node 24 run
(`--help`) exit 0.

GATE: PASS (R5-03 + R5-05 closed; IR-02 stale claims corrected in the
tool). Commit + push attempt follows (push still blocked — human token
prerequisite recorded).

### T25 — Update App documented-Mandatory body + truthful summary (Round 5)

RED (fresh feature-implementer, agent-b3f31b8e, mode bug): 6 failed — the
PUT-body toEqual diffs (Expected app_name/app_type fields / Received the
2-field violation — R5-04 itself), the distinct-name threading row
(app_name undefined), and the two summary-attribution rows (the T24-F02
untruthful "fileStatus 2" claim on a PENDING→poll run). The fresh reviewer
independently reproduced the RED in a /tmp scratch copy (exactly 6
failures for the intended reasons).

IMPLEMENT: `addAppVersion` gains the appName parameter and PUTs the exact
4-field body {app_name, app_type: 2 (Enterprise — documented enum comment),
app_file, force_update_in_label: true}; release_label_id stays a PATH param
only; `runUpload` threads inputs.appName (equal to the listed app's name by
the exact-=== walk — comment records the invariant). T24-F02 fold-in:
FileUploadResult success arm gains readyVia ("upload-response" |
"status-poll"); the summary line cites the signal each path actually
observed (fast path: "the upload response reported fileStatus 2 —
COMPLETED"; poll path: "ready for use — file_availability_status 2 from
POST /emsapi/fileupload/status"). THREE pinned PUT-body expectations were
amended (happy-path, two-phase, RD5-05 poll — the plan's "both" was a
stale pre-execution figure; T25-F02 records the correction) + three new
rows (distinct-fixture threading; two summary-attribution rows with
not.toContain guards against cross-path wording leakage).

REVIEW (fresh code-reviewer, agent-532bfe50): **0 blocking / 0 major / 2
minor** — T25-F01 (no failing-PUT row: the fake route always 200s the PUT)
deferred BY PLAN to T26 (whose rows cover mutation failure paths incl.
the PUT); T25-F02 (record-accuracy: three pins amended, not "both") —
resolved by this entry. Reviewer verified: exact 4-field body with
release_label_id path-only; appName threading invariant (strict ===
match); readyVia confined with the sole consumer type-narrowed; honest
in-file amendment comments; scope exactly the two files; RED reproduced.

GREEN: focused suite 133/133; `pnpm test:ci` **69 suites / 957 tests**
(954+3); typecheck/lint/format clean (Lead re-ran).

GATE: PASS (R5-04 closed; T24-F02 folded). Commit + push attempt follows
(push still blocked — human token prerequisite recorded).

### T26 — retry policy split by call class + documented lock guidance (Round 5)

RED (fresh feature-implementer, agent-64eebf4e, behavior-change): 8 failed
— five mutation-5xx rows (labels/files/apps/PUT/associate) each `Expected
length: 1 / Received length: 3` (the ambiguous-outcome replay R5-06 names)
and three lock rows (no "5-minute lock" in final 429/COM0002 messages).
The fresh reviewer independently reproduced the RED in a /tmp scratch copy
AND proved the compile-time class requirement (deleting one retryClass
declaration fails typecheck).

IMPLEMENT: `HttpCall.retryClass: "read-safe" | "mutation"` (required — all
9 call sites declare: token/pages/group-GET/status-poll read-safe; the
five mutations mutation); `requestWithRetry` branches — mutation retries
ONLY 429/COM0002 (ENGINEERING judgment labeled: pre-execution assumption
undocumented, conservative fail-closed direction); mutation 5xx ⇒ one
attempt + MUTATION_AMBIGUITY_DIAGNOSTIC (re-run performs the read-walk
reconciliation); any final 429/COM0002 (either class) appends the
documented 5-minute-lock guidance; transport exceptions unchanged (zero
retries — now pinned); stale "figures are NOT in current docs" comment
replaced with the documented footers (60/120/300/500/min + 5-min lock).
12 new rows (pure additions — the pre-existing 502-labels row rides the
one-attempt path compatibly by design). FOLD-IN T25-F01: PUT 422 COM0011 ⇒
named fail-closed, zero associate POSTs.

REVIEW (fresh code-reviewer, agent-a24f20fb): **0 blocking / 0 major / 2
minor** — T26-R1 (diagnostic precedence in the mutation-5xx+COM0002
corner) ACCEPTED as documented (low realism: COM0002 is documented as
429; 500+COM0002 is a server contradiction; the ambiguity diagnostic is
the safer guidance — recorded in review.md); T26-R2 gate-time bookkeeping
(this entry). Reviewer verified: all 9 class assignments; read-safe
unchanged (pins); the T24-F01(a) status-poll row unchanged and guarding
the poll's read-safe classification; masking held; no weakened rows
(pure-addition test diff); RED reproduced.

GREEN: focused suite 145/145; `pnpm test:ci` **69 suites / 969 tests**
(957+12); typecheck/lint/format clean (Lead re-ran).

GATE: PASS (R5-06 closed). Commit + push attempt follows (push still
blocked — human token prerequisite recorded).

### T27 — Beta target allowlist (vars-sourced) + group_type 6 validation (Round 5)

RED (fresh feature-implementer, agent-61f57741, behavior-change tool +
config workflow): 8 failed / 147 passed — the 7 group_type refusal rows
(all `Expected: not 0`: today only the group NAME is checked; a User/Tag
group sails through) + the dry-run summary "Device Group" truthfulness
row. The fresh reviewer independently reproduced the RED in a /tmp scratch
copy (8 failed / 147 passed, same rows).

IMPLEMENT: tool — `DEVICE_GROUP_TYPE = 6` (documented enum 6/7/11; the
details sample's own 1 is undocumented); `fetchGroupDetails` parses
group_type from the same wrapped-or-flat record as the name (number or
numeric string via readInteger; else unusable);
`validateTargetGroup` requires groupType === 6 AFTER the unchanged name
check, pre-mutation, refusal naming id + enum + observed value (or
absence); CLI flags unchanged (standalone use); truthful dry-run summary.
Workflow — group/group-name/production-group-id dispatch inputs REMOVED
(run-id, dry-run, app-name, data-centre, app-category-id, redirect-uri
remain); the triple sourced from `vars.MDM_BETA_GROUP_ID` /
`MDM_BETA_GROUP_NAME` / `MDM_PRODUCTION_GROUP_ID` (the `mdm-upload`
environment's VARIABLES — admin-controlled); fail-closed presence checks
naming the variable + the admin configuration path (Settings →
Environments → mdm-upload → Environment variables; values never echoed);
--production-group-id forwarded UNCONDITIONALLY (early validation
guarantees non-empty); T11-F02 conditional pattern retained for
category/redirect.

REVIEW (fresh code-reviewer, agent-335b46f3): **0 blocking / 0 major / 2
minor** — T27-F1 (wrapped-shape × wrong-group_type refusal row) and
T27-F2 (two comment-accuracy nits) both CLOSED by a same-implementer
resume (the wrapped refusal row added and green; both comments reworded).
Reviewer verified: the allowlist genuinely removes the dispatcher's aim
(no group value can enter via dispatch; admin config vs write-dispatch
boundary); exit-code accumulator correctness; permissions/concurrency/
persist-credentials unchanged; the fixture 2→6 update honest; RED
reproduced; config-mode evidence (YAML parse; the validation + upload
step run-blocks extracted and executed against unset/set inputs;
check:ci-scripts; pnpm verify).

GREEN: focused suite 156/156 (147+9+1... 10 tool rows + 1 wrapped-refusal
row); `pnpm test:ci` **69 suites / 980 tests**; typecheck/lint/format
clean; check:ci-scripts + verify green (Lead re-ran test:ci).

GATE: PASS (R5-07 closed — the Beta target is now an admin-controlled
allowlist; dispatch cannot override it). Commit + push attempt follows
(push still blocked — human token prerequisite recorded).

### T28 — run provenance validation before cross-run artifact download (Round 5)

CONFIG MODE (fresh feature-implementer, agent-e4cc085e): a new workflow
step "Validate the release run before downloading its artifact" inserted
exactly between the MDM-secrets check and the download step —
GET /repos/{repo}/actions/runs/{run-id} with the job's github.token
(actions: read — no new permissions; curl; HTTP status captured
separately so 404 is a named failure); jq @tsv extraction of ONLY the
five validated fields; validates workflow path (exact or @ref-suffixed —
stronger than "ends with": prefix-gamed paths rejected) AND name
"Android release"; status completed AND conclusion success; head_branch ∈
{main, develop} (documented engineering allowlist — closes the
same-version branch-swap hole content re-verification cannot). Every
failure exits 1 with a precise ::error::; the full run JSON (actor emails
etc.) never echoed; no inline ${{ }} in the run block (env plumbing
only); the download step byte-identical to HEAD (structural assertion:
parsed-doc-minus-new-step == HEAD doc).

Verification: the extracted run block executed against a mock Actions API
(401s unauthenticated requests) — the required matrix (a)–(f) PLUS seven
adversarial rows = 13/13 pass, no-leak invariants asserted per row; the
fresh reviewer then ran an INDEPENDENT 17-row adversarial matrix (array/
scalar/null/empty JSON shapes, empty-name field-shift, tab-in-name,
capitalization, prefix-gamed path, ::error:: injection probe, 404/403/500/
transport) — 17/17 pass, again under bash -eo pipefail. YAML parses;
check:ci-scripts green; pnpm verify exit 0 (69 suites / 980 tests
unchanged).

REVIEW (fresh code-reviewer, agent-57a0a0c0): **0 blocking / 0 major / 1
minor** — T28-F1: the jq comment overstated the read's field-count
guarantee (empty/null fields shift left under IFS-whitespace tabs;
behavior verified fail-closed in all shift paths, but the stated invariant
was wrong and edge errors misattribute). CLOSED by a same-implementer
comment-only resume (the comment now states the true invariant + the
accepted misattribution edge; the reviewer's field-shift repro was
independently reproduced by the implementer first; 13/13 matrix re-run
green; structural assertions 10/10).

GATE: PASS (R5-12 closed as defense-in-depth; content re-verification
unchanged and still primary). Commit + push attempt follows (push still
blocked — human token prerequisite recorded).

### T29 — mdm-operations.md Round 5 alignment (Round 5, final task)

CONFIG MODE (fresh feature-implementer, agent-80eb1221): one file,
`features/kiosk-runtime/docs/mdm-operations.md` (+311/−104). Content
derived from the ACTUAL current tool + workflow code and review.md's
synthesis, not the plan's prose. §4 two-phase lifecycle + IR-02
correction; §4 Update App mandatory body; the Accept-header contract; §7d
retry classes + the documented rate table (60/120/300/500 + 5-min lock; no
"soft assumption" language); §7a/§7d the Beta-target allowlist with the
EXACT human configuration steps (three mdm-upload environment VARIABLES);
the provenance gate section; the R5-09 receiver evidence paragraph; the
accounts-host footnote; §9 Round 5 live-tenant unknowns + human
prerequisites; the source index re-cited to the cloud help tree (dated
2026-09-04). §2/§3/§6/§7b/§7c/§7e/§8/§10 byte-identical to HEAD
(reviewer-verified by md5).

REVIEW (fresh code-reviewer, agent-eddf29df): **0 blocking / 0 major / 2
minor** — T29-R1 (the "either class" lock-naming sentence overstated the
code: the accepted T26-R1 precedence gives the ambiguity diagnostic
priority on mutation-5xx+COM0002) CLOSED by a same-implementer one-clause
resume (the sentence now carries the caveat; pnpm verify green); T29-R2
(the todo status board rows T21–T29 still read "not started" — a REAL
bookkeeping defect: the Lead's per-task python replaces silently failed
after prettier re-flowed the table padding; the checkpoint lines and
commits were always accurate) — CLOSED by this commit (regex-based board
fix, all nine rows now done/PASS; lesson recorded). The reviewer
independently re-fetched the seven cited ManageEngine pages live (all
HTTP 200) and re-verified the quoted contracts — including the fileStatus
1/2/3 wording, the fileIDs sample, the Mandatory badges, and every rate
footer — plus docs-vs-code cross-checks on all eleven verification axes.

GREEN: `pnpm verify` exit 0 (check:docs 79 files; 69 suites / 980 tests
unchanged — docs-only); prettier clean.

GATE: PASS (R5-13 remains as the develop-freshness procedural step; AC-10
re-aligned to the current contract). Commit + push attempt follows (push
still blocked — human token prerequisite recorded).

## ROUND 5 ROUND GATE — kiosk-runtime (2026-09-04)

ROUND REVIEW (fresh round-scope code-reviewer, agent-d2a1b417, over the
accumulated Round 5 diff 4840497..HEAD — 9 gate commits, +4138/−356, 24
files): **0 blocking / 0 major / 1 minor** — R5R-F01: mdm-operations.md
§4's maintenance lifecycle was two Round 5 behaviors behind the code (the
RD5-02(b) restrictions-change force-clear of an unlocked session; the
RD5-04 unsettled-credential refusal + settling state) — a doc-only seam
(task-graph: T29 depended on T24–T28, so no task owned aligning the
T21/T23 policy-side changes in the ops doc). CLOSED by a T29-implementer
resume (§4 patched: both behaviors stated, +11/−2; pnpm verify green).
The reviewer's composite verification: the full readiness state machine
(readiness × readError × restrictionsSettled × role × epoch × single-
flight) traced with NO hole; the cold-start matrix per platform class;
the MDM chain end-to-end under split retry classes; the workflow↔tool
wiring; AC coverage (AC-02/03/04/05); every deferred/accepted disposition
verified to hold; scope discipline confirmed (the diff touches exactly the
plan's Round 5 file list — root-guard.ts, core/**, shared components/**,
supabase/\*\*, the Kotlin module, and android-release.yml UNTOUCHED);
69 suites / 980 tests green.

**ROUND 5 GATE: PASS** (all nine task gates + the round review converged
0 blocking / 0 major with the one doc-seam minor closed in-round).

Next: develop re-fetch/integration (R5-13) → final verification on the
integrated HEAD → fresh full final code review → fresh quality audit →
NEW Feature Gate → PR #9 update → HUMAN_HANDOFF.

## ROUND 5 FINAL VERIFICATION — on the exact final HEAD (2026-09-04)

- **develop freshness (R5-13)**: re-fetched; origin/develop = 3a25640
  (UNCHANGED since the Round 4 integration db3a50d — behind-by 0). No new
  integration required; the Round 4 merge already integrated this exact
  develop state. origin/feature/kiosk-runtime still 527a7e6 (pushes
  credential-blocked — every gate commit attempted push; see the
  prerequisite note).
- **pnpm verify** on 771933d: exit 0 — 69 suites / **980 tests** (reopen
  baseline 894; +86 rows across the policy/MDM surfaces).
- **Runtime browser regression (agent-browser, static web export, SPA
  clean-URL server)**: signed-out root → /sign-in IMMEDIATELY (web
  module-absent resolves instantly through the T21 discriminator — the
  T22 gate renders NO error surface on web; no hang); customer journey
  (committed disposable account): Demo Store + nav + brands render, ZERO
  console errors, ZERO page errors; preparation journey: the preparation
  experience renders (Sign out control) immediately — AC-04 through the
  readiness changes; `/kiosk-mismatch` unauthenticated → FAIL-CLOSED to
  sign-in, NO mismatch content leaks; no kiosk surfaces (no maintenance
  affordance) anywhere on the standard path; tablet landscape 1280×800
  AND portrait 800×1280.
- **CNG prebuild (partial native tier)**: `npx expo prebuild --platform
android --no-install --clean` exit 0 on the final HEAD; the generated
  manifest carries `android.content.APP_RESTRICTIONS` meta-data +
  `android:lockTaskMode="if_whitelisted"`; kiosk_restrictions.xml intact;
  package.json restored after the run (the documented T08/T10 mitigation);
  the tracked tree is clean. NOTE: the Kotlin module and
  android-release.yml are UNTOUCHED by Round 5 (round-reviewer-verified),
  so the label-gated Android build on the Round 4 code base (run
  33857102920 SUCCESS) remains the native evidence; the label-gated build
  on the EXACT Round 5 HEAD could not run (push blocked) — recorded
  honestly as UNVERIFIED pending the human's push + dispatch.

## Round 5 quality audit + NEW FEATURE GATE (2026-09-04)

### Quality audit (fresh, agent-068989be)

Verdict: **"The Round 5 delivery is sound and honestly recorded. No
not-delivered code scope; no false remote/CI claims; the
external-unverifiable items are labeled UNVERIFIED, not PASS."** The
auditor re-ran `pnpm verify` itself (69 suites / 980 tests, exit 0 — the
third independent re-run), re-verified the full-feature diff
(52 commits / 51 files / +20219−32 vs the plan's three file lists), the
workflow allowlist, the tool contracts, the remediation integrity (no
backfilled PASS; T01–T20 history preserved; new evidence per task; the
894→…→980 chain arithmetically consistent), and the external honesty
(CI/native on the Round 5 HEAD explicitly UNVERIFIED pending push; R5-13
develop check verified: origin/develop = 3a25640 = merge-base). Four
record-hygiene items required before the gate — ALL CLOSED/ACCEPTED in
this commit: E-1+S-1+S-2+S-3 (the final-review section committed together
with a REAL todo close-out: checkpoint refreshed; the stale session-2
credentials statement in `## Blocked` rewritten to the current
push-blocked truth; the bottom Round 4 gate section annotated HISTORICAL);
P-1 (the plan's generator-bypass justification for policy-startup-gate
corrected to the honest judgment — the capability exists but its template
does not model composing another feature's screen); S-4 (AC-06's task
mapping note recorded in the gate checklist — accepted, delivered via the
shared-sign-out design decision + tests).

### ROUND 5 FEATURE GATE: PASS

Checklist in todo.md ("Round 5 Feature gate"). Earned on the remediated
HEAD after: seven-researcher gate (batches 3+2+2; verdict matrix R5-01…
R5-13; IR-02 contradiction resolved) → plan amendment + Lead Planning
Review → T21–T29 (each: fresh implementer, Lead verification, fresh task
review, remediations where flagged, gate, commit, push attempt) → Round 5
round gate (0/0, R5R-F01 closed) → R5-13 develop check (unchanged) →
final verification (pnpm verify 69/980 + runtime browser regression + CNG
prebuild) → fresh final full review (0 blocking / 0 major; FF-01
accepted-with-rationale / FF-02 fixed / FF-03 rejected false-positive
byte-level proof) → fresh quality audit (sound and honestly recorded).

### HUMAN_HANDOFF (terminal state)

The human's next actions, in order:

1. **Push** the local branch (13 commits, ca8531e..HEAD, are local-only;
   remote feature HEAD is 527a7e6). Any method: provide a token to the
   agent session, or run `git push origin feature/kiosk-runtime` from a
   machine with credentials (the branch is at
   /home/z/my-project/repos/Kisok_react_app).
2. Let **CI and the label-gated Android build** run on the exact HEAD
   (add the `android-build` label to PR #9 as before). These are honestly
   UNVERIFIED until then.
3. **Update the PR #9 body** with the Round 5 summary (text below).
4. Review **Draft PR #9** (base develop) and decide the merge. The agent
   never merges.

PR #9 body text (ready to paste; replace the previous body's status
sections):

> ## Round 5 — post-review remediation complete (Feature Gate re-earned)
>
> A new independent review reopened the prior gate with findings
> R5-01…R5-13. Round 5 closed every confirmed finding with
> research-backed, fail-closed changes:
>
> - **Policy readiness hardened** (R5-01/02/08/10/11): platform-
>   discriminated module absence (Android + missing module can never
>   resolve permissively — fail-closed startup hold with a named error +
>   manual retry); restrictions-change events synchronously invalidate a
>   permissive verdict (+ an epoch guard discards superseded in-flight
>   reads); the maintenance credential requires SETTLED restrictions
>   (provisional + LOCKED routes to the mismatch screen but never unlocks);
>   the maintenance sheet resets on role exit.
> - **MDM contract aligned to the current official cloud docs** (R5-03/04/
>   05/06/07): the documented two-phase file-upload lifecycle (PENDING →
>   bounded status polling); the documented-Mandatory Update App body
>   (app_name + app_type); Accept: application/json on every MDM JSON
>   call; retry classes split (mutations never auto-replay ambiguous 5xx);
>   the Beta target is an ADMIN-CONTROLLED allowlist (three mdm-upload
>   environment variables — dispatch can no longer aim the upload at any
>   group) + group_type 6 (Device Group) validated pre-mutation.
> - **Release provenance** (R5-12): the upload workflow validates the run
>   (workflow identity, conclusion, head_branch ∈ {main, develop}) before
>   the artifact download — defense-in-depth on top of the existing
>   package/version/cert re-verification.
> - **R5-09 rejected with evidence**: RECEIVER_NOT_EXPORTED for the
>   protected system broadcast is the documented-correct pattern — no
>   change.
>
> Evidence: 69 suites / 980 tests (re-run independently by the final
> reviewer AND the quality auditor); runtime browser regression (both
> tablet viewports, zero console errors); CNG prebuild green; fresh final
> full review 0 blocking / 0 major; fresh quality audit: "the Round 5
> delivery is sound and honestly recorded."
>
> **Honest unverified list**: GitHub CI + the label-gated Android build on
> this exact HEAD (the agent's sandbox lost push credentials — the commits
> are pushed by the human first); the live MDM dry-run (needs the tenant +
> the three new environment variables configured: MDM_BETA_GROUP_ID,
> MDM_BETA_GROUP_NAME, MDM_PRODUCTION_GROUP_ID); physical-kiosk behavior.
> Full details: features/kiosk-runtime/docs/{worklog,review,plan}.md.
>
> Do not merge before the CI/native runs land on this HEAD. The agent
> never merges.
