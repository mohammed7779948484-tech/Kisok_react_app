import type { AppRole, AuthStatus } from "@/core/auth";

import type { DevicePolicy } from "./derive-device-policy";

/**
 * The visible root-navigator target, derived from (auth status × profile role
 * × device-policy role × policy readiness). AC-03 / AC-04 — the pure decision
 * the app's routing consumes through `useRootTarget()` (plan Design decision
 * 6, remediation RD-01/IR-01).
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
 * Whether the device-policy store holds a settled policy verdict (RD-01).
 *
 * "pending" until the platform has produced one: a completed, schema-valid,
 * NON-provisional snapshot (or a module-absent null — web/jest, where the
 * standard default IS the platform verdict). A provisional snapshot, a
 * schema-rejected snapshot, and a failed read all keep it pending — none of
 * them is affirmative evidence of anything. The store owns this verdict; the
 * resolver only consumes it.
 */
export type PolicyReadiness = "pending" | "resolved";

/**
 * Decide which root target is visible.
 *
 * Mapping (every row is pinned in `root-guard.test.ts`):
 * - `resolving`/`error` → `"startup"` — callers early-return on these today;
 *   the resolver stays total so the table is complete.
 * - `signedOut` → `"sign-in"` on BOTH policy roles and BOTH readiness values —
 *   device policy never blocks sign-in, and employee-facing flows must not be
 *   delayed by a pending read (RD-01 rejected gating anything but the
 *   preparation row); a signed-out kiosk is a locked tablet showing sign-in.
 * - `unauthorized` → `"unauthorized"` (today's routing).
 * - `ready` + `customer` → `"customer"` on BOTH policy roles — a customer
 *   kiosk runs the customer experience; that is the product.
 * - `ready` + `preparation` + `"customer-kiosk"` → `"kiosk-mismatch"` — the
 *   kiosk veto (AC-03): the Preparation experience never mounts on a kiosk.
 *   NOT gated on readiness: a kiosk verdict is already affirmative, and a
 *   provisional snapshot with live LOCKED corroboration derives kiosk
 *   (RD-02), so a real kiosk shows the mismatch immediately instead of
 *   holding at startup.
 * - `ready` + `preparation` + `"standard"` + `"resolved"` → `"preparation"` —
 *   EXACTLY today's routing (behavior-change discipline: old rows stay
 *   identical).
 * - `ready` + `preparation` + `"standard"` + `"pending"` → `"startup"` — THE
 *   one new row (RD-01/IR-01): the native restrictions read is disk I/O that
 *   "may take several seconds" and has no ordering guarantee against auth
 *   resolution, so a fast auth must hold Preparation at the startup target
 *   until the policy read resolves. Expo Router's `Stack.Protected` removes
 *   routes only AFTER the guard flips — it cannot prevent a first mount — so
 *   the gate must happen here, in the resolver's inputs, before any
 *   `(preparation)` route exists.
 */
export function resolveRootTarget(
  status: AuthStatus,
  role: AppRole | undefined,
  policyRole: RootPolicyRole,
  policyReadiness: PolicyReadiness,
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
    if (policyRole === "customer-kiosk") {
      return "kiosk-mismatch";
    }
    if (policyReadiness === "pending") {
      return "startup";
    }
    return "preparation";
  }

  // UNREACHABLE via useAuth today: core/auth resolves a missing profile and
  // every non-tablet role (admin) to `unauthorized` BEFORE `ready`, so `ready`
  // always carries a customer or preparation role. Defensive row, pinned by
  // tests: a pure resolver must not have a hole where a drifted role falls
  // through into an experience it must not see.
  return "unauthorized";
}
