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

## Round 7 — the review that found the fail-opens my own round-6 fix created

Round 6 replaced display-name matching with package identity read from the
documented App Details endpoint. The independent re-review found that the
replacement leaked in two places, and that a third contract was wrong in a way
no round had caught.

### R6-01 (blocking) — every rejection collapsed into "not a match"

`identifyApp` returned a boolean. An entry that was somebody ELSE's package and
an entry the script could not verify at all (App Details missing
`bundle_identifier`, an unreadable `app_id`, a non-Enterprise `app_type`) both
came back `false`, so `findApp` filtered them out identically and returned
`absent` — and `absent` means CREATE. A repository the script could not read
produced a duplicate enterprise app rather than a stop.

Probed before fixing, with the real `publish()` against a fake fetch:

| probe | repository state                               | before  | after     |
| ----- | ---------------------------------------------- | ------- | --------- |
| H1    | App Details carries no `bundle_identifier`     | MUTATED | `STOPPED` |
| H2    | listed entry's `app_id` is not addressable     | MUTATED | `STOPPED` |
| H3    | our package, but not the Enterprise `app_type` | MUTATED | `STOPPED` |

Fixed by making the result a discriminated union — `{ok:true}`,
`{ok:false,kind:"other-package"}`, `{ok:false,kind:"unverifiable",reason}` —
and failing closed on any `unverifiable`. Only `other-package` may be skipped,
because only that one is a fact. `listedAppIds` now reports entries it cannot
even address (`unusable`), and a non-zero count is itself a stop.

### R6-03 (major) — the update silently renamed the tenant's app

The label-scoped update echoed `inputs.appName` back to ManageEngine. Probe H7
against an app the console calls "KISOK Kiosk" sent
`{"app_name":"KISOK",...}` — the pipeline would have renamed the operator's
app on every release. It now echoes `match.appName`, read from App Details, and
`verifyCandidates` refuses a match whose name it could not read rather than
substituting one.

```
H7 → PUT /api/v1/mdm/apps/55/labels/9
     {"app_name":"KISOK Kiosk","app_type":2,"app_file":42,"force_update_in_label":true}
```

### R6-04 to R6-06

The App Details route matcher in the fake fetch matched by substring, so a test
that meant to prove a guard was reading the LISTING body instead and passing
for the wrong reason; matching is now by exact pathname, which turned two other
tests red and exposed R6-01. The headline `Zoho-oauthtoken` fix had no test at
all — it does now, asserting the scheme is never `Bearer`. Dead defensive state
(`sawAnyBundleIdentifier`) was deleted rather than kept.

### Round 7 gate

```
npx jest tools/mdm → 45 passed, 45 total
pnpm verify        → PASS (exit 0)
pnpm exec expo prebuild --platform android --no-install --clean → "✔ Finished prebuild"
  android/app/src/main/AndroidManifest.xml carries
    <meta-data android:name="android.content.APP_RESTRICTIONS"
               android:resource="@xml/kiosk_restrictions"/>
  android/app/src/main/res/xml/kiosk_restrictions.xml renders the choice restriction
```

`prebuild` rewrites `package.json` (`expo start --android` → `expo run:android`,
and it adds an `ios` script). Reverted — this project ships Android tablets and
the script change is a prebuild artefact, not a decision.

## Round 8 — the fresh review of round 7, and the class behind six rounds of it

The round-7 fixes were handed to an independent reviewer with instructions to
prove findings with probes rather than reading. It found the round-7 fix
leaking one layer up, and named the pattern the branch had been rediscovering.

### F1 (blocking) — the unusable count could not see what the walk had dropped

`findApp` collected only entries that were objects:

```ts
for (const app of apps) if (isRecord(app)) collected.push(app);
```

`listedAppIds` carefully counts entries it cannot address as `unusable`, and
`verifyCandidates` stops on a non-zero count — but a non-object entry never
reached the counter. `collected` came back empty, `unusable` was 0, and
`absent` took the CREATE branch. Reviewer probes against the real `publish()`:

| probe | listing                                              | before             |
| ----- | ---------------------------------------------------- | ------------------ |
| P1    | `{apps:[null,"com.kisok.kiosk",7]}`                  | uploaded + CREATED |
| P2    | `{apps:[null,null],metadata:{total_record_count:2}}` | uploaded + CREATED |

P2 is the worse one: `seen += apps.length` counted the dropped entries, so
`seen >= total` ended the walk as though the repository had been read in full.
The walk now collects every entry and `listedAppIds` counts a non-object the
same as a missing `app_id`.

### F2 (major) — a dropped release label could retarget the release

`parseAppDetails` skipped a `release_labels` entry with no readable name.
`selectReleaseLabel` then saw one survivor and took the "only label — use it"
branch, so the "several labels and none is Stable — refuse to guess" guard
never ran. Probe P3, with labels `[{id:9}, {id:8,name:"Beta"}]`, pushed the
release into Beta and reported success. The unreadable label could have been
Stable. `parseAppDetails` now reports `unreadableLabels` and any non-zero
count refuses.

### F3 (major) — two guards with no test, one of them this round's headline

The reviewer mutated the source a line at a time and re-ran the suite:

| mutation                                        | suite before | now      |
| ----------------------------------------------- | ------------ | -------- |
| `if (verified.length > 1)` → `if (false)`       | 45 passed    | 1 failed |
| `if (app.appName === undefined)` → `if (false)` | 45 passed    | 1 failed |

The second is the guard round 7's own commit message claimed to have added.
With it gone, `JSON.stringify` drops the undefined and the PUT goes out
without the field the code calls documented-mandatory — silently.

### F4, F5, F6

