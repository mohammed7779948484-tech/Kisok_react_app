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
   Tick **dry run** the first time: it authenticates and reads the App
   Repository but uploads and changes nothing, which is the cheapest way to
   confirm the credentials and the data centre.
3. Run it for real. It builds a signed APK, verifies package identity,
   versionCode, versionName, the signing certificate and the embedded JS
   bundle, then uploads and creates or updates the KISOK enterprise app.

The app is matched in the App Repository by **package identity**
(`com.kisok.kiosk`), read from the documented App Details endpoint. The display
name plays no part: every repository entry is read and checked, so renaming the
app in the console neither hides it from the pipeline nor causes a duplicate,
and an entry that merely shares the name is never touched. If two entries claim
the same package the run stops rather than guessing.

Two consequences worth knowing:

- **The order is verify, then upload.** An App Repository state the script
  cannot read costs nothing — no APK is uploaded until the app is identified.
- **`platform_type` is not asserted.** The field is documented, but its integer
  enum could not be confirmed from an authoritative source (one example shows
  `2` beside an iOS bundle id, another describes `2` as Android), so the run
  logs the value it observed instead of testing it. Identity rests on
  `bundle_identifier` — which on Android IS the package name — plus the
  documented Enterprise `app_type`. If you can confirm the enum from your
  tenant, that check can be tightened. **TENANT VALIDATION REQUIRED.**

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

## Maintenance / settings inside the kiosk

Not implemented, because no current requirement calls for it.

ManageEngine documents a Custom Settings integration for kiosk devices; for
Single-App Kiosk it is embedded in the kiosk app itself via a snippet the vendor
provides. If an in-kiosk maintenance entry point is ever needed, use that
documented integration — do not build a custom unlock runtime.
