# KioskRuntime — implementation plan

**HOW the brief gets built.** Written with the `kisok-feature-plan` skill after
research, and before generating anything beyond this workspace.

Status: `READY`

`READY` — the Lead Planning Review pass is complete (requirements, AC mapping,
shape, task graph, skills, test/runtime strategy, document consistency, and
integration plan were re-checked; AC-01's task mapping was the one gap found
and fixed). Implementation may begin.

`DRAFT` → no implementation task may start. Set `READY` only when the checklist
at the bottom of this file is fully satisfied. If a material decision changes
later — an acceptance criterion, the shape, a dependency, a scaffold — return to
`DRAFT`, reconcile this file and `todo.md`, then restore `READY`.

There is no fourth gate: `TASK`, `ROUND` and `FEATURE` are the gates. This
status is the implementation-readiness signal.

## Research synthesis

Five READ-ONLY evidence packets were gathered on 2026-09-02 (recorded in the
feature's `docs/worklog.md` research phase). Conclusions load-bearing for this
plan, each with its primary source:

- **Kiosk enforcement is DPC/MDM-owned, not app-owned.** Dedicated devices are
  fully managed; lock-to-app is delivered by lock task mode with a
  DPC-allowlisted app set; the app cannot and must not self-enforce it.
  Screen pinning is user-exitable and is NOT an enforcement boundary.
  [developer.android.com/work/dpc/dedicated-devices + /lock-task-mode, last
  updated 2026-03-05]
- **One-APK dual-role mechanism exists**: `android:lockTaskMode="if_whitelisted"`
  on the activity — identical to `always` when the DPC allowlists the package,
  identical to `normal` otherwise. Non-privileged `always`/`never` are treated
  as `normal`. [developer.android.com/guide/topics/manifest/activity-element,
  2026-07-06]
- **Managed configurations today**: declare
  `<meta-data android:name="android.content.APP_RESTRICTIONS"
android:resource="@xml/app_restrictions"/>` in `<application>`; read via
  `RestrictionsManager.getApplicationRestrictions()` (disk I/O — read once at
  start/resume and cache; returns null when absent; bundle holds only
  explicitly-set keys, never XML defaults); changes broadcast
  `Intent.ACTION_APPLICATION_RESTRICTIONS_CHANGED` to **dynamically registered**
  receivers only (manifest receivers unsupported; no listener API exists in the
  SDK — verified against the live RestrictionsManager reference 2026-08-03);
  `UserManager.KEY_RESTRICTIONS_PENDING` may appear transiently → treat as
  not-yet-applied. Android 14+ allows multiple managing admins, but the legacy
  read returns DPC-set restrictions and ManageEngine is the DPC — acceptable,
  documented limitation. [developer.android.com/work/managed-configurations,
  2025-02-18; RestrictionsManager reference, 2026-08-03]
- **Read-only corroboration**: any app may call
  `DevicePolicyManager.isLockTaskPermitted(pkg)` (permission-free) and
  `ActivityManager.getLockTaskModeState()` → `LOCKED` vs `PINNED` vs `NONE`
  (`PINNED` never counts as enforced kiosk). The app will never call
  `startLockTask`/`stopLockTask`.
  [DevicePolicyManager / ActivityManager references, 2026-08-28/2026-08-03]
- **Expo SDK 54 integration contracts** (verified against the installed
  `expo@54.0.37` / `expo-modules-core` in this repo's `node_modules`): local
  modules autolink from `./modules/`; `expo-module.config.json` =
  `{"platforms":["android"],"android":{"modules":["<fqcn>"]}}`; JS loads with
  `requireOptionalNativeModule` (SDK 54 name — there is no
  `OptionalRequireNativeModule`); module DSL `AsyncFunction` +
  `Events("onRestrictionsChanged")` + `OnStartObserving/OnStopObserving`
  receiver lifecycle; JS subscribes via `module.addListener(...).remove()`;
  config plugins: `withAndroidManifest` +
  `AndroidConfig.Manifest.addMetaDataItemToMainApplication(..., 'resource')`,
  and `withDangerousMod` writing `res/xml` (no first-class res/xml mod).
  [docs.expo.dev modules/get-started, module-config, module-api,
  config-plugins/plugins + mods + dangerous-mods, 2026 dates; installed
  node_modules type defs]
- **CNG policy**: `android/` is generated and gitignored (verified in this
  repo's `.gitignore`); `expo prebuild --clean` regenerates it; all native
  customization must flow through app config + plugins + local modules.
  [docs.expo.dev/workflow/continuous-native-generation, 2026-07-20]
- **Release build/sign**: `expo prebuild` → `./gradlew app:assembleRelease` →
  `android/app/build/outputs/apk/release/app-release.apk`; the Expo template
  signs release with the **checked-in debug keystore** by default (the e2e
  workflow depends on this); the documented override is a guarded
  `signingConfigs.release` block reading `MYAPP_UPLOAD_*` gradle properties;
  `android.versionCode` comes from app config (NOT expo-build-properties in
  SDK 54); verify with `apksigner verify --print-certs` and
  `aapt2 dump badging`. [docs.expo.dev/guides/local-app-production,
  reactnative.dev/docs/signed-apk-android, docs.expo.dev versions/v54 config
  - build-properties; expo-template-bare-minimum sdk-54 build.gradle]
- **ManageEngine MDM Cloud product**: QR-template enrollment provisions Fully
  Managed (Device Owner); Single-App Kiosk profile requires Device Owner;
  in-house ("Android Enterprise App") APKs upload to the App Repository and
  silently install on Fully Managed devices **without Google Play publishing**;
  managed app configurations ARE supported for in-house apps when the app
  declares the restrictions schema (Configurations tab appears on upload);
  updates = "Add new version"/Upgrade action (silent on DO), versionCode must
  strictly increase, signature must never change, **no downgrade path** (remove
  - redistribute, app data erased); re-distributing a Kiosk profile pins the
    app version from profile creation (updated app must be distributed
    separately); recovery = Pause Kiosk / recovery key / chat commands; offline
    kiosk devices stay locked. Free edition = 25 devices, 1 technician, and
    includes kiosk, Android Enterprise, Enterprise Apps, REST APIs (edition
    matrix 2025-04-03; help pages last updated 2026-07/08).
    [manageengine.com/mobile-device-management/help/...]
- **MDM REST API + Zoho OAuth**: scopes are `MDMOnDemand.MDMDeviceMgmt.*` +
  `MDMOnDemand.MDMInventory.READ` (there is NO `MDMCloud.MDMAPI`); Cloud API
  base `https://mdm.manageengine.com/api/v1/mdm/*` (per data centre — US/EU/IN/
  AU/CN/JP/CA/UK/SA; DC chosen by console URL); file upload
  `POST {base}/emsapi/files` with header `Module: MDM_APP_MGMT` and multipart
  key **`file`** → `fileID` → poll `/emsapi/fileupload/status` until
  `fileStatus 2`; create app `POST /api/v1/mdm/apps` `{app_name, app_type: 2,
app_file, supported_devices}`; add version
  `PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}` with
  `force_update_in_label`; channels `POST /api/v1/mdm/labels`
  `{"channel_name":"Beta"}`; associate
  `POST /api/v1/mdm/groups/{group_id}/apps`
  `{"app_details":[{app_id,release_label_id}],"silent_install":true}`;
  production promotion `POST .../approve` with `distribute_update` — **not
  called by our automation**; status
  `GET /api/v1/mdm/devices/{device_id}/apps/{app_id}`; auth header
  `Authorization: Zoho-oauthtoken <token>`; token = refresh-token exchange at
  `https://accounts.zoho.<dc>/oauth/v2/token` (access token 1 h; refresh token
  permanent until revoked; 10 token requests / 10 min throttle); app-management
  rate limit ~60 calls/min with 5-min lock (HTTP 429 / `COM0002`); error shape
  `{error_code, error_description}`. Zoho's exposed-credentials policy counts
  **logs as exposure** and revokes — mask token-derived values, never echo
  raw token responses. [manageengine.com/mobile-device-management/api + help
  /api/cloud/*, zoho.com/developer/oauth/*, 2026]
  **Recovery revalidation (2026-09-03, fresh read-only researcher, current
  official `mobile-device-management/api/*` docs; evidence packet in the
  feature's worklog research phase)**: (a) the current docs show the upload
  response itself carrying `fileStatus: 2` and document NO
  `/emsapi/fileupload/status` polling endpoint — T11 confirms upload
  completion from the upload response's `fileStatus` instead of a polling
  loop; (b) app-create (`POST /api/v1/mdm/apps`) now documents
  `app_category_id` and `release_label_id` as additional Required arguments
  — T11 resolves a category id and passes the Beta label id at create
  time; (c) the multipart key is `file` in the docs prose (code examples
  use `fileName` — the written contract is used and the discrepancy
  recorded); (d) App Repository reads document only STRING versions
  (`GET /api/v1/mdm/apps` list: top-level `version`, per-label
  `release_labels[].app_version`) — the monotonic pre-check compares the
  incoming version against the existing app's documented version fields,
  with the server remaining the authority on the versionCode increase;
  (e) 429/`COM0002`/error envelope are confirmed, while the numeric
  "60/min, 5-min lock" figures are not stated in current docs and are
  treated as conservative soft limits for backoff. No AC, feature shape,
  or task-graph change results; the plan stays `READY` (Lead consistency
  re-check of the changed lines only).
- **GitHub Actions safety**: secrets are available to **same-repo** PR runs
  (fork protection does not help) → gate release jobs by trigger
  (workflow_dispatch / tags), not by "PRs don't get secrets"; unset secret →
  empty string, and secrets cannot be used in `if:` → the documented
  fail-closed primitive is env-var + explicit non-empty check + `exit 1`;
  environment secrets unlock only for jobs referencing the environment (+
  required reviewers when configured — available for public repos on
  Free/Pro/Team; this repository is public); a typo'd environment name creates
  an UNPROTECTED environment implicitly; `workflow_dispatch` only fires when
  the workflow file is on the default branch; pin `pull_request` (never
  `pull_request_target`), `permissions: contents: read`,
  `persist-credentials: false`; artifacts: `upload-artifact@v7`,
  `if-no-files-found: error`; release-scoped concurrency group.
  [docs.github.com actions security/environments/events/concurrency +
  actions READMEs, 2026-09-02]

Repository facts verified directly by the Lead (see worklog): package
`com.kisok.kiosk` in `app.config.ts`; Expo ~54.0.37 / RN 0.81.5; CNG confirmed
(`/android`, `/ios` gitignored; no native dirs tracked); root routing in
`app/_layout.tsx` uses `Stack.Protected` with `useAuth()`; the reusable
fail-closed sign-out pipeline exists at `core/auth/sign-out.ts` +
`core/auth/use-sign-out-action.ts` (guards → handoff marker → cleanup →
recovery); tiered CI (`ci.yml` fast tier, label-gated `android-build.yml` /
`android-e2e.yml`; e2e builds a release APK signed by the template's debug
keystore — the signing plugin must stay inert when no signing env is present);
`pnpm verify` baseline is green on this clone; jest `testMatch` is
`**/*.test.ts(x)` (tools tests colocated as `.ts` will run; `.mjs` imports do
NOT work under jest — probed, failed — so tool scripts are TypeScript run by
Node 24 native type-stripping, verified working locally with
`node <file>.ts`).

## Design decisions

1. **MDM owns kiosk enforcement; the app only reads state.** The app never
   calls `startLockTask`/`stopLockTask`; the activity declares
   `android:lockTaskMode="if_whitelisted"` so the SAME manifest is
   self-locking on DPC-allowlisted (store) tablets and a normal app on
   employee tablets. Rejected: app-level "kiosk mode" navigation locks and
   screen pinning — user-exitable, not a security boundary (AC-04).
2. **Device policy = managed configuration, fail-closed.** The MDM pushes a
   `kiosk_device_role` restriction through ManageEngine's App Configurations
   (supported for in-house apps). Derivation rule:
   `kiosk ⇔ restrictions["kiosk_device_role"] === "customer_kiosk" ||
lockTaskPermitted === true`; everything else (missing key, invalid value,
   pending marker, empty bundle) → `standard`. The lock-task-allowlist
   corroboration makes a provisioned-but-unconfigured store tablet fail
   CLOSED (kiosk, never preparation) rather than open. An explicit
   `"standard"` value combined with an allowlist contradiction resolves
   toward kiosk — safety first; downgrading a store tablet is an MDM action
   (remove the allowlist), not an app-config toggle. Rejected: keyguard or
   `isDeviceOwnerApp`-based detection — keyguard is screen state, and the
   device-owner check identifies the MDM agent, not KISOK's management state.
3. **Change handling: read-on-resume + runtime receiver.** Snapshot is read on
   cold start, on AppState active, and on `onRestrictionsChanged` (native
   dynamically-registered receiver → module event → JS re-read, per current
   Android guidance; no listener API exists). `restrictions_pending` marks a
   provisional snapshot → treated as standard until a later read corrects it.
4. **Maintenance credential comes from the managed config, not Supabase.**
   Restriction keys: `kiosk_device_role` (string — a `choice` type was
   considered and rejected: it requires res/values array resources for no
   enforcement gain, since the app validates the value anyway; the MDM console
   presents a text field), `maintenance_unlock_code`
   (string — visible to MDM admins in the console; `hidden` risks the console
   not rendering a settable field), `maintenance_unlock_timeout_seconds`
   (integer, clamped 15–600, default 90). The code is compared inside the
   feature store (`tryUnlock`), never exposed via the public API, never
   logged, never persisted. Unlock state is ephemeral in memory, cleared on
   timeout, AppState background, and account switch. Rejected: a Supabase
   role/credential check — device policy must stay independent of backend
   auth (AC-02), and admin-provisioned accounts are a web-admin concern.
5. **Account switching reuses the shared pipeline.** The maintenance panel and
   the mismatch screen both use `useSignOutAction()` from `@/core/auth` — the
   guards/handoff/cleanup/recovery pipeline is the safety property. No
   parallel sign-out implementation (AC-06).
6. **Root safety via a pure resolver.** `resolveRootTarget(auth, role, policy)`
   (pure, in `model/`) decides which navigator target is visible; the app
   consumes it through the feature-exposed hook `useRootTarget()`
   (`state/use-root-target.ts` — subscribes to the store's policy role,
   combines `useAuth()`, calls the pure resolver). Reason (Lead amendment
   2026-09-02, pre-T07): `.claude/rules/routes.md` + eslint block Zustand
   imports in `app/**` — "Own the store inside the feature and expose a
   hook" — so the barrel exports `useRootTarget`, `useDevicePolicySync`, and
   `KioskMaintenanceOverlay` only; the raw store stays feature-private.
   `app/_layout.tsx` maps the target to `Stack.Protected` guards. This keeps
   the shared-file diff minimal, the logic table-testable, and
   standard-device behavior provably unchanged (AC-03/AC-04).
   `app/index.tsx`'s role redirect becomes target-driven through the same
   hook — without it, a preparation session on a kiosk would redirect to the
   then-unregistered `(preparation)` group and land on `+not-found`, which
   violates AC-03. Routing-only diff; same source of truth as the layout
   guards.
7. **Native integration through a local Expo module + config plugin.**
   `modules/kiosk-policy` (Android-only) exposes
   `getDevicePolicySnapshot()` (AsyncFunction — restrictions read is disk I/O)
   and `onRestrictionsChanged` (Events; receiver registered in
   `OnStartObserving`, unregistered in `OnStopObserving`). Its
   `app.plugin.js` adds the `APP_RESTRICTIONS` meta-data, writes
   `res/xml/kiosk_restrictions.xml`, and sets `lockTaskMode="if_whitelisted"`
   on the main activity. Rejected: editing generated `android/` files (CNG
   violation) or a third-party managed-config package (unvetted, and the
   schema is three keys).
8. **Release signing is plugin-injected and env-guarded.**
   `plugins/with-android-release-signing.ts` reads
   `MYAPP_UPLOAD_*` env at prebuild time, writes gradle properties, and adds
   the `hasProperty`-guarded `signingConfigs.release` block (the documented
   Expo/RN pattern). With no env (local dev, e2e CI) the block is inert and
   the template default (debug-signed release) is preserved — the e2e
   workflow keeps working unchanged. Fail-closed lives in the workflow +
   scripts (explicit secret-presence checks, exit 1) — the plugin never
   guesses. Secrets are written only into the generated, gitignored,
   ephemeral `android/` tree on the runner; the keystore is decoded from a
   base64 secret after prebuild. (AC-07)
9. **Release artifacts are verified before delivery.** The release workflow
   runs `tools/release/verify-release-apk.ts` (Node 24 native TS) asserting
   package `com.kisok.kiosk`, expected `versionCode`/`versionName` from the
   evaluated app config, a non-debug signing certificate
   (`apksigner verify --print-certs`), and an embedded JS bundle
   (`assets/index.android.bundle`). (AC-08)
10. **MDM automation is upload-only, beta-first, fail-closed.**
    `tools/mdm/upload-beta.ts` (Node 24 native TS, unit-tested with mocked
    `fetch`) implements: token exchange (masked), optional dry-run
    (read-only: list apps/groups), two-phase APK upload (file → fileID,
    completion confirmed from the upload response's `fileStatus` — current
    docs carry no polling endpoint; see research synthesis revalidation),
    app create-or-update (app_type 2, with the documented Required
    `app_category_id` and Beta `release_label_id` on create), version
    monotonic pre-check (incoming version compared against the existing
    app's documented string version fields; the server remains the
    authority on the Android versionCode increase), Beta release label,
    association to exactly the configured non-production group with
    `silent_install: true`, 429/COM0002 backoff. It REFUSES to run without
    a group id, refuses the production group id, and contains no call to
    `approve`/`distribute_update`. The workflow takes a prior
    `android-release` run id as input and re-verifies the downloaded artifact —
    the build workflow is the only builder, and a human inspects the artifact
    between build and upload. (AC-09)
11. **Workflows are manual-trigger only.** `android-release.yml` and
    `mdm-beta-upload.yml` are `workflow_dispatch`-only (dispatch requires
    write access; no push/PR trigger can ever reach signing or MDM secrets).
    `permissions: contents: read`, `persist-credentials: false`,
    release-scoped concurrency, Node 24 (native TS execution for the tools;
    verified locally). Production deployment automation is explicitly absent
    and gated behind documented activation prerequisites in
    `docs/mdm-operations.md`. (AC-07/AC-09/AC-10)
12. **`main` branch remains untouched; PR targets `develop`.** No integration
    branch edits; the draft PR lifecycle begins when push credentials are
    provided (external dependency — see Verification).

## Data contract

No Supabase read, write, RPC, or Realtime is used by this feature. The only
"contracts" are:

| Contract                       | Direction       | Owner                                      | Shape                                                                                                                                                                                                       |
| ------------------------------ | --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android managed configurations | read            | Android OS / ManageEngine MDM (DPC writes) | `Bundle` of explicitly-set keys: `kiosk_device_role` ("customer_kiosk" \| "standard"), `maintenance_unlock_code` (string), `maintenance_unlock_timeout_seconds` (integer)                                   |
| Lock-task corroboration        | read            | Android OS (DPC allowlist)                 | `DevicePolicyManager.isLockTaskPermitted("com.kisok.kiosk")`: boolean; `ActivityManager.getLockTaskModeState()`: "none"\|"locked"\|"pinned"                                                                 |
| ManageEngine MDM REST          | write (CI only) | GitHub-hosted workflow, never the app      | Token exchange `POST https://accounts.zoho.<dc>/oauth/v2/token`; app repository operations under `https://mdm.manageengine.<dc>/api/v1/mdm/*` + `/emsapi/files` — exact endpoints in the research synthesis |

Realtime: N/A — Realtime is Preparation-only and this feature performs no
Supabase subscription. Device-policy change events arrive through the native
module, not Realtime.

## Feature shape decision

Every capability gets an explicit YES or NO with a reason.

| Capability   | Needed? | Evidence / reason                                                                                                                                                                             |
| ------------ | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model/schema |     YES | The native snapshot needs a validated boundary (Zod) before derivation; derivation is pure domain logic — `model/` is exactly this.                                                           |
| query        |      NO | No Supabase read. Device policy is not server state; a query hook would be architecture theatre.                                                                                              |
| mutation     |      NO | No Supabase write.                                                                                                                                                                            |
| store        |     YES | Device policy + maintenance session are client-owned state shared by the root navigator, overlay, and mismatch screen — it outlives any single screen. Ephemeral: deliberately NOT persisted. |
| component    |     YES | Maintenance affordance, unlock/panel sheet, and the root overlay are feature-private presentational units reused across screens/surfaces.                                                     |
| screen       |     YES | The kiosk mismatch screen is a routed, testable screen.                                                                                                                                       |
| realtime     |      NO | Preparation-only policy; N/A — and the generator rejects `shared` realtime anyway.                                                                                                            |
| route        |     YES | `app/kiosk-mismatch.tsx` renders the mismatch screen; it is the one file this feature legitimately owns outside its directory.                                                                |

Routes are planned explicitly, one line each:

```
route path → role/group → target screen → existing placeholder or new file
app/kiosk-mismatch.tsx → shared (top-level) → kiosk-mismatch → new file (nothing occupies the path; no --force)
```

No placeholder replacement, so no `--force` anywhere in this feature. The
Foundation placeholders in `app/(customer)/index.tsx` and
`app/(preparation)/index.tsx` are left for the Catalog/Preparation features —
this feature must not touch them.

## Generator commands, mapped to tasks

The exact commands, in order, each mapped to the task that uses it. **The Lead
runs each one immediately before delegating that task** — not all of them up
front. Generate only what the shape actually needs.

| Generator command                                                                        | Task |
| ---------------------------------------------------------------------------------------- | ---- |
| `pnpm generate schema kiosk-runtime device-policy`                                       | T02  |
| `pnpm generate store kiosk-runtime device-policy`                                        | T03  |
| `pnpm generate screen kiosk-runtime kiosk-mismatch`                                      | T05  |
| `pnpm generate route kiosk-runtime kiosk-mismatch --role=shared --screen=kiosk-mismatch` | T05  |
| `pnpm generate component kiosk-runtime maintenance-entry`                                | T06  |
| `pnpm generate component kiosk-runtime maintenance-sheet`                                | T06  |
| `pnpm generate component kiosk-runtime kiosk-maintenance-overlay`                        | T06  |

The native module, config plugins, tool scripts, workflows, and docs are NOT
generator capabilities — they are planned manual artifacts (below), scaffolded
by the Lead (T01 module files) or created inside the owning task's scope.

Allowed manual files (with the reason no capability fits):

- `modules/kiosk-policy/**` — Expo local Android module + its `app.plugin.js`.
  No KISOK generator capability produces Expo local modules; the Expo
  scaffolder (`create-expo-module --local`) is interactive and emits more than
  needed (iOS dir, view templates). The Lead scaffolds the minimal planned
  files (T01) and records them as SCAFFOLD evidence.
- `plugins/with-android-release-signing.ts` — an Expo config plugin; no
  capability covers repo-level release plumbing.
- `features/kiosk-runtime/model/derive-device-policy.ts` (+ test) — pure
  derivation rules; the `schema` capability generates the Zod boundary only.
- `features/kiosk-runtime/model/root-guard.ts` (+ test) — pure routing
  resolver; domain rules are the documented manual case.
- `features/kiosk-runtime/state/use-root-target.ts` (+ test) — the hook the
  app consumes instead of the store (routes rule: expose a hook, not the
  store); state/ is the store-subscription layer, so it is the planned home.
- `features/kiosk-runtime/native/policy-source.ts`,
  `features/kiosk-runtime/native/use-device-policy-sync.ts` (+ tests) — the
  feature's platform IO boundary and its wiring hook; `api/` is for Supabase
  only, `model/` forbids IO, so `native/` is the planned home.
- `tools/release/verify-release-apk.ts` (+ test) — release verification CLI
  run by Node 24 type-stripping; jest cannot import `.mjs` (probed), so the
  script is TypeScript, colocated-tested, self-contained.
- `tools/mdm/upload-beta.ts` (+ test) — MDM upload CLI, same constraints.
- `.github/workflows/android-release.yml`,
  `.github/workflows/mdm-beta-upload.yml` — GitHub workflows; no capability.
- `features/kiosk-runtime/docs/mdm-operations.md` — the ManageEngine
  operational contract (AC-10).
- `app/_layout.tsx` (edit), `app/index.tsx` (edit — target-driven redirect;
  Lead amendment pre-T07, see Design decision 6), `app.config.ts` (edit),
  `.gitignore` (edit) — the only shared-file changes, listed and justified
  below.

## Files expected to change

Anything outside `features/kiosk-runtime/` must be listed and justified —
shared files are where parallel agents collide.

- `app.config.ts` — add two plugin references (`./modules/kiosk-policy/app.plugin.js`,
  `./plugins/with-android-release-signing.ts`); no other edits. Additive;
  required because CNG has no other native-configuration channel.
- `app/_layout.tsx` — mount the device-policy sync hook + maintenance overlay,
  and replace the inline role guards with the `resolveRootTarget` mapping
  (adding the `kiosk-mismatch` guard). Routing-level device-policy safety has
  no feature-local alternative; the diff is kept to the guard section and two
  imports.
- `.gitignore` — add `*.keystore` (the existing patterns cover `*.jks` etc. but
  not `.keystore`, and the template's `debug.keystore` is currently only safe
  by virtue of living in the ignored `android/` tree).
- `.github/workflows/android-release.yml` (new), `.github/workflows/mdm-beta-upload.yml` (new) —
  manual dispatch only; existing workflows untouched.
- `modules/kiosk-policy/**` (new top-level directory) — the Expo local-module
  convention (`./modules` is the autolinking search root).
- `plugins/with-android-release-signing.ts` (new `plugins/` directory) — the
  Expo local-plugin path convention.
- `tools/release/**`, `tools/mdm/**` (new tool directories) — release/MDM
  tooling, consistent with existing `tools/` layout.
- NOT changed: `core/**`, `components/**`, `features/auth/**`,
  `features/catalog/**`, `features/preparation/**`, `app/(customer)/**`,
  `app/(preparation)/**`, `app/sign-in.tsx`, `app/unauthorized.tsx`,
  `supabase/**`, `tools/generator/**`, existing workflows,
  `package.json` (no new scripts or dependencies — the workflows invoke the
  tools with plain `node`).

## Required skills

- `test-driven-development` — every task.
- `kisok-design-system` — T05, T06 (mismatch screen, maintenance UI).
- `kisok-react-native-rules` — T04, T06, T07 (AppState/event subscriptions,
  timers, overlay rendering).
- `expo-router` — T07 (root layout `Stack.Protected` guards; note: vendored
  skill covers SDK-56+ features too — KISOK is SDK 54; treat iOS/SDK-56+
  material as not applicable).
- `expo-dev-client` — T01 (native module build knowledge; KISOK policy wins —
  no EAS/TestFlight/iOS workflows are introduced).

## Test strategy

What is worth a test and why — behaviour, contracts, state transitions, safety
invariants, accessibility; not coverage for its own sake.

- **Derivation (AC-02)** — table-driven tests over snapshot fixtures: empty
  bundle, explicit `customer_kiosk`, explicit `standard`, invalid value,
  `restrictions_pending`, allowlist-only corroboration, allowlist +
  explicit-standard contradiction (→ kiosk), maintenance code/timeout parsing
  and clamping. The invariant under test: nothing except affirmative signals
  yields kiosk, and auth state is never an input.
- **Store (AC-02/AC-05/AC-06)** — snapshot application and role transitions;
  `tryUnlock` right/wrong code; unlock cleared by timeout, background, and
  account switch; **zero calls into `@/core/storage`** (the maintenance code
  and unlock state must never persist — asserted with a mocked storage
  surface).
- **Policy source (AC-02)** — with the native module mocked: initial read,
  event-driven re-read, AppState-background clears the maintenance session;
  web/no-native fallback yields standard.
- **Root guard resolver (AC-03/AC-04)** — table tests over
  (auth status × profile role × policy role) → expected visible target; the
  standard-device rows must equal today's behavior exactly.
- **Mismatch screen (AC-03/AC-06)** — renders for preparation-on-kiosk with a
  sign-out control wired to the shared `useSignOutAction` (blocked/failed
  message surfaced); asserts it renders nothing data-backed (no loading/empty
  states it cannot have).
- **Maintenance UI (AC-05)** — entry visible only on kiosk; long-press opens
  unlock; wrong code shows retry state; unlock expires; panel's switch-account
  uses the shared sign-out action; accessibility labels present; the managed
  code never appears in any rendered output or log sink (silent logger sink
  per repo test rules).
- **Release verification script (AC-07/AC-08)** — env validation fails closed
  (missing/empty secret → non-zero + named variable); badging parsing (package,
  versionCode, versionName); debug-certificate rejection; bundle-presence
  check; version expectations compared against an evaluated app-config fixture.
- **MDM upload script (AC-09)** — mocked `fetch`: token exchange (masked —
  token value never in output), dry-run performs GETs only, two-phase upload,
  app create/update payloads (app_type 2, Beta label), monotonic versionCode
  refusal, group-refusal (missing/production), silent_install association,
  429/5xx backoff, error envelope parsing. No network in tests.
- **Static safety (AC-04)** — a repository-wide search for
  `startLockTask`/`stopLockTask` in app-owned code (feature + app + core +
  components) returns nothing (the native module exposes read-only
  corroboration only).
- **Runtime (browser, tablet sizes)** — standard-path regression: the app
  signs in/roles/routes exactly as before; no maintenance affordance renders;
  no console errors. Kiosk-specific UI is component-tested (a web kiosk
  override was rejected — a shipped flag that force-enables kiosk is a
  fail-open hazard).
- **Android native** — prebuild output inspection (manifest meta-data,
  `res/xml`, `lockTaskMode`, module autolink) is local; Kotlin compilation and
  emulator behavior are label-gated CI (`android-build`), and physical kiosk
  behavior is explicitly unverified (no hardware).

## Rounds and tasks

Group tasks so each round leaves the feature coherent. Every task is atomic:
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE.

### Round 1 — Device-policy foundation (native → model → store → source)

| Task | Mode     | Acceptance              | Objective                                                                                                                                                                | Depends on         | Entry evidence                                                                                                                                                                                                |
| ---- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01  | config   | Supporting AC-02, AC-01 | Expo local module `modules/kiosk-policy` (snapshot + change event, read-only) + config plugin + app config wiring (package `com.kisok.kiosk` untouched, no flavor split) | —                  | `npx expo prebuild --platform android --no-install --clean` succeeds; generated manifest has APP_RESTRICTIONS meta-data + `lockTaskMode`; `res/xml/kiosk_restrictions.xml` exists; typecheck/lint/tests green |
| T02  | behavior | Acceptance: AC-02       | `model/` device-policy Zod schema + pure fail-closed derivation                                                                                                          | T01 (module types) | failing derivation tests (module absent)                                                                                                                                                                      |
| T03  | behavior | Acceptance: AC-02       | `state/` device-policy store: apply snapshot, role, ephemeral maintenance session (unlock/clear), no persistence                                                         | T02                | failing store tests (no snapshot application / unlock behavior)                                                                                                                                               |
| T04  | behavior | Supporting AC-02        | `native/` policy source + sync hook: module wrapper, web/test fallback, AppState + event-driven refresh, background clears maintenance                                   | T03                | failing source tests (mocked module; no refresh/clear behavior)                                                                                                                                               |

### Round 2 — Kiosk safety UI and maintenance (routing + screens)

| Task | Mode            | Acceptance               | Objective                                                                                                                                                                                                                                                                                   | Depends on    | Entry evidence                                                                                                    |
| ---- | --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| T05  | behavior        | Acceptance: AC-03        | Kiosk mismatch screen + `app/kiosk-mismatch.tsx` route; safe sign-out via the shared pipeline                                                                                                                                                                                               | T03           | failing screen test (screen/route absent)                                                                         |
| T06  | behavior        | Acceptance: AC-05        | Maintenance UI: entry affordance (long-press), unlock sheet, panel with switch-account; ephemeral session rules                                                                                                                                                                             | T03           | failing component tests (components absent)                                                                       |
| T07  | behavior-change | Acceptance: AC-03, AC-04 | Root integration: `resolveRootTarget` resolver + `useRootTarget` hook + `app/_layout.tsx` guard rewrite + overlay mount + `app/index.tsx` target-driven redirect; verification includes the repository-wide static search proving no app-owned `startLockTask`/`stopLockTask` calls (AC-04) | T04, T05, T06 | failing resolver tests stating the NEW behavior (preparation-on-kiosk → mismatch) while standard rows match today |

### Round 3 — Signed release delivery (signing, verification, MDM automation, docs)

| Task | Mode     | Acceptance                          | Objective                                                                                                                                                                 | Depends on       | Entry evidence                                                                                    |
| ---- | -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| T08  | config   | Supporting AC-07                    | Release-signing config plugin (env-guarded) + `.gitignore` `*.keystore` + app config wiring                                                                               | —                | prebuild with env → guarded signing block + properties present; without env → absent (e2e compat) |
| T09  | behavior | Acceptance: AC-08, Supporting AC-01 | `tools/release/verify-release-apk.ts`: fail-closed env validation + APK verification logic (package identity `com.kisok.kiosk`, versions, non-debug cert, bundle) + tests | —                | failing script tests (module absent)                                                              |
| T10  | config   | Supporting AC-07                    | `.github/workflows/android-release.yml`: dispatch-only build, secret checks, verify, artifact                                                                             | T08, T09         | workflow YAML parses; `pnpm verify` green (check:ci-scripts scans it); structural review          |
| T11  | behavior | Acceptance: AC-09                   | `tools/mdm/upload-beta.ts`: MDM client (token/upload/app/associate/status), dry-run, refusal rules, masking + tests                                                       | —                | failing script tests (module absent)                                                              |
| T12  | config   | Supporting AC-09                    | `.github/workflows/mdm-beta-upload.yml`: dispatch-only, artifact download by run id, re-verify, upload (dry-run default)                                                  | T09, T11         | workflow YAML parses; `pnpm verify` green; structural review                                      |
| T13  | config   | Acceptance: AC-10                   | `docs/mdm-operations.md`: ManageEngine operational contract + activation prerequisites + unverified list                                                                  | T01–T12 evidence | `pnpm verify` green (check:docs); content cross-checked against research packets                  |

Rounds 1 and 3 tasks have disjoint file scopes (feature/native vs
tools/workflows/docs) and no dependency between T08–T13 and Round 1/2 other
than T13's content; execution stays sequential per Lead preference (no
parallel implementation — single implementer chain, dependencies explicit).

## Risks

| Risk                                                                                                               | Likelihood | Mitigation                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expo prebuild` side effects dirty shared files (script/dependency mutation)                                       | medium     | Run prebuild with `EXPO_NO_GIT_STATUS=1`, then `git status` — restore any tracked change (android/ is untracked/ignored); recorded per run in the worklog.                      |
| ManageEngine managed-config delivery timing to sideloaded in-house APKs on Device Owner devices (research unknown) | medium     | Read-on-resume + event receiver; re-distribution guidance in mdm-operations.md; hardware verification explicitly pending.                                                       |
| ME console does not render `hidden` restriction types → maintenance code unconfigurable                            | low        | Use `string` type for `maintenance_unlock_code` (visible to MDM admins only); documented in mdm-operations.md.                                                                  |
| Android 14+ multi-admin restrictions not visible via legacy read                                                   | low        | ManageEngine is the DPC; legacy read returns DPC-set restrictions. Documented limitation; per-admin API noted as future work.                                                   |
| Template release-APK signing (debug keystore) silently used for a production artifact                              | medium     | AC-07/AC-08: explicit secret-presence checks in the workflow + debug-cert rejection in the verification script.                                                                 |
| No GitHub push credentials in this environment → branch/PR/CI evidence blocked                                     | certain    | Recorded as an explicit external dependency; all local gates proceed; PR + CI on final HEAD are pending-external items in the handoff (never claimed as PASS without evidence). |
| MDM OAuth secrets exist only as GitHub Actions secrets → live dry-run cannot run from here                         | certain    | Script logic unit-tested with mocked fetch; live dry-run is a documented human action in mdm-operations.md (non-destructive, authorized).                                       |
| Emulator cannot be provisioned as ManageEngine Device Owner → kiosk runtime unverified on emulator                 | certain    | Component/resolver tests + explicit unverified list; android-build CI proves compilation; physical tablet verification documented as prerequisite before production activation. |
| Rate limiting (60/min app ops, token throttle) on MDM API                                                          | low        | Script polls sparsely, backs off on 429 (documented contract), one token exchange per run.                                                                                      |
| Native module Kotlin correctness without local Android SDK                                                         | medium     | Code reviewed against researched API contracts; android-build CI (label-gated) compiles it once PR CI runs; failure = fix-in-task loop.                                         |

## Verification

- `pnpm verify` after every task (typecheck, lint, format, tests, docs,
  commits, appId, ci-scripts, db:verify(local SKIPPED without PostgreSQL),
  generator smoke).
- Browser runtime at tablet sizes (landscape + portrait): standard-path
  regression — sign-in and both role routings unchanged; no kiosk overlay.
- Android native tier: local `expo prebuild` content inspection (every
  config-mode task); Kotlin compile + emulator behavior via the label-gated
  `android-build` job once the PR exists (pending push credentials).
- Maestro: N/A — no new normal-device user journey; kiosk journeys cannot run
  on an unmanaged emulator (documented).
- CI on final HEAD: pending external push credentials — explicitly recorded,
  never claimed.
- Live MDM dry-run: human action documented in mdm-operations.md (authorized,
  non-destructive); not runnable from this environment.

## `DRAFT` → `READY`

Set the status at the top to `READY` only when every line here is true.

- [x] Acceptance criteria complete, stable IDs, each mapped to at least one task
- [x] Feature shape matrix complete; every YES justified
- [x] Data contracts verified — no Supabase contract is claimed; the external
      contracts (Android/Expo/ManageEngine/Zoho/GitHub) are pinned to current
      primary sources in the research synthesis
- [x] Every generator command mapped to a task
- [x] Manual-only artifacts justified
- [x] Dependencies coherent
- [x] Route mappings known, target screen named
- [x] Changes outside `features/kiosk-runtime/` listed and justified
- [x] No unnecessary capability or folder planned