App Details is now checked to be about the app that was addressed: a body
echoing a different `app_id` is unverifiable, not a source of an `app_name` to
rename ours with (probe P4 had renamed app 55 to "Totally other"). `--dry-run`
reads the APK instead of skipping it, so a wrong `--apk` path fails on the dry
run the operator is told to trust rather than on the real dispatch. The module
docstring's path to `mdm-operations.md` was wrong, and the update body's
contract — `app_name` mandatory, `force_update_in_label` true — lived only in a
code comment; it is now in the TENANT VALIDATION list an operator checks.

### Every new guard was mutation-tested, not just run

Each fix was reverted one at a time against the new suite:

```
F1  drop non-record entries again        → 2 failed
F2  ignore unreadable labels again       → 2 failed
F3a duplicate-package stop removed       → 1 failed
F3b missing app_name accepted            → 1 failed
F4  app_id echo unchecked                → 1 failed
F5  dry run skips the APK read again     → 1 failed
restored                                 → 53 passed
```

### The class, finally

The reviewer's closing point is the one worth keeping: F1 and F2 are the same
defect shape as R6-01, found one layer up and one layer down. Six rounds fixed
the instance at the point of discovery instead of the rule. The rule is
**never discard an input you could not read** — an unreadable entry is not an
absent one, and `absent` is the branch that mutates.

So the remaining drop sites in the file were audited as a class rather than
waiting for round 9. `parseAppDetails` falling back to `{}` on a non-record
body, a non-array `release_labels`, a non-record `paging`, the CLI flag loop
and the file-upload status walk all end in a `fail()` or a stop, so they are
fail-closed already. The two that were not are the two fixed above.

### Round 8 gate

```
npx jest tools/mdm → 53 passed, 53 total
pnpm verify        → PASS (exit 0)
pnpm exec expo prebuild --platform android --no-install --clean → "✔ Finished prebuild"
```

## Round 9 — three proposed contract changes that could NOT be verified

Three ManageEngine contract changes were proposed, each conditional on current
official documentation confirming it. The verification is the deliverable here,
and it came back negative on all three.

### The egress block is a gateway policy denial, not a flake

```
WebFetch https://www.manageengine.com/mobile-device-management/api/apps/
  → EGRESS_BLOCKED
curl  www.manageengine.com | manageengine.com | ...-msp
  → curl: (56) CONNECT tunnel failed, response 403   (all three hosts)
$HTTPS_PROXY/__agentproxy/status → recentRelayFailures:
  "gateway answered 403 to CONNECT (policy denial or upstream failure)"
```

The vendor's documentation cannot be opened first-hand from this environment.
Search-engine summaries of those same pages are second-hand model output, not
the documentation, so they are evidence that a page exists — not proof of what
it says.

### F1 — label-scoped App Details: NOT confirmed, and the change as specified would regress round 6

