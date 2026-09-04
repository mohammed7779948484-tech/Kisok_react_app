# KioskRuntime — implementation plan

**HOW the brief gets built.** Written with the `kisok-feature-plan` skill after
research, and before generating anything beyond this workspace.

Status: `READY` (remediation amendment 2026-09-04 — see "Remediation amendment" at
the end; the original plan below is preserved as history and remains accurate
for T01–T13)

`READY` — the remediation amendment's Lead Planning Review is complete: the
seven research packets are synthesized in `review.md`, every load-bearing
primary source was Lead-spot-checked, IR-01…IR-09 all carry verdicts, every
confirmed finding maps to an owned task (T14–T20) or an explicit non-code
disposition, no external contract is guessed, and current-develop integration
is scheduled before final verification. Remediation implementation may begin
with T14.

`READY` (historical, for T01–T13) — the Lead Planning Review pass is complete
(requirements, AC mapping, shape, task graph, skills, test/runtime strategy,
document consistency, and integration plan were re-checked; AC-01's task
mapping was the one gap found and fixed). Implementation may begin.

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
    `permissions: contents: read` (plus `actions: read` on the MDM upload
    workflow, which downloads the prior run's artifact through the Actions
    API — minimal sufficient, documented in-file), `persist-credentials: false`,
    release-scoped concurrency, Node 24 (native TS execution for the tools;
    verified locally). Production deployment automation is explicitly absent
    and gated behind documented activation prerequisites in
    the feature's `docs/mdm-operations.md`. (AC-07/AC-09/AC-10)
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

## Remediation amendment (2026-09-04) — post-gate review IR-01…IR-09

