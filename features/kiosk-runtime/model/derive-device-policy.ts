import type { DevicePolicySnapshot } from "./device-policy.schema";

/**
 * The app-wide device policy, derived fail-closed from a validated
 * device-policy snapshot (AC-02).
 *
 * Derivation rules (plan.md Design decisions 2–4):
 * - `role` is `"customer-kiosk"` ONLY when the MDM-pushed managed
 *   configuration explicitly says so (`kiosk_device_role === "customer_kiosk"`)
 *   OR the DPC lock-task allowlist corroborates it
 *   (`lockTaskPermitted === true`). Everything else — missing key, invalid or
 *   non-string value, empty bundle, pending marker — yields `"standard"`.
 *   An explicit `"standard"` combined with an allowlist contradiction
 *   resolves toward kiosk: safety first; downgrading a store tablet is an MDM
 *   action (remove the allowlist), not an app-config toggle.
 * - A provisional snapshot (`restrictions_pending` truthy — Android's
 *   `UserManager.KEY_RESTRICTIONS_PENDING` semantics) never latches a kiosk
 *   signal; it is treated as standard until a later read corrects it. The
 *   check is truthy, not `=== true`, so a drifted pending marker still fails
 *   closed.
 * - `maintenance.code` is the string value of `maintenance_unlock_code`, and
 *   ONLY on a customer-kiosk device. Standard (or provisional) devices expose
 *   no maintenance credential at all. A non-string value is never coerced to a
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
 * Derives the app-wide device policy from a validated snapshot.
 *
 * @param snapshot a `DevicePolicySnapshot` that has already passed
 *   `devicePolicySchema` (the source layer owns validation and the
 *   fail-closed fallback for invalid snapshots).
 */
export function deriveDevicePolicy(snapshot: DevicePolicySnapshot): DevicePolicy {
  const { restrictions, lockTaskPermitted } = snapshot;

  const provisional = Boolean(restrictions[RESTRICTIONS_PENDING_KEY]);
  const role: DevicePolicy["role"] =
    !provisional &&
    (restrictions[KIOSK_DEVICE_ROLE_KEY] === CUSTOMER_KIOSK_ROLE_VALUE || lockTaskPermitted)
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
