import { z } from "zod";

import type { AppRole } from "@/core/auth";

/**
 * The complete device-policy domain of this application. It is deliberately
 * one small file: KISOK reads ONE managed-configuration value and derives ONE
 * access decision from it. Android and ManageEngine own device lockdown —
 * see `../docs/brief.md` → "What this feature is NOT".
 *
 * Pure: no React, no IO, no native import. Everything here is table-testable.
 */

/**
 * The managed-configuration key this application declares in
 * `res/xml/kiosk_restrictions.xml` (written by
 * `plugins/with-managed-configuration.ts`) and that a ManageEngine
 * app-configuration policy sets on the Customer Kiosk tablet.
 */
export const KIOSK_DEVICE_ROLE_KEY = "kiosk_device_role";

/** The ONLY value that means "this is the store's Customer Kiosk tablet". */
export const CUSTOMER_KIOSK_ROLE = "customer_kiosk";

/**
 * `UserManager.KEY_RESTRICTIONS_PENDING`. Android documents this as: real
 * restrictions may be applied in the near future but are NOT available yet.
 * Reading it as "no restrictions, therefore an ordinary tablet" is precisely
 * the wrong conclusion, so it maps to `unknown` rather than `standard`.
 */
export const RESTRICTIONS_PENDING_KEY = "restrictions_pending";

/**
 * One managed-configuration value. `RestrictionsManager` delivers a `Bundle`
 * whose values are Boolean, int, String or String[]; the native module drops
 * null-valued keys (Android treats an explicit null as unset) and reduces
 * anything that is not a String/Boolean/Int to its string form, so only these
 * three primitives ever cross the bridge. A value outside this union means the
 * native contract broke, and the whole payload is rejected.
 */
export const restrictionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

/**
 * The native payload boundary. Keys are MDM-defined, not app-defined, so any
 * key is accepted — only the VALUE shape is constrained.
 */
export const managedConfigurationSchema = z.object({
  restrictions: z.record(z.string(), restrictionValueSchema),
});

export type ManagedConfiguration = z.infer<typeof managedConfigurationSchema>;

/**
 * What kind of tablet this is.
 *
 * `unknown` is not an error state. It is the honest answer before the first
 * native read resolves, while Android reports `restrictions_pending`, and when
 * a read fails or fails validation — all cases where claiming `standard` would
 * be a guess that fails OPEN on a managed device.
 */
export type DeviceMode = "customer-kiosk" | "standard" | "unknown";

/** Whether a signed-in role may use its experience on this device. */
export type DeviceRoleAccess = "allowed" | "blocked" | "pending";

/**
 * Derive the device mode from the MDM-pushed managed configuration.
 *
 * `restrictions_pending` wins over everything: a role value sitting beside it
 * is not yet the settled policy.
 */
export function deriveDeviceMode(restrictions: ManagedConfiguration["restrictions"]): DeviceMode {
  if (restrictions[RESTRICTIONS_PENDING_KEY] === true) return "unknown";
  return restrictions[KIOSK_DEVICE_ROLE_KEY] === CUSTOMER_KIOSK_ROLE
    ? "customer-kiosk"
    : "standard";
}

/**
 * The entire device guard, as one pure decision.
 *
 * - `customer` is `allowed` on every mode: the customer experience is correct
 *   on a kiosk tablet and on an ordinary one, so device mode never delays it.
 * - `preparation` is `allowed` only on a `standard` device — exactly today's
 *   routing — `blocked` on a Customer Kiosk, and `pending` while the mode is
 *   not yet known, because holding briefly is honest and guessing is not.
 * - Any other role has no tablet experience at all. `core/auth` already
 *   resolves those to `unauthorized` before `ready`, so this row is
 *   unreachable through `useAuth()` today; it exists so the function is total
 *   and a drifted role can never fall through into an experience.
 *
 * This guard is UX protection layered on top of authorization. Supabase RLS
 * remains the boundary that actually refuses work.
 */
export function deviceRoleAccess(role: AppRole, mode: DeviceMode): DeviceRoleAccess {
  if (role === "customer") return "allowed";
  if (role !== "preparation") return "blocked";
  if (mode === "customer-kiosk") return "blocked";
  if (mode === "unknown") return "pending";
  return "allowed";
}
