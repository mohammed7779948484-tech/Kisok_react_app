import type { AppRole, AuthStatus } from "@/core/auth";

import type { DevicePolicy } from "./derive-device-policy";

/**
 * The visible root-navigator target, derived from (auth status × profile role
 * × device-policy role). AC-03 / AC-04 — the pure decision the app's routing
 * consumes through `useRootTarget()` (plan Design decision 6).
 *
 * Pure: TYPE-ONLY imports, no React, no store, no IO — the file is
 * table-testable domain logic, and auth state can never leak into device
 * policy through it (the policy role is an explicit parameter, by type).
 */
export type RootTarget =
  | "startup"
  | "sign-in"
  | "unauthorized"
  | "customer"
  | "preparation"
  | "kiosk-mismatch";

/** The derived device-policy role (the store's `policy.role`). */
export type RootPolicyRole = DevicePolicy["role"];

/**
 * Decide which root target is visible.
 *
 * Mapping (every row is pinned in `root-guard.test.ts`):
 * - `resolving`/`error` → `"startup"` — callers early-return on these today;
 *   the resolver stays total so the table is complete.
 * - `signedOut` → `"sign-in"` on BOTH policy roles — device policy never
 *   blocks sign-in; a signed-out kiosk is a locked tablet showing sign-in.
 * - `unauthorized` → `"unauthorized"` (today's routing).
 * - `ready` + `customer` → `"customer"` on BOTH policy roles — a customer
 *   kiosk runs the customer experience; that is the product.
 * - `ready` + `preparation` + `"standard"` → `"preparation"` — EXACTLY
 *   today's routing (behavior-change discipline: old rows stay identical).
 * - `ready` + `preparation` + `"customer-kiosk"` → `"kiosk-mismatch"` — THE
 *   new behavior (AC-03): the Preparation experience never mounts on a kiosk.
 */
export function resolveRootTarget(
  status: AuthStatus,
  role: AppRole | undefined,
  policyRole: RootPolicyRole,
): RootTarget {
  if (status === "resolving" || status === "error") {
    return "startup";
  }
  if (status === "signedOut") {
    return "sign-in";
  }
  if (status === "unauthorized") {
    return "unauthorized";
  }

  // status === "ready" — the session carries a tablet role.
  if (role === "customer") {
    return "customer";
  }
  if (role === "preparation") {
    return policyRole === "customer-kiosk" ? "kiosk-mismatch" : "preparation";
  }

  // UNREACHABLE via useAuth today: core/auth resolves a missing profile and
  // every non-tablet role (admin) to `unauthorized` BEFORE `ready`, so `ready`
  // always carries a customer or preparation role. Defensive row, pinned by
  // tests: a pure resolver must not have a hole where a drifted role falls
  // through into an experience it must not see.
  return "unauthorized";
}
