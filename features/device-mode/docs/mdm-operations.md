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
keytool -exportcert -keystore <keystore> -alias <alias> | sha256sum
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
(`com.kisok.kiosk`), never by display name alone. If an entry is found that
carries the name but no matching package field, the run stops rather than
updating something it cannot positively identify — resolve that in the console.

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

```
kiosk_device_role = customer_kiosk
```

on the **Customer Kiosk tablet only**. Leave it unset everywhere else — absence
is what makes a tablet an ordinary employee device, and that is the fail-safe
direction.

⚠️ The single assumption most worth confirming: that this tenant can push an app
configuration to an **in-house enterprise** APK, not only to a Managed Google
Play app. If the console does not offer app configuration for the KISOK
enterprise app, stop and report it — the guard still fails closed (Preparation
is withheld, never wrongly granted), but it would never reach the kiosk verdict.

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
