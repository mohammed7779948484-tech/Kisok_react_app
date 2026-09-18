# DeviceMode — plan

**HOW.** Decisions, contracts, tasks, risks. Progress lives in `todo.md`,
evidence in `worklog.md`.

Status: `READY`

## Research synthesis (first-party sources, opened for this plan)

| Source                                                                       | What it settled                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| developer.android.com/work/managed-configurations                            | `<meta-data android:name="android.content.APP_RESTRICTIONS" android:resource="@xml/app_restrictions"/>`; the `<restrictions>` XML; `RestrictionsManager.getApplicationRestrictions()`; `ACTION_APPLICATION_RESTRICTIONS_CHANGED` **must be registered dynamically**, never in the manifest |
| github.com/android/enterprise-samples → `ManagedConfigurations` (Apache-2.0) | The manifest meta-data placement and the `res/xml` restriction element shape were taken from the sample and adapted; attribution kept in the plugin                                                                                                                                        |
| `UserManager.KEY_RESTRICTIONS_PENDING` (`"restrictions_pending"`)            | A `true` value means real restrictions may arrive shortly and are **not available yet** — so it must not be read as "unmanaged"                                                                                                                                                            |
| `create-expo-module --local`                                                 | The official local-module scaffold; used verbatim, then trimmed to Android-only                                                                                                                                                                                                            |
| ManageEngine help (app update management, kiosk profile)                     | Enterprise apps on kiosk devices are installed and **updated silently** by MDM, no user action; ordinary devices prompt the user. See "Update experience"                                                                                                                                  |

**Honest gap.** `www.manageengine.com` is blocked by this environment's egress
policy, so the ManageEngine REST contracts below could not be re-opened
first-hand. They are carried over from the superseded `feature/kiosk-runtime`
branch, which recorded them from the live help pages, and they are cross-checked
only against search-result summaries here. Every ManageEngine call is therefore
marked **TENANT VALIDATION REQUIRED**: the first real dispatch is the proof.

## Design decisions

**D1 — Read one value, derive three states.** The only managed key KISOK reads
is `kiosk_device_role`. Derivation is a pure function:

```
restrictions_pending === true            → "unknown"   (documented pending semantics)
kiosk_device_role === "customer_kiosk"   → "customer-kiosk"
anything else / empty / no module        → "standard"
```

`"unknown"` is also the initial value on Android before the first read resolves,
and the value after a failed or schema-invalid read (AC-07 fail-closed).

**D2 — One pure access function is the entire guard.**
`deviceRoleAccess(role, mode) → "allowed" | "blocked" | "pending"`. Customer is
always `allowed`. Preparation is `allowed` only on `standard`, `blocked` on
`customer-kiosk`, `pending` on `unknown`. Nothing else in the app reasons about
device policy.

**D3 — React Context, not a store.** Device mode is a provider-owned platform
value read once and refreshed on a system broadcast — the same shape as
`core/auth`'s `AuthProvider`, which is why that one is Context too. A Zustand
store would add a persistence surface and a second mount for a single string.
`AGENTS.md`: "not every client-owned value needs a store".

**D4 — The native module is read-only and Android-only.** It exposes exactly one
async read and one event. It never writes device policy and never inspects
lock-task state.

**D5 — Reuse `useSignOutAction`.** The mismatch screen calls the existing shared
sign-out pipeline; no new auth path.

**D6 — One release workflow, not two.** Build → verify → upload is a single
manual dispatch, so no artifact hand-off between runs and no run-provenance
validation are needed.

**D7 — Match the App Repository entry by package identity.** `com.kisok.kiosk`
is the identity; the display name is only a fallback tie-break and never the
sole matcher.

## Update experience (researched before implementation, as required)

ManageEngine performs **silent install and update of enterprise apps on kiosk
devices with no user intervention**; on ordinary (non-kiosk) devices it can
prompt the user to install an available update. A "user presses Update" button
_inside_ a Single-App Kiosk has no first-party path — nothing but KISOK is
reachable on that screen, so it would require a custom in-app update-check UI
plus a way to trigger the MDM install. That is exactly the substantial custom
system this work must not invent.

**Decision (confirmed with the product owner): use ManageEngine silent update.**
The kiosk tablet updates silently; the employee tablet keeps ManageEngine's own
native update prompt. KISOK builds no updater. Console configuration is listed
in `docs/mdm-operations.md`.

## Contracts

**Supabase:** none. No new RPC, table, grant, or RLS change — and none is
needed. `current_active_profile()` already supplies the role this guard reads.

**Native → JS** (validated with Zod at the boundary):

