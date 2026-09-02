# KioskRuntime — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

## Objective

Make the SAME KISOK Android app (one APK, package `com.kisok.kiosk`) behave
safely as either a store **Customer Kiosk tablet** or a normal **Employee
tablet**, with the kiosk boundary owned by Android Enterprise / ManageEngine
MDM Cloud rather than by JavaScript — and add a GitHub-controlled,
fail-closed release pipeline that produces a release-signed APK and can
deliver it through the ManageEngine Enterprise (in-house) App Repository to a
non-production group first, with production deployment deliberately manual and
undone.

Today the app has no device-policy identity: any tablet that signs in a
`preparation` account reaches the Preparation experience, and there is no
signed-release delivery path at all. After this feature, a Customer Kiosk
tablet stays a customer device (even signed out, even if a `preparation`
account signs in), an Employee tablet behaves exactly as it does today, and a
human can ship a verified signed APK to managed devices without Google Play.

## User-visible behaviour

- **Store Customer tablet** (Android Enterprise Fully Managed / Dedicated,
  Single-App Kiosk, pushed by ManageEngine): the device is locked to KISOK by
  the MDM. Signing out shows the sign-in screen inside the same locked device —
  the app never exits or weakens device kiosk. A customer account signs in and
  uses the customer experience. If a `preparation` account signs in on this
  device, the app shows a mismatch screen (this is a customer tablet) with a
  safe sign-out action — never the Preparation experience.
- **Store staff on a Customer tablet**: a deliberate long-press on a small
  corner affordance opens a maintenance unlock prompt. Entering the
  MDM-managed maintenance code unlocks a maintenance panel offering **Switch
  customer account**, which runs the existing safe sign-out pipeline (handoff
  guards, cleanup, recovery) and returns to the sign-in screen. The unlock is
  ephemeral: it clears after a timeout, when the app goes to the background,
  and when the account is switched. The code is never shown, logged, or stored
  beyond the app's memory.
- **Employee tablet** (normal Android, with or without ordinary MDM
  management): the app behaves exactly as today — role-based routing,
  preparation experience reachable for `preparation` accounts, no forced
  lock-task or pinning behaviour of any kind.
- **Release delivery (human-operated)**: a maintainer manually dispatches a
  GitHub workflow that builds a release-signed APK, verifies package identity,
  version, and signature, and publishes it as a build artifact. A second manual
  workflow (dry-run by default) can upload that APK to the ManageEngine App
  Repository as an enterprise app on a Beta channel and associate it with a
  non-production device group with silent install. Production rollout is not
  automated by this feature.

## Acceptance criteria

Each one must be observable and checkable. These become tests.

