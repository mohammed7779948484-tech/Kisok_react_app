# ManageEngine operations for KISOK

What a human must do in the ManageEngine console and in GitHub. Nothing here is
automated by this repository, and nothing here was executed while writing it —
every step below is **TENANT VALIDATION REQUIRED**.

## GitHub configuration

**Secrets** (Settings → Secrets and variables → Actions → Secrets). Values are
never printed, logged, or committed; the release workflow refuses to run unless
all seven are present.

| Name                        | What it is                                      |
| --------------------------- | ----------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | the upload keystore, base64-encoded             |
| `ANDROID_KEYSTORE_PASSWORD` | its store password                              |
| `ANDROID_KEY_ALIAS`         | the key alias inside it                         |
| `ANDROID_KEY_PASSWORD`      | that key's password                             |
| `MDM_CLIENT_ID`             | ManageEngine OAuth client id (already prepared) |
| `MDM_CLIENT_SECRET`         | ManageEngine OAuth client secret (prepared)     |
| `MDM_REFRESH_TOKEN`         | ManageEngine OAuth refresh token (prepared)     |

**Variables** (same page → Variables). These are PUBLIC by design.

| Name                         | What it is                                                                |
| ---------------------------- | ------------------------------------------------------------------------- |
| `ANDROID_UPLOAD_CERT_SHA256` | the upload certificate's SHA-256 fingerprint — the APK identity pin       |
| `MDM_DATA_CENTRE`            | optional; defaults to `us`. Only set it if the tenant is not in the US DC |

Compute the fingerprint once, from the keystore:

```bash
keytool -exportcert -keystore <keystore> -alias <alias> | sha256sum | cut -d' ' -f1
```

**Environment.** The workflow targets a GitHub environment named
`android-release`. Create it and move the seven secrets from repository scope to
that environment to activate the access boundary; add required reviewers if you
want a human approval before every release.

No `MDM_BETA_GROUP_ID`, `MDM_BETA_GROUP_NAME` or `MDM_PRODUCTION_GROUP_ID` is
used. There is one physical customer tablet; group rollout would be
infrastructure for a fleet that does not exist.

## Releasing

1. Bump `android.versionCode` in `app.config.ts` (Android refuses an update
   whose versionCode is not greater) and `version` if the name should change.
2. Actions → **Android release to ManageEngine** → Run workflow.
   Tick **dry run** the first time: it reads the built APK, authenticates and
   reads the App Repository, but uploads and changes nothing — the cheapest way
   to confirm the credentials, the data centre and that the app resolves to a
   single repository entry.
3. Run it for real. It builds a signed APK, verifies package identity,
   versionCode, versionName, the signing certificate and the embedded JS
   bundle, then uploads and creates or updates the KISOK enterprise app.

The app is matched in the App Repository by **package identity**
(`com.kisok.kiosk`), read from the documented App Details endpoint. The display
name plays no part: every repository entry is read and checked, so renaming the
app in the console neither hides it from the pipeline nor causes a duplicate,
and an entry that merely shares the name is never touched. If two entries claim
the same package the run stops rather than guessing.

Anything the run cannot READ stops it too, rather than being skipped: a
repository entry that is not a readable object, an App Details response that
answers about a different app than the one addressed, an app with no
`bundle_identifier`, or a release label whose name cannot be read. The reason
is always the same — an entry that cannot be judged could be ours, and treating
it as absent is what creates a duplicate enterprise app.

Status against a real tenant, precisely: a real release attempt OBSERVED the
OAuth token exchange, the App Repository listing, and repository-absence
detection all SUCCEED. Then FOUR separate live upload attempts have all
FAILED with the same `HTTP 406 {"errorCode":"406","errorMsg":"Not
Acceptable"}` on `POST /emsapi/files`:

1. A hand-built multipart body (a manual boundary and `Content-Type`) → 406.
2. Node's native `FormData`/`Blob`, field name `file`, no `X-Customer` → 406,
   identical error.
3. Node's native `FormData`/`Blob`, field name `fileName`, no `X-Customer` →
   406, identical error again.
