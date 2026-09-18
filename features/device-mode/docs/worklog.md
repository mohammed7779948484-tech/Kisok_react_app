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
