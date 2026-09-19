# DeviceMode — worklog

Evidence per task. Commands and their real output; a checkmark alone is not
evidence.

## Round 1 — the runtime guard

### T01 — pure model (`behavior`)

```
SCAFFOLD: pnpm generate schema device-mode device-mode
  + features/device-mode/model/device-mode.schema.ts
  + features/device-mode/model/device-mode.schema.test.ts
RED:   npx jest features/device-mode/model/device-mode.schema.test.ts
       → Tests: 12 failed, 2 passed, 14 total
       → "TypeError: (0 , _deviceMode.deriveDeviceMode) is not a function"
         (the behaviour is missing, not an import error)
GREEN: same command → Tests: 14 passed, 14 total
GATE: PASS
```

### T02 — local Expo module + native source (`behavior`)

```
SCAFFOLD (official CLI, not hand-rolled):
  npx create-expo-module@latest --local kiosk-policy --name KioskPolicy \
    --package expo.modules.kioskpolicy -p android --features AsyncFunction Event
  → "Successfully created Expo module in modules/kiosk-policy"
  Then trimmed: the View, the web implementations and the apple platform entry
  were deleted — this module has exactly one read and one event.
RED:   npx jest features/device-mode/native
       → "Cannot find module './managed-configuration'" then, once created,
         the behaviour assertions failed
GREEN: npx jest features/device-mode/native → Tests: 8 passed, 8 total
GATE: PASS
```

### T03 — device-mode provider (`behavior`)

```
RED:   npx jest features/device-mode/state → 6 failed (module absent)
GREEN: Tests: 6 passed, 6 total

MUTATION CHECK — an honest correction recorded rather than hidden:
  The first version of the unmount test ("does not publish a late read after
  unmount") PASSED with the `active` guard deleted, so it caught nothing:
  React 19 no longer warns on setState after unmount. It was replaced with a
  test of a real hazard — two change broadcasts resolving OUT OF ORDER, where
  a slow earlier read would downgrade a kiosk tablet to "standard".
  That test failed RED, and a monotonic read token made it pass.
  → npx jest features/device-mode/state → Tests: 6 passed, 6 total
GATE: PASS
```

### T04 — device-mismatch screen and route (`behavior`)

```
SCAFFOLD: pnpm generate screen device-mode device-mismatch
          pnpm generate route device-mode device-mismatch --role=shared --screen=device-mismatch
  + features/device-mode/screens/device-mismatch/{screen,test}
  + app/device-mismatch.tsx
  ~ features/device-mode/index.ts — exported device-mismatch
RED:   npx jest features/device-mode/screens → Tests: 3 failed, 3 total
GREEN: Tests: 3 passed, 3 total
GATE: PASS
```

### T05 — wire the guard into the routes (`behavior-change`)

The repository had NO route-level tests, so this task pinned the existing
routing rows as well as the new ones. That is what makes the RED meaningful:

```
RED:   npx jest app/__tests__/index-route.test.tsx
       → Tests: 2 failed, 10 passed, 12 total
       The 10 passing rows ARE today's behaviour, unchanged. The 2 failures are
       exactly the new rows: preparation-on-kiosk, and hold-while-unknown.
RED:   npx jest app/__tests__/root-layout-guards.test.tsx
       → 4 failed: "Cannot read properties of undefined" — RootNavigator was
         not yet exported, i.e. the subject did not exist.
GREEN: npx jest app/__tests__ → Tests: 16 passed, 16 total
GATE: PASS
```

### T06 — managed-configuration config plugin (`config` — no RED, run the thing)