Search summaries report BOTH `GET /api/v1/mdm/apps/{app_id}` ("the basic app
details endpoint") and `GET /api/v1/mdm/apps/{app_id}/labels/{release_label_id}`
as documented. Nothing available distinguishes which is authoritative for
reading `bundle_identifier`.

The specified remedy — take app_id AND release label data from the App List,
then call the label-scoped endpoint — has a structural problem independent of
the documentation question. Round 6 established that the List response's
identity fields (`identifier`, `bundle_id`, `package_name`,
`app_package_name`) are **undocumented**, which is why identity moved to App
Details in the first place. Requiring a `release_label_id` from the List before
identity can be read makes the run depend on List fields again. If the List
does not carry `release_labels`, identity resolution has no entry point at all.

Changing this blind would trade a working, tested path for an unverified one
and reopen a closed finding. **Not implemented. Requires one tenant call to
settle**, which the dry run makes cheap.

### F2 — `release_label_type` 1 = Stable, 2 = Beta: NOT confirmed

A search summary shows `"release_label_type": 1` appearing in a response
example. No available source states what 1 or 2 MEAN. Selecting the release
channel from an enum whose semantics are unconfirmed is exactly the guess that
would push a release into the wrong channel — the F2 failure of round 8, made
deliberately. **Not implemented.**

Current behaviour is unchanged and already fails closed: one label is used,
several selects the one named "Stable", several with no "Stable" refuses, and
any unreadable label entry refuses.

### F3 — `platform_type` Android = 2: NOT confirmed, and the evidence conflicts

| source (via search summary) | value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Profiles example            | `platform_type: 1` on "IOS Restrictions Policy"                    |
| Devices example             | `platform_type: "android"` (a STRING) beside `platform_type_id: 2` |
| Apps example                | `platform_type: 2`                                                 |

Three different resources, two different types for the same field name, and no
enum definition. An earlier round already recorded one Apps example showing `2`
beside an iOS bundle id. Asserting `platform_type === 2` on this basis could
reject the right app (blocking every release) or accept a wrong one.
**Not implemented**, per the explicit instruction not to guess an enum value.

Identity continues to rest on `bundle_identifier` — which on Android IS the
package name — plus the documented Enterprise `app_type`, with the observed
`platform_type` logged rather than tested.

### What WAS fixed: a shipped comment that contradicted the code

`plugins/with-managed-configuration.ts` generates
`res/xml/kiosk_restrictions.xml`, and its comment told the operator that
`kiosk_device_role` set to "anything else, including an unset value, behaves as
a normal employee tablet". That has been false since round 3 fixed CR-3: only
an ABSENT key derives `standard`; any other present value derives `unknown` and
withholds Preparation. The file's docstring carried the same inversion, still
claiming a typo "derives as an ordinary device and quietly makes Preparation
reachable" — the pre-CR-3 behaviour, used to justify the `choice` restriction.

Both now state what the code does. The `choice` restriction keeps its
justification, correctly: it stops the typo being expressible, rather than
stopping it from failing open.

### Round 9 gate

```
npx jest tools/mdm features/device-mode plugins → 5 suites, 99 passed
pnpm verify        → PASS (exit 0), 95 suites / 1319 tests
pnpm exec expo prebuild --platform android --no-install --clean
  → "✔ Finished prebuild"; the corrected comment is present in the
    generated android/app/src/main/res/xml/kiosk_restrictions.xml
```

### CodeRabbit, re-verified against the current head

All five inline threads are resolved, and each fix was confirmed present in the
code rather than trusted from the thread state: the `cut -d' ' -f1` in the
documented keytool command; `unavailable` in plan.md's `deviceRoleAccess`
contract; `deriveDeviceMode` returning `unknown` for a present-but-unrecognised
role; `readDeviceMode` returning `unknown` when the module is missing ON
Android only; and `if (page === LIST_MAX_PAGES) return outOfPages();` guarding
the `paging.next` path.

The top-level comment's **"Merge Risk: High"** is stamped
`sourceCommitId: 35ec2d0`, nine commits behind the current head, and its two
stated reasons are precisely those findings — "configuration or
native-registration failures can defeat the kiosk guard" (CR-3/CR-4) and "a
long ManageEngine listing can create a duplicate application" (CR-5). All
three are fixed and tested. **The warning is stale, not current.**

The one failing pre-merge check, Docstring Coverage 44.44% against CodeRabbit's
own 80% threshold, is also scoped to `35ec2d0`. It is an advisory style metric
with no correctness claim attached, and writing docstrings to hit a
third-party tool's arbitrary threshold is not a change this PR should carry.
Recorded, not actioned.

## Round 10 — the contracts arrive verified, and the flow is rebuilt to them

Round 9 refused to implement three contract changes because this environment
cannot reach the vendor's documentation. They were then verified OUTSIDE this
environment and supplied as authoritative. That removes the objection — the
objection was never that the findings looked wrong, only that nothing here
could confirm them — so all three are implemented.

### The App resolution flow is now label-scoped

`GET /api/v1/mdm/apps/{app_id}` is gone. The current Cloud contract is
`GET /api/v1/mdm/apps/{app_id}/labels/{release_label_id}`, which inverts the
order the pipeline used to run in: the label id ADDRESSES App Details, so it
must come from the App Repository listing before identity can be read at all.

```
GET /apps  →  per entry: Stable label by release_label_type === 1
           →  GET /apps/{app_id}/labels/{stable_label_id}
           →  bundle_identifier + app_type 2 + platform_type 2
           →  PUT /apps/{app_id}/labels/{stable_label_id}
```

The fail-closed rule from rounds 6–8 carries straight over, and one new case
falls out of it: **an entry whose Stable label cannot be resolved is not "not
ours".** Without that label id its identity cannot be READ, so it is counted
unusable and stops the run — exactly like an entry with no `app_id`. Calling it
someone else's app would let `absent` create a duplicate, which is the failure
this whole area exists to prevent.

### Stable is chosen by type, never by name

`release_label_type` 1 = Stable, 2 = Beta. `release_label_name` is UI text and
is now used only in the log line. The previous name-based selection had two
failure modes, and a test pins each: a tenant renaming "Stable" to "Live" made
the release unroutable, and a channel that merely called itself Stable would
have been selected.

### platform_type is asserted

Identity now requires all three of `bundle_identifier == com.kisok.kiosk`,
`app_type == 2` (Enterprise) and `platform_type == 2` (Android). Round 9
declined to assert this on conflicting search evidence; with the enum confirmed
(1 = iOS, 2 = Android, 3 = Windows) it is a real check.

### The create path was NOT changed

Current Cloud Add App requires `app_name`, `app_type` and — for Enterprise —
`app_file`. Everything else (`app_category_id`, `supported_devices`,
`release_label_id`, `bundle_identifier`, `description`) is optional, so the
minimal body already in place is correct. No new variables, no tenant
metadata, no `POST /labels` to manufacture a channel.

### Every new guard is mutation-tested

Each was reverted one at a time against the suite:

```
M1 regress to the UNLABELED App Details route  → 11 failed
M2 select the label by NAME instead of type    →  4 failed
M3 drop the Android platform assertion         →  2 failed
M4 allow several Stable labels                 →  2 failed
M5 skip an entry whose Stable label is unresolvable → 4 failed
M6 tolerate an unreadable label entry          →  1 failed
restored                                       → 56 passed
```

M1 is the one the round turns on: a regression to `/apps/{app_id}` cannot pass.

### The release workflow now refuses any ref but main

`workflow_dispatch` is manual, but manual is not main — the dispatch UI and API
both take a ref, so the workflow could be aimed at this very feature branch and
would build, sign and PUBLISH unreviewed source to the tenant under the real
package identity. The first step now fails the run when `GITHUB_REF` is not
`refs/heads/main`, loudly rather than as a green skip, because a silent skip on
the wrong ref looks exactly like a successful release.

`tools/release/release-workflow.test.ts` pins that guard's POSITION (step 0),
the manual-only trigger, the environment, least privilege, serialized
concurrency, SHA-pinned actions and the absence of any secret echo. It reads
the YAML as text on purpose: the repo has no YAML parser of its own (`yaml`
resolves to a browser ESM build under jest, `js-yaml` is only transitive), and
buying a dependency to assert nine lines is worse than a regex.

### Two stale comments corrected

`plugins/with-managed-configuration.ts` still said `customer_kiosk` is a kiosk
and "everything else — absent, empty, or any other value — an ordinary
device". That is the pre-CR-3 behaviour and it is false: absent → `standard`,
the exact literal → `customer-kiosk`, anything else present → `unknown` and
Preparation withheld.

`features/device-mode/model/device-mode.schema.ts` claimed the native module
"drops null-valued keys". The Kotlin does the opposite — `null -> ""` — and
deliberately so: a key the DPC delivered as null stays PRESENT to JS and
derives `unknown`, instead of disappearing and deriving `standard`.

### Round 10 gate

```
npx jest tools/mdm            → 56 passed
npx jest tools/release        → 74 passed
npx jest features/release-notes → 20 passed
npx jest features/device-mode plugins → 46 passed
```

## Round 11 — the first real release attempt, and the upload contract it broke

A real release was attempted against the real US Cloud tenant. This is the
first entry in this log that can say OBSERVED rather than TENANT VALIDATION
REQUIRED for any ManageEngine call:

```
OAuth refresh-token exchange        → OBSERVED, SUCCEEDED
App Repository listing              → OBSERVED, SUCCEEDED
repository-absence detection        → OBSERVED, SUCCEEDED
POST /emsapi/files (hand-built      → OBSERVED, FAILED
  multipart body)                     HTTP 406 {"errorCode":"406",
                                       "errorMsg":"Not Acceptable"}
```

The upload was rejected because the request body was assembled by hand — a
manual `MULTIPART_BOUNDARY`, a hand-written `buildMultipartBody(...)`, and a
manually set `Content-Type: multipart/form-data; boundary=...` header. That is
gone. `uploadApk` now builds the request with Node's native `FormData` and
`Blob`:

```
const form = new FormData();
form.append("file", new Blob([bytes], { type: "application/vnd.android.package-archive" }), fileName);
await request(..., { method: "POST", headers: { ...authHeaders(token), Module: "MDM_APP_MGMT" }, body: form });
```

`Content-Type` is never set by this script for that call — `fetch` generates
`multipart/form-data; boundary=...` and the matching framing itself, which is
exactly the class of bug a hand-rolled boundary can reintroduce. The multipart
field name is exactly `file`, matching the documented contract; there is no
`fileName` field and no `X-Customer` header.

This fix has NOT itself been dispatched against a real tenant yet — it is
NOT YET OBSERVED. Neither has app creation or app update. Only the four calls
listed above carry OBSERVED status; everything downstream of the upload is
still TENANT VALIDATION REQUIRED.

### Large ManageEngine ids can exceed Number.MAX_SAFE_INTEGER

The vendor's own current documentation shows ids (`fileID`, `app_id`,
`release_label_id`) as large as `9007199254741080` — above
`Number.MAX_SAFE_INTEGER` (`9007199254740991`). A plain `JSON.parse` already
rounds such a value the moment it is tokenised, before any code here runs, and
`Number(...)`/`parseInt(...)` on a string id would do the same. Both are now
refused by construction:

