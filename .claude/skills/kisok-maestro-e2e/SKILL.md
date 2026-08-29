---
name: kisok-maestro-e2e
description: When and how to write Maestro end-to-end flows for KISOK — flow organization, testID selector conventions, deterministic state preparation, secret handling, smoke versus feature E2E, local and CI commands, and the evidence a PR must show. Use this when adding or changing a .maestro flow, when deciding whether a feature needs device-level end-to-end coverage, or when a PR claims Maestro evidence.
---

# Maestro end-to-end flows

Maestro drives the real app on a real Android device or emulator. It is the only
check in this repository that exercises what a person in the store actually
touches — and the slowest, so it is label-gated rather than run on every PR.

Everything here lives in `.maestro/`. Read `.maestro/README.md` too; this skill
is the judgement, that file is the local convention.

## Does this feature need a flow?

Add one only when a failure would be **invisible to every other check**:

- a multi-screen journey whose steps are individually tested but never together
- **native** behaviour — persistence across a cold start, backgrounding,
  rotation, the on-screen keyboard
- a safety invariant with real consequences. Checkout above all: an ambiguous
  submission must never produce two orders, and no unit test can prove that on a
  real device

Do not add a flow to re-test what a component test already covers. A slow suite
that duplicates fast checks gets ignored, and then the one flow that mattered is
ignored with it.

**Never write a flow for a feature that does not exist yet.** A flow that cannot
run is not coverage; it makes the suite look like it protects something it does
not. Add the flow with the feature, in the same change.

## Organisation

One flow per journey, named `<feature>-<journey>.yaml`:

```
.maestro/flows/
  smoke-app-launches.yaml
  catalog-browse-and-add-to-cart.yaml
  checkout-submits-one-order-on-retry.yaml
```

Flows must be **independent** — any order, any subset. A flow that only passes
after another one ran is a flow that will fail confusingly in CI.

## Select by testID, never by text

```yaml
- tapOn:
    id: "cart-submit" # stable
- tapOn: "Place order" # breaks when the copy changes
```

Copy changes for product reasons. A suite that breaks on wording teaches people
that failures are noise, which is how a real failure gets waved through.

The `testID` is part of the contract: add it to the component in the same change
as the flow, and treat removing one as a breaking change.

## Prepare state explicitly

```yaml
- launchApp:
    clearState: true
```

Always start from a known state. A flow that passes only on a device someone
already signed in on is not a test — it is a coincidence. If a flow needs data,
it must create it through the UI or through a documented seeding step.

Cold starts on a store tablet are slower than on a dev machine; prefer
`extendedWaitUntil` with a generous timeout over a bare assertion, so a slow
boot is not reported as a broken feature.

## Secrets

No credentials in a flow, ever — these files are committed. Test accounts come
from environment variables the runner injects (`MAESTRO_*`). If a flow cannot
run without a real store account, say so in the PR rather than committing one.

## Running

```bash
maestro test .maestro/flows                            # all
maestro test .maestro/flows/smoke-app-launches.yaml    # one
```

In CI: add the **`e2e`** label to a pull request, or dispatch the _Android E2E_
workflow. It prebuilds, assembles a **release** APK, boots a tablet-profile
emulator and runs every flow.

Release, not debug: a debug APK carries no JS bundle (`debuggableVariants`
defaults to `["debug"]`), so it needs a Metro server and Maestro would only ever
time out. If you change that step, keep the check that asserts the APK contains
`assets/index.android.bundle`.

Write the `appId` out in the flow. Maestro substitutes `${...}` only from values
passed with `-e`, so a shell environment variable is left as a literal and every
selector silently targets nothing. `pnpm check:e2e-appid` fails the build if a
flow interpolates it or names an app this build does not produce.

## Evidence

A PR claiming Maestro coverage must show the command, its result, and where it
ran — emulator image or device model. "Maestro passes" with nothing behind it is
exactly the kind of claim the quality audit exists to catch.

If you could not run the flows — no emulator, no device — say that plainly
instead. An admitted gap is useful; an unverified claim is worse than silence.
