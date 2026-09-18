# DeviceMode — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: `READY`

## Objective

KISOK ships as one APK (`com.kisok.kiosk`) to two kinds of store-owned Android
tablets. The Customer tablet is corporate-owned, enrolled through ManageEngine
Android Enterprise as Fully Managed / Device Owner, and locked into Single-App
Kiosk. The Employee tablet runs the same APK as an ordinary Android application.

Today the app cannot tell the two apart, so a preparation employee who signs in
on the Customer Kiosk tablet reaches the Preparation experience on a device that
is physically locked to the customer-facing kiosk and cannot be handed back.

This feature gives KISOK the **minimum** device context to prevent that: it
reads one MDM-pushed managed configuration value and lets the existing root
routing refuse the Preparation experience on a Customer Kiosk device.

## What this feature is NOT

Android and ManageEngine own device lockdown. KISOK does not:

- provision, enforce, inspect or escape kiosk/lock-task mode
- call any `DevicePolicyManager` write API, `startLockTask`, or `stopLockTask`
- read `ActivityManager.getLockTaskModeState()` or infer a policy from it
- keep a device-policy snapshot, policy engine, or maintenance-unlock runtime
- replace Supabase role authorization — RLS remains the authorization boundary

The device check is an **additional device/role compatibility guard**, layered
on top of the existing auth and role routing, and nothing more.

## User-visible behaviour

**Employee tablet (ordinary Android, no MDM-managed configuration).** Nothing
changes. A customer profile reaches the customer experience; a preparation
profile reaches the preparation experience, exactly as today.

**Customer Kiosk tablet (ManageEngine pushes `kiosk_device_role =
customer_kiosk`).** A customer profile reaches the customer experience as
normal. A preparation profile never reaches the Preparation UI: it lands on a
short explanation screen that offers the existing shared sign-out, so the tablet
returns to the customer sign-in state.

**While the managed configuration has not been read yet** (the native read is
disk I/O, and Android's own `restrictions_pending` flag says real values may
still be arriving) the app holds a preparation session on the existing startup
screen rather than guessing. A customer session is never held — the customer
experience is correct on both device kinds.

## Acceptance criteria

| ID    | Criterion                                                                                                           | Observable how                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | With no managed configuration (employee tablet, web, dev), device mode is `standard` and role routing is unchanged  | `deviceRoleAccess` table test; root-layout and index route tests                                                                                                                                             |
| AC-02 | `kiosk_device_role = customer_kiosk` + customer profile reaches the customer experience                             | `deviceRoleAccess` table test; index route test                                                                                                                                                              |
| AC-03 | `kiosk_device_role = customer_kiosk` + preparation profile can never reach Preparation UI                           | `deviceRoleAccess` table test; root-layout guard test; index route test                                                                                                                                      |
| AC-04 | Android's documented `restrictions_pending` is treated as "not known yet", never as "unmanaged"                     | `deriveDeviceMode` test; access test asserts `pending` for preparation                                                                                                                                       |
| AC-05 | A managed-configuration change is observed through `ACTION_APPLICATION_RESTRICTIONS_CHANGED` and re-read            | provider test drives the module's event subscription                                                                                                                                                         |
| AC-06 | The blocked preparation session can sign out through the existing shared sign-out pipeline                          | device-mismatch screen test                                                                                                                                                                                  |
| AC-07 | A malformed or unreadable native payload fails closed (never silently "standard" on a managed device)               | managed-configuration source test                                                                                                                                                                            |
| AC-08 | The Android app declares the managed-configuration schema so ManageEngine can push the value                        | `expo prebuild` + assert the generated manifest meta-data and res/xml                                                                                                                                        |
| AC-09 | A dispatched release builds a signed APK, verifies its identity/signature/version/bundle, and refuses on mismatch   | `verify-release-apk` unit tests incl. deliberate mismatch; workflow syntax and script-resolution checks. **NEVER DISPATCHED** — the workflow has not been run once, so end-to-end build→verify is UNVERIFIED |
| AC-10 | The verified APK is uploaded to the ManageEngine App Repository and KISOK is created or updated, matched by package | `publish-app` unit tests over the documented API contract. **NEVER EXECUTED** — no call has been made against a real tenant; TENANT VALIDATION REQUIRED                                                      |

## Out of scope (deliberate)

- Any in-app update UI. ManageEngine performs silent install/update of
  enterprise apps on kiosk devices, and prompts the user on ordinary devices;
  building a KISOK updater would duplicate a first-party capability. See
  `plan.md` → "Update experience".
- Any maintenance/unlock runtime. ManageEngine's Custom Settings integration
  covers an in-kiosk settings entry point if one is ever required; no current
  requirement calls for one.
- Beta/Production group rollout, labels, or device-group orchestration. One
  physical customer tablet is planned.
- Prices, payments, delivery, shipping, public signup, social login.

## Constraints

- Managed configurations are Android-only. On web and in jest the native module
  is absent, which is itself the platform verdict: `standard`.
- `app/**` may not import Zustand, TanStack Query or Supabase; the feature
  exposes a provider and hooks.
- No new Supabase contract, grant, or RLS change. None is needed.
