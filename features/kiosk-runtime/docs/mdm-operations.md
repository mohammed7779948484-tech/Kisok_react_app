# KioskRuntime — ManageEngine MDM operational contract

**The durable operational contract between this repository's release
automation and the ManageEngine MDM Cloud tenant.** Audience: the maintainer
who dispatches the two release workflows, and the MDM administrator who owns
the console. It is written from the feature's durable research evidence — the
2026-09-02 research packets and the 2026-09-03 MDM API revalidation, recorded
in the feature's `docs/worklog.md` and synthesized in the feature's
`docs/plan.md` — and from what the feature actually built: the restriction
schema in `modules/kiosk-policy/app.plugin.js`, the release workflow
`.github/workflows/android-release.yml`, the APK verification script
`tools/release/verify-release-apk.ts`, the MDM upload client
`tools/mdm/upload-beta.ts`, and the Beta upload workflow
`.github/workflows/mdm-beta-upload.yml`.

Every load-bearing claim cites its official source inline. Section 9 is the
honest list of what has NOT been verified on hardware or on the live tenant;
nothing here should be read as claiming otherwise. Secret VALUES never appear
in this document — only secret NAMES.

## 1. Purpose and scope

This document governs the GitHub-controlled release and MDM pipeline for the
single KISOK Android package `com.kisok.kiosk`:

- the one-time repository setup (Actions secrets, console ids) a human
  performs before anything can run;
- the two manual-dispatch workflows: `.github/workflows/android-release.yml`
  (build, verify and publish the release-signed APK) and
  `.github/workflows/mdm-beta-upload.yml` (download, re-verify and upload it
  to the MDM App Repository "Beta" release label);
- the MDM objects they touch: the in-house ("Android Enterprise App") app in
  the App Repository, the "Beta" release label, and exactly one
  non-production device group;
- the console-side behaviour an administrator needs in order to run store
  Customer tablets as dedicated Single-App Kiosk devices: enrollment, the
  kiosk profile, managed app configuration, silent install, updates,
  rollback and recovery.

What this document deliberately does NOT automate — and what no automation in
this repository does:

- **Production deployment.** ManageEngine documents production promotion as
  the `approve` operation (with `distribute_update`); no tool or workflow in
  this repository calls it. Section 8 records the explicit prerequisites
  that must hold before anyone ever automates it.
- **Push-triggered or scheduled releases.** Both workflows are
  `workflow_dispatch`-only. No push or PR event can ever reach the signing or
  MDM secrets.

## 2. Enrollment for dedicated (store Customer) tablets

- Only store **Customer** tablets are enrolled as dedicated devices.
  ManageEngine's QR-template enrollment provisions the tablet as **Android
  Enterprise Fully Managed** with the MDM agent as **Device Owner** — the
  tablet is wiped and enrolled by scanning a QR code generated from an
  enrollment template in the console.
- Device Owner is a prerequisite for the Single-App Kiosk profile (Section 3)
  and for silent install (Section 5). A store tablet that is merely
  "managed" is not a dedicated device.
- **Employee tablets are never enrolled this way.** They stay unmanaged, or
  ordinarily managed (work profile / profile owner). The same APK behaves as
  a normal app on them — normal role-based routing, no lock task, no pinning
  — because the `if_whitelisted` lock-task declaration is inert without a
  DPC allowlist (Section 3).
- Enrolled devices land in device groups. The group the Beta upload
  associates with (Sections 5 and 7d) must be the non-production group the
  pilot tablets actually belong to.

[manageengine.com/mobile-device-management/help/ — enrollment and Android
Enterprise pages, last updated 2026-07/08]

## 3. The Single-App Kiosk profile

