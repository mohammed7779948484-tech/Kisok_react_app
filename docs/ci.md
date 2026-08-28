# CI and quality gates

The point: an agent's PR should get **fast, automatic evidence** that it did not
break the foundation — without needing any secret.

## Every PR — `.github/workflows/ci.yml`

| Job            | What it proves                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| **verify**     | typecheck, lint (including the architecture boundaries), formatting, the test suite, and the generator smoke test |
| **web-export** | `expo export --platform web` still bundles — the preview workflow agents depend on                                |
| **doctor**     | `expo-doctor` dependency alignment (advisory, non-blocking)                                                       |

The doctor job captures its report into the job summary and **always
succeeds**. It compares against Expo's hosted compatibility manifest, so it goes
red for reasons outside a PR's control — a network hiccup, or Expo publishing a
patch release an hour earlier. `continue-on-error` alone is not enough there:
the check run still reports failure, and a check that is permanently red teaches
everyone to ignore red. Read its findings in the job summary.

Locally, `pnpm verify` runs the same checks as the `verify` job.

## On request — `.github/workflows/android-build.yml`

An Android prebuild and debug APK. It runs **only** when a PR carries the
`android-build` label or someone dispatches it manually, because it is far
slower than the fast tier and most changes do not need it.

**Request it for anything touching native configuration** — `app.config.ts`
plugins, SDK or dependency versions, permissions, or a new dependency with native
code.

## Design notes

- **No secrets.** Ordinary validation uses placeholder Supabase values, so any
  contributor's PR gets the same signal. `expo export` needs no login.
- **The web bundle is primed first.** `pnpm export:web` runs
  `ignite/scripts/prime-nativewind-cache.mjs` before bundling. NativeWind writes
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