**IDs are stable.** Every task in `plan.md` links to one by ID. Once the plan is
`READY`, never renumber or reuse an ID: a new criterion gets a new ID, and a
removed one stays here marked superseded, with the reason. Renumbering silently
invalidates every reference in `worklog.md`.

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                                | Observable how                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | One Android package remains: the app still declares `com.kisok.kiosk` with a single customer/preparation code path; no split apps, flavors, or per-role builds are introduced.                                                                                                                                                                           | `app.config.ts` unchanged package; built APK `aapt2 dump badging` reports `com.kisok.kiosk`; review of the diff shows no build-variant split.                                                                   |
| AC-02 | Device policy is derived fail-closed from MDM signals, independent of Supabase auth: the app treats a device as a **customer kiosk** only when the MDM-pushed managed configuration explicitly says so (or the DPC lock-task allowlist corroborates it); missing, invalid, pending, or contradictory values leave the device **standard**.               | Unit tests of the pure derivation over restriction-bundle fixtures; the derivation never reads auth/session state; on a real managed tablet — explicitly unverified without hardware (see Evidence).            |
| AC-03 | On a customer-kiosk device the Preparation experience is unreachable: even when a `preparation` account signs in successfully, the app shows the kiosk mismatch screen with a safe sign-out, and never mounts the `(preparation)` experience.                                                                                                            | Component/routing tests with a mocked device policy; derivation tests; runtime web preview with the policy source stubbed to kiosk.                                                                             |
| AC-04 | On a standard device the current role-based routing behaviour is preserved exactly, and the app contains no self-initiated lock-task / screen-pinning enforcement (no `startLockTask`/`stopLockTask` calls anywhere in app code).                                                                                                                        | Existing routing/auth tests stay green; new tests assert standard-device routing is unchanged; static search of the codebase for lock-task invocation calls returns only the native read-only detector; review. |
| AC-05 | Maintenance unlock on a customer kiosk is deliberate (long-press affordance), requires the MDM-managed code (never a Supabase credential), is never logged or persisted to client storage, and clears on timeout, background, or account switch.                                                                                                         | Component tests for the affordance and unlock flow; store tests for the ephemeral maintenance session; logging call sites reviewed; runtime preview on the stubbed-kiosk policy.                                |
| AC-06 | "Switch customer account" reuses the existing sign-out/handoff safety pipeline (guards, cleanup tasks, durable handoff marker) rather than duplicating auth cleanup.                                                                                                                                                                                     | Tests assert the shared sign-out action is used (same failure surfaces: blocked/failed/unsafe messages); review confirms no parallel sign-out implementation.                                                   |
| AC-07 | The release build path fails closed: when required Android signing material (keystore + passwords) is absent, the release workflow exits non-zero with a precise message; it never silently produces a debug-signed production artifact.                                                                                                                 | Unit tests of the fail-closed secret validation; workflow inspection (explicit presence checks, no fallback values); release-verification script tests.                                                         |
| AC-08 | The release pipeline verifies the built APK before delivery: package identity `com.kisok.kiosk`, expected `versionCode`/`versionName` from the app config, a release (non-debug) signing certificate, and an embedded JS bundle.                                                                                                                         | Unit tests of the APK verification logic; the verification script runs in the release workflow and fails on any mismatch (CI evidence or explicitly unverified without push credentials).                       |
| AC-09 | MDM delivery automation is non-production-first: the upload script targets only a Beta release label and a non-production device group, refuses a missing or production group target, supports a no-mutation dry-run mode, and never calls production approve/distribute operations.                                                                     | Unit tests with mocked HTTP of the MDM client (endpoint shapes, group refusal, dry-run, masking); workflow inspection; a live dry-run is a human action documented in the operational contract.                 |
| AC-10 | The ManageEngine operational contract is documented from current official sources: enrollment for dedicated devices, Single-App Kiosk profile, in-house app upload + managed app configuration, silent install prerequisites, update/rollback rules, recovery, and the explicit activation prerequisites for any future automatic production deployment. | `features/kiosk-runtime/docs/mdm-operations.md` exists, cites current official ManageEngine/Android documentation, and lists the unverified-on-hardware items.                                                  |

State requirements are **capability-aware**. Put a state into an AC only when
that feature can actually reach it — inventing an empty state for a screen that
cannot be empty produces a test asserting something impossible.

| If the feature has…   | The states to specify                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| the mismatch screen   | signed-in-as-preparation on kiosk (the only reachable state — it is not data-backed) |
| maintenance unlock    | idle, wrong code (retry), unlocked, unlocked-then-expired                            |
| the maintenance panel | ready, sign-out pending, sign-out blocked/failed (surfaced from the shared pipeline) |

## General delivery requirements

These are Definition-of-Done checks, not extra Acceptance Criteria, so they do
not get fake AC IDs and tasks do not link to them as if they described product
behaviour.

- [x] Applicable read/mutation states above are handled (this feature adds no
      Supabase read or mutation; its screens are local-only).
- [x] Works at the tablet sizes in `docs/design-system.md` (landscape and
      portrait) — verified in runtime evidence.
- [x] Accessible: roles and labels on interactive elements; no colour-only
      meaning (maintenance affordance carries an accessibility label; unlock
      failures are announced, not just coloured).

## Scope

- A device-policy runtime for the app: native managed-configuration reading,
  lock-task corroboration (read-only), a fail-closed derivation, an app-wide
  store, and root routing/maintenance integration.
- One new Expo local Android module (with its config plugin) that exposes the
  policy snapshot and change events to JS.
- Maintenance UI (affordance, unlock, panel) and the kiosk mismatch screen.
- A release signing config plugin, an Android release workflow, an MDM
  Beta-upload workflow with a testable Node client, and the ManageEngine
  operational contract document.

## Out of scope

Be explicit. This is what stops a feature growing while it is being built.

- Prices, payments, delivery, shipping, public signup, social login — permanent
  product boundaries, not deferrals. See `docs/product-boundaries.md`.
- **No Supabase change of any kind** — no schema, RPC, RLS, grant, or Realtime
  change; device policy is intentionally independent of backend auth.