- `tryParseJson` recovers `fileID`, `file_id`, `app_id` and `release_label_id`
  from the ORIGINAL response text, via the `context.source` a Node `JSON.parse`
  reviver receives (confirmed present on this environment's Node `v22.22.2` —
  see the `node -e` check below; Node 24, which the release workflow runs,
  carries the same support). A safe integer is
  canonicalised to its decimal string; an unsafe one is accepted ONLY when its
  exact source text is a plain decimal integer, and refused otherwise.
- `readId` now accepts only a plain decimal string or a JS number that is
  itself a safe non-negative integer — never a rounded unsafe number.
- `app_file` is documented as a `long` on Add/Update App — an unquoted JSON
  integer, not a string — so it can never be produced by
  `JSON.stringify({..., app_file: fileId})`, which would either round the id
  (a JS number) or wrongly quote it (a JS string). The two mutation bodies are
  now built by a small explicit serialiser, `decimalIdLiteral`, that validates
  the id and inserts its exact digits unquoted.
- The file-status endpoint is UNCHANGED: `fileIDs` are still sent as decimal
  strings (`JSON.stringify({ fileIDs: [String(fileId)] })`), because that is
  what the status API documents.

```
node -e '
let exact;
JSON.parse(
  "{\"app_id\":9007199254741080}",
  (key, value, context) => { if (key === "app_id") exact = context?.source; return value; },
);
console.log(process.version, exact);
if (exact !== "9007199254741080") process.exit(1);
'
→ v22.22.2 9007199254741080   (exit 0 — this environment's Node already
  supports reviver source access; nothing here depends on Node 24 alone)
```

### Regression tests added

`tools/mdm/publish-app.test.ts` — 8 new cases, none touching the network:

```
uploads the APK as native FormData with exactly one 'file' field
sends the documented upload headers, with no manual Content-Type / X-Customer
sends the CREATE body with exactly app_name, app_type, app_file
serialises a large fileID in the CREATE body as an unquoted JSON long
serialises a large fileID in the UPDATE body the same way
recovers an UNQUOTED app_id above MAX_SAFE_INTEGER exactly, from raw response text
fails closed when a returned id above MAX_SAFE_INTEGER has no recoverable decimal source
polls file status with the fileID as a STRING, never renumbered
```

The sixth of those needed a small harness change: `fakeFetch` can now answer a
route with `rawText` instead of `body`, because a JS numeric literal above
`Number.MAX_SAFE_INTEGER` is already rounded by the time it could be
`JSON.stringify`'d from a test fixture object — the raw-text route sends the
server's exact wire bytes instead.

### Round 11 gate

```
npx jest tools/mdm/publish-app.test.ts --runInBand → 64 passed
pnpm typecheck   → PASS
pnpm lint        → PASS
pnpm format:check → PASS
```

Not claimed: that the ManageEngine upload, create, or update now WORK against
the real tenant. Only that a hand-built multipart body is gone, ids are now
handled losslessly end to end, and the wire contract is pinned by tests. The
next real release workflow dispatch against the live tenant is still the
proof.

⚠️ **Correction (Round 12): the sentence above originally claimed the
hand-built multipart body WAS the 406-causing defect. That is disproven —
see Round 12.** Native FormData was a reasonable next thing to try, not a
confirmed fix, and it should have been recorded that way.

## Round 12 — a second live 406 disproves the working theory, and a diagnostic probe