```
VERIFY: npx expo prebuild --platform android --no-install --clean
        → "✔ Finished prebuild"

Generated tree asserted, not assumed:
  android/app/src/main/AndroidManifest.xml:15
    <meta-data android:name="android.content.APP_RESTRICTIONS"
               android:resource="@xml/kiosk_restrictions"/>
  android/app/src/main/res/xml/kiosk_restrictions.xml   → the kiosk_device_role restriction
  android/app/src/main/res/values/kiosk_device_role_strings.xml → its @string refs
  grep lockTaskMode AndroidManifest.xml → no match (KISOK adds NO kiosk enforcement)

  npx expo-modules-autolinking resolve -p android → resolves "kiosk-policy"

  Two resolution failures were hit and fixed here, both recorded because they
  are easy to re-introduce: the plugin entry needs the explicit ".ts"
  extension, and `expo/config-plugins.js` (with the suffix) is the only
  specifier that resolves — and `AndroidConfig` must come off the default
  export because Node's CJS named-export detection does not see it.

NOT VERIFIED LOCALLY: the Android compile. This container has no Android SDK
(ANDROID_HOME is empty). The native compile is the android-build CI job's, and
the PR carries the `android-build` label so it runs there.
GATE: PASS
```

### Round 1 gate

```
pnpm typecheck   → clean
pnpm lint        → clean
pnpm format:check → "All matched files use Prettier code style!"
pnpm test:ci     → Test Suites: 93 passed, 93 total
                   Tests: 1182 passed, 1182 total
  (every pre-existing customer, preparation and auth/sign-out suite still green)
ROUND 1 GATE: PASS
```

## Round 2 — the release pipeline

### T07 — release-signing plugin (`config`, salvaged)

Taken unchanged from the superseded `feature/kiosk-runtime`
(`plugins/with-android-release-signing.ts`). Re-read against
https://reactnative.dev/docs/signed-apk-android before reuse: it writes the
documented `MYAPP_UPLOAD_*` gradle properties and the `hasProperty`-guarded
`signingConfigs.release` block. No change was needed.

BOTH paths were exercised, because an env-guarded plugin that was only ever
run one way is half untested:

```
INERT PATH (no MYAPP_UPLOAD_* env):
  npx expo prebuild --platform android --no-install --clean
  grep -c MYAPP_UPLOAD android/gradle.properties      → 0
  grep signingConfig android/app/build.gradle         → both build types on signingConfigs.debug
  (the Expo template default is preserved byte-for-byte — local dev and the e2e
   workflow depend on the debug-signed release)

ACTIVE PATH (all four set):
  MYAPP_UPLOAD_STORE_FILE=kisok-upload.keystore MYAPP_UPLOAD_KEY_ALIAS=test-alias \
  MYAPP_UPLOAD_STORE_PASSWORD=test-store-pw MYAPP_UPLOAD_KEY_PASSWORD=test-key-pw \
    npx expo prebuild --platform android --no-install --clean
  (throwaway local values, never real signing material)

  android/gradle.properties:69-72  → the four MYAPP_UPLOAD_* entries
  android/app/build.gradle         → the guarded signingConfigs.release block
  android/app/build.gradle:124     → buildTypes.release now on signingConfigs.release
  (line 119, the debug build type, is untouched)
GATE: PASS
```

### T08 — verify-release-apk (`behavior`, salvaged)

Taken unchanged from the superseded branch with its 868-line colocated test.

```
npx jest tools/release → Tests: 65 passed, 65 total
```

The suite includes the mismatch cases that make it a real gate: a wrong
`--package`, the Android debug certificate, a certificate whose SHA-256 is not
the pin, and a missing `assets/index.android.bundle`. Reused rather than
rewritten — it was already correct, already tested, and rewriting it would have
thrown away evidence.

### T09 — ManageEngine publish script (`behavior`, new and much smaller)

The superseded branch's `tools/mdm/upload-beta.ts` was 2189 lines carrying
Beta/Production group validation, label resolution and rollout orchestration —
infrastructure for a fleet that does not exist. It was NOT reused. Its verified
knowledge of the REST contracts was.

