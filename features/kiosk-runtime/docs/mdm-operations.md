# KioskRuntime — ManageEngine MDM operational contract

**The durable operational contract between this repository's release
automation and the ManageEngine MDM Cloud tenant.** Audience: the maintainer
who dispatches the two release workflows, and the MDM administrator who owns
the console. It is written from the feature's durable research evidence — the
2026-09-02 research packets, the 2026-09-03 MDM API revalidation, the
2026-09-04 remediation revalidation and the 2026-09-04 Round 5 research
(seven Evidence Packets, every load-bearing page Lead-opened — the
feature's `docs/review.md`), recorded
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

- the one-time repository setup (Actions secrets and variables, console
  ids, the admin-configured Beta target environment variables) a human
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
  The tool performs the documented **two-phase** upload: `POST
{mdm}/emsapi/files` (headers `Module: MDM_APP_MGMT` and
  `Accept: application/json`, multipart key `file`) returns a `fileID` plus
  a `fileStatus` — **1 = PENDING** ("file is queued for processing"),
  **2 = COMPLETED**, **3 = FAILED**. `fileStatus` 2 proceeds immediately
  with NO status call (the fast path); 3 is the documented terminal failure
  (no poll); 1 polls the documented **Get File Upload Status** call — `POST
{mdm}/emsapi/fileupload/status` with body `{"fileIDs":["<fileID>"]}` (an
  array of STRINGS, the documented sample) — until the `response[]` entry
  whose `file_id` matches OUR fileID reports `file_availability_status`
  **2** ("the file has been uploaded and is ready for use"); the upload
  page's own `fileID` field says "Use Get File Upload Status to verify the
  file is ready for use." No poll interval or timeout is documented, so
  the tool's cadence (3 s) and attempt bound (20 attempts ≈ 60 s —
  comfortably under the endpoint's documented 500 requests/min limit) are
  engineering choices; a malformed response, a missing entry for our
  fileID, or bound exhaustion fails closed. Each upload mints a NEW
  fileID (with an auto-deleting expiry), so the SAME fileID from the
  upload response is the one verified and used. The tool then either
  creates the app (`app_type 2`, Enterprise) or adds a version on the
  Beta label — the add-version PUT body carries the documented-Mandatory
  `app_name` and `app_type 2` (R5-04).
  One recorded documentation discrepancy: the docs' prose says multipart
  key `file` while their code examples say `fileName` — the written prose
  contract is used, and the discrepancy is recorded here rather than
  resolved by invention.
  [manageengine.com/mobile-device-management/help/api/cloud/ —
  files-upload-file-ems.html + files-get-file-upload-status.html,
  Lead-opened 2026-09-04]
- **Round 5 correction of this document's Round 4 record (IR-02).** The
  Round 4 edition of this section claimed the tool "performs no polling"
  because a 2026-09-04 sweep found no polling endpoint — that sweep
  covered the edition-general `manageengine.com/mobile-device-management/
api/` tree (MDM Plus, on-prem build markers), which genuinely lacks the
  status endpoint today. The **cloud help tree**
  (`mobile-device-management/help/api/cloud/`) — the tree that matches
  KISOK's actual cloud hosts (`mdm.manageengine.<dc>`,
  `accounts.zoho.<dc>`) — documents `POST /emsapi/fileupload/status` on
  its own page, in its API Index Files section, and cross-referenced from
  the upload page's `fileID` field. The Round 4 negative was an
  incomplete-tree over-generalization and is overturned by current
  first-party evidence (the feature's `docs/review.md`, "IR-02
  contradiction — RESOLVED"); the cloud help tree is authoritative for
  KISOK's cloud deployment wherever the two trees disagree.

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
  yield kiosk** — the explicit `customer_kiosk` value, the DPC lock-task
  allowlist, or live full lock task mode (`lockTaskModeState === "locked"`
  — a live OS query, DPC-enforced, unreachable by an app that is not
  allowlisted). A missing, invalid or empty value leaves the device
  **standard** (a provisioned-but-unconfigured tablet fails closed, never
  half-kiosk). Pending semantics are precise: a provisional snapshot
  (`restrictions_pending`) never latches a kiosk signal from the
  restrictions bundle or the allowlist — pending WITHOUT lock evidence
  derives **standard** — while the live lock-task state is current OS
  evidence and the one exemption from provisional suppression: pending
  WITH live LOCKED already derives **kiosk** (on a real kiosk that means
  the mismatch screen, not a hold, for a `preparation` account). One
  deliberate asymmetry: an explicit `standard` combined with a DPC
  allowlist or live LOCKED resolves **toward kiosk** — downgrading a store
  tablet is an MDM action (remove it from the kiosk allowlist / end lock
  task mode), not an app-configuration toggle.
- `maintenance_unlock_code` — the store-staff maintenance credential, not a
  Supabase credential. It is visible to MDM admins in the console
  (deliberately a plain, settable string — a `hidden` type risks the console
  not rendering a settable field at all). The app compares it in memory
  only: the code is never rendered, never logged, never persisted. A
  deliberate long-press on the corner affordance opens the unlock prompt;
  the right code opens the maintenance panel, whose "Switch customer
  account" runs the app's shared fail-closed sign-out pipeline. The unlock
  is ephemeral — it clears on timeout, when the app goes to background,
  when the account is switched, and on the restrictions-changed broadcast
  itself: a restrictions change is a policy event, so any unlocked session
  clears immediately (Round 5, RD5-02) — an admin rotating the unlock code
  in the console locks the running kiosk the moment the push lands, before
  the new code could be needed. The code is only ever compared while the
  restrictions are SETTLED: a provisional bundle
  (`restrictions_pending` — "may be applied in the near future but are not
  available yet") is not final credential material, so while it is in force
  the unlock is refused outright and the sheet shows its settling state
  (Round 5, RD5-04) — the pending marker never becomes a usable code.
- `maintenance_unlock_timeout_seconds` — how long an unlock lasts. The app
  clamps the value to 15–600 seconds and defaults to 90 when unset.

**Where the admin sets them:** in the ManageEngine console, on the KISOK
app's **Configurations** tab (App Repository → the app → Configurations),
which appears because the APK declares the schema above. The values reach
the app through the Android managed-configurations mechanism when MDM
distributes the app: the app reads restrictions on cold start, on resume,
and on the restrictions-changed broadcast, so a console edit reaches the
running app without a reinstall. That broadcast —
`ACTION_APPLICATION_RESTRICTIONS_CHANGED`, a protected intent only the
system can send — is received by a DYNAMIC receiver (manifest receivers
are documented-unsupported for this action) registered with
`ContextCompat.RECEIVER_NOT_EXPORTED`: the documented-correct pattern for
this system-sent broadcast — ContextCompat's own guidance says to use the
NOT_EXPORTED flag for broadcasts received "from the system UID", and
Android 14's receiver-flag requirement exempts receivers of system
broadcasts only. Round 5 (R5-09) reviewed this pattern and made no code
change. Delivery timing on a real tablet is on the unverified list
(Section 9).
[developer.android.com/work/managed-configurations, 2025-02-18; the
Intent reference, ContextCompat receiver-flag guidance and Android 14
behavior changes, reviewed 2026-09-04]

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
   the ONE admin-configured non-production group — the upload tool refuses
   to run without a group id AND its exact expected group name, refuses a
   group that does not resolve to exactly that name, refuses a group whose
   documented `group_type` is anything other than 6 — Device Group
   (Section 7d), and refuses the configured production group id; since
   Round 5 the group triple is an admin-controlled allowlist, not dispatch
   input (Sections 7a and 7d).
   [manageengine.com/mobile-device-management/help/api/cloud/ —
   groups-create-apps-from-agroup.html, Lead-opened 2026-09-04]
3. **The app version is on the "Beta" release label.** The automation
   REUSES the app's existing Beta label id from its documented
   `release_labels[]` (matching `release_label_name` "Beta") whenever
   present, and resolves a new label id through the documented channels
   endpoint (`POST /api/v1/mdm/labels`) ONLY when the app has no Beta label
   yet or does not exist at all — one label POST per run at most. The
   duplicate-channel behavior of that POST is undocumented and stays on the
   live-tenant unknowns list (Section 9).

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
- **Bump BOTH version fields in `app.config.ts` for the next release.**
  `android.versionCode: 1` is now SET explicitly in `app.config.ts` (the
  first-release value), and both workflows' identity-derivation steps fail
  CLOSED when the evaluated config lacks a numeric `android.versionCode` —
  a named error before any build or upload work, because Expo's hidden
  `?? 1` default would otherwise ship `versionCode` 1 forever and silently
  skip the increase contract. `versionName` keeps Expo's own defaulting
  (`android.version ?? version`); `versionCode` is explicit. Shipping the
  next release bumps BOTH `version` AND `android.versionCode` — the FIRST
  update requires `android.versionCode` 2 or higher. Mind the asymmetry:
  the tool's pre-check compares the versionName string, while the server
  enforces the ANDROID `versionCode` increase — an operator who bumps only
  `version` passes the pre-check and then fails at the server (fail-closed,
  a named error, nothing distributed).
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

One PUBLIC Actions **variable** — deliberately not a secret — belongs beside
those four: `ANDROID_UPLOAD_CERT_SHA256` (repository settings → Secrets and
variables → Actions → the **Variables** tab). It holds the SHA-256
fingerprint of the upload signing certificate — computable by anyone
holding the shipped APK, which is exactly why it is a variable and not a
secret. Compute it with either documented procedure:

- `apksigner verify --print-certs <known-good.apk>` — copy the
  "certificate SHA-256 digest" line (colons and letter case are normalized
  on both sides of the comparison); or
- `keytool -exportcert -keystore <keystore> -alias <alias> | sha256sum`.

BOTH verify gates consume it: the Android release verify step (7b) and the
MDM upload's re-verify step (7d) feed the digest to
`tools/release/verify-release-apk.ts`, which requires an exact match
(Android compares signing certificates byte-for-byte — a non-debug
certificate DN alone is not identity). An unset variable fails closed
before any verification runs, with an error naming the variable and both
computation procedures.

MDM OAuth — three secrets:

- `MDM_CLIENT_ID`, `MDM_CLIENT_SECRET`, `MDM_REFRESH_TOKEN` — the
  ManageEngine MDM Cloud REST API client's credentials. Register the client
  with the documented MDM REST scopes — `MDMOnDemand.MDMDeviceMgmt.*`
  (device management) plus `MDMOnDemand.MDMInventory.READ`; there is no
  `MDMCloud.MDMAPI` scope. The workflow exchanges the refresh token for a
  short-lived access token (about one hour; at most 10 tokens per refresh
  token per 10 minutes — the tool performs one exchange per run) at
  `https://accounts.zoho.<dc>/oauth/v2/token` — with two exceptions in the
  official multi-dc accounts-host table: `ca` uses `accounts.zohocloud.ca`
  and `cn` uses `accounts.zoho.com.cn` (the naive `accounts.zoho.ca` /
  `accounts.zoho.cn` hosts do NOT resolve — verified against the live
  serverinfo endpoints. Note that ManageEngine's own MDM "Endpoint
  Domain" page still lists those DNS-dead hosts — a recorded documentation
  discrepancy, R5-C1 — so the live-DNS table above is what the tool uses).
  The upload tool's `--data-centre` input selects the correct host
  automatically.
  [zoho.com/developer/oauth/, zoho.com/accounts/protocol/oauth/multi-dc.html
  and manageengine.com/mobile-device-management/api/oauth/, revalidated
  2026-09-03; ca/cn hosts verified 2026-09-04]

Zoho's documented guidance is only **"Do not share this credentials"** —
current official pages document no logs-count-as-exposure-and-revoke
policy. The masking is deliberate engineering discipline: logs are TREATED
as a potential credential-exposure surface, so every line the upload tool
emits is redacted of the known secret values, and no message is ever
constructed from them in the first place.

**GitHub environments — the human follow-up (IR-07).** Both secret-bearing
jobs already reference a dedicated environment: the Android release job
references `android-signing`, the MDM upload job references `mdm-upload`
(repository settings → Environments). To activate the boundary, the
repository administrator: (1) creates the two environments; (2) optionally
configures required reviewers on each (plus the "Prevent self-review"
toggle); and (3) migrates the seven secrets — the four `ANDROID_*` and the
three `MDM_*` — from repository scope to the matching environment's scope.
Until that migration happens nothing breaks: referencing an environment
that does not exist yet auto-creates it EMPTY, repository-scope secrets
still resolve (the jobs already carry the environment references), and the
fail-closed secret-presence checks above guard either way. Both workflows
also pin every action to a full commit SHA — the documented way to consume
an action as an immutable release — each pin carrying a `# vX.Y.Z` tag
comment so the pinned version stays discoverable.
[docs.github.com actions secure-use 2026-07-24 and manage-environments
2026-07-16]

Console ids to resolve (the human reads these in the ManageEngine console):

- the **App Repository category id** — the create path requires it (the
  `app-category-id` dispatch input; needed only when the app does not
  exist yet);
- the **non-production (Beta) device group id, its exact NAME, and the
  production device group id** — the **Beta target allowlist** (Round 5,
  R5-07). These three are NO LONGER dispatch inputs: they are environment
  VARIABLES of the `mdm-upload` GitHub environment, so a dispatcher (write
  access) can never aim the upload at any group — configuring an
  environment variable requires repository ADMIN, a boundary above
  dispatch's write access. The one-time human configuration, before the
  FIRST dispatch of the MDM Beta upload workflow: repository **Settings →
  Environments → `mdm-upload` → Environment variables**, one "Add
  environment variable" per name — `MDM_BETA_GROUP_ID` (the numeric id of
  the pilot device group), `MDM_BETA_GROUP_NAME` (the exact NAME the group
  must resolve to — the positive non-production verification, Section 7d)
  and `MDM_PRODUCTION_GROUP_ID` (the production group id; the upload
  refuses a Beta group id equal to it — belt-and-braces on top of the name
  and type-6 verification). The values are ids and one group name — not
  secrets. An unset variable renders as an empty string, and the workflow's
  first step fails closed, naming the missing variable and this
  configuration procedure.

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
     (`expo config --json`): package `com.kisok.kiosk`, `versionName`
     (Expo's own defaulting: `android.version ?? version`) and
     `versionCode` — which must be EXPLICIT: an absent
     `android.versionCode` is a named failure, never Expo's hidden `?? 1`
     default (the config currently sets `android.versionCode: 1`;
     Section 6). Every derived value is validated as a simple token before
     use — never hard-coded literals, so a config bump cannot desync the
     expectation from the artifact;
  3. `expo prebuild` with the signing env so the guarded release signing
     config lands in the generated tree, then decode the keystore into the
     gitignored `android/` tree (the material never enters the repository,
     the logs, or the artifact);
  4. `./gradlew assembleRelease` — release-signed, embedded JS bundle, both
     tablet ABIs from `expo-build-properties`;
  5. **verify** with `tools/release/verify-release-apk.ts`: package
     identity, the expected `versionCode`/`versionName`, the pinned upload
     signing-certificate SHA-256 (the PUBLIC Actions variable
     `ANDROID_UPLOAD_CERT_SHA256`, 7a — an unset variable fails closed with
     an error naming it), the release (non-debug) certificate check, and an
     embedded JS bundle. The workflow additionally asserts the script's
     `APK verification passed` success line in the captured output, so a
     mis-invoked or renamed script cannot pass the delivery gate silently;
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

| Input             | Required | Default | Semantics                                                                                                                                                            |
| ----------------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-id`          | yes      | —       | Numeric id of the prior Android release run whose `kisok-release-apk` artifact is uploaded; validated numeric immediately after checkout, before any toolchain work. |
| `dry-run`         | no       | `true`  | Read-only dry-run (token exchange, read-only GETs, version pre-check). A real upload requires deliberately setting this to `false`.                                  |
| `app-category-id` | no       | —       | The MDM App Repository category id — needed only when the app does not exist yet (the create path).                                                                  |
| `app-name`        | no       | `KISOK` | The App Repository app name to match or create.                                                                                                                      |
| `data-centre`     | no       | `us`    | The ManageEngine data centre code: `us`, `eu`, `in`, `au`, `jp`, `ca`, `cn`, `sa`, `uk`.                                                                             |
| `redirect-uri`    | no       | —       | The OAuth redirect URI registered for the MDM API client; forwarded to the token exchange when set.                                                                  |

The **Beta target is NOT dispatch input** (Round 5, R5-07): the group id,
the exact expected group name and the production group id are sourced from
the `mdm-upload` environment's VARIABLES — `MDM_BETA_GROUP_ID`,
`MDM_BETA_GROUP_NAME`, `MDM_PRODUCTION_GROUP_ID` (the admin-configured
allowlist; the exact one-time configuration steps are in Section 7a). A
dispatcher with write access cannot aim the upload at ANY group: the
workflow checks all three variables are present (fail closed, naming the
missing variable and its configuration procedure) immediately after
checkout, and then forwards the values to the tool as flags — never through
the tool's own `MDM_*` environment names.

- **Flow:** validate the inputs (the `run-id` must be numeric, and the
  three Beta target environment variables must all be set — both checks
  run immediately after checkout, before any toolchain setup, install,
  download or re-verification work) → fail-closed presence check of the
  three MDM secrets → **validate the release run's provenance (Round 5,
  R5-12 — below)** → download `kisok-release-apk` **by name from the given
  `run-id`** through the Actions API (the job carries `actions: read` for
  exactly this; a digest mismatch or missing artifact fails loudly) →
  **re-verify** the downloaded APK with the same verification script
  against the same derived identity AND the same pinned certificate
  SHA-256 (`ANDROID_UPLOAD_CERT_SHA256`, 7a), before anything touches the
  MDM tenant → run `tools/mdm/upload-beta.ts` (dry-run unless the
  dispatcher deliberately set `dry-run: false`).
- **Run provenance validation (Round 5, R5-12 — defense-in-depth).**
  Before the artifact is downloaded, the workflow asks the Actions REST
  API — with the job's own `github.token` under `actions: read`, no new
  permission — who the run IS, and fails closed unless it is a completed,
  successful run of the Android release workflow: the run's workflow
  identity (path `.github/workflows/android-release.yml` and display name
  "Android release"), `status` completed, `conclusion` success, and
  `head_branch` in the release-source allowlist **{main, develop}** — an
  ENGINEERING choice: a same-version artifact built from any other branch
  would pass every CONTENT check below (same package, same
  versionCode/versionName, same pinned certificate, same embedded bundle),
  so only the run's origin closes that branch-swap hole. Content
  re-verification remains PRIMARY; this identity gate is the secondary
  defense. The allowlist is one reviewed `case` line in the workflow file
  — widening the release-source branches is a deliberate, reviewed change.
  Only the five validated fields are ever echoed, never the full run JSON.
  [docs.github.com — the Actions workflow-runs REST API]
- **What the tool refuses (AC-09):** to run without a group id or without
  an expected group name; a group that does not resolve read-only, or that
  resolves with any name other than the exact expected group name; a group
  whose documented `group_type` is not **6 — Device Group** (the documented
  enum: 6 — Device Group, 7 — User Group, 11 — Tag Group, read as
  number-or-string per the docs' own dual sample shapes; anything else —
  missing, non-numeric or undocumented — fails closed) — id, exact name and
  type 6 together are the strongest non-production identification the
  documented contract supports (no group field distinguishes production); a
  group id equal to the configured production group id; any label name other
  than exactly "Beta"; a non-increasing version. It contains no call to
  `approve`, `distribute_update` or `retire_old_version` at all. The incoming
  version is not a dispatch input — the workflow feeds the tool the
  `versionName` it derived from the app config and re-verified against the
  APK, so a dispatcher cannot lie to the monotonic pre-check — and the Beta
  target is not dispatch input either (the environment-variable allowlist
  above).
- **If an upload run fails mid-flight.** The mutations run in a fixed order:
  the Beta label step — `POST /api/v1/mdm/labels`, ONLY when the app has no
  existing Beta label; an existing app's Beta label id is REUSED from its
  documented `release_labels[]` (matching `release_label_name` "Beta") with
  no POST at all → the two-phase file upload (`POST /emsapi/files`, the
  lifecycle of Section 4) → add-version on the Beta label (the
  documented-Mandatory `app_name` + `app_type 2` body; or app create,
  first upload) → the group association with `silent_install`. A mutation
  that fails with 5xx is NOT retried (the retry classes below): the
  outcome is ambiguous — the server may have applied it — so the run fails
  closed with a message naming the re-run reconciliation path. A run that
  fails between add-version and the association leaves the new
  version on the Beta label but not distributed to the group. Re-dispatching
  is the SAFE move (the Beta target comes from the environment variables,
  so a re-run aims at the same group): the app-list read now sees the
  version the failed run already added, and the monotonic pre-check refuses
  the same-version re-run BEFORE any new mutation (fail-closed, a named
  error, nothing new written). Complete the release one of two ways: finish
  the association in the ManageEngine console (distribute the Beta-labelled
  app to the non-production group with silent install), or fix forward — a
  new build with a higher `android.versionCode` (Section 6; no downgrade
  exists, so there is no "re-send the old version" path).
- **Dry-run is read-only:** the OAuth token exchange, the read-only GETs
  (the app-list walk and the group-details read) and the version pre-check.
  No mutation, no APK read, nothing written to the tenant — and it exits
  NON-ZERO whenever the group is missing, its name does not match, or its
  `group_type` is not 6 — Device Group, the states in which a real run
  could not proceed safely: a truthful dry-run.
- **The read-path API behavior.** The app-list walk follows the documented
  pagination envelope exactly: a non-empty `paging.next` (a FULL URL) is
  followed — only when its origin is the MDM API host's own origin, so a
  foreign next URL can never receive the bearer token; otherwise the walk
  steps with the documented `limit`/`offset` query params, terminating on a
  short page, on accumulating `metadata.total_record_count`, or on matching
  the target app. A `page` parameter is documented NOWHERE and is never
  sent; a page longer than the 50-row default with no usable envelope
  fails closed (termination would be unknowable). The target group is
  validated read-only via `GET /api/v1/mdm/groups/{group_id}` — the
  documented single-group details call (fields `group_id`, `name`,
  `group_type`, `domain`) — BEFORE any mutation: its `name` must equal the
  required expected group name exactly, and its `group_type` must be 6 —
  Device Group. The group-details response shape (flat body vs a wrapped
  `group` object, and number-or-string `group_type`) is a live-tenant
  unknown the tool tolerates (Section 9).
  [manageengine.com/mobile-device-management/api/pagination/ (envelope,
  revalidated 2026-09-04) and the cloud help tree's
  groups-get-an-existing-group.html, Lead-opened 2026-09-04]
- **The HTTP contract of every MDM call (Round 5, R5-05).** Every MDM
  JSON call sends `Accept: application/json` — documented-Mandatory on
  `POST /emsapi/files`, `GET /api/v1/mdm/groups/{group_id}`,
  `POST /api/v1/mdm/groups/{group_id}/apps` and
  `POST /emsapi/fileupload/status`; on the labels/apps/list pages Accept
  is not documented but is sample-consistent, so it is sent uniformly
  there too (an engineering recommendation, not a documented requirement
  there). The file upload additionally carries `Module: MDM_APP_MGMT`;
  the JSON calls carry `Content-Type: application/json`; the Zoho token
  exchange keeps its own form-urlencoded header set (no bearer, no
  Accept).
- **Retry classes and the documented rate limits (Round 5, R5-06).** No
  MDM mutation page documents idempotency, duplicate or re-association
  behavior, so the tool's retry policy is split by call class. READ-SAFE
  calls — the Zoho token exchange, the app-list GET pages, the group GET,
  and the file-status poll (a POST in verb, a pure status read) — retry
  HTTP 429, error code COM0002 ("API Limit Exceeded") and 5xx: 3
  attempts, backoff 1 s then 2 s. MUTATIONS — the label POST, the file
  upload, the app create, the add-version PUT and the group association —
  retry ONLY 429/COM0002 (an engineering judgment: such rejections are
  assumed pre-execution refusals; whether that is always so is
  undocumented — the conservative direction), and a 5xx after a mutation
  FAILS CLOSED after ONE attempt with a re-run reconciliation diagnostic:
  the server may have applied the change, and replaying a mutation whose
  duplicate behavior is undocumented could double-apply it. A re-run
  performs the reconciliation (the run start re-reads the app list,
  reuses the Beta label, and re-checks the monotonic version before any
  mutation). Transport-level failures fail closed immediately in both
  classes. A FINAL 429/COM0002 failure, either class, names the documented
  5-minute lock — except a mutation 5xx carrying a rate-rejection envelope
  (HTTP ≥500 with a COM0002 body), which keeps the ambiguity diagnostic
  only: the ambiguity guidance is the safer message there, the recorded
  T26-R1 precedence. The documented per-endpoint rate footers (every page's
  "Wait time before consecutive API requests" is that 5-minute lock):

| Endpoint                                         | Documented footer       |
| ------------------------------------------------ | ----------------------- |
| most mutation pages (labels, apps create/update) | 60 requests per minute  |
| `GET /api/v1/mdm/groups/{group_id}`              | 120 requests per minute |
| `POST /api/v1/mdm/groups/{group_id}/apps`        | 300 requests per minute |
| `POST /emsapi/fileupload/status`                 | 500 requests per minute |
| every used page (the consecutive-request lock)   | a 5-minute lock         |

The tool's 1 s/2 s backoff deliberately does NOT wait out that lock
(that would stall a run for minutes); a final rate rejection says so in
its message instead. The poll cadence/attempt bound and the retry
counts/backoff are engineering choices — only the limits above are
documented.
[manageengine.com/mobile-device-management/help/api/cloud/ — the
per-page rate footers, Lead-opened 2026-09-04]

- Hardening: the job runs in the `mdm-upload` GitHub environment (7a);
  `permissions: contents: read` + `actions: read`;
  `persist-credentials: false`; release-scoped, serialized concurrency;
  timeout 30 minutes; the three MDM secrets reach the tool only as step
  env — never as flags; optional inputs are forwarded only when non-empty;
  the Beta target triple is forwarded from the environment variables.

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
- **Duplicate Beta-label POST behavior.** The research records channel
  creation — `POST /api/v1/mdm/labels` with `{"channel_name":"Beta"}`
  returning a `release_label_id` — but nothing about a duplicate channel
  name. The upload tool REUSES the app's existing Beta label id whenever
  one is present, so the POST normally runs only once per app (when it has
  no Beta label yet); if a POST ever does collide with an existing channel,
  the run fails closed at that step (named error, no mutation), and a human
  resolves it in the console on first encounter. Unverified without a live
  tenant.
- **GET /groups/{id} error shape for an unknown group id.** The
  group-details success shape (flat body vs a wrapped `group` object) is
  tolerated by the tool, but what a real tenant actually returns for a
  nonexistent group id — the status, the error envelope, the message — is
  undocumented; the tool treats any non-200 or unparseable outcome as "the
  group is missing" and refuses. Unverified without a live tenant.
- **The actual app-list pagination envelope.** The walk implements the
  documented envelope (`paging.next`, `limit`/`offset`,
  `metadata.total_record_count`), but the docs' own apps example carries no
  envelope at all; what the live app-list response actually contains —
  `paging`, `metadata`, both or neither — is a live-tenant fact the first
  dry-run is expected to record.
- **The actual `/emsapi/files` and `/emsapi/fileupload/status` responses
  for a real APK.** The tool implements the documented two-phase lifecycle
  (fileStatus 1 = pending / 2 = completed / 3 = failed; poll on 1 until
  `file_availability_status` 2), but whether a real upload of a real APK
  ever returns the initial PENDING (1), what the status endpoint returns
  for an unknown or expired fileID, and what additional fields the live
  responses carry are live-tenant facts the first dry-run and upload are
  expected to record.
- **Whether ManageEngine sets `restrictions_pending`.** The app treats a
  provisional restrictions bundle (the Android
  `KEY_RESTRICTIONS_PENDING` marker) as "no evidence yet" and holds at
  startup rather than mounting Preparation; whether the ManageEngine
  managed-config push actually sets that marker on real devices is
  unverified.
- **Whether ManageEngine always pushes `kiosk_device_role`.** The kiosk
  derivation accepts any of three affirmative signals — the explicit
  `customer_kiosk` value, the DPC lock-task allowlist, or live full lock
  task mode — and fails closed to standard otherwise (pending without lock
  evidence included); whether the MDM always delivers the explicit
  `kiosk_device_role` value on Customer kiosks — rather than the device
  deriving kiosk from lock evidence alone — is unverified.
- **Whether the live server enforces the documented-Mandatory request
  fields (Round 5).** `Accept: application/json` (the files, group, associate
  and file-status calls), the add-version body's `app_name` + `app_type`,
  and the `group_type` 6 enumeration are documented on their pages; the
  tool complies with the documented contract regardless (fail-closed
  direction), but whether the live tenant actually rejects requests that
  omit them is unverified.
- **Duplicate / re-association behavior of the mutations (Round 5).**
  Beyond the duplicate-label case above, no mutation page documents what
  happens when `POST /api/v1/mdm/apps` collides with an existing app
  name, when the add-version PUT re-adds a file, or when
  `POST /api/v1/mdm/groups/{group_id}/apps` re-associates an
  already-associated app — which is exactly why a mutation that fails with
  5xx fails closed unretried (the server may have applied it). Live-tenant
  behavior unverified.
- **The Zoho token throttle's HTTP status (Round 5).** The documented
  limit is at most 10 access tokens per refresh token per 10 minutes (the
  tool performs one exchange per run); what status or error a throttled
  exchange actually returns is undocumented.
- **The GitHub environments and their variables are not yet configured
  (human prerequisite, Round 5).** The `mdm-upload` environment's three
  Beta-target VARIABLES (`MDM_BETA_GROUP_ID` / `MDM_BETA_GROUP_NAME` /
  `MDM_PRODUCTION_GROUP_ID` — Section 7a's exact steps), the
  environment-scoped secret migration, and optional protection
  (`android-signing` too) are admin actions; until the variables exist,
  the first dispatch fails closed at the presence check — by design.

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
- developer.android.com — the Intent reference
  (`ACTION_APPLICATION_RESTRICTIONS_CHANGED`: a protected, system-sent
  broadcast), the ContextCompat receiver-flag guidance ("from the system
  UID" ⇒ `RECEIVER_NOT_EXPORTED`), and the Android 14 behavior changes
  (the receiver-flag requirement exempts system-broadcast-only receivers) —
  reviewed 2026-09-04 (R5-09: no change needed)
- manageengine.com/mobile-device-management/help/ — enrollment (QR template,
  Fully Managed), Single-App Kiosk and kiosk recovery, in-house (Enterprise)
  apps, managed app configuration, silent install, app updates and rollback
  (pages last updated 2026-07/08)
- manageengine.com/mobile-device-management/help/api/cloud/ — the CLOUD HELP
  tree, authoritative for KISOK's cloud deployment, Lead-opened 2026-09-04:
  api-index.html (the API Index, Files section), files-upload-file-ems.html
  (`POST /emsapi/files` — `fileStatus` 1/2/3, the `Module: MDM_APP_MGMT`
  header, multipart key `file`, `Accept` Mandatory),
  files-get-file-upload-status.html (`POST /emsapi/fileupload/status` —
  `fileIDs` array-of-strings, `file_availability_status`, 500/min),
  app-management-update-app-details.html (the add-version request body —
  Mandatory `app_name` + `app_type`, `release_label_id` a PATH parameter),
  groups-get-an-existing-group.html (group details — `group_type` "6 —
  Device Group", 120/min), groups-create-apps-from-agroup.html (the group
  association, `silent_install`, 300/min), create-app-channel.html
  (`POST /api/v1/mdm/labels`) and add-an-app.html (`POST /api/v1/mdm/apps`);
  the rate footers: 60/min on most mutation pages and the 5-minute lock
  ("Wait time before consecutive API requests") on every page
- manageengine.com/mobile-device-management/api/ — the edition-general tree
  (revalidated 2026-09-03/04): api/oauth/ (token exchange), api/pagination/
  (the read envelope), api/apps/ (repository reads, per-app
  `release_labels`), api/devices/ and the `approve` production-promotion
  contract. This tree lacks the file-status endpoint — the incomplete sweep
  behind the Round 4 IR-02 mistake (review.md) — and its "Endpoint Domain"
  page lists the DNS-dead `accounts.zoho.ca` / `accounts.zoho.cn` hosts
  (R5-C1); where the two trees disagree, the cloud help tree wins for
  KISOK's cloud deployment
- zoho.com/developer/oauth/ and
  zoho.com/accounts/protocol/oauth/multi-dc.html — Zoho OAuth
  refresh-token exchange, token lifetimes, the "Do not share this
  credentials" guidance, the token throttle (10 access tokens per refresh
  token per 10 minutes), and the multi-dc accounts-host table (the ca/cn
  exceptions) (2026; hosts verified against the live serverinfo endpoints
  2026-09-04)
- manageengine.com edition-comparison-matrix — edition capabilities
  (2025-04-03)
- docs.github.com actions events documentation — the `workflow_dispatch`
  default-branch requirement (fetched 2026-09-02)
- docs.github.com actions secure-use, manage-environments and
  workflow-runs REST documentation — full-length-SHA action pinning,
  deployment environments with required reviewers, and the workflow-run
  fields (name/path/status/conclusion/head_branch) the provenance gate
  validates (2026-07-16/24; workflow-runs reviewed 2026-09-04)