```ts
{
  restrictions: Record<string, string | number | boolean>;
}
```

**ManageEngine REST** (US data centre, confirmed by the product owner):
`accounts.zoho.com` for the refresh-token grant, `mdm.manageengine.com` for the
API. Calls: token exchange → `POST /emsapi/files` (+ `POST
/emsapi/fileupload/status` while pending) → `GET /api/v1/mdm/apps` (paged, match
on package identity) → `POST /api/v1/mdm/apps` (create) or `PUT
/api/v1/mdm/apps/{app_id}` (update).

## Tasks

Two rounds. Round 1 is the runtime guard; round 2 is the release pipeline.
They are independent — round 2 touches no app code.

| Task | Mode            | Acceptance     | Objective                                                                                     | Deps     | Scaffold                                  |
| ---- | --------------- | -------------- | --------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| T01  | behavior        | AC-01,02,03,04 | `model/device-mode.ts`: the Zod boundary, `deriveDeviceMode`, `deviceRoleAccess`              | —        | `generate schema device-mode device-mode` |
| T02  | behavior        | AC-05, AC-07   | `modules/kiosk-policy` trimmed to an Android-only read + change event; `native/` typed source | T01      | `create-expo-module --local` (done)       |
| T03  | behavior        | AC-01, AC-05   | `state/device-mode-context.tsx`: provider, initial read, broadcast re-read, `useDeviceMode()` | T02      | manual (Context, per D3)                  |
| T04  | behavior        | AC-03, AC-06   | The device-mismatch screen and its route                                                      | T01      | `generate screen` + `generate route`      |
| T05  | behavior-change | AC-01,02,03,04 | Wire the provider and the guard into `app/_layout.tsx` and `app/index.tsx`                    | T03, T04 | manual (existing route files)             |
| T06  | config          | AC-08          | `plugins/with-managed-configuration.ts` + app.config.ts; prove it via `expo prebuild`         | —        | manual (config plugin)                    |
| T07  | config          | AC-09          | `plugins/with-android-release-signing.ts` salvaged from the superseded branch                 | —        | manual (salvage)                          |
| T08  | behavior        | AC-09          | `tools/release/verify-release-apk.ts` salvaged; cert pin made optional                        | T07      | manual (salvage)                          |
| T09  | behavior        | AC-10          | `tools/mdm/publish-app.ts`: OAuth → upload → poll → create/update, matched by package         | —        | manual (rewritten small)                  |
| T10  | config          | AC-09, AC-10   | `.github/workflows/android-release.yml`: one dispatch, build → verify → publish               | T07–T09  | manual (workflow)                         |
| T11  | config          | —              | `features/device-mode/docs/mdm-operations.md`: console setup and required secrets by name     | T10      | manual (docs)                             |

## Added during implementation, outside the task table

Recorded because each arrived without a task naming it, and a silent addition
is the thing an audit should be able to catch:

- `app.config.ts` `android.versionCode: 1` (T07/T10). The release workflow fails
  closed when it is absent, and Expo's hidden `?? 1` default would otherwise
  ship versionCode 1 forever — Android refuses an update that does not increase
  it. Small, and the pipeline does not work without it.
- `--dry-run` on `publish-app.ts` and the `dry_run` workflow input (T09/T10).
  Authenticates and reads without uploading or writing. Given that no
  ManageEngine call has ever been made, a rehearsal that cannot mutate the
  tenant is worth its ~15 lines.
- The "Publish the verified APK as a build artifact" workflow step (T10), so a
  human can inspect exactly what was sent.

## Risks

| Risk                                                                           | Mitigation                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| ManageEngine cannot push a managed configuration to an in-house enterprise app | TENANT VALIDATION REQUIRED before the kiosk tablet is trusted; the guard fails closed (preparation held/blocked), it never fails open |
| The ManageEngine REST contract drifted since it was recorded                   | Every call fails closed with a message naming the endpoint; the first dispatch is the proof                                           |
| The native read races auth resolution                                          | `pending` holds preparation on the startup screen; it is not a guess                                                                  |
| Device-mode logic spreading through the app                                    | One pure function (D2); ESLint keeps `app/**` thin                                                                                    |

## Verification

`pnpm verify`; focused tests per task; `expo prebuild --platform android` plus a
manifest/`res/xml` assertion for AC-08; `gradlew assembleDebug` for the native
compile; GitHub CI on the PR head. The ManageEngine upload and anything needing
the physical Galaxy Tab A9+ are marked **PHYSICAL/TENANT VALIDATION REQUIRED**
and are not claimed as tested.