```
RED:   npx jest tools/mdm → suite failed to run (module absent)
GREEN: npx jest tools/mdm → Tests: 20 passed, 20 total

Two of those tests initially failed for a reason worth recording: the fake
fetch matched routes by URL only, so the create POST received the list
response. The HARNESS was wrong, not the implementation — routes are now keyed
"METHOD /path".

GUARD PROVEN TO REJECT (not just to pass):
  env -u MDM_CLIENT_ID -u MDM_CLIENT_SECRET -u MDM_REFRESH_TOKEN \
    node tools/mdm/publish-app.ts
  → error: MDM_CLIENT_ID is not set.
    error: MDM_CLIENT_SECRET is not set.
    error: MDM_REFRESH_TOKEN is not set.
    error: APK_PATH (or --apk) is not set.
  exit 1, before any network call.
GATE: PASS
```

NOT VERIFIED: every ManageEngine HTTP call. No request has been made against a
real tenant, so the whole contract is TENANT VALIDATION REQUIRED — see
`mdm-operations.md` and the PR's "Explicitly NOT verified" section.

### T10 — the release workflow (`config`)

One manual dispatch: build → verify → publish. The superseded branch split this
across two workflows and then needed run-provenance validation to trust the
artifact hand-off; one run removes that problem instead of solving it.

```
pnpm check:ci-scripts → "Workflow scripts resolve correctly and `pnpm verify`
                         matches the CI verify job (4 workflows, 10 checks)."
YAML parse           → jobs: ['release'], 15 steps
```

Secret safety, read line by line: the seven secrets appear only as step `env`;
the presence check prints NAMES only; the keystore is decoded into the
gitignored `android/` tree and never into the artifact; `publish-app.ts`
redacts the three MDM credentials out of everything it prints, and its
top-level catch refuses to print a raw error at all.

NOT VERIFIED: the workflow has never been dispatched. It requires secrets this
environment does not have.

### T11 — operations doc (`config`)

```
pnpm check:docs → "Documentation matches the current workflow (89 files checked)."
```

### Round 2 gate

```
pnpm verify → PASS (typecheck, lint, format, 93 suites / 1182 tests,
              check:docs, check:commits, check:e2e-appid, check:ci-scripts,
              db:verify, generate:smoke)
ROUND 2 GATE: PASS
```

## Remediation — independent review, round 1 (commit 4123266)

Findings and dispositions are in `review.md`; this is the evidence.

### R01 — committed `expo prebuild` mutation of `package.json`

```
git diff develop..HEAD -- package.json   → (before) 12 lines
git checkout develop -- package.json
git diff develop..HEAD -- package.json   → 0 lines
```

Confirmed rather than assumed: prebuild rewrites `"android"` to
`expo run:android` and adds `"ios"`. It was restored after the FIRST prebuild
(T06) but not after the two T07 signing prebuilds, and `git add -A` swept it in.

### R02 — free-text restriction fails open on a typo (`config`)

```
VERIFY: npx expo prebuild --platform android --no-install --clean → "✔ Finished prebuild"

android/app/src/main/res/xml/kiosk_restrictions.xml
  → android:restrictionType="choice"
    android:entries="@array/kiosk_device_role_entries"
    android:entryValues="@array/kiosk_device_role_values"
android/app/src/main/res/values/kiosk_device_role_strings.xml
  → both string-arrays, positionally paired, one entry: customer_kiosk
```

### R03 — a failed read stranded preparation (`behavior`)

```
RED:   npx jest features/device-mode/state → 3 failed, 6 passed
       (retries / recovery / restart-after-giving-up all absent)
GREEN: npx jest features/device-mode/state → 9 passed
       then 11 passed after the N02 rows below
Model: npx jest features/device-mode/model → 16 passed (2 new `unavailable` rows)
Screen: npx jest features/device-mode/screens → 5 passed (2 new unreadable-device rows)
Routes: npx jest app/__tests__ → 20 passed (4 new rows)
```