- **Lock-to-app is MDM-owned enforcement.** The ManageEngine Single-App Kiosk
  profile locks a dedicated device to one app by placing it in Android
  **lock task mode** with the DPC allowlisting the app. The enforcement
  boundary is device policy, not app code: the app cannot and must not
  self-enforce it, and user-initiated screen pinning is user-exitable and is
  not a boundary.
  [developer.android.com/work/dpc/dedicated-devices + /work/dpc/lock-task-mode,
  last updated 2026-03-05]
- The Single-App Kiosk profile **requires Device Owner** — hence the
  QR-template enrollment of Section 2. Configure the profile so the
  allowlisted app is `com.kisok.kiosk`.
- The app declares `android:lockTaskMode="if_whitelisted"` on its main
  activity (injected at prebuild by `modules/kiosk-policy/app.plugin.js`):
  the SAME APK is automatically locked into lock task mode when a DPC
  allowlists the package, and behaves as a normal activity everywhere else —
  one package, both device roles, no build variants.
  [developer.android.com/guide/topics/manifest/activity-element, 2026-07-06]
- **The app never calls `startLockTask`/`stopLockTask`.** It only reads
  lock-task state (`isLockTaskPermitted` / `getLockTaskModeState`) as
  read-only corroboration of the device policy; a `PINNED` state never
  counts as enforced kiosk.
- **Offline kiosk devices stay locked** — losing network does not unlock the
  tablet.
- **Recovery for a locked tablet** (MDM-side actions): Pause Kiosk, the
  kiosk recovery key, chat commands.
  [manageengine.com/mobile-device-management/help/ — kiosk pages, last
  updated 2026-07/08]
- **Expect relaunch after reboot.** The kiosk app relaunches on boot, and
  ManageEngine documents that a kiosk relaunch after reboot may clear the
  app's login sessions — plan for the sign-in screen being the post-reboot
  state. The device stays a customer kiosk regardless of auth state: a
  `preparation` account that signs in on a kiosk tablet gets the mismatch
  screen with a safe sign-out, never the Preparation experience.
- Signing out inside the app never exits the device kiosk — the sign-in
  screen shows inside the same locked device.

## 4. In-house (Enterprise) app upload and managed app configuration

### The upload path (no Google Play)