- No Catalog or Preparation business behaviour or UI redesign; no changes under
  `features/catalog/**`, `features/preparation/**`, `app/(customer)/**`, or
  `app/(preparation)/**` (the root `app/_layout.tsx`, `app/index.tsx` (edit —
  target-driven redirect, Lead amendment pre-T07, see the plan's Design
  decision 6), and a new top-level route file are the only `app/` changes).
- No Flutter-reference research or parity work (`KISOK_FLUTTER_PRODUCT_REFERENCE.md`
  is not a source for this feature).
- No custom DPC, Device Owner implementation, launcher replacement, or Android
  Management API backend — MDM/Android Enterprise owns enforcement.
- No Screen Pinning or app-initiated lock-task as a security boundary.
- No public Google Play publishing, no Google Play Developer account, no EAS
  Update, no in-app self-updater.
- No automatic production deployment or unconditional push-triggered releases.
- No physical-tablet verification claims (no hardware exists; see Evidence).

## Constraints

- Backend contracts come from `supabase/migrations/*.sql`. If an RPC you need
  does not exist there, STOP and raise it — do not invent one. This feature
  expects to need none.
- Never weaken RLS, add a grant, or write a security-definer workaround.
- **Kiosk enforcement is MDM-owned.** The app never calls `startLockTask` /
  `stopLockTask`; it only _reads_ lock-task state as corroboration, per current
  Android documentation (Lock Task Mode vs Screen Pinning).
- Native integration must stay compatible with the repository's CNG policy:
  no committed `android/` tree; native behaviour flows through app config
  plugins and Expo local modules only.
- Release signing material never enters the repository, logs, or artifacts; CI
  fails closed when it is absent.
- ManageEngine MDM REST/OAuth contracts come from current official
  documentation (as researched 2026-09-02): `Zoho-oauthtoken` bearer header,
  `MDMOnDemand.*` scopes, `https://mdm.manageengine.com/api/v1/mdm/*` (per data
  centre), two-phase `/emsapi/files` upload. Live tenant verification is
  authorized only as non-destructive dry-run.
- GitHub Actions secrets `MDM_CLIENT_ID`, `MDM_CLIENT_SECRET`,
  `MDM_REFRESH_TOKEN` are expected for the MDM workflow; signing secrets
  (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`) must be created by the human. Secret values are never
  read, echoed, or written into documents.

## Evidence

Link what this brief is based on: migration files, the Flutter reference for
BEHAVIOUR only, existing screens, research findings.

- Research Evidence Packets (2026-09-02), scopes A–E, recorded in the feature's
  `docs/worklog.md` research phase and synthesized in the feature's `docs/plan.md`:
  Android Enterprise/Dedicated Devices/Lock Task/Managed Configurations
  (developer.android.com, last-updated dates 2025-02 → 2026-08); Expo SDK 54
  local modules / config plugins / CNG / release signing (docs.expo.dev,
  reactnative.dev, installed `node_modules` verified); ManageEngine MDM Plus
  Cloud kiosk / Enterprise App Repository / editions (manageengine.com help,
  last-updated 2026-07/08); ManageEngine MDM REST API + Zoho OAuth
  (manageengine.com API docs, zoho.com/developer, 2026); GitHub Actions
  secrets/environments/release safety (docs.github.com, 2026).
- Repository facts verified directly: `app.config.ts` (package
  `com.kisok.kiosk`, Expo ~54.0.37 plugins, `newArchEnabled`, CNG with
  gitignored `android/`), `core/auth/sign-out.ts` +
  `core/auth/use-sign-out-action.ts` (the reusable fail-closed sign-out
  pipeline), `app/_layout.tsx` (`Stack.Protected` role routing),
  `.github/workflows/{ci,android-build,android-e2e}.yml` (tiered CI, label
  gates, release-APK e2e), `docs/ci.md` (main currently unprotected),
  `docs/environment.md` (committed `.env`, shared hosted TEST project,
  `EXPO_PUBLIC_ENVIRONMENT`).
- **Explicitly unverified until real hardware/tenant actions exist** (recorded,
  never claimed as PASS): physical Fully Managed ownership and Single-App
  Kiosk escape prevention; boot/auto-relaunch into kiosk; physical silent
  install/update N→N+1; MDM managed-config delivery timing to the app on a
  real tablet; physical maintenance flow. Live MDM dry-run and GitHub CI runs
  require external credentials (GitHub push token; MDM OAuth secrets exist only
  as GitHub Actions secrets) and are documented as human follow-ups.
