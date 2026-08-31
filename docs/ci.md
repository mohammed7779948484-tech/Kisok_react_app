# CI and quality gates

The point: an agent's PR should get **fast, automatic evidence** that it did not
break the foundation — without needing any secret.

## Every PR — `.github/workflows/ci.yml`

| Job            | What it proves                                                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **verify**     | typecheck, lint (including the architecture boundaries), formatting, the test suite, documentation freshness, the commit convention, the Maestro appId, the workflow script invocations, the database types against the migrations, and the generator smoke test |
| **web-export** | `expo export --platform web` still bundles — the preview workflow agents depend on                                                                                                                                                                               |
| **doctor**     | `expo-doctor` dependency alignment                                                                                                                                                                                                                               |

### Two different commit checks, deliberately

They are not the same guarantee, and neither substitutes for the other:

| Check                                  | Lints                          | Answers                                                                                                                        |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check:commits`                   | 13+ hard-coded sample messages | do the RULES behave — is `feat(order-v2)` accepted, is a shapeless subject rejected, did someone reintroduce a scope registry? |
| `commitlint --from <base> --to <head>` | this PR's real commits         | does the history actually follow the convention?                                                                               |

The sample check is not commit enforcement, and calling it that would be the
kind of claim this repository is built to avoid. The `commit-msg` hook is
bypassed by `--no-verify`, so the range lint in CI is what makes the convention
binding. Policy: **every commit on a PR must be a Conventional Commit**, not
just the eventual merge subject.

### A check that ran nothing at all

The doctor job invoked `pnpm doctor`. pnpm has a **built-in `doctor`
subcommand**, which shadows the package script: the job checked pnpm's own
installation, printed nothing, and exited 0 without ever running
`tools/doctor.mjs`. It would have stayed green if the script were deleted. It is
now `pnpm run doctor`, and `pnpm check:ci-scripts` fails the build on any
workflow step whose `pnpm <name>` resolves to a pnpm subcommand instead of this
project's script.

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

Locally, `pnpm verify` runs every **package-script** check the `verify` job
runs — and that is enforced, not asserted: `pnpm check:ci-scripts` compares the
two sets and fails if they diverge. It used to be false in both directions, and
every document claiming `pnpm verify` and the CI verify job checked the same
things was quietly wrong.

The verify job runs one thing `pnpm verify` cannot: `commitlint --from <base>
--to <head>` over this PR's actual commit range (see the table above). That
step only makes sense against a real base/head pair, so it cannot be a
package script `pnpm verify` calls locally — `pnpm check:commits` is the local
stand-in, and it checks the RULES against sample messages, not this branch's
real history. `pnpm verify` is still the local package-script check set
mirrored by CI, worth running as you work — it is not a precondition for
opening the draft PR, which happens early (see
[feature-workflow.md](./feature-workflow.md)), and it does not replace what CI
does with the commit range.

## On request — `.github/workflows/android-build.yml`

An Android prebuild and debug APK. It runs **only** when a PR carries the
`android-build` label or someone dispatches it manually, because it is far
slower than the fast tier and most changes do not need it.

**Request it for anything touching native configuration** — `app.config.ts`
plugins, SDK or dependency versions, permissions, or a new dependency with native
code.

## On request — `.github/workflows/android-e2e.yml`

Maestro flows against a tablet-profile emulator, gated on the **`e2e`** label. It
prebuilds, assembles a **release** APK, boots the emulator and runs
`.maestro/flows`.

Release, not debug, and the reason is load-bearing: React Native's Gradle plugin
only embeds the JS bundle for variants outside `debuggableVariants`, which
defaults to `["debug"]`. A debug APK therefore expects a Metro server and shows
"Unable to load script" without one, so Maestro would time out waiting for a
screen that never renders. The workflow asserts the APK really contains
`assets/index.android.bundle` rather than trusting that. Expo's template signs
the release variant with the checked-in debug keystore, so this needs no
secrets.

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

## Protecting `main` — required before parallel feature agents

`main` is currently **unprotected**, and no check in this repository can change
that: branch protection is a repository setting, and the pre-commit hook is a
convenience that `--no-verify` walks past. It must be configured by someone with
admin access before several agents start working from `main` at once.

Settings → Branches → add a rule for `main`:

- **Require a pull request before merging.**
- **Require status checks to pass**, and select these three — they run on every
  PR and need no secrets, so any contributor gets the same signal:

  | Check       | Job name                                                         |
  | ----------- | ---------------------------------------------------------------- |
  | Verify      | `Verify (typecheck, lint, format, tests, guards, db, generator)` |
  | Web bundle  | `Web bundle`                                                     |
  | Expo doctor | `Expo doctor`                                                    |

- **Do not require the Android jobs.** `Android build` and `Android E2E` are
  label-gated and normally skipped; a required check that usually does not run
  blocks every PR. Request them with the `android-build` and `e2e` labels, and
  make them part of the feature gate rather than a merge rule.
- **Block direct pushes** (do not allow bypass for administrators unless there
  is a specific reason).

The job names above are the display names in `ci.yml`. If a job is renamed, the
required check silently stops matching and protection quietly weakens — so
rename a job and its required check together.