- KISOK ships as an **in-house app** (a ManageEngine "Android Enterprise
  App"): the release-signed APK is uploaded to the **App Repository** and
  distributed to devices by MDM — without Google Play publishing, without a
  Play Developer account, without a public listing.
  [manageengine.com/mobile-device-management/help/ — app-management and
  enterprise-app pages, last updated 2026-07/08]
- The upload itself is automated by the Beta upload workflow (Section 7d).
  The tool performs the two-phase `POST {mdm}/emsapi/files` upload (header
  `Module: MDM_APP_MGMT`, multipart key `file`) and then either creates the
  app (`app_type 2`, Enterprise) or adds a version on the Beta label. One
  recorded documentation discrepancy: the docs' prose says multipart key
  `file` while their code examples say `fileName` — the written prose
  contract is used, and the discrepancy is recorded here rather than
  resolved by invention.
  [manageengine.com/mobile-device-management/api/files/ + api/apps/,
  revalidated 2026-09-03]

### Managed app configuration for in-house apps

- Managed app configuration **is supported for in-house apps** when the app
  declares a restrictions schema: the app's **Configurations** tab appears
  in the console on upload.
  [manageengine.com/mobile-device-management/help/ — app-configuration
  pages, last updated 2026-07/08]
- THIS app declares its schema in `res/xml/kiosk_restrictions.xml` (written
  by `modules/kiosk-policy/app.plugin.js`) — three restrictions:

| Restriction key                      | XML type | Values / range                             |
| ------------------------------------ | -------- | ------------------------------------------ |
| `kiosk_device_role`                  | string   | `customer_kiosk` or `standard`             |
| `maintenance_unlock_code`            | string   | admin-chosen code (any non-empty string)   |
| `maintenance_unlock_timeout_seconds` | integer  | 15–600 seconds; the app clamps; default 90 |

- `kiosk_device_role` — set to `customer_kiosk` on store Customer tablets.
  **The app derives the device role fail-closed: only affirmative signals
  yield kiosk** — the explicit `customer_kiosk` value, or the DPC lock-task
  allowlist corroborating it. A missing, pending, invalid or empty value
  leaves the device **standard** (a provisioned-but-unconfigured tablet
  fails closed, never half-kiosk). One deliberate asymmetry: an explicit
  `standard` combined with a DPC allowlist resolves **toward kiosk** —
  downgrading a store tablet is an MDM action (remove it from the kiosk
  allowlist), not an app-configuration toggle.
- `maintenance_unlock_code` — the store-staff maintenance credential, not a
  Supabase credential. It is visible to MDM admins in the console
  (deliberately a plain, settable string — a `hidden` type risks the console
  not rendering a settable field at all). The app compares it in memory
  only: the code is never rendered, never logged, never persisted. A
  deliberate long-press on the corner affordance opens the unlock prompt;
  the right code opens the maintenance panel, whose "Switch customer
  account" runs the app's shared fail-closed sign-out pipeline. The unlock
  is ephemeral — it clears on timeout, when the app goes to background, and
  when the account is switched.
- `maintenance_unlock_timeout_seconds` — how long an unlock lasts. The app
  clamps the value to 15–600 seconds and defaults to 90 when unset.

**Where the admin sets them:** in the ManageEngine console, on the KISOK
app's **Configurations** tab (App Repository → the app → Configurations),
which appears because the APK declares the schema above. The values reach
the app through the Android managed-configurations mechanism when MDM
distributes the app: the app reads restrictions on cold start, on resume,
and on the restrictions-changed broadcast, so a console edit reaches the
running app without a reinstall. Delivery timing on a real tablet is on the
unverified list (Section 9).
[developer.android.com/work/managed-configurations, 2025-02-18]

## 5. Silent install prerequisites

Silent install — installing the app on a device with no user interaction —
has one platform prerequisite and two distribution prerequisites:

1. **The device is Fully Managed (Device Owner).** Store Customer tablets
   must be QR-template-enrolled as Device Owner (Section 2). Silent install
   of in-house apps is documented for Fully Managed devices.
   [manageengine.com/mobile-device-management/help/ — app-distribution and
   silent-install pages, last updated 2026-07/08]
2. **The app is associated with exactly one device group with
   `silent_install: true`.** This feature's automation associates exactly
   the ONE configured non-production group — the upload tool refuses to run
   without a group id and refuses the configured production group id.
   [manageengine.com/mobile-device-management/api/groups/ —
   associate-apps-to-a-group, revalidated 2026-09-03]
3. **The app version is on the "Beta" release label.** The automation
   resolves the Beta release label id through the documented channels
   endpoint (`POST /api/v1/mdm/labels`) and puts the uploaded version on
   that label before associating it with the group.

## 6. Update and rollback rules

- **Updating = "Add new version".** A release goes out by uploading the new
  APK as a new version on the app (the tool's add-version path on the Beta
  label; the console equivalent is the "Add new version"/Upgrade action). On
  Fully Managed devices the update installs **silently**.
  [manageengine.com/mobile-device-management/help/ — app-update pages, last
  updated 2026-07/08]
- **`versionCode` must strictly increase.** Every uploaded APK must carry a
  higher Android `versionCode` than the one it replaces. The upload tool
  enforces this **before** any upload with a monotonic version pre-check:
  the incoming version must be strictly greater than the existing app's
  documented version — the Beta label's `app_version` when present, else the
  app's top-level `version` (the documented repository reads expose versions
  as strings). An unparsable or missing existing version fails closed
  rather than guessing. The pre-check is a guard, not the authority: **the
  MDM server remains the authority** on the `versionCode` increase.
  [manageengine.com/mobile-device-management/api/apps/, revalidated
  2026-09-03]