One test correction recorded: the first negative assertion
(`queryByText(/is the customer kiosk/i)`) was too loose — the new copy
legitimately contains "in case it is the customer kiosk". The implementation was
right; the assertion was tightened to the title string.

### R04 — pagination could create a duplicate app (`bug`)

```
RED:   npx jest tools/mdm → 3 failed, 20 passed
GREEN: npx jest tools/mdm → 24 passed
```

The first fix attempt was WRONG and the test caught it: the short-page break
still fired ahead of the documented-total check, so the two-page listing still
terminated on page 1. A documented `total_record_count` now wins over the
short-page heuristic.

### R06 — a two-character fixture token hid a redaction problem

The token fixture was `"at"`, so pushing the access token into the redaction set
scrubbed that substring out of ordinary words (`the app cre***REDACTED***ion`).
An earlier edit that was supposed to fix this silently did not apply — prettier
had reformatted the target string — and the mangled output in a later failure
message is what revealed it. Redaction stays unconditional (mangling is the safe
direction; a skipped short secret is not), and the fixture is now realistic.

### N01/N02/N04, R08 — second remediation pass

```
RED:   npx jest tools/mdm features/device-mode/state → 2 failed, 33 passed
GREEN: npx jest tools/mdm features/device-mode app/__tests__ → 84 passed
act warnings in features/device-mode/screens: 8 → 0
```

R08 was recorded as FIXED in the first pass and was NOT: only `app/_layout.tsx`
had changed (`git diff 81f686a..4123266 -- app/index.tsx` was empty). Both files
now compute and branch on the same `deviceAccess` value.

### Final local gate

```
pnpm verify → PASS
  Test Suites: 95 passed, 95 total
  Tests:       1284 passed, 1284 total
```

### Native compile

```
android-build / "Android prebuild check" (label-gated): SUCCESS on 81f686a
  https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/35295784503
  (this was first recorded here as be1e961; the API reports the run's head_sha
   as 81f686a — corrected rather than left as a plausible-looking wrong id)
```

That run predates the Kotlin `synchronized`/`@Volatile` change and the new
`androidx.core:core-ktx` gradle dependency, so it does NOT cover that code.

The run on the FINAL head does:

```
Android prebuild check — SUCCESS on db5fe97
  https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/35297426092
  (expo prebuild --platform android, then ./gradlew assembleDebug)
```

That compiles `KioskPolicyModule.kt` with the `@Volatile` field, the
`synchronized(receiverLock)` blocks and the labelled return, and resolves the
newly declared `androidx.core:core-ktx` dependency. R10 is closed on evidence
that covers the shipped code, not on an earlier run.

### Fast CI on the final head db5fe97

```
Verify (typecheck, lint, format, tests, guards, db, generator) : SUCCESS
  https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/35297426008
Expo doctor                                                    : SUCCESS
Web bundle                                                     : SUCCESS
Android prebuild check (label-gated native tier)               : SUCCESS
  https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/35297426092

Maestro flows — a SEPARATE label-gated workflow, not a job of the CI run above.
  SKIPPED, an honest skip and never counted as a pass.
  No `e2e` label: this guard adds no new customer journey to drive, and the one
  state worth driving on a device (a kiosk-configured tablet) cannot be
  reproduced on an emulator without a DPC.
```

### Runtime evidence — browser, tablet sizes

```
pnpm web on :8099, driven with Playwright/Chromium at
  tablet portrait 768x1024, tablet landscape 1280x800, narrow web 420x900
→ the app boots and renders the sign-in screen at all three sizes
→ console errors: NONE at any size
```

What that does and does not prove: on web the native module is absent, so the
device mode is `standard` by design. This is real regression evidence for the
"ordinary device, nothing changes" path (AC-01, signed-out row) and nothing
more. The `customer_kiosk` and `unavailable` paths CANNOT be reached in a
browser — they are covered by the model, provider, screen and route tests, and
remain PHYSICAL/TENANT VALIDATION REQUIRED on hardware.

