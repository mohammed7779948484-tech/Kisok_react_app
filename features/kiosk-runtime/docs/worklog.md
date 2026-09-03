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
