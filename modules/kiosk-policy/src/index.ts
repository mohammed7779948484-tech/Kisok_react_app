/**
 * KISOK kiosk-policy — typed JavaScript surface for the Android-only Expo
 * local module `expo.modules.kioskpolicy.KioskPolicyModule`.
 *
 * Deliberately a thin, dependency-free typed surface:
 *  - No business logic — the fail-closed device-policy derivation lives in
 *    the kiosk-runtime feature (`model/`, T02); this module must stay
 *    importable from anywhere without pulling feature or app code.
 *  - No fallback behaviour — `getKioskPolicyModule()` returns `null` when
 *    the native module is unavailable (web, jest, non-Android platforms).
 *    The feature's source layer (T04) owns the fallback, not this module.
 *
 * Native contract (Kotlin side — read-only by design; never calls
 * startLockTask/stopLockTask or any DevicePolicyManager write API):
 *  - `getDevicePolicySnapshot()`: `restrictions` (MDM-pushed managed app
 *    restrictions; empty map when no DPC manages the device; null-valued
 *    restriction keys are treated as unset and omitted by the Kotlin layer,
 *    so every emitted value fits `string | number | boolean`),
 *    `lockTaskPermitted` (DPC lock-task allowlist corroboration),
 *    `lockTaskModeState` ("none" | "locked" | "pinned" — "pinned" is
 *    user-exitable screen pinning, never an enforced kiosk).
 *  - `addListener("onRestrictionsChanged", ...)`: fires when the system
 *    broadcasts a managed-configurations change; JS then re-reads the
 *    snapshot.
 */
import { requireOptionalNativeModule } from "expo";

export type KioskRestrictionsNative = Record<string, string | number | boolean>;

export type KioskPolicySnapshotNative = {
  restrictions: KioskRestrictionsNative;
  lockTaskPermitted: boolean;
  lockTaskModeState: "none" | "locked" | "pinned";
};

export type KioskPolicyModuleInterface = {
  getDevicePolicySnapshot(): Promise<KioskPolicySnapshotNative>;
  addListener(
    eventName: "onRestrictionsChanged",
    listener: () => void,
  ): {
    remove(): void;
  };
};

/**
 * Returns the native `KioskPolicy` module, or `null` when it is unavailable
 * (web, jest, any non-Android platform).
 */
export function getKioskPolicyModule(): KioskPolicyModuleInterface | null {
  return requireOptionalNativeModule<KioskPolicyModuleInterface>("KioskPolicy");
}
