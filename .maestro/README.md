# Maestro end-to-end flows

Maestro drives the real app on a real Android device or emulator. It is the only
check here that exercises what a person in the store actually touches.

## When a feature deserves a flow

Add one when a failure would be invisible to every other check:

- a multi-screen journey whose steps are individually tested but never together
- anything where **native** behaviour matters — persistence across a cold start,
  backgrounding, orientation
- a safety invariant with real consequences, above all **checkout**: an ambiguous
  submission must never produce two orders

Do NOT add a flow to re-test what a component test already covers. Maestro runs
are slow and are gated behind a label for that reason.

## Conventions

- **One flow per journey**, named `<feature>-<journey>.yaml`.
- **Select by `testID`**, never by visible text — copy changes, and a flow that
  breaks on wording trains people to ignore failures. Add `testID` to the
  element in the component; it is part of the contract the flow depends on.
- **Prepare state explicitly.** `clearState: true` on launch. A flow that only
  passes on a device someone already used is not a test.
- **Write the `appId` out; never interpolate it.** Maestro substitutes `${...}`
  only from values passed with `-e`, so a shell environment variable is left as
  a literal and every selector in the flow silently targets nothing.
  `pnpm check:e2e-appid` reads `BUNDLE_ID` from `app.config.ts` and fails the
  build if a flow interpolates its appId or names a different app.
- **No secrets in a flow.** Credentials come from environment variables the
  runner injects (`MAESTRO_*`); never commit an account.
- Keep flows **independent** — any order, any subset.

## Running

```bash
# Local, against a running emulator or attached device
maestro test .maestro/flows

# One flow
maestro test .maestro/flows/smoke-app-launches.yaml
```

CI runs these in the label-gated `android-e2e` workflow — add the `e2e` label to
a pull request. They do not run on every PR: an emulator boot plus a native
build is minutes of runtime, and paying that on a docs change trains everyone to
ignore the result.

## Evidence

A PR claiming Maestro coverage must paste the command and its result, and say
which device or emulator image it ran on.

## Authenticated Catalog → Cart acceptance

`catalog-review-cart.yaml` uses the documented disposable TEST backend and
Customer account. It requires `MAESTRO_CUSTOMER_EMAIL` and
`MAESTRO_CUSTOMER_PASSWORD` in the environment; no account is written in the
flow. Use a TEST release APK. CI reads/masks the documented login and injects
these variables. The flow never submits an order or seeds backend data.

The journey adds one available selection, reviews it, returns to browsing,
reopens Quick Cart and reviews again. It compares line identity and item counts.
Animations must remain enabled for this navigation/portal regression.

The label-gated CI runner executes each flow independently, saves native logs,
process evidence, view hierarchy and screenshots under
`android-runtime-evidence`, and requires the same app process throughout each
journey. Missing process evidence fails verification. Maestro is pinned and
expanded login values are redacted from text diagnostics before upload.
