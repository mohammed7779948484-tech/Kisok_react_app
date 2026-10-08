import { z } from "zod";

import type { AppRole } from "@/core/auth";

/**
 * The complete device-policy domain of this application. It is deliberately
 * one small file: KISOK reads one managed-configuration value for descriptive
 * device context. Account roles determine workspace access; Android and
 * ManageEngine independently own device lockdown.
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
 * whose values are Boolean, int, String or String[]; the native module maps a
 * present null to the EMPTY STRING — deliberately, so a key the DPC delivered
 * as null stays present to JS and derives `unknown` rather than disappearing
 * and deriving `standard` — and reduces anything that is not a
 * String/Boolean/Int to its string form, so only these three primitives ever
 * cross the bridge. A value outside this union means the
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
 * Descriptive device classification, independent of account-role access.
 *
 * `unknown` describes an unresolved, pending, failed or invalid native read.
 * The provider retries unknown results and publishes `unavailable` when those
 * attempts are exhausted. Neither state delays an authorized workspace.
 */
export type DeviceMode = "customer-kiosk" | "standard" | "unknown" | "unavailable";

/** Whether a signed-in role may use its experience on this device. */
export type DeviceRoleAccess = "allowed" | "blocked" | "pending";

/**
 * Derive the device mode from the MDM-pushed managed configuration.
 *
 * Three cases, and the distinction between the first two is the whole point:
 *
 * - The key is ABSENT → `standard`. An ordinary employee tablet has no
 *   managed configuration at all, so absence is positive evidence.
 * - The key holds exactly `customer_kiosk` → `customer-kiosk`.
 * - The key is PRESENT with anything else → `unknown`, never `standard`.
 *   A value we do not recognise — a typo, a stale value, a wrong primitive
 *   type — describes a managed configuration we cannot interpret.
 *
 * `restrictions_pending` wins over all of it, and is read with the same rule:
 * Android documents it as a boolean, so `true` means pending and `false` means
 * settled, but any OTHER present value is a flag we cannot interpret from a
 * DPC that is managing this device — which is `unknown`, not settled.
 */
export function deriveDeviceMode(restrictions: ManagedConfiguration["restrictions"]): DeviceMode {
  const pending = restrictions[RESTRICTIONS_PENDING_KEY];
  if (pending !== undefined && pending !== false) return "unknown";

  const role = restrictions[KIOSK_DEVICE_ROLE_KEY];
  if (role === undefined) return "standard";
  if (role === CUSTOMER_KIOSK_ROLE) return "customer-kiosk";
  return "unknown";
}

/**
 * Workspace access follows the account role, regardless of device mode.
 *
 * Customer and Preparation are the only tablet roles. Other roles stay
 * blocked defensively; `core/auth` normally resolves them to `unauthorized`.
 * Keep the mode parameter for existing consumers, without coupling access to
 * native reads, retries or MDM classification changes.
 *
 * This is a routing decision. Supabase authorization and RLS remain the
 * security boundary.
 */
export function deviceRoleAccess(role: AppRole, _mode: DeviceMode): DeviceRoleAccess {
  return role === "customer" || role === "preparation" ? "allowed" : "blocked";
}
