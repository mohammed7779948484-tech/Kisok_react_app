# DeviceMode — brief

Status: `READY`

## Objective

Authenticated users access the experience authorized by their account role on
any Android device. Device mode is descriptive context and never prevents or
delays a valid Preparation or Customer session. Android and ManageEngine manage
device policies independently.

This intentional product-policy change supersedes the original device/role
compatibility guard. No Supabase authentication, authorization, RLS, checkout,
native RestrictionsManager integration or release infrastructure changes.

## User-visible behaviour

A ready Preparation account reaches the Preparation workspace immediately in
`standard`, `customer-kiosk`, `unknown` and `unavailable` modes. Pending native
reads, retries, failures and configuration changes never withhold or unmount its
workspace. The customer-kiosk blocking screen is unreachable for this account.

A ready Customer account still reaches Customer immediately in every mode.
Signed-out, resolving/error, inactive and unauthorized accounts retain their
existing restrictions; Admin has no tablet experience.

## Acceptance criteria

Existing IDs remain stable. AC-03 (block Preparation on customer kiosk) and
AC-06 (device-mismatch sign-out) are **superseded** by AC-11–AC-13 below.

| ID    | Criterion                                                                            | Evidence                                                            |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| AC-01 | Absent managed role remains `standard`; ordinary-device routing is unchanged         | Derivation and routing tests                                        |
| AC-02 | Customer accesses its experience on a customer kiosk                                 | Role and routing tests                                              |
| AC-03 | Superseded: device mode no longer denies Preparation access                          | AC-11                                                               |
| AC-04 | `restrictions_pending` still derives `unknown`, without delaying authorized accounts | Derivation and routing integration tests                            |
| AC-05 | Configuration broadcasts still trigger a read                                        | Provider tests                                                      |
| AC-06 | Superseded: no device-mismatch handoff for valid tablet roles                        | AC-11                                                               |
| AC-07 | Malformed/unreadable payloads remain `unknown`, rather than silently `standard`      | Native source tests                                                 |
| AC-08 | Android managed-configuration schema and unset default remain intact                 | Plugin and receiver tests; existing prebuild CI                     |
| AC-09 | Release APK validation remains unchanged                                             | Existing release tests; deployment not performed by this fix        |
| AC-10 | ManageEngine publishing remains unchanged                                            | Existing publish tests; tenant deployment not performed by this fix |
| AC-11 | Ready Preparation accesses its workspace under all four modes, without mismatch      | Shared decision, navigator and index tests                          |
| AC-12 | Unresolved reads, retries and broadcasts never delay or unmount Preparation          | Routing integration regression tests                                |
| AC-13 | Customer routing and other-role restrictions remain correct                          | Role/routing and existing auth tests                                |

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
  is absent, which is itself the platform verdict: `standard`. On Android the
  module missing is NOT that verdict — it means a broken build, and derives
  `unknown` without changing account-role access.
- `app/**` may not import Zustand, TanStack Query or Supabase; the feature
  exposes a provider and hooks.
- No new Supabase contract, grant, or RLS change. None is needed.
