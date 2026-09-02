import { getKioskPolicyModule, type KioskPolicySnapshotNative } from "@/modules/kiosk-policy";

/**
 * The kiosk-runtime platform-IO boundary over the native KioskPolicy module
 * (plan Design decision 3).
 *
 * This file is the feature's ONLY import of `@/modules/kiosk-policy`: every
 * other layer (the sync hook, the store, the UI) consumes the policy through
 * this seam — which is exactly what makes the native module mockable in
 * tests.
 *
 * Responsibilities end at transport:
 * - NO validation or derivation — the model owns the schema (T02) and the
 *   store owns fail-closed application (T03).
 * - NO failure decisions — a native read rejection PROPAGATES to the caller;
 *   the sync hook decides what a failed read means (keep last-known-good).
 * - NO logging — restriction values travel through this layer, and the
 *   maintenance code travels inside the restrictions (AC-05), so this layer
 *   must never emit them anywhere.
 *
 * Web and jest have no native module: `getKioskPolicyModule()` returns null
 * there, and this source degrades to "no policy available" — a null snapshot
 * the hook turns into "apply nothing", leaving the store's fail-closed
 * standard default in place (AC-02).
 */

/** The native module's snapshot type, under the feature's own name. */
export type DevicePolicySnapshotNative = KioskPolicySnapshotNative;

/**
 * Read the current device-policy snapshot from the native module.
 *
 * Resolves null when the module is unavailable (web, jest, non-Android) —
 * platform absence is not an error. A native read failure REJECTS, and the
 * rejection propagates: this layer has no policy authority.
 */
export async function readDevicePolicySnapshot(): Promise<DevicePolicySnapshotNative | null> {
  const kioskPolicyModule = getKioskPolicyModule();
  if (kioskPolicyModule === null) return null;
  return kioskPolicyModule.getDevicePolicySnapshot();
}

/**
 * Subscribe to MDM restrictions changes through the module's
 * `onRestrictionsChanged` event.
 *
 * Returns an unsubscribe that removes the listener. When the module is
 * unavailable there is nothing to observe: the returned unsubscribe is a
 * no-op, so callers never need to know whether native code exists.
 */
export function subscribeToRestrictionsChanges(listener: () => void): () => void {
  const kioskPolicyModule = getKioskPolicyModule();
  if (kioskPolicyModule === null) return () => {};
  const subscription = kioskPolicyModule.addListener("onRestrictionsChanged", listener);
  return () => {
    subscription.remove();
  };
}
