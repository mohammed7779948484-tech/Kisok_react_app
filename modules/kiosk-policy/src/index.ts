import { requireOptionalNativeModule } from "expo";

/**
 * Typed JavaScript surface for the Android-only local module
 * `expo.modules.kioskpolicy.KioskPolicyModule`.
 *
 * Deliberately a thin, logic-free boundary: deriving a device mode from these
 * values belongs to `features/device-mode/model`, so this module stays
 * importable without pulling app code in.
 */

/** One managed-configuration value, as the native layer emits it. */
export type ManagedRestrictionValue = string | number | boolean;

export type KioskPolicyModule = {
  /** The MDM-pushed managed configuration for this package. Empty when unmanaged. */
  getManagedConfiguration(): Promise<{ restrictions: Record<string, ManagedRestrictionValue> }>;
  /** Fires on `ACTION_APPLICATION_RESTRICTIONS_CHANGED`; re-read afterwards. */
  addListener(eventName: "onManagedConfigurationChanged", listener: () => void): { remove(): void };
};

/**
 * The native module, or `null` where it does not exist — web, jest, and any
 * non-Android platform. Absence is a legitimate platform answer, not an error:
 * a device with no managed-configuration capability is an ordinary device.
 */
export function getKioskPolicyModule(): KioskPolicyModule | null {
  return requireOptionalNativeModule<KioskPolicyModule>("KioskPolicy");
}
