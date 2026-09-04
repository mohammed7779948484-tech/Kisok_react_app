import type { DevicePolicySnapshot } from "./device-policy.schema";

/**
 * The app-wide device policy, derived fail-closed from a validated
 * device-policy snapshot (AC-02).
 *
 * Derivation rules (plan.md Design decisions 2–4, remediation RD-02):
 * - `role` is `"customer-kiosk"` ONLY when an affirmative MDM signal says
 *   so: the managed configuration explicitly (`kiosk_device_role ===
 *   "customer_kiosk"`), the DPC lock-task allowlist (`lockTaskPermitted ===
 *   true`), or live full lock task mode (`lockTaskModeState === "locked"`).
 *   Everything else — missing key, invalid or non-string value, empty
 *   bundle, pending marker — yields `"standard"`. An explicit `"standard"`
 *   combined with an allowlist or LOCKED contradiction resolves toward
 *   kiosk: safety first; downgrading a store tablet is an MDM action (remove
 *   the allowlist / end lock task mode), not an app-config toggle.
 * - A provisional snapshot (`restrictions_pending` truthy — Android's
 *   `UserManager.KEY_RESTRICTIONS_PENDING`: restrictions "may be applied in
 *   the near future but are not available yet") never latches a kiosk signal
 *   from the restrictions bundle or the allowlist; it derives standard until
 *   a later read corrects it. The final state is UNDETERMINED, so the pending
 *   marker is never affirmative evidence of anything (it may not be treated
 *   as verified `standard` either — that is why the store keeps its READINESS
 *   verdict pending, RD-01). The check is truthy, not `=== true`, so a
 *   drifted pending marker still fails closed.
 * - `lockTaskModeState === "locked"` is the ONE exemption from provisional
 *   suppression (RD-02): `getLockTaskModeState()` is a live OS query in the
 *   same snapshot, and LOCKED means "Full lock task mode is active" —
 *   DPC-enforced, unreachable by an app that is not allowlisted. The
 *   restrictions bundle may be provisional, but the lock-task-state field is
 *   current OS evidence, so it corroborates kiosk even while pending (this
 *   also shortens the pending window on real kiosks: mismatch instead of a
 *   startup hold). `"pinned"` is user-exitable screen pinning — never a
 *   kiosk signal — and `"none"` is not affirmative.
 * - `maintenance.code` is the string value of `maintenance_unlock_code`, and
 *   ONLY on a customer-kiosk device (however that role was derived — including
 *   provisional+LOCKED, RD-02). Standard devices, and provisional snapshots
 *   without lock evidence (which derive standard), expose no maintenance
 *   credential at all. A non-string value is never coerced to a
 *   code, and an empty string is treated as unset — an empty code would be a
 *   credential you can type by accident.
 * - `maintenance.timeoutSeconds` is the integer value of
 *   `maintenance_unlock_timeout_seconds`, clamped to [15, 600]; 90 when the
 *   key is missing or not an integer (floats are contract drift, not
 *   something to truncate). Derived regardless of role — inert on a standard
 *   device, which has no code to time out.
 *
 * Pure function: no IO, no auth/session input, no global state. Device policy
 * is independent of Supabase auth (AC-02) — the snapshot is its entire input
 * surface, by type.
 */

/** Managed-configuration key holding the MDM-assigned device role. */
const KIOSK_DEVICE_ROLE_KEY = "kiosk_device_role";

/** The only affirmative role value; every other value means standard. */
const CUSTOMER_KIOSK_ROLE_VALUE = "customer_kiosk";

/** Android `UserManager.KEY_RESTRICTIONS_PENDING` marker. */
const RESTRICTIONS_PENDING_KEY = "restrictions_pending";

/** Managed-configuration key holding the maintenance unlock code. */
const MAINTENANCE_UNLOCK_CODE_KEY = "maintenance_unlock_code";

/** Managed-configuration key holding the maintenance unlock timeout. */
const MAINTENANCE_UNLOCK_TIMEOUT_KEY = "maintenance_unlock_timeout_seconds";

const DEFAULT_MAINTENANCE_TIMEOUT_SECONDS = 90;
const MIN_MAINTENANCE_TIMEOUT_SECONDS = 15;
const MAX_MAINTENANCE_TIMEOUT_SECONDS = 600;

/** Full lock task mode is active (DPC-enforced) — affirmative kiosk evidence. */
const LOCK_TASK_MODE_STATE_LOCKED = "locked";

export type DevicePolicy = {
  role: "customer-kiosk" | "standard";
  maintenance: {
    /** MDM-managed unlock code; null unless the role is "customer-kiosk". */
    code: string | null;
    /** Unlock window length in seconds, clamped to [15, 600]; defaults to 90. */
    timeoutSeconds: number;
  };
};

function clampMaintenanceTimeout(seconds: number): number {
  return Math.min(
    MAX_MAINTENANCE_TIMEOUT_SECONDS,
    Math.max(MIN_MAINTENANCE_TIMEOUT_SECONDS, seconds),
  );
}

function maintenanceCode(
  restrictions: DevicePolicySnapshot["restrictions"],
  role: DevicePolicy["role"],
): string | null {
  if (role !== "customer-kiosk") {
    return null;
  }

  const value = restrictions[MAINTENANCE_UNLOCK_CODE_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function maintenanceTimeoutSeconds(restrictions: DevicePolicySnapshot["restrictions"]): number {
  const value = restrictions[MAINTENANCE_UNLOCK_TIMEOUT_KEY];
  return typeof value === "number" && Number.isInteger(value)
    ? clampMaintenanceTimeout(value)
    : DEFAULT_MAINTENANCE_TIMEOUT_SECONDS;
}

/**
 * Whether a validated snapshot is provisional (Android
 * `UserManager.KEY_RESTRICTIONS_PENDING`). The store consumes this for its
 * READINESS verdict (RD-01): a provisional snapshot derives a policy (per the
 * rules above) but never resolves readiness — the final state is
 * undetermined. Exported so the store and the derivation share ONE definition
 * of provisional-ness, drift included (the check is truthy, not `=== true`).
 */
export function isProvisionalSnapshot(snapshot: DevicePolicySnapshot): boolean {
  return Boolean(snapshot.restrictions[RESTRICTIONS_PENDING_KEY]);
}

/**
 * Derives the app-wide device policy from a validated snapshot.
 *
 * @param snapshot a `DevicePolicySnapshot` that has already passed
 *   `devicePolicySchema` (the source layer owns validation and the
 *   fail-closed fallback for invalid snapshots).
 */
export function deriveDevicePolicy(snapshot: DevicePolicySnapshot): DevicePolicy {
  const { restrictions, lockTaskPermitted, lockTaskModeState } = snapshot;

  // LOCKED is checked OUTSIDE the provisional guard: it is a live OS query,
  // not restrictions-bundle state, so it corroborates kiosk even while the
  // bundle itself is provisional (RD-02).
  const role: DevicePolicy["role"] =
    (!isProvisionalSnapshot(snapshot) &&
      (restrictions[KIOSK_DEVICE_ROLE_KEY] === CUSTOMER_KIOSK_ROLE_VALUE || lockTaskPermitted)) ||
    lockTaskModeState === LOCK_TASK_MODE_STATE_LOCKED
      ? "customer-kiosk"
      : "standard";

  return {
    role,
    maintenance: {
      code: maintenanceCode(restrictions, role),
      timeoutSeconds: maintenanceTimeoutSeconds(restrictions),
    },
  };
}