**`DeviceMismatchScreen` has never been opened in a browser, and cannot be.**
It is the only new screen in this feature, and on web the native module is
absent, so the device mode is always `standard` and `deviceRoleAccess` never
returns `blocked` — the route is not in the navigator. Its evidence is five
behaviour tests (both device states, the sign-out call with `scope: "local"`,
and the failed-sign-out message). It composes `Screen`, `Button` and `Text`
from the design system, so it inherits their tokens and 48dp targets, but
nobody has looked at it at a tablet size. Settling that needs either hardware
or a temporary provider stub in the UI Lab.

## Round 3 remediation — CodeRabbit (commit ff60aad)

Five findings, three major, all verified against the code before acting and all
real. See `review.md` for the dispositions and reasoning.

### CR-3 — unrecognised `kiosk_device_role` derived `standard` (`behavior-change`)

The old rows asserted the fail-open, so this is a deliberate behaviour change
and the old assertions were replaced, not loosened:

```
RED:   npx jest features/device-mode/model
       → 1 failed, 16 passed
       ✕ is unknown for any other PRESENT value of the key, including a wrong type
GREEN: npx jest features/device-mode → 41 passed
```

### CR-4 — missing native module derived `standard` on Android (`behavior-change`)

```
PROBE: Platform.OS under this jest config → "ios"
       (so the existing non-Android rows keep their meaning without change)
RED:   npx jest features/device-mode/native → 1 failed, 8 passed
       ✕ is unknown when the module is missing ON ANDROID
GREEN: npx jest features/device-mode → 42 passed
```

### CR-5 — the page bound sat after the `paging.next` `continue` (`bug`)

```
RED:   npx jest tools/mdm → 1 failed, 24 passed
       ✕ enforces the page bound on the paging.next path too, not just the offset path
GREEN: npx jest tools/mdm → 25 passed
```

Worth recording as a pattern rather than an incident: this is the THIRD time in
this feature that a fix was placed after a `continue`/short-circuit and the
accompanying test only drove the path that already worked. The first was R04's
terminator order, the second was N01's bound on the offset path, this is the
third. The lesson is not "be careful" — it is that a guard added to a loop with
two advance paths needs a test per path.

### Final gate on ff60aad

```
pnpm verify → PASS
  Test Suites: 95 passed, 95 total
  Tests:       1287 passed, 1287 total

GitHub checks, all on ff60aad:
  Verify (typecheck, lint, format, tests, guards, db, generator) : SUCCESS
  Expo doctor                                                    : SUCCESS
  Web bundle                                                     : SUCCESS
  Android prebuild check (label-gated native tier)               : SUCCESS
  Maestro flows                                                  : SKIPPED, not a pass
```

## Round 4 remediation — re-review of the round 3 fixes (commit follows)

The re-review confirmed CR-1…CR-5 correct, and answered the question it was
set — _is there a fourth fail-open?_ — with yes.

### N04/N07 — the Kotlin layer (`bug`, native: no local test possible)

```
NO LOCAL TEST: this container has no Android SDK, and the module has no JVM
test harness. The contract is covered from the JS side instead:
  - N07: deriveDeviceMode({ kiosk_device_role: "" }) → "unknown"
    (the native layer now emits "" for a DPC-cleared key rather than dropping it)
  - N04: readDeviceMode already fails closed to "unknown" on a throw, which is
    the existing, tested catch — the change is that the native side now THROWS
    instead of returning an empty map.
VERIFIED BY: the android-build CI job, which compiles the new CodedException
subclass. Result on the head carrying it:

  Android prebuild check — SUCCESS on 2ff9f6b
    https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/35298812598

That is the check that matters here: RestrictionsUnreadableException extends
expo.modules.kotlin.exception.CodedException with a (code, message, cause)
constructor, and that signature could not be verified in this container — it
has no Android SDK. A green assembleDebug is the proof.
```