- **The release signature must NEVER change.** Every release of
  `com.kisok.kiosk` must be signed with the same upload key (the four
  `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` signing secrets, Section 7a). A
  signature change is, to Android, a different app: it blocks the update
  and forces the remove-and-reinstall route below.
- **No downgrade path exists.** MDM will not distribute a lower version. The
  documented way back to an older release is to **remove the app and
  re-distribute it — which erases the app's data**. Treat every upload as
  one-way: the recovery from a bad release is a new, higher `versionCode`,
  not a rollback. App data survives an update; it does not survive a remove.
- **Re-distributing a Kiosk profile pins the app version** the profile was
  created with — an updated app must be distributed separately. App updates
  flow through the App Repository, not through re-sending the kiosk profile.
  [manageengine.com/mobile-device-management/help/ — kiosk pages, last
  updated 2026-07/08]

## 7. The release path — both workflows' dispatch contracts

The human-operated sequence, end to end:

1. one-time repository setup (7a);
2. dispatch **Android release** — build, verify, publish the
   `kisok-release-apk` artifact (7b);
3. a human inspects the artifact (7c);
4. dispatch **MDM Beta upload** (dry-run by default) — re-verify, then
   upload to the Beta label (7d);
5. the first live dry-run and the first real upload are deliberate human
   actions (7e).

### 7a. One-time repository setup (the human, once)

**Actions secrets** (repository settings → Secrets and variables → Actions).
Values never enter the repository, the logs, the artifacts, or this document —
NAMES only.

Android release signing — four secrets, all four or the build refuses to run:

- `ANDROID_KEYSTORE_BASE64` — the upload keystore, base64-encoded; the
  workflow decodes it only into the generated, gitignored `android/` tree on
  the runner.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

These four must be created **before the first Android release dispatch** —
the workflow's first step fails closed (exit 1, naming only the missing
NAME) before any toolchain work, so it can never silently produce a
debug-signed "release" artifact. The key they protect is permanent: the
release signature must never change (Section 6).

MDM OAuth — three secrets:

- `MDM_CLIENT_ID`, `MDM_CLIENT_SECRET`, `MDM_REFRESH_TOKEN` — the
  ManageEngine MDM Cloud REST API client's credentials. Register the client
  with the documented MDM REST scopes — `MDMOnDemand.MDMDeviceMgmt.*`
  (device management) plus `MDMOnDemand.MDMInventory.READ`; there is no
  `MDMCloud.MDMAPI` scope. The workflow exchanges the refresh token for a
  short-lived access token (about one hour; at most 10 tokens per refresh
  token per 10 minutes — the tool performs one exchange per run) at
  `https://accounts.zoho.<dc>/oauth/v2/token`.
  [zoho.com/developer/oauth/ and
  manageengine.com/mobile-device-management/api/oauth/, revalidated
  2026-09-03]

Zoho's exposed-credentials policy counts **logs** as credential exposure and
revokes — which is why every line the upload tool emits is redacted of the
known secret values.

Console ids to resolve (the human reads these in the ManageEngine console
and supplies them as dispatch inputs):

- the **App Repository category id** — the create path requires it
  (`app-category-id`; needed only when the app does not exist yet);
- the **non-production (Beta) device group id** — the pilot group the Beta
  distribution associates with (`group-id`);
- the **production device group id** — recommended: when supplied
  (`production-group-id`), the upload refuses a `group-id` equal to it.

One branch fact before the FIRST dispatch of either workflow: **the workflow
file must be on the repository's default branch** — the Actions UI only
lists default-branch workflows for `workflow_dispatch`.
[docs.github.com actions events documentation, fetched 2026-09-02]

### 7b. Android release — build, verify, publish (dispatch-only)

File: `.github/workflows/android-release.yml`.

- **Who may dispatch:** anyone with **write access** to the repository —
  `workflow_dispatch` requires it, and that is the access boundary for who
  can spend the signing material. No push or PR trigger can ever reach this
  workflow.
