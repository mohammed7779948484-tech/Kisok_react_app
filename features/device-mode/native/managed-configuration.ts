import { Platform } from "react-native";

import { getKioskPolicyModule } from "@/modules/kiosk-policy/src";
import { createLogger } from "@/core/logging";

import {
  deriveDeviceMode,
  managedConfigurationSchema,
  type DeviceMode,
} from "../model/device-mode.schema";

const log = createLogger("device-mode");

/**
 * The platform boundary: the only place that touches the native module.
 *
 * Absence of the module means different things on different platforms, and
 * conflating them is a fail-open:
 *
 * - NOT Android (web, jest) — managed configurations are an Android
 *   Enterprise capability, so there is no DPC at all and the device is by
 *   definition an ordinary one. `standard`.
 * - Android — the module SHOULD be there. Missing means autolinking or
 *   registration failed, i.e. a broken build, and a kiosk APK in that state
 *   would otherwise enable Preparation on a locked tablet. `unknown`.
 *
 * A device that has the module but whose payload cannot be read or trusted
 * fails closed the same way — claiming `standard` on a managed device is the
 * one outcome this feature exists to prevent.
 */
export async function readDeviceMode(): Promise<DeviceMode> {
  const nativeModule = getKioskPolicyModule();
  if (nativeModule === null) {
    if (Platform.OS !== "android") return "standard";
    log.error(
      "The kiosk-policy native module is missing on Android; holding device mode as unknown",
    );
    return "unknown";
  }

  try {
    const parsed = managedConfigurationSchema.parse(await nativeModule.getManagedConfiguration());
    return deriveDeviceMode(parsed.restrictions);
  } catch (caught) {
    log.error("Could not read the managed configuration; holding device mode as unknown", {
      message: caught instanceof Error ? caught.message : String(caught),
    });
    return "unknown";
  }
}

/**
 * Observe managed-configuration changes.
 *
 * The native module re-emits Android's `ACTION_APPLICATION_RESTRICTIONS_CHANGED`
 * broadcast, which is the documented mechanism for learning that the DPC
 * changed this app's configuration. The event carries no payload by design:
 * the caller re-reads through `readDeviceMode()`, so there is exactly one way
 * to obtain the value.
 *
 * Returns an unsubscribe function. Where the module does not exist there is
 * nothing to observe, and unsubscribing is a no-op.
 */
export function subscribeToManagedConfigurationChanges(onChange: () => void): () => void {
  const nativeModule = getKioskPolicyModule();
  if (nativeModule === null) return () => {};

  const subscription = nativeModule.addListener("onManagedConfigurationChanged", onChange);
  return () => subscription.remove();
}