### N05 — the empty-page fall-through (`bug`)

```
RED:   npx jest tools/mdm → 1 failed, 26 passed
       ✕ fails closed on an EMPTY page while the documented total promises more
GREEN: npx jest tools/mdm → 27 passed
       (the companion row pins that an empty page with NO total is still a
        legitimate end of the listing, so the fix did not over-correct)
```

### N06 — non-boolean `restrictions_pending` (`behavior-change`)

```
RED:   npx jest features/device-mode/model → 1 failed, 17 passed
GREEN: 18 passed
```

### N08 — retention must be downgrade-only (`behavior-change`)

```
RED:   npx jest features/device-mode/state → 1 failed, 12 passed
       ✕ does NOT keep a settled `standard` when a re-read starts failing
GREEN: 13 passed, after updating the ONE superseded test.

SUPERSEDED TEST, named rather than loosened: the N02 row asserted that a
settled `standard` was held through the retry window. That assertion WAS the
fail-open N08 describes, so the retained-verdict case is now pinned with
`customer-kiosk` — the verdict it is safe to hold — and the `standard` case is
pinned as NOT held.
```

### Final local gate

```
pnpm verify → PASS
  Test Suites: 95 passed, 95 total
  Tests:       1293 passed, 1293 total
pnpm check:docs → "Documentation matches the current workflow (89 files checked)."

GitHub checks, all on 2ff9f6b:
  Verify (typecheck, lint, format, tests, guards, db, generator) : SUCCESS
  Expo doctor                                                    : SUCCESS
  Web bundle                                                     : SUCCESS
  Android prebuild check (label-gated native tier)               : SUCCESS
  Maestro flows                                                  : SKIPPED, not a pass
```

## Round 5 remediation — external contracts re-verified against current sources

Every contract below was re-checked from a primary source in this session, not
from PR #9 and not from memory. `www.manageengine.com` remains blocked by the
build environment's egress policy, so ManageEngine facts come from the vendor's
own API documentation as surfaced in search results, and are quoted.

### Finding 1 — the auth scheme was wrong (`bug`)

The documented scheme is `Authorization: Zoho-oauthtoken <token>`; the API
doc's own curl example is
`-H 'Authorization: Zoho-oauthtoken ba4604e8e433g9c892e360d53463oec5'`.
The code sent `Bearer`, which is not recognised — **every ManageEngine call
would have returned 401.** The whole pipeline was untested against a tenant, so
nothing caught it.

### Finding 2/4 — the update endpoint and force_update_in_label (`bug`)

Documented: `PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}`, and
`force_update_in_label` must be true "to update the app version in the specific
label which already has an app" — exactly this flow.

The code did `PUT /api/v1/mdm/apps/{app_id}` with no label segment and no force
flag. Worth recording honestly: **PR #9 had this right**, and an earlier round
of this branch regressed it while "simplifying" toward the endpoint named in
the brief. Reverting to the documented path is not new work; it is undoing a
regression this branch introduced.

### Finding 3 — identity came from undocumented fields (`behavior-change`)

The App LIST response documents `app_id` and `app_name`. It does not document a
package field. The code guessed four spellings — `identifier`, `bundle_id`,
`package_name`, `app_package_name` — none documented; a tenant returning none
made every entry unidentifiable and the run fail.

`bundle_identifier` IS documented, on App Details
(`GET /api/v1/mdm/apps/{app_id}`, fields: app_id, app_name, app_category,
app_type, bundle_identifier, version, platform_type, description, icon,
store_url, is_app_paid, country_code, store_id, added_time, modified_time,
release_labels). Identity now comes from there: the listing selects candidates
by documented `app_name`, App Details positively verifies
`bundle_identifier == com.kisok.kiosk` and `app_type == 2`, and anything
ambiguous fails the run.

