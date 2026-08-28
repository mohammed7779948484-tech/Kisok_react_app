# CI and quality gates

The point: an agent's PR should get **fast, automatic evidence** that it did not
break the foundation — without needing any secret.

## Every PR — `.github/workflows/ci.yml`

| Job            | What it proves                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **verify**     | typecheck, lint (including the architecture boundaries), formatting, the test suite, documentation freshness, the database types against the migrations, and the generator smoke test |
| **web-export** | `expo export --platform web` still bundles — the preview workflow agents depend on                                                                                                    |
| **doctor**     | `expo-doctor` dependency alignment                                                                                                                                                    |

### The two checks that could quietly become theatre

Both of these could pass without proving anything, so both are built to tell the
difference between "checked and fine" and "could not check".

**`db:verify`** applies the migrations to a throwaway PostgreSQL and compares
the committed database types against the result. Locally, a machine without
PostgreSQL reports `SKIPPED` and exits 0 — no reason to block a commit. In CI
that leniency would be dangerous: if the runner stopped shipping PostgreSQL the
job would go permanently green while verifying nothing. So CI sets
`KISOK_DB_VERIFY_REQUIRED=1` and "could not run" becomes a failure. A mismatch
fails in both modes.

**`expo-doctor`** compares against Expo's hosted compatibility service, so it
can fail for reasons outside a PR's control. `tools/doctor.mjs` treats a run as
inconclusive only when **every** failing check is one that cannot run without a
remote service, and the output shows a transport problem. A real version
mismatch still fails, even when unrelated network noise appears in the same run
— excusing everything because "network" appeared somewhere is how a genuine SDK
mismatch gets swallowed.

Locally, `pnpm verify` runs the same checks as the `verify` job.

## On request — `.github/workflows/android-build.yml`

An Android prebuild and debug APK. It runs **only** when a PR carries the
`android-build` label or someone dispatches it manually, because it is far
slower than the fast tier and most changes do not need it.

**Request it for anything touching native configuration** — `app.config.ts`
plugins, SDK or dependency versions, permissions, or a new dependency with native
code.

## On request — `.github/workflows/android-e2e.yml`

Maestro flows against a tablet-profile emulator, gated on the **`e2e`** label. It
prebuilds, assembles a debug APK, boots the emulator and runs `.maestro/flows`.

Minutes of runtime, so it is not on every PR: paying that on a docs change
trains everyone to ignore the result. See [`.maestro/README.md`](../.maestro/README.md)
for when a feature actually deserves a flow.

## Design notes

- **No secrets.** Ordinary validation uses placeholder Supabase values, so any
  contributor's PR gets the same signal. `expo export` needs no login.
- **The web bundle is primed first.** `pnpm export:web` runs
  `tools/prime-nativewind-cache.mjs` before bundling. NativeWind writes
  its CSS cache _during_ the build, but Metro resolves it beforehand, so the
  first export after a fresh install fails on a file that does not exist yet.
  This only ever bites CI and a fresh clone — never a warm dev machine — which
  is exactly the class of failure CI exists to catch.
- **`pull_request`, never `pull_request_target`.** The latter runs with the base
  repo's token against PR-authored code.
- **`permissions: contents: read`** at workflow level; nothing writes.
- **`persist-credentials: false`** on checkout — no job pushes, so no token
  should be left in `.git/config`.
- **`concurrency`** cancels superseded runs for the same PR.
- **pnpm is installed before `setup-node`**, which is required for
  `cache: pnpm` to find it. Reversing the order silently disables caching.
- **`--frozen-lockfile`** is explicit rather than relying on CI auto-detection.

## Dependabot

`.github/dependabot.yml` groups updates so the repo gets a couple of reviewable
PRs a week instead of dozens.

**Expo SDK packages are grouped together and must move as a set.** Never merge a
single `expo-*` or `react-native-*` bump on its own — see
[adr/0001-expo-sdk-version.md](./adr/0001-expo-sdk-version.md).