The Round 11 fix (native `FormData`, field `file`) was dispatched against the
real tenant for the first time: Android release run #5
(`35677325769`, `main@440e1dadd2066c2fca75a6c0ae49ca93b53972b3`). Everything
up to and including the signed, verified APK succeeded — production Supabase
config, Node 24, Java 17, prebuild, the Gradle release build, signing,
package identity, version, the certificate pin, the embedded JS bundle, all
OBSERVED SUCCEEDED. `POST /emsapi/files` answered:

```
HTTP 406
{"errorCode":"406","errorMsg":"Not Acceptable"}
```

The SAME error as attempt 1. That disproves the theory Round 11 recorded:
attempt 2 removed every characteristic of a hand-rolled multipart request —
the manual boundary, the manual `Content-Type` — and the tenant rejected it
identically. Something else about the request is what the tenant is
rejecting; it is not yet known what. What is held constant across both
failures, and therefore not a standalone suspect: the endpoint
(`/emsapi/files`), host (`mdm.manageengine.com`), `Module: MDM_APP_MGMT`,
`Accept: application/json`, no `X-Customer`, the OAuth token, the tenant.

Neither attempt has reached `fileID`, `/emsapi/fileupload/status`,
`POST /api/v1/mdm/apps`, or app create/update. The Round 11 64-bit id
hardening is untouched by this finding and stays as-is — nothing here
implicates it.

### The diagnostic problem: ~16 minutes per guess is too slow

A full release run rebuilds and signs Android before it ever reaches the
upload, so testing the next candidate wire shape the same way costs a full
build cycle per attempt. `tools/mdm/publish-app.ts` was deliberately NOT
touched this round — there is no live evidence yet for what to change it to,
and guessing again inside the production publisher would just be a third
untested attempt wearing the same build cost.