**`platform_type` is deliberately NOT asserted.** The field is documented but
its integer enum could not be confirmed — one source shows `platform_type: 2`
against an iOS agent bundle id, another describes `2` as Android. Asserting a
guessed value would reject the right app or accept the wrong one, so the
observed value is reported in the run log instead and the gap is recorded in
`mdm-operations.md`. This is a partial implementation of the requested check,
stated as partial.

### Finding 6 — verify before mutating (`behavior-change`)

`publish()` now resolves and verifies identity BEFORE uploading. Previously an
unreadable repository state uploaded the APK first and only then failed,
leaving an orphan file in the tenant every time.

```
RED:   npx jest tools/mdm → 6 failed, 27 passed
GREEN: npx jest tools/mdm → 33 passed
```

Several of those failures were stale FIXTURES, not implementation faults, and
two of my replacements silently no-op'd because prettier had reformatted the
target strings — the same trap recorded twice earlier in this worklog. The
route matcher now prefers the longest matching path so App Details can never be
shadowed by the listing route.

### Finding 5 — headers

`Authorization: Zoho-oauthtoken` and `Content-Type: application/json` are
documented. `Accept: application/json` is sent on JSON calls as convention; it
could NOT be confirmed as a documented requirement, and is labelled as such in
the source rather than claimed as doc-driven.

### Finding 7 — REJECTED, with evidence (`config`)

The receiver flag was re-checked and deliberately NOT changed:

```
AOSP frameworks/base core/res/AndroidManifest.xml (main), line 461:
  <protected-broadcast android:name="android.intent.action.APPLICATION_RESTRICTIONS_CHANGED" />
```

Only the system can send a protected broadcast, so no third-party app can reach
this receiver whatever the flag is. Android's broadcast guide requires one of
the two export flags on API 33+, and `RECEIVER_EXPORTED` is needed only to
receive broadcasts from other apps — including highly privileged ones such as
Bluetooth and telephony that run outside the system UID. This broadcast comes
from system_server, which `RECEIVER_NOT_EXPORTED` receives. `EXPORTED` would
widen exposure and add no delivery. The evidence is now in the Kotlin.

### Finding 8 — workflow hardening (`config`)

Every action pinned to an immutable 40-character commit SHA, resolved with
`git ls-remote` against each upstream repository in this session:

```
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1       # v7.0.1
pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86      # v6.0.10
actions/setup-node@820762786026740c76f36085b0efc47a31fe5020     # v7.0.0
actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961     # v5.7.0
actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
```

`npx --yes expo` replaced with `pnpm exec expo`: `npx --yes` resolves from the
registry at run time, which is an unpinned dependency fetched inside the one
workflow holding the signing key and the tenant credentials. Verified locally:

```
pnpm exec expo --version → 54.0.27
pnpm exec expo prebuild --platform android --no-install --clean → "✔ Finished prebuild"
```

Manual dispatch, `permissions: contents: read`, the `android-release`
environment and the fail-closed secret-presence check are all unchanged.

```
pnpm check:ci-scripts → "Workflow scripts resolve correctly ... (4 workflows, 10 checks)"
YAML parse → 15 steps, unpinned actions: NONE
```

### Finding 9 — two false fail-closed claims corrected (`config`)

`mdm-operations.md` said absence of the key "is the fail-safe direction" and
that a tenant unable to push app config would leave the guard "still failing
closed (Preparation is withheld, never wrongly granted)". **Both were wrong in
the same direction.** With no app configuration the kiosk tablet presents an
empty bundle, the client derives `standard`, and Preparation is granted. A
tenant that cannot push the configuration gets no guard at all, not a degraded
one. `plan.md`'s risk row carried the same claim and is corrected.

No new runtime was invented for this: it stays an operational invariant
(AR-01), now stated accurately.

### Final gate