- **Steps, in order:**
  1. fail-closed presence check of the four `ANDROID_KEYSTORE_*` /
     `ANDROID_KEY_*` signing secrets (names only, before any toolchain
     work);
  2. derive the expected APK identity from the evaluated app config
     (`expo config --json`): package `com.kisok.kiosk`, `versionName` and
     `versionCode` with Expo's exact defaulting, validated as simple tokens
     before use — never hard-coded literals, so a config bump cannot desync
     the expectation from the artifact;
  3. `expo prebuild` with the signing env so the guarded release signing
     config lands in the generated tree, then decode the keystore into the
     gitignored `android/` tree (the material never enters the repository,
     the logs, or the artifact);
  4. `./gradlew assembleRelease` — release-signed, embedded JS bundle, both
     tablet ABIs from `expo-build-properties`;
  5. **verify** with `tools/release/verify-release-apk.ts`: package
     identity, the expected `versionCode`/`versionName`, a release
     (non-debug) signing certificate, and an embedded JS bundle. The
     workflow additionally asserts the script's `APK verification passed`
     success line in the captured output, so a mis-invoked or renamed
     script cannot pass the delivery gate silently;
  6. **publish** the artifact `kisok-release-apk` (the APK only — never
     signing material) with **30-day retention**.
- **The 30-day window matters:** the MDM upload workflow downloads this
  artifact by name from the chosen run id — the upload must happen within
  the retention window, or the build must be re-dispatched.
- Hardening: `permissions: contents: read`; checkout with
  `persist-credentials: false`; release-scoped, serialized concurrency (an
  in-flight signing build is never cancelled); timeout 60 minutes; Node 24
  for the TypeScript verification tool.

### 7c. The human inspects the artifact between build and upload