Instead: `.github/workflows/mdm-upload-diagnostic.yml` (manual dispatch) plus
a new standalone script, `tools/mdm/probe-upload.ts`. The workflow downloads
an already-verified production APK artifact with
`actions/download-artifact@37930b1c2abaa49bbe596cd826c3c89aef350131` (pinned
v7.0.0, matching this repo's existing SHA-pinning convention) rather than
rebuilding one, locates the `.apk` with `find` rather than assuming a fixed
path, and runs the probe. One dispatch = one upload representation, chosen by
a `variant` input:

- `cloud_file` — field `file`, matching the current publisher and the
  Cloud-specific docs. Already OBSERVED to fail (this is what shipped in
  run #5), so it is not the useful first thing to try again.
- `legacy_fileName` — field `fileName`, matching a contradictory ManageEngine
  example. NOT YET OBSERVED. **Default**, and the recommended first dispatch.

`probe-upload.ts` is deliberately standalone — it duplicates a few small
pieces of `publish-app.ts` (secret redaction, data-centre hosts, the
token-exchange body) rather than importing from it, so this temporary probe
can never change the production publisher's behaviour by accident, and
`publish-app.ts` stays untouched until a variant is proven live. It:

- authenticates and optionally confirms repository read access
  (`repository read: HTTP <status>`, nothing else printed from that call),
- sends exactly one multipart representation to `/emsapi/files`,
- reports status, content-type, and — ONLY on a non-2xx response — the
  (capped) response body; a 2xx body is never dumped raw, because it would
  contain the real `fileID`,
- on success, reports the `fileID` REDACTED (`9007...1056`, never the whole
  value), `fileStatus`, and stops,
- NEVER calls `POST /api/v1/mdm/apps` or the `/labels/` update endpoint,
  whatever the upload result — pinned by a test that scans the script's own
  source for either call.

`X-Customer` is deliberately NOT tried yet — this is a standard non-MSP Cloud
tenant, and mixing it with the field-name change in one probe would leave
two variables changed at once if a run happened to succeed.

### Tests added

`tools/mdm/probe-upload.test.ts` (19 cases) and
`tools/mdm/mdm-upload-diagnostic-workflow.test.ts` (9 cases, workflow text
assertions in the same style as `tools/release/release-workflow.test.ts`).
One test caught a real bug before it shipped: an early draft dumped the raw
2xx response body unconditionally, which would have printed the unredacted
`fileID` on a successful probe — fixed to dump the raw body only on failure.

```
npx jest tools/mdm --runInBand → 3 suites, 92 passed
pnpm typecheck    → PASS
pnpm lint         → PASS
pnpm format:check → PASS
pnpm check:ci-scripts → PASS (5 workflows, 10 checks)
node -e (js-yaml) → all 5 workflow files parse
```

`git diff --stat -- tools/mdm/publish-app.ts` → empty. The production
publisher is untouched by this round.

### Round 12 gate

```
npx jest tools/mdm --runInBand → 92 passed
pnpm typecheck    → PASS
pnpm lint         → PASS
pnpm format:check → PASS
pnpm check:ci-scripts → PASS
```

Not claimed: that `legacy_fileName`, or any variant, is correct. Only that
two representations have now failed identically, that a hand-built multipart
body is disproven as the sole cause, and that a cheap, isolated, audited way
to test the next candidate now exists. The recommended next step is one
dispatch of `mdm-upload-diagnostic.yml` with `variant: legacy_fileName`.

## Round 13 — a third live 406, and a real tenant/customer id

The recommended Round 12 dispatch happened: `legacy_fileName` (field
`fileName`) against `main@440e1da`, workflow run `35681125575`. Everything
up to the upload OBSERVED SUCCEEDED again — checkout, secrets present,
Node 24, artifact download, digest, APK location, package/version, OAuth
token exchange, `GET /api/v1/mdm/apps` (HTTP 200). `POST /emsapi/files`
answered the same `HTTP 406 {"errorCode":"406","errorMsg":"Not
Acceptable"}` as both earlier attempts. Three representations now share
this outcome: hand-built multipart, native FormData/`file`, native
FormData/`fileName` — none varying `X-Customer`, `Module`, `Accept`, or the
endpoint. See `mdm-operations.md` for the corrected reasoning about what
holding those characteristics constant does and does not prove.

Two things independently narrow the remaining hypotheses:

- The granted OAuth scope was confirmed: `MDMOnDemand.MDMDeviceMgmt.READ`,
  `.CREATE`, `.UPDATE`, `MDMOnDemand.MDMInventory.READ`. Scope is no longer
  a leading suspect.
- The identical APK was uploaded successfully through the ManageEngine web
  console (App Repository → Add App → Android Enterprise App → Self Hosted
  Apps), reading back `com.kisok.kiosk` / `KISOK` / `1.0.0` correctly. That
  flow is session/cookie/CSRF-based (`upload.zoho.com/webupload`) and is
  NOT being adopted for this OAuth publisher or its diagnostic — it is
  evidence only, for two things: the tenant accepts this exact APK, and the
  tenant has a real customer/tenant id. Another official ManageEngine
  `/emsapi/files` example shows an `X-Customer` header the current
  Cloud-specific docs omit. Nothing from that browser session — cookies,
  CSRF tokens, session ids, the NetLog itself — was committed or logged;
  only the fact that a customer id exists informs this round.

### New probe variant: `cloud_file_with_customer`

Isolates that one hypothesis. `tools/mdm/probe-upload.ts` gained a third
`Variant`, sharing `cloud_file`'s field (`file`) and adding exactly one
header, `X-Customer`, built by a new pure `buildUploadHeaders(variant,
token, customerId)` — tested directly to differ from `cloud_file`'s headers
by that one key and nothing else (`headers[k] === base[k]` for every other
key). The real customer id is never hard-coded: it is read only from
`process.env.MDM_CUSTOMER_ID`, supplied as a GitHub Actions environment
SECRET (not a variable) in `android-release`, and added to the same
redaction set as the three OAuth credentials. `resolveInputs` fails closed
— before any network call — when `cloud_file_with_customer` is selected and
`MDM_CUSTOMER_ID` is unset or blank; the other two variants are unaffected
and do not require it. The diagnostic's printed header line now reads
`X-Customer: yes (redacted)` or `X-Customer: no`, never the value.

`tools/mdm/publish-app.ts` and `publish-app.test.ts` are untouched —
confirmed by an empty `git diff` against both for this entire round.

### Small hardening fixes, from review of the Round 12 workflow

- **APK cardinality.** `find … | head -n1` silently picked the first match.
  Replaced with `mapfile -t apks < …`, which fails closed on 0 files (as
  before) AND now on more than 1, printing the offending paths rather than
  guessing.
- **`run_id` verification wording.** The download step's comment previously
  implied whichever `run_id` a dispatch selects carries the same recorded
  verification as the documented default. Corrected: only run `35535503611`
  is recorded as verified in this repo's docs; an overridden run_id still
  runs, unverified by this repository.
- **Repository-read body.** `reportRepositoryRead` read only `.status` and
  never consumed the response body, leaving the connection unreleased.
  Fixed to `await response.text()` (discarded) before logging the status —
  still logs only `repository read: HTTP <status>`, never the body.
- **Doc logic error.** `mdm-operations.md` previously said characteristics
  held constant across the failed attempts were "therefore not (yet) a
  suspect" — backwards: an unvaried characteristic is NOT ruled out by that
  fact, only unproven either way. Corrected in both `mdm-operations.md` and
  `plan.md`, along with the stale "contracts themselves are no longer in
  question" line — the Add/Update/App-Details/status contracts remain
  implemented as documented, but the LIVE `/emsapi/files` upload wire
  contract is the separate, still-open question.

### Tests added

24 new cases across `tools/mdm/probe-upload.test.ts` (13) and
`tools/mdm/mdm-upload-diagnostic-workflow.test.ts` (3), plus the existing
suites re-run green. Notably: `buildUploadHeaders` is proven to differ
between `cloud_file` and `cloud_file_with_customer` by exactly the
`X-Customer` key (a same-keys-else diff, not just "it has one more key");
`run()` is proven to send `X-Customer` only for `cloud_file_with_customer`
even when a customer id happens to be available for another variant; and a
workflow-source test proves `MDM_CUSTOMER_ID` is assigned only from
`${{ secrets.MDM_CUSTOMER_ID }}` on every line that names it, never a
literal, never `vars.*`.

### Round 13 gate

```
npx jest tools/mdm --runInBand → 108 passed
pnpm typecheck        → PASS
pnpm lint             → PASS
pnpm format:check     → PASS
pnpm check:docs       → PASS (94 files)
pnpm check:ci-scripts → PASS (5 workflows, 10 checks)
node -e (js-yaml)     → all 5 workflow files parse
git diff --check      → clean
git diff -- tools/mdm/publish-app.ts tools/mdm/publish-app.test.ts → empty
```

Not claimed: that `X-Customer` fixes the 406. Only that it is now the most
informative untested candidate, isolated cleanly, and ready for one live
dispatch: `mdm-upload-diagnostic.yml`, `variant: cloud_file_with_customer`,
`run_id: 35535503611`, once the `MDM_CUSTOMER_ID` environment secret is
created. The `GET /api/v1/mdm/apps` repository read already OBSERVED
SUCCEEDED on this same OAuth token in every attempt so far, so a 406 here
would mean the customer-id hypothesis is disproven too, not that auth or
repository access broke.

## Round 14 — a fourth /emsapi/files failure, and a different endpoint

The recommended Round 13 dispatch happened: `cloud_file_with_customer`
against `main@005cd2a`, workflow run `35686694952`. Everything up to the
upload OBSERVED SUCCEEDED again — artifact download (65557265 bytes),
package/version, `MDM_CUSTOMER_ID` present, `X-Customer` actually sent,
OAuth token exchange, `GET /api/v1/mdm/apps` (HTTP 200). `POST /emsapi/files`
— native FormData, field `file`, real `X-Customer` — answered the same
`HTTP 406 {"errorCode":"406","errorMsg":"Not Acceptable"}` as all three
earlier attempts.

Four representations of `/emsapi/files` have now failed identically:

```
1. hand-built multipart,       field=file,     no X-Customer  → 406
2. native FormData,            field=file,     no X-Customer  → 406
3. native FormData,            field=fileName, no X-Customer  → 406
4. native FormData,            field=file,     real X-Customer → 406
```

**`X-Customer` is disproven as the fix**, the same way the hand-built
multipart theory was disproven in Round 12. Per explicit instruction, this
branch of diagnosis — permuting `/emsapi/files` itself — is exhausted
enough for now. See `mdm-operations.md` for the corrected framing: the
tested `/emsapi/files` representations have all failed on this tenant; that
is not the same claim as the endpoint being definitively broken.

### New target: the legacy `/api/v1/mdm/files` endpoint

Per instruction NOT to invent a request shape from memory: research came
first. `WebSearch` (direct `WebFetch` of `www.manageengine.com` is blocked
by this environment's egress policy, unchanged from every earlier round)
returned search-result summaries and a quoted verbatim Python example from
the official page
`https://www.manageengine.com/mobile-device-management/api/files/`
("Files | Mobile Device Manager Plus | API Documentation"). That search
also independently confirmed `/api/v1/mdm/files` is documented as the
**deprecated** predecessor `/emsapi/files` replaced — consistent with why
`/emsapi/files` was adopted originally, and now the reason to try the older
one while the newer one keeps failing. The user interrupted further
searching once this was sufficient to implement from; no additional pages
were fetched beyond what is quoted below.

The quoted official example (headers and call shape only; token redacted
here as it was in the source):

```python
headers = {
    'Authorization': "Zoho-oauthtoken 1000.41d9...c2d1.8fcc...125f",
    'content-type': "application/json",
    'content-disposition': f"filename={file_name}"
}
conn.request("POST", "/api/v1/mdm/files", payload, headers)
```

with `payload = file.read()` — the raw file bytes, not a multipart body.
Documented response fields: `file_id`, `content_type`, `file_name`,
`expiry_time`, `content_length`. No `Module` header and no `X-Customer`
appear anywhere in that example, so `legacy_api_v1_files` sends neither and
does not require `MDM_CUSTOMER_ID`. No status-poll step is documented for
this endpoint, unlike `/emsapi/files`'s `fileStatus`/
`/emsapi/fileupload/status`, so none is implemented.

That `content-type: application/json` on a binary body is unusual, and it
would have been tempting to "correct" it to
`application/vnd.android.package-archive` or `application/octet-stream`.
Followed the documented example verbatim instead, per the instruction not
to invent a shape from memory — that is exactly the kind of detail a live
dispatch needs to test as documented, not as it "should" read.

### Implementation: a fourth variant, kept structurally separate

`legacy_api_v1_files` targets a different endpoint AND a different
transport (raw bytes, not multipart) from every `/emsapi/files` variant, so
it was NOT forced through the existing `buildUploadForm`/
`buildUploadHeaders` multipart helpers — `VARIANT_FIELD` has no entry for
it (`Partial<Record<Variant, string>>`, and `buildUploadForm` now throws if
ever called with it), and a new, fully self-contained
`runLegacyApiV1Files()` function handles its request/response independently
of `run()`'s existing multipart path, which is otherwise untouched. A
`git diff` confined to that new function, its two small pure helpers
(`buildLegacyUploadHeaders`, `readLosslessId`) and the `VARIANTS`/
`VARIANT_FIELD` additions is the evidence the three existing variants'
behaviour is unchanged — and all 32 of their existing tests pass unmodified.

`file_id` can exceed `Number.MAX_SAFE_INTEGER` in this endpoint's documented
response shape too. Rather than import `publish-app.ts`'s lossless-id
machinery (which would couple this temporary probe to production), the same
strategy — Node's `JSON.parse` reviver `context.source` recovery, canonicalise
safe integers to decimal strings, refuse an unsafe number with no recoverable
source — is duplicated locally as `parseLegacyResponse`/`readLosslessId`.
Proven directly: a raw-text fixture with an unquoted `file_id` above
`MAX_SAFE_INTEGER` round-trips exactly; a fractional literal (a valid JSON
number that is not a plain decimal integer) is refused, reported as
"cannot be confirmed exact", and treated as `upload accepted: no` rather
than trusted.

### Tests added

18 new cases in `tools/mdm/probe-upload.test.ts` (endpoint targeting, exact
header shape, raw-bytes body with no FormData, no X-Customer, resolveInputs
not requiring `MDM_CUSTOMER_ID`, the documented failure/success shapes,
large and small `file_id` handling, the fail-closed path, secret redaction,
and the create/update guarantee), plus 2 in the workflow-pinning suite
(variant list and default, the new endpoint named in the workflow). The
existing 32 `probe-upload` cases and 11 workflow cases pass unmodified.

### Round 14 gate

```
npx jest tools/mdm --runInBand → 127 passed
pnpm typecheck        → PASS
pnpm lint             → PASS
pnpm format:check     → PASS
pnpm check:docs       → PASS (94 files)
pnpm check:ci-scripts → PASS (5 workflows, 10 checks)
node -e (js-yaml)     → all 5 workflow files parse
git diff --check      → clean
git diff -- tools/mdm/publish-app.ts tools/mdm/publish-app.test.ts → empty
```

Not claimed: that `legacy_api_v1_files`, or `/api/v1/mdm/files` generally,
works for this tenant. Only that it is a documented, differently-shaped
candidate worth one cheap live dispatch before any production decision, and
that the implementation matches the cited official example as closely as
the search tooling available in this environment could confirm — a full
page fetch remains blocked here, so live behaviour is still the only proof
that matters. `tools/mdm/publish-app.ts` is untouched.

⚠️ **Correction (Round 15): `legacy_api_v1_files` treated `/api/v1/mdm/files`
as one settled contract. It is not — see Round 15.** ManageEngine publishes
two contradictory representations for that endpoint, and this round's own
naming hid which one was under test.

## Round 15 — the legacy endpoint has two contradictory contracts, split apart

No web access was used this round — explicit instruction. The correction
came from two independently verified contracts supplied directly for this
task, not from research performed here:

- **Representation A** (already implemented in Round 14, unchanged): a
  general API example — raw POST of the file bytes, `Authorization`,
  `content-type: application/json`, `content-disposition: filename=<name>`.
  No `Accept`, no `Module`, no `X-Customer`.
- **Representation B** (new): a Cloud-specific page for the SAME
  `POST /api/v1/mdm/files` endpoint — `multipart/form-data`,
  `content-disposition: filename=<name>`, `Accept: application/json`. No
  `Module`, no `X-Customer` documented either.

Round 14's `legacy_api_v1_files` implemented only Representation A and
named it as though the endpoint had one settled contract. That framing was
wrong the moment Representation B was verified, and is corrected here
rather than left standing: **do not say either representation is correct,
and do not say the legacy endpoint works, until a live dispatch proves
it** — neither claim was made before, and neither is made now.

### The rename, and why

`legacy_api_v1_files` no longer exists as a variant name — it hid which
contradictory contract a given dispatch actually tested. Split into:

- `legacy_api_v1_raw_example` — exactly Round 14's wire shape, preserved
  byte-for-byte (proven by the existing 14 tests passing unmodified once
  only the variant string literal changed). Kept, not deleted: ManageEngine's
  own documentation is genuinely contradictory, so this remains a candidate.
- `legacy_api_v1_cloud` — new. Because this tenant IS ManageEngine Cloud,
  this representation is tested FIRST and is now the workflow default.

### Implementing Representation B without corrupting the boundary

The Cloud-specific page's `Content-Type: multipart/form-data` requirement is
real, but a hand-set literal Content-Type header on a FormData body omits
the boundary parameter fetch would otherwise generate — producing an
invalid multipart request. `buildLegacyCloudUploadForm`/
`buildLegacyCloudUploadHeaders` solve this the same way the existing
`/emsapi/files` variants already do: build a native `FormData`, and leave
`Content-Type` UNSET so `fetch` supplies
`multipart/form-data; boundary=...` itself. That is how the documented
requirement is satisfied safely. Proven by a test asserting no
`content-type` key (any case) appears in the sent headers at all.

**The multipart field name is `file`.** The Cloud-specific page confirms
the body is multipart but does not itself name a field in what was
supplied for this task. Per explicit instruction, `file` is used as the
conservative, already-documented ManageEngine Cloud upload field (the same
one `cloud_file` already uses against `/emsapi/files`) — stated in code
comments, the module doc, the workflow comment, and here as a diagnostic
assumption, never as a proven contract. Only a live dispatch settles it.

### Structural isolation, not shared plumbing

Per instruction, `legacy_api_v1_cloud` does NOT reuse
`legacy_api_v1_raw_example`'s header/body builders — each has its own
(`buildLegacyRawUploadHeaders` vs `buildLegacyCloudUploadForm`/
`buildLegacyCloudUploadHeaders`), and each runs through its own top-level
function (`runLegacyApiV1RawExample` vs `runLegacyApiV1Cloud`), so the two
representations can never drift into each other by accident. The one piece
they DO share on purpose — `reportLegacyUploadResult`, extracted this round
— is response handling: reading the body, reporting status, and applying
the lossless `file_id` strategy. That logic is correctness-critical and
identical in contract for both variants (same response shape, same
precision-loss risk), so sharing it is what PREVENTS the two
implementations from diverging on id safety, rather than a blurring of the
request-side isolation the task called for. A dedicated test proves the two
variants differ in body type (`Blob` vs `FormData`) and `content-type`
presence while hitting the identical endpoint path.

Existing `/emsapi/files` variants (`cloud_file`, `legacy_fileName`,
`cloud_file_with_customer`) are untouched — their code path in `run()` is
gated behind the two new early-return branches and never reached by either
legacy variant, and all their existing tests pass unmodified.

### Tests added

20 new/renamed cases in `tools/mdm/probe-upload.test.ts` (Representation A's
existing 14 tests renamed to the new variant string with unchanged
assertions; Representation B gets its own parallel suite: endpoint, exact
header set including the no-Content-Type proof, FormData field/MIME/
filename, no X-Customer, no MDM_CUSTOMER_ID requirement, the documented
failure/success shapes, large and small `file_id` handling, the fail-closed
path, secret redaction, and the create/update guarantee); plus a
cross-variant suite proving same endpoint + different transport + exactly
one upload attempt per run + the retired name no longer resolves. 4 new
cases in the workflow-pinning suite (five-variant list and default, the
retired name absent from the workflow file).

### Round 15 gate

```
npx jest tools/mdm --runInBand → 142 passed
pnpm typecheck        → PASS
pnpm lint             → PASS
pnpm format:check     → PASS
pnpm check:docs       → PASS (94 files)
pnpm check:ci-scripts → PASS (5 workflows, 10 checks)
node -e (js-yaml)     → all 5 workflow files parse
git diff --check      → clean
git diff -- tools/mdm/publish-app.ts tools/mdm/publish-app.test.ts → empty
```

Not claimed: that `legacy_api_v1_cloud`, `legacy_api_v1_raw_example`, or
`/api/v1/mdm/files` generally, works for this tenant. Only that the two
contradictory documented representations are now correctly separated,
`legacy_api_v1_cloud` is the higher-priority untested candidate for this
Cloud tenant, and the multipart-field-name assumption is stated honestly as
an assumption rather than implied to be proven. `tools/mdm/publish-app.ts`
remains untouched.