The prior Feature Gate was reopened by an independent review. SEVEN fresh
read-only researchers (batches 3+2+2) returned Evidence Packets; the Lead
spot-checked every load-bearing primary source personally. The verdict matrix,
per-finding evidence, and the full synthesis live in `review.md` ("Remediation
research synthesis"). This amendment derives the remediation task graph from
that research — not from memory. T01–T13 above are immutable history.

### Remediation design decisions

RD-01. **Policy readiness is a store-owned verdict (IR-01).** The device-policy
store gains `readiness: "pending" | "resolved"` (initial `pending`). Only these
resolve it: (a) a completed, schema-valid, NON-provisional snapshot applied;
(b) a null snapshot from `policy-source` (module absent: web/jest — the
standard default IS the platform verdict; web/test can never hang). These hold
it at `pending`: a provisional (`restrictions_pending`) snapshot, a
schema-REJECTED snapshot (policy still fails closed to the standard default and
the maintenance session still clears — AC-02 unchanged at the policy level),
and a read failure (readiness unchanged — a failed read carries no evidence).
`resolveRootTarget` gains an explicit `policyReadiness` parameter with exactly
ONE new row: `ready + preparation + standard + not-resolved → "startup"` —
every existing row is byte-identical (behavior-change discipline; AC-04).
`useRootTarget` reads `policy.role` + `policy.readiness` through the existing
store subscription. The layout/index need no new machinery — the existing
`startup` target renders StartupScreen (`app/index.tsx`'s case exists; its
"unreachable" comment is corrected). Rejected: resolving unresolved→standard
for routing (the prior accepted-risk — R1 disproved its "disk ~ms" premise:
Android documents "may take several seconds"); gating the
customer/sign-in/unauthorized rows (no invariant at stake; employee-facing
flows must not be delayed); a timeout that resolves to standard (re-opens the
kiosk hole — hold-closed is invariant-faithful; exit paths are the
restrictions-change event and AppState-active re-read, both already
implemented).
[developer.android.com/work/managed-configurations 2025-02-18; UserManager
getApplicationRestrictions/KEY_RESTRICTIONS_PENDING 2026-08-28; installed
expo-router@6.0.24 Protected.js = primitives.Group (render-time,
removal-after-change)]

RD-02. **Live lock-task state is an affirmative, non-provisional kiosk signal
(IR-01 hardening).** `deriveDevicePolicy` gains `lockTaskModeState ===
"locked"` as kiosk corroboration equal to `lockTaskPermitted` — and NOT
suppressed by `restrictions_pending`: the restrictions bundle may be
provisional, but `getLockTaskModeState()` is a live OS query in the same
snapshot (LOCKED = "Full lock task mode is active", DPC-enforced). This
shortens the pending window on real kiosks (mismatch instead of hold) and
closes the provisioned-but-unconfigured gap harder. PINNED is never kiosk
(user-exitable screen pinning). Employee tablets can never be LOCKED (no DPC
allowlist) — AC-04 unchanged.
[developer.android.com/work/dpc/dedicated-devices/lock-task-mode 2026-03-05;
ActivityManager reference 2026-08-03]

RD-03. **MDM list walking follows the documented envelope (IR-03).** Never send
`?page=` (documented nowhere). Prefer `paging.next` (full URL) when the
response carries it; else step with the documented `limit`/`offset` query
params; terminate on absent `paging.next`, on accumulating
`metadata.total_record_count`, on a short page (< 50), or on matching the
target app; `MAX_LIST_PAGES` bound retained (fail closed). A response with an
`apps`/`groups` array but NO envelope is tolerated exactly as the docs' own
apps example shows (short-page termination) — but a page LONGER than 50
without an envelope fails closed (termination unknowable). The group list is
replaced by `GET /api/v1/mdm/groups/{group_id}` details where a single group is
needed (the current unpaged full-list walk had its own >50 drift).
[manageengine.com/mobile-device-management/api/pagination/, server
Last-Modified 2026-03-24; Lead spot-checked]

RD-04. **Pre-mutation group validation with positive name verification
(IR-04).** BOTH flows (dry-run and real) resolve the target group read-only
BEFORE any mutation: `GET /api/v1/mdm/groups/{group_id}` — 200 + parse →
validate; non-200 or unparseable → the group is treated as missing → REFUSE
(non-zero). A NEW required input `--expected-group-name` /
`MDM_EXPECTED_GROUP_NAME` (workflow dispatch input `group-name`, required,
early-validated like `group-id`) pins the expected exact group `name` (the
documented field — the current code reads `group_name`, which appears nowhere
in current docs): a resolved group whose name does not match the expected name
refuses. No documented group-type distinguishes production from
non-production, so the positive identification is id + exact name (the
strongest the documented contract supports). The optional
`production-group-id` denylist is RETAINED as belt-and-braces. The dry-run now
exits NON-ZERO whenever a real run could not proceed safely (missing/mismatched
group) — a truthful dry-run. [api/groups: group_id/name/group_type/domain;
GET /groups/{group_id}; Lead spot-checked]

RD-05. **Beta label reuse before create (IR-05).** The update path (app
exists) reuses the app's existing Beta label id from its documented
`release_labels[]` (match `release_label_name === "Beta"`). `POST
/api/v1/mdm/labels` is issued ONLY when the target app has no existing Beta
label (the create path, or an existing app with no Beta label). A
duplicate-channel POST error fails closed with a named error (the duplicate
behavior is undocumented — recorded as a live-tenant unknown in
mdm-operations.md). There is no labels LIST endpoint in current docs — per-app
`release_labels` is the documented lookup. [api/apps: release_labels
attributes; api/apps labels section "If not present app will be added in
default stable channel"; Lead spot-checked]

RD-06. **Auth/error contract alignment (R5 drifts).** `DATA_CENTRES`: `ca` →
`https://accounts.zohocloud.ca`, `cn` → `https://accounts.zoho.com.cn` (both
current hosts are DNS-non-resolvable; verified against the live serverinfo
endpoints). `error_code` comparisons accept string OR number
(`String(error_code)`), in `describeErrorBody` and the COM0002 retry check.
The token-endpoint `{"error": ...}` shape surfaces its `error_description`.
The masking header comment's "Zoho policy" provenance is reworded to
engineering discipline (R5 found no substantiating official page; behavior
unchanged). [zoho.com/accounts/protocol/oauth/multi-dc.html + live
serverinfo; api/oauth error envelope example error_code 1002]

RD-07. **Pinned signing-certificate SHA-256 (IR-06).** `verify-release-apk.ts`
gains a REQUIRED identity input: `--cert-sha256` / `EXPECTED_CERT_SHA256` —
fail-closed when absent (like `--package`). Parsing anchors on the
`certificate SHA-256 digest:` line SUFFIX (rotated/multi-signer output shapes
safe), normalizes colons/case on both sides, and requires an exact match to
the pinned value; the debug-DN rejection is retained as belt-and-braces. The
pinned value is PUBLIC (it is the fingerprint anyone can compute from the
shipped APK) — the workflows source it from the repository Actions VARIABLE
`vars.ANDROID_UPLOAD_CERT_SHA256` with a fail-closed presence check naming the
variable and the documented computation procedure
(`keytool -exportcert -keystore <ks> -alias <alias> | sha256sum`, or
`apksigner verify --print-certs` on a known-good APK). Both the
android-release verify step and the mdm-beta-upload re-verify step pass the
flag. [developer.android.com app-signing "App upgrade" (byte-level
certificate equality); AOSP ApkSignerTool.java printCertificate (DN + SHA-256
digest lines, HexEncoding lowercase); Lead spot-checked]

RD-08. **Explicit versionCode with fail-closed derivation (IR-08).**
`app.config.ts` gains `android.versionCode: 1` (the documented first-release
value). Both workflows' identity-derivation steps change `android.versionCode
?? 1` into a NAMED FAILURE when the evaluated config lacks a numeric
`android.versionCode` — the N→N+1 bump contract (strictly increasing integer
per MDM-delivered release; Android enforces ≥, MDM/Expo guidance says increase
per release) can no longer be silently skipped by relying on the hidden
default (which would ship versionCode 1 forever).
[developer.android.com/studio/publish/versioning 2025-08-20; installed
@expo/config-plugins Version.js `?? 1`; docs.expo.dev v54 config app]

RD-09. **Actions pinned to full SHAs + environment references (IR-07).** The
six `uses:` in the two SECRET-BEARING workflows (checkout, setup-node,
setup-java, upload-artifact, download-artifact, pnpm/action-setup) are pinned
to full-length commit SHAs resolved at implementation time via
`git ls-remote` (with `# vX.Y.Z` tag comments) — documented good practice
("currently the only way to use an action as an immutable release"), not
required absent an org policy. CI workflows (no secrets) keep tag pins (Lead
scope decision). Each secret-bearing job gains an `environment:` reference —
`android-signing` (android-release.yml) and `mdm-upload`
(mdm-beta-upload.yml): the documented human follow-up (create the
environment, configure required reviewers + Prevent self-review if desired,
migrate the seven secrets from repository to environment scope) is recorded in
mdm-operations.md; the typo/auto-creation hazard is fail-safe here (an empty
environment leaves repo-scope secrets resolving, and the existing empty-string
fail-closed checks still guard). permissions/dispatch/artifact-download usage
is already documented-compliant — unchanged. [docs.github.com secure-use
2026-07-24; manage-environments 2026-07-16; Lead spot-checked]

RD-10. **IR-02 requires no code.** The reviewer's `/emsapi/fileupload/status`
claim is REJECTED by current official evidence (0 occurrences across the
entire live doc set + searchindex + EU mirror; `fileStatus` appears exactly
once — the literal 2). The single-phase fail-closed check stays; the
live-tenant response smoke (a real dispatch records the actual response,
redacted) remains a documented human follow-up.

### Feature shape (remediation) — unchanged

No new capabilities. All remediation work lives in EXISTING planned surfaces
(model/state/native tests, tools, workflows, app.config.ts, docs). No
generator command applies to any remediation task (scaffold N/A everywhere).

### Remediation tasks — Round 4 (post-review remediation)

| Task | Mode            | Acceptance               | Objective (findings)                                                                                                                                                                                                             | Depends on | Entry evidence (RED/baseline/config)                                                                                                                                                                                                                                         |
| ---- | --------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T14  | behavior-change | Acceptance: AC-03, AC-04 | Policy readiness verdict + resolver parameter + startup hold + LOCKED corroboration (IR-01)                                                                                                                                      | —          | RED: cold-start ordering test — auth resolves ready+preparation while the first native read is pending → target must be `startup`, Preparation never mounts (fails today: mounts preparation); RED: pending/malformed/first-read-failure rows; RED: provisional+locked→kiosk |
| T15  | bug             | Acceptance: AC-09        | MDM read-path contract: documented pagination + pre-mutation group validation + expected-group-name + truthful dry-run + Beta label reuse (IR-03, IR-04, IR-05) + mdm-beta-upload.yml group-name wiring                          | —          | RED: paging.next walk (current code sends `?page=`); RED: group missing → real run must refuse BEFORE any mutation (currently mutates); RED: dry-run non-zero on missing/mismatched group (currently exits 0); RED: existing Beta label → no POST (currently always POSTs)   |
| T16  | bug             | Supporting: AC-09        | MDM auth/error contract: ca/cn accounts hosts, numeric error_code, token error_description, comment provenance (R5 drifts)                                                                                                       | T15        | RED: MDM_DATA_CENTRE=ca → first request host must be accounts.zohocloud.ca (fails today: accounts.zoho.ca); RED: numeric-error_code envelope parsed structured (currently raw fallback); RED: 429-with-numeric-code still retries                                            |
| T17  | behavior-change | Acceptance: AC-08        | Verifier certificate SHA-256 pinning + both workflows' verify steps + vars wiring (IR-06)                                                                                                                                        | —          | RED: certs output with a different non-debug SHA-256 → must fail (passes today); RED: absent --cert-sha256 → named fail-closed; mixed-case/colon normalization accepted                                                                                                      |
| T18  | config          | Supporting: AC-08        | Explicit `android.versionCode: 1` + fail-closed absence in both derivation steps (IR-08)                                                                                                                                         | T17        | config: `expo config --json` carries android.versionCode=1; derivation-step mock matrix (absent → exit 1 with named error, present → passes; /tmp GITHUB_ENV pattern per T10-F01)                                                                                            |
| T19  | config          | Supporting: AC-07, AC-09 | Actions pinned to full SHAs + `environment:` references in both secret-bearing workflows (IR-07)                                                                                                                                 | T17, T18   | config: every pin re-resolved via git ls-remote at implementation time and proven equal to its `# vX.Y.Z` comment; YAML parses; check:ci-scripts green                                                                                                                       |
| T20  | config          | Supporting: AC-10        | mdm-operations.md remediation alignment: new dispatch contract (required group-name; cert variable procedure), label reuse semantics, pagination contract, IR-02 verdict, environment migration steps, live-tenant unknowns list | T15–T19    | config: `pnpm verify` green (check:docs); content cross-checked against the research synthesis                                                                                                                                                                               |

Round 4 gate: fresh code-reviewer over the accumulated remediation diff after
T20. Execution stays sequential (single-implementer chain, repository
convention). Push discipline: every Task Gate PASS → commit → push → verify
remote/PR #9 advanced → inspect CI → next task.

### Files expected to change (remediation additions)

- `features/kiosk-runtime/model/derive-device-policy.ts` (+test) — RD-02.
- `features/kiosk-runtime/model/root-guard.ts` (+test) — RD-01 resolver
  parameter.
- `features/kiosk-runtime/state/device-policy-store.ts` (+test) — readiness
  state.
- `features/kiosk-runtime/state/use-root-target.ts` (+test) — readiness
  wiring.
- `features/kiosk-runtime/native/use-device-policy-sync.ts` (+test) —
  module-absent resolution + readiness transitions.
- `app/index.tsx` — startup-case comment correction (behavior already
  correct); NO layout machinery added.
- `tools/mdm/upload-beta.ts` (+test) — RD-03/04/05/06.
- `tools/release/verify-release-apk.ts` (+test) — RD-07.
- `.github/workflows/android-release.yml`, `.github/workflows/mdm-beta-upload.yml`
  — RD-07/08/09 (+T15 group-name input).
- `app.config.ts` — `android.versionCode: 1` (RD-08).
- `features/kiosk-runtime/docs/mdm-operations.md` — T20 alignment.
- NOT changed: `core/**`, `components/**`, other features, `main`, existing
  CI workflows (ci.yml / android-build.yml / android-e2e.yml keep tag pins —
  Lead scope decision), `supabase/**`.

### Required skills (remediation)

- `test-driven-development` — every task.
- `expo-router` — T14 (root guard/layout semantics; vendored skill covers
  SDK-56+ features too — KISOK is SDK 54; iOS/SDK-56+ material not
  applicable).
- `kisok-react-native-rules` — T14 (timer/event discipline in the sync hook
  tests).

### Test strategy additions

- **Readiness invariant (AC-03)** — THE cold-start ordering regression: mocked
  policy-source with a read held pending; auth resolves ready+preparation
  first; assert target stays `startup` and the (preparation) route never
  mounts. Rows: valid→resolved; null-module→resolved immediately;
  provisional→pending; malformed→pending (+ policy fail-closed + maintenance
  cleared); first-read failure→pending; failure-after-success→readiness
  unchanged; standard+resolved rows byte-identical to today (AC-04).
- **Derivation** — `lockTaskModeState==="locked"` (incl. provisional+locked →
  kiosk; pinned → never kiosk).
- **MDM client** — pagination: paging.next walk, limit/offset variant,
  envelope-less short page, >50-no-envelope fail-closed, non-termination
  bound, no request contains `?page=`. Groups: pre-mutation GET /groups/{id}
  before ANY POST in the real run; missing → refuse; name mismatch → refuse;
  dry-run non-zero on missing/mismatch; group field is `name`. Labels:
  existing Beta → zero POST; no Beta → exactly one POST; POST failure → named
  fail-closed. Hosts: ca/cn accounts hosts pinned. Envelope: numeric
  error_code parsed; 429-with-numeric-code retries; token {"error"} surfaces
  error_description.
- **Release verifier** — SHA-256 mismatch fails; absent input fails closed;
  colon/case normalization; multi-space/rotated fixture shapes (AOSP-documented
  lines).
- **Workflows** — derivation-step versionCode-absent mock (T10-F01 pattern);
  SHA-pin resolution proof; YAML + check:ci-scripts; group-name early
  validation.

### Risks (remediation additions)

| Risk                                                                                                 | Likelihood         | Mitigation                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The live app-list response may carry no paging envelope (the docs' own example omits it)             | medium             | RD-03 tolerates the documented example shape (short page) and fails closed only on the unknowable shape (>50, no envelope); the first real dry-run records the actual envelope (live-tenant fact)                                                    |
| Duplicate Beta-label POST behavior is undocumented                                                   | medium             | Fail closed with a named error; per-app reuse avoids the POST on every update path; recorded as a live-tenant unknown                                                                                                                                |
| `restrictions_pending` or a failing first read could hold preparation accounts at the startup screen | low                | Hold-closed is invariant-faithful (never preparation); exit paths = restrictions-change event + AppState-active re-read (already implemented); the bridge is versioned with the app — a persistently malformed bridge is a build bug caught by tests |
| The human has not yet created `vars.ANDROID_UPLOAD_CERT_SHA256`                                      | certain (external) | Fail-closed presence check names the variable and the documented computation procedure; the first android-release dispatch is a human action anyway (secrets external)                                                                               |
| Environment migration is a human prerequisite (IR-07)                                                | certain (external) | `environment:` references are safe pre-migration (empty env → repo-scope secrets still resolve → existing fail-closed checks guard); the migration steps are documented in mdm-operations.md                                                         |
| Pinned SHAs go stale (no Dependabot configured)                                                      | low                | `# vX.Y.Z` comments keep the tag discoverable; re-pinning is a one-line review; Dependabot intentionally out of scope (no new CI surface in this remediation)                                                                                        |
| develop may advance again before the Feature Gate                                                    | medium             | Re-fetch and re-integrate before final verification per the develop integration rule; PR #12's cart hardening is expected to be conflict-free (disjoint surfaces)                                                                                    |

### Verification (remediation)

- `pnpm verify` after every task; focused suites per task; the cold-start
  ordering regression in T14's gate.
- Workflow static checks: YAML parse, `pnpm check:ci-scripts`, SHA-pin
  resolution proof, derivation-step mock matrices.
- Runtime browser regression (standard path, tablet sizes) on the final
  remediated HEAD — standard routing unchanged, no kiosk surfaces, zero
  console errors (the readiness change must be invisible on web: module absent
  → resolved immediately).
- Android native tier: label-gated android-build on the final HEAD (T14 is
  JS-only — CNG-safe by construction; the compile tier still re-runs as the
  final evidence).
- Live MDM dry-run: human action (external, unchanged) — now additionally
  records the actual app-list envelope and the group-details response shape.
- develop integration (IR-09) after T20, before final verification: non-
  destructive merge of `origin/develop` (3a25640 at amendment time; re-fetch
  at execution), affected checks re-run, integrated HEAD = the final candidate.

### Remediation `DRAFT` → `READY` checklist

- [x] All seven research packets complete; synthesis + IR verdict matrix in
      review.md; Lead spot-checked every load-bearing primary source
- [x] Every IR-01…IR-09 finding has a verdict; IR-02 documented REJECTED with
      primary evidence (no needless change)
- [x] Every CONFIRMED / CONFIRMED-WITH-MODIFICATION finding maps to an owned
      Task (T14–T20) or an explicit non-code disposition (IR-02; IR-09 =
      integration step)
- [x] Stable AC IDs preserved; AC-03 amended minimally with evidence citation;
      no unrelated product scope entered
- [x] No external contract guessed: every task's contract is pinned to
      research-packet sources (RD-01…RD-10 cite them)
- [x] No new capability/shape; no generator command (scaffold N/A justified)
- [x] Task graph dependency-coherent; file scopes explicit; skills explicit
- [x] Tests target failure modes (the ordering race, the fail-open rows, the
      contract drifts), not implementation trivia
- [x] latest develop integration scheduled before final verification (IR-09)
- [x] skipped/hardware/live-tenant evidence cannot be mislabeled PASS
      (unverified lists retained and extended)
- [x] Worklog/review/todo preserve T01–T13 history while recording the
      reopened gate truth

Status: `READY` (remediation) — the Lead Planning Review was re-run on this
amendment in full (requirements vs. research, external contracts, shape,
safety semantics, task graph, test strategy, integration plan, document
consistency; see review.md synthesis). Implementation of T14 may begin.