```
pnpm verify → PASS (exit 0)
  Test Suites: 95 passed, 95 total
  Tests:       1299 passed, 1299 total
pnpm exec expo prebuild --platform android → "✔ Finished prebuild"
```

NOT VERIFIED: the Kotlin compile (no Android SDK in this container — the
android-build CI job covers it), and every ManageEngine call. No request has
been made against a real tenant; the corrected contracts are still
TENANT VALIDATION REQUIRED and the first `dry_run` dispatch is the proof.

## Round 6 — fresh review of the round 5 contract fixes

The fresh reviewer confirmed the contract corrections and the workflow pinning,
and found that round 5 had reopened the very failure class this branch has
closed three times. Recorded plainly because it is the fourth instance.

### R5-01 — BLOCKING, and a regression I introduced (`bug`)

Round 5 replaced undocumented list-field matching with documented App Details
verification — correct — but selected which entries to verify by exact display
name. So an app already in the repository under any other name ("KISOK Kiosk",
a rename, a different case) was never examined, the walk concluded `absent`,
and a DUPLICATE enterprise app was created. The package check could confirm a
match but could never find one.

Proven before and after with the same probe:

```
BEFORE (686b163):
  RESULT {"ok":true,"action":"created", ...}
  CALLS  POST /oauth/v2/token | GET /apps?limit=50&offset=0 | POST /emsapi/files | POST /apps
  (the existing app_id 55 was never read at all)

AFTER:
  RESULT {"ok":true,"action":"updated","detail":"updated com.kisok.kiosk (app_id 55, release label 9) ..."}
  CALLS  POST /oauth/v2/token | GET /apps?limit=50&offset=0 | GET /apps/55
         | POST /emsapi/files | PUT /apps/55/labels/9
```

The listing is now used only for its documented `app_id`, every entry is read
through App Details, and `MAX_DETAIL_READS` (200) bounds the work — exceeding
it fails the run rather than concluding `absent` from a partial scan. The
deleted round-5 test that asserted name-based selection is replaced by one
asserting the opposite.

### R5-02 — the guard test passed for the wrong reason (`bug`)

The name-only test registered no App Details route, and the fixture matcher
used `url.includes(...)`, so the App Details request silently received the
LISTING body — which happened to lack `bundle_identifier`, so the test passed
through a branch it was not testing. The matcher now compares
`new URL(url).pathname` for equality, and an unregistered path throws. That
change alone turned two other tests red, which is the point of it.

### R5-03 — the headline fix had no test (`behavior`)

Round 5's own framing was that a single wrong header made the pipeline
non-functional and nothing caught it. Nothing still caught it: no test read the
recorded headers. There is now one asserting every authenticated call carries
`Authorization: Zoho-oauthtoken …` and `Accept: application/json`, and that the
credentials never travel in a header on the token call.

### R5-04 — three places still claimed the property the code had lost

The module docstring, the workflow comment and `mdm-operations.md` all still
said matching was by package identity and never by display name. Round 5 had
inverted that. All three now describe what the code does: every entry is read,
the name neither selects nor excludes one.

### R5-05 to R5-09 — accepted and fixed

`platform_type`'s unconfirmed enum is now actually recorded in
`mdm-operations.md` (the source pointed at a section that did not exist);
response-supplied ids are validated before being spliced into an authenticated
URL path (`isSafePathSegment`); the module docstring no longer says "five calls"
for seven, no longer overclaims that orphan files are impossible, and no longer
says the contracts were carried over unverified; the APK is read before the
first network call again; a mis-titled test is renamed; leftover `identifier`
fixtures are gone; and the duplicate least-privilege comment is removed.

### Final gate

```
npx jest tools/mdm → 37 passed
pnpm verify        → PASS (exit 0)
  Test Suites: 95 passed, 95 total
  Tests:       1303 passed, 1303 total
pnpm exec expo prebuild --platform android → "✔ Finished prebuild"
```