The build workflow is the only builder; the upload workflow is the only
uploader; **a human inspects the `kisok-release-apk` artifact in between**
(the feature's `docs/plan.md`, design decision 10). The 30-day retention
exists because this gap can legitimately span weeks. Download the artifact
from the Android release run and inspect it before dispatching the upload —
the upload workflow re-verifies it mechanically, but the human look (right
build, right version, deliberate release) is the actual decision being
made.

### 7d. MDM Beta upload — download, re-verify, upload (dispatch-only, dry-run by default)

File: `.github/workflows/mdm-beta-upload.yml`. It builds nothing — the
Android release workflow is the only builder.

- **Who may dispatch:** anyone with write access (same boundary; this
  workflow spends the MDM OAuth secrets).
- **Dispatch inputs and their semantics:**

| Input                 | Required | Default | Semantics                                                                                                                           |
| --------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `run-id`              | yes      | —       | Numeric id of the prior Android release run whose `kisok-release-apk` artifact is uploaded; validated numeric before anything runs. |
| `dry-run`             | no       | `true`  | Read-only dry-run (token exchange, read-only GETs, version pre-check). A real upload requires deliberately setting this to `false`. |
| `group-id`            | yes      | —       | The ONE non-production MDM device group id the app is associated with, with silent install. An empty value is rejected early.       |
| `production-group-id` | no       | —       | The production group id; the upload refuses a `group-id` equal to it (the fat-finger guard).                                        |
| `app-category-id`     | no       | —       | The MDM App Repository category id — needed only when the app does not exist yet (the create path).                                 |
| `app-name`            | no       | `KISOK` | The App Repository app name to match or create.                                                                                     |
| `data-centre`         | no       | `us`    | The ManageEngine data centre code: `us`, `eu`, `in`, `au`, `jp`, `ca`, `cn`, `sa`, `uk`.                                            |
| `redirect-uri`        | no       | —       | The OAuth redirect URI registered for the MDM API client; forwarded to the token exchange when set.                                 |

- **Flow:** validate the inputs → fail-closed presence check of the three
  MDM secrets → download `kisok-release-apk` **by name from the given
  `run-id`** through the Actions API (the job carries `actions: read` for
  exactly this; a digest mismatch or missing artifact fails loudly) →
  **re-verify** the downloaded APK with the same verification script against
  the same derived identity, before anything touches the MDM tenant → run
  `tools/mdm/upload-beta.ts`.
- **What the tool refuses (AC-09):** to run without a group id; a group id
  equal to the configured production group id; any label name other than
  exactly "Beta"; a non-increasing version. It contains no call to
  `approve`, `distribute_update` or `retire_old_version` at all. The
  incoming version is not a dispatch input — the workflow feeds the tool
  the `versionName` it derived from the app config and re-verified against
  the APK, so a dispatcher cannot lie to the monotonic pre-check.
- **Dry-run is read-only:** the OAuth token exchange, read-only GETs (the
  paginated app list, the group list) and the version pre-check. No
  mutation, no APK read, nothing written to the tenant.
- Hardening: `permissions: contents: read` + `actions: read`;
  `persist-credentials: false`; release-scoped, serialized concurrency;
  timeout 30 minutes; the three MDM secrets reach the tool only as step
  env; optional inputs are forwarded only when non-empty.

### 7e. The live dry-run and the first real upload are human actions

- **Order of first operations:** live dry-run first (read-only), then the
  first real upload. Both are deliberate, authorized human actions — the
  dry-run default exists so that "run the workflow" can never mean
  "upload" by accident.
- Live tenant verification is authorized **only** as a non-destructive
  dry-run (the feature's `docs/brief.md` constraints). The first real
  upload should follow a reviewed dry-run on the same inputs.
- Nothing in this feature has touched the live tenant — see Section 9.

## 8. Activation prerequisites for any future automatic production deployment

ManageEngine documents production promotion as the **`approve`** operation on
a release label — with `distribute_update`, plus silent-install,
retire-old-version and notify options. **No automation in this repository
calls it:** the upload tool contains no `approve` / `distribute_update` /
`retire_old_version` call, and neither workflow has any production-promotion
step. This is deliberate (AC-09) — production deployment stays a human action
in the ManageEngine console.
[manageengine.com/mobile-device-management/api/apps/ — approve, revalidated
2026-09-03]

Before anyone automates production promotion, **all** of the following must
hold:

1. **The Section 9 list has shrunk.** Physical Fully Managed ownership and
   Single-App Kiosk escape prevention; boot and auto-relaunch into kiosk; a
   physical silent install and a physical N→N+1 update; managed-config
   delivery timing; and the physical maintenance flow — all verified on real
   store hardware, not only in the console and in unit tests.
2. **A deliberate, recorded human decision.** The decision to automate
   production must be explicit and written down where the next implementer
   will find it — the owning feature's control documents, or an ADR if it
   changes repository policy. Never a quiet workflow edit.
3. **A secrets and environment review.** Who can dispatch (write access
   today) — is that still the right boundary, or does the production path
   need a GitHub environment with required reviewers? Are the MDM OAuth
   client's scopes still minimal? The current production guards
   (production-group refusal, dry-run default, Beta-only label) are
   client-side conventions — an automated production path would need
   equivalents that cannot be fat-fingered.
4. **The rollback path understood and accepted.** No downgrade exists
   (Section 6). Automating production means accepting that a mistake is
   fixed **forward** — a new, higher `versionCode` shipped under time
   pressure to locked store tablets — because the remove-and-re-distribute
   route erases app data.
5. **The Beta path is proven live.** The live dry-run, the first real Beta
   upload, and at least one physical N→N+1 update on a Beta device (the
   Section 9 items retired) must have happened before production automation
   is even considered.

## 9. Explicitly unverified on hardware and on the live tenant

The honest list, carried from the feature's `docs/brief.md` Evidence section.
These are recorded as unverified — never claimed as verified:

- **Physical Fully Managed ownership and Single-App Kiosk escape
  prevention.** No physical tablet exists in this environment. The lock is
  MDM-owned and is verified here only through documentation, the manifest
  declaration, and the app's read-only corroboration code paths.
- **Boot and auto-relaunch into kiosk.** Expected from the research (offline
  devices stay locked; the kiosk app relaunches on boot) but never observed
  on hardware — including whether a reboot clears login sessions on these
  tablets.
- **Physical silent install and physical N→N+1 update.** The MDM API
  contracts are unit-tested with mocked HTTP; no device has actually
  received the app, or an update to it, through MDM.
- **MDM managed-config delivery timing to the app on a real tablet.** The
  app re-reads restrictions on cold start, on resume, and on the
  restrictions-changed broadcast; how quickly a console edit actually
  reaches a real tablet is unverified.
- **The physical maintenance flow.** The unlock prompt, code entry, timeout,
  background-clear and account switch are component- and store-tested; the
  long-press affordance has never been exercised on a locked physical kiosk.
- **The live MDM dry-run and the first real upload.** Human actions
  requiring the customer's MDM tenant; nothing has touched the live tenant.
- **ManageEngine managed-config field rendering of the three restriction
  keys in the current console version.** The keys are declared
  string / string / integer so the console should present settable fields
  (the `choice` type was rejected deliberately, and the unlock code is a
  visible string rather than `hidden`); whether the current console renders
  all three fields exactly as expected is unverified without a live tenant.
- **The channels endpoint's behavior when the Beta channel already exists.**
  The research records channel creation — `POST /api/v1/mdm/labels` with
  `{"channel_name":"Beta"}` returning a `release_label_id` — but nothing
  about a duplicate channel name. The upload tool POSTs unconditionally and
  uses the returned id, so if the API rejects a duplicate, second and later
  uploads fail closed at that step (named error, no mutation); a human
  resolves it in the console on first encounter. Unverified without a live
  tenant.

## 10. Edition note

- The researched edition matrix: the **Free** edition of ManageEngine MDM
  Cloud covers **25 devices and 1 technician**, and **includes** kiosk,
  Android Enterprise, Enterprise Apps (the in-house App Repository) and the
  REST APIs. [manageengine.com edition-comparison-matrix, 2025-04-03]
- The beta delivery path in this document is therefore **not
  edition-blocked**: QR-template enrollment, the Single-App Kiosk profile,
  in-house app upload with managed configurations, silent install and the
  REST upload API are all Free-edition capabilities.
- Scaling past 25 devices, or adding a second technician, is a **licensing
  decision** — not an engineering one. Nothing in this repository's pipeline
  changes with the edition.

## Source index

Each load-bearing claim above cites its official source inline; the
consolidated index:

- developer.android.com/work/dpc/dedicated-devices and
  /work/dpc/lock-task-mode — dedicated devices, lock task mode (last updated
  2026-03-05)
- developer.android.com/guide/topics/manifest/activity-element —
  `android:lockTaskMode` (2026-07-06)
- developer.android.com/work/managed-configurations — the restrictions
  schema and its delivery (2025-02-18)
- manageengine.com/mobile-device-management/help/ — enrollment (QR template,
  Fully Managed), Single-App Kiosk and kiosk recovery, in-house (Enterprise)
  apps, managed app configuration, silent install, app updates and rollback
  (pages last updated 2026-07/08)
- manageengine.com/mobile-device-management/api/ — api/apps/ (create,
  add-version, approve), api/groups/ (associate-apps-to-a-group),
  api/files/ (two-phase upload), api/oauth/ (token exchange), api/devices/
  and api/pagination/ (repository reads) — revalidated 2026-09-03
- zoho.com/developer/oauth/ — Zoho OAuth refresh-token exchange, token
  lifetimes, exposed-credentials policy (2026)
- manageengine.com edition-comparison-matrix — edition capabilities
  (2025-04-03)
- docs.github.com actions events documentation — the `workflow_dispatch`
  default-branch requirement (fetched 2026-09-02)