4. Node's native `FormData`/`Blob`, field name `file`, WITH a real
   `X-Customer` header (the tenant's actual customer id) → 406, identical
   error again.

**Do not claim the hand-built multipart body was the cause.** That was the
working theory after attempt 1, and it is now disproven repeatedly: attempts
2–4 removed every characteristic of a hand-rolled request — the boundary,
the `Content-Type` header, all of it — varied the field name and the
customer-id header, one at a time, and the tenant rejected every one exactly
the same way. Something else about the request — or about `/emsapi/files`
itself for this tenant — is what is being rejected, and it is not yet known
what.

**Do not claim `X-Customer` fixes the 406 either.** Attempt 4 tested that
hypothesis directly and it also failed. The following hypotheses have now
been live-tested against `/emsapi/files` and did NOT resolve the 406: manual
boundary vs native FormData, field `file`, field `fileName`, and a real
X-Customer tenant context. The tested `/emsapi/files` representations have
all failed on this tenant; the current public Cloud upload contract for
this specific endpoint remains unresolved — that is different from saying
the endpoint is definitively broken, which the evidence does not establish.

What is held constant across all four failures — the endpoint
(`/emsapi/files`), host (`mdm.manageengine.com`), `Module: MDM_APP_MGMT`,
`Accept: application/json`, and the tenant — is NOT thereby ruled out. These
characteristics simply were not varied by any experiment run so far, so
nothing here proves them innocent; each remains a candidate until an attempt
actually isolates it.

Two things narrow that list, though, from evidence outside the upload calls
themselves:

- **The OAuth scope is confirmed sufficient**, not merely held constant: the
  granted scope includes `MDMOnDemand.MDMDeviceMgmt.READ`, `.CREATE`,
  `.UPDATE` and `MDMOnDemand.MDMInventory.READ`. Scope is no longer the
  leading hypothesis for the 406.
- **The APK itself is accepted by this exact tenant**: the identical
  artifact was uploaded successfully through the ManageEngine web console
  (App Repository → Add App → Android Enterprise App → Self Hosted Apps),
  which correctly read back `com.kisok.kiosk` / `KISOK` / `1.0.0`. That
  upload used the browser's own session-based flow
  (`upload.zoho.com/webupload`, cookies, CSRF) — appropriate for a browser,
  not for this OAuth-authenticated GitHub Actions publisher, and it is NOT
  being adopted here. What it DID establish: the tenant has a real
  customer/tenant id — since tested directly as attempt 4 above, and also
  disproven as the fix.

The production publisher (`tools/mdm/publish-app.ts`) still sends attempt
2's shape — native `FormData`, field `file`, no `X-Customer` — because none
of the four `/emsapi/files` failures has yet been turned into a live success
to change it to, and DO NOT keep permuting `/emsapi/files` further: that
branch of diagnosis is exhausted enough for now. A separate, temporary
diagnostic exists to find out cheaply instead of by spending a full
~16-minute release run per guess:

- `.github/workflows/mdm-upload-diagnostic.yml` (manual dispatch) downloads
  an already-verified production APK artifact rather than rebuilding one, and
  sends it to exactly one endpoint, under exactly one representation, per
  run.
- `tools/mdm/probe-upload.ts` is the standalone script it runs. It isolates
  ONE variable at a time:
  - `cloud_file` — `/emsapi/files`, field `file`, no `X-Customer`. OBSERVED
    to fail (406).
  - `legacy_fileName` — `/emsapi/files`, field `fileName`, no `X-Customer`.
    OBSERVED to fail (406).
  - `cloud_file_with_customer` — `/emsapi/files`, field `file`,
    `X-Customer: <tenant id>` added, everything else identical to
    `cloud_file`. OBSERVED to fail (406).
  - `legacy_api_v1_files` — a DIFFERENT endpoint entirely:
    `POST /api/v1/mdm/files`, which current Cloud API documentation
    describes as the deprecated predecessor `/emsapi/files` replaced (search
    result summary of
    `https://www.manageengine.com/mobile-device-management/api/files/`,
    "Files" page — direct fetch of that page is blocked from this
    environment's egress policy, so the implementation follows the search
    result's quoted Python example verbatim rather than guessing). Its
    documented contract is a RAW POST of the file bytes — no multipart, no
    boundary — with headers `Authorization: Zoho-oauthtoken <token>`,
    `content-type: application/json` (exactly as documented, unusual as
    that is for a binary body) and
    `content-disposition: filename=<file name>`. No `Module` header and no
    `X-Customer` appear in that documented example, so this variant sends
    neither and does not require `MDM_CUSTOMER_ID`. The response is
    documented to carry `file_id`, `content_type`, `file_name`,
    `expiry_time`, `content_length` in one shot — no separate status-poll
    step is documented, unlike `/emsapi/files`'s `fileStatus`/
    `/emsapi/fileupload/status`. `file_id` can exceed
    `Number.MAX_SAFE_INTEGER`, so it is parsed with the same lossless
    source-recovery strategy `tools/mdm/publish-app.ts` uses (duplicated
    locally, not imported). Goal: determine whether this older Cloud upload
    endpoint remains functional for this tenant while `/emsapi/files`
    consistently returns 406. NOT YET OBSERVED — if it succeeds, that
    justifies a separate, later decision about the production publisher; it
    is not pre-committed here.

  Each variant authenticates, optionally confirms repository read access,
  and performs exactly one upload — none of them EVER calls app creation or
  update, even on a successful upload, so a stray probe cannot mutate the
  App Repository.

- The real customer/tenant id is never committed to this public repository.
  It is supplied only as the GitHub Actions environment secret
  `MDM_CUSTOMER_ID` (in `android-release`, alongside the three OAuth
  credentials) and is redacted out of every diagnostic log line the same way
  those credentials are.

Everything below in this section — App Details, Stable label selection, the
create/update bodies, the lossless id handling — is DOCUMENTED and
IMPLEMENTED against the vendor's published contract and unaffected by the
406; but none of it has been exercised live either, because no upload has
yet succeeded to reach them. The Add/Update App, App Details and file-status
CONTRACTS are not themselves in question — only the live upload WIRE
CONTRACT (which endpoint, which transport, which headers) remains
unresolved, and that is now being tested against a second endpoint.

The upload, app creation and app update all remain **TENANT VALIDATION
REQUIRED**: NOT YET OBSERVED to succeed against a real tenant. Do not treat
any of them as proven until a real dispatch — diagnostic or release — shows
it working live. In particular: do not claim `X-Customer` fixes the 406 (it
does not — see attempt 4) and do not claim `legacy_api_v1_files` works until
a live dispatch of it proves it.

Two consequences worth knowing:

- **The order is verify, then upload.** An App Repository state the script
  cannot read costs nothing — no APK is uploaded until the app is identified.
- **The update body's contract has never been observed.** The run sends
  `app_name`, `app_type`, `app_file` and `force_update_in_label: true` to
  `PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}`, on the
  documentation's word that `app_name` is mandatory and that
  `force_update_in_label` is what makes the new build the one devices receive.
  `app_name` is echoed back from App Details, never taken from the workflow, so
  a release cannot rename the app you named in the console. Confirm on the first
  real dispatch that the app's version moves and its name does not.
  **TENANT VALIDATION REQUIRED.**
- **The ManageEngine Cloud contracts are now settled** and the pipeline is
  written to them:

  | contract                | value                                                                    |
  | ----------------------- | ------------------------------------------------------------------------ |
  | App Details (read)      | `GET /api/v1/mdm/apps/{app_id}/labels/{release_label_id}` — LABEL-SCOPED |
  | Update                  | `PUT /api/v1/mdm/apps/{app_id}/labels/{release_label_id}`                |
  | `release_label_type`    | 1 = Stable, 2 = Beta — the SEMANTIC selector                             |
  | `platform_type`         | 1 = iOS, **2 = Android**, 3 = Windows                                    |
  | `app_type`              | 2 = Enterprise (in-house)                                                |
  | File upload             | `POST /emsapi/files`, module `MDM_APP_MGMT`, multipart field `file`      |
  | Add App required fields | `app_name`, `app_type`, and `app_file` for Enterprise apps               |

  `app_category_id`, `supported_devices`, `release_label_id`,
  `bundle_identifier` and `description` are OPTIONAL on Add App, so the create
  body stays minimal — no tenant metadata, no extra variables, no channel
  created on the app's behalf.

- **The Stable label is chosen by type, never by name.** `release_label_name`
  is UI text. Renaming "Stable" in the console does not misroute a release, and
  a channel that merely calls itself Stable is never selected.

- **Identity requires all three** of `bundle_identifier == com.kisok.kiosk`,
  `app_type == 2` and `platform_type == 2`. An entry whose Stable label cannot
  be resolved is never written off as "not ours" — without that label id its
  identity cannot be read at all, so the run stops instead.

## ManageEngine console setup

### 1. The Customer Kiosk tablet

- Enrol as **Fully Managed / Device Owner** (Android Enterprise).
- Apply an **Android Kiosk** profile in **Single-App Kiosk** mode with KISOK as
  the kiosk app.
- ManageEngine owns every lockdown control here — Home, Recents, the status
  bar, the launcher, and kiosk escape. KISOK implements none of it and must not
  be asked to.

### 2. Push the managed configuration — the one thing this feature needs

KISOK declares an Android Enterprise managed-configuration schema in its
manifest, so the console can set app configuration values for it. Set:

**Kiosk device role → "Customer kiosk tablet"** (the stored value is
`customer_kiosk`)

on the **Customer Kiosk tablet only**. Leave it unset everywhere else: an
absent key is what the app reads as an ordinary employee tablet.

Be precise about which direction that is safe in. Absence is safe on an
employee tablet, where it is the truth. It is NOT a fail-safe on the kiosk
tablet — there, an absent key is the one input that wrongly grants Preparation.
Everything else about this feature fails closed; **this single case does not**,
and it cannot, because the app has no way to tell an unconfigured managed
device from an unmanaged one. That makes the app configuration on the kiosk
tablet an operational invariant, not a convenience. See AR-01 below.

The restriction is declared as a **choice**, not free text, so the console
offers that single option rather than a text box.

**An unset key is the only correct employee-tablet configuration.** Setting
`kiosk_device_role` to anything other than `customer_kiosk` does not mean
"ordinary tablet" — it withholds Preparation on that tablet until the value is
removed. That is deliberate: only an MDM can set the key at all, so a value the
app does not recognise means a managed device whose policy it cannot read, and
guessing "ordinary" there is the one failure this feature exists to prevent.
The `choice` restriction stops an administrator typing a wrong value through
the normal UI, but ManageEngine's raw key/value app-config path can still set
one.

⚠️ **Removing the KISOK app configuration silently disables the guard.** A
kiosk tablet presents an empty restrictions bundle if its app configuration is
deleted, never delivered, or fails to reapply after a factory reset or an app
reinstall — and at the Android API level that is indistinguishable from an
unmanaged tablet. The app derives `standard` and Preparation becomes reachable
on the locked tablet, with no signal. There is no unprivileged Android API that
tells the two apart, so this cannot be fixed in the client: it is a
console-discipline invariant. Check the app configuration is present after any
factory reset, re-enrolment or KISOK reinstall.

⚠️ The single assumption most worth confirming: that this tenant can push an app
configuration to an **in-house enterprise** APK, not only to a Managed Google
Play app. If the console does not offer app configuration for the KISOK
enterprise app, **stop — do not put the tablet into service.**

An earlier version of this page claimed the guard "still fails closed" in that
case. That was wrong, and the correction matters: with no app configuration the
kiosk tablet presents an EMPTY restrictions bundle, the app derives `standard`,
and Preparation is reachable on the locked tablet. A tenant that cannot push
the configuration does not get a degraded-but-safe guard — it gets no guard.

### What the tablet does if the configuration cannot be read

The app retries the read a few times and then settles on an "unavailable"
state. Preparation stays blocked — an unreadable tablet is never assumed to be
an ordinary one — and the employee gets a screen that says so and offers sign
out, rather than an indefinite loading screen with no way off the tablet. A
customer is never affected: the customer experience needs no device context.

### 3. Employee tablets

Nothing to configure. No kiosk profile, no app configuration. KISOK behaves as
an ordinary Android application and the existing role routing is unchanged.

## App updates

There is no in-app updater, deliberately.

- **Customer Kiosk tablet.** ManageEngine silently installs and updates
  enterprise apps on kiosk devices with no user intervention. Enable silent /
  scheduled app update for KISOK on this device.
- **Employee tablet.** ManageEngine's own update handling applies — the user can
  be prompted to install an available update.

A "user presses Update" button inside the Single-App Kiosk has no first-party
path: nothing but KISOK is reachable on that screen, so it would need a custom
in-app update-check UI plus a way to trigger the MDM install. That was raised as
a hard stop and the decision was to use ManageEngine's silent update instead.

### What KISOK DOES do, once, after an update

Drawing the line precisely, because "no updater" has been read too broadly:

|                                      | who          |
| ------------------------------------ | ------------ |
| check whether an update exists       | ManageEngine |
| download it                          | ManageEngine |
| install it (silently, on the kiosk)  | ManageEngine |
| tell the customer the tablet changed | **KISOK**    |

After ManageEngine has ALREADY installed a new build, KISOK shows a one-time
local message — "KISOK has been updated", the version, and any bundled
release-note bullets, with a Continue button. It is `features/release-notes`,
and it is informational only: it polls nothing, queries no backend, downloads
nothing and can trigger no install. It compares the running build's version
against one local key (`kisok:last_seen_release`) and nothing else.

A FIRST install shows nothing — the tablet was set up, not updated; the current
release is recorded silently so the next update has something to compare with.
Tapping Continue is what records the new release, so a release is never marked
seen by a customer who never saw it.

Release-note bullets are bundled static copy in
`features/release-notes/model/release-notes.ts`. A release that ships without
bullets still shows the generic line rather than an empty panel — a forgotten
note is not a reason to hide that the tablet changed.

**Still deferred:** notifying the owner or the store BEFORE an update lands.
That needs a channel this app does not have, and is not in this PR.

## Maintenance / settings inside the kiosk

Not implemented, because no current requirement calls for it.

ManageEngine documents a Custom Settings integration for kiosk devices; for
Single-App Kiosk it is embedded in the kiosk app itself via a snippet the vendor
provides. If an in-kiosk maintenance entry point is ever needed, use that
documented integration — do not build a custom unlock runtime.
