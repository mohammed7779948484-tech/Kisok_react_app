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
 * - Outside Android (web, jest), managed configurations are unavailable and
 *   the device is classified as `standard`.
 * - On Android, a missing module indicates a build integration issue and
 *   produces `unknown`, as do unreadable or invalid native payloads.
 *
 * Classification remains accurate without controlling account-role access.
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
