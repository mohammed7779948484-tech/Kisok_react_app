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
real tenant. See "Explicitly not verified" below.

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
android-build / "Android prebuild check" (label-gated): SUCCESS on be1e961
  https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/35295784503
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
Maestro flows                                                  : SKIPPED — honest skip, not a pass.
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
