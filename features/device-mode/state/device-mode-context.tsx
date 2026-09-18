import { createContext, useContext, useEffect, useRef, useState } from "react";

import {
  readDeviceMode,
  subscribeToManagedConfigurationChanges,
} from "../native/managed-configuration";
import type { DeviceMode } from "../model/device-mode.schema";

/**
 * Device mode is a provider-owned platform value: read once at startup and
 * refreshed when Android says the MDM changed it. That is the same shape as
 * `core/auth`'s session, which is why this is Context and not a Zustand store
 * — a store would add a persistence surface and a second mount for one string
 * that is neither client-edited nor shared across screens as state.
 *
 * Default `"unknown"` is deliberate. A consumer rendered outside the provider
 * gets the honest "not known yet" answer, which the role guard treats as
 * "hold", never as "ordinary device".
 */
const DeviceModeContext = createContext<DeviceMode>("unknown");

export function DeviceModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DeviceMode>("unknown");
  // Reads are disk I/O with no ordering guarantee, and two change broadcasts
  // in quick succession can resolve out of order. Only the newest read may
  // publish: a late earlier one would silently downgrade a kiosk tablet to
  // "standard", which is the one failure this feature exists to prevent.
  const latestRead = useRef(0);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      const token = (latestRead.current += 1);
      void readDeviceMode().then((next) => {
        if (active && token === latestRead.current) setMode(next);
      });
    };

    // Subscribe BEFORE the first read, so a change broadcast that arrives
    // while that read is in flight is not lost.
    const unsubscribe = subscribeToManagedConfigurationChanges(refresh);
    refresh();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return <DeviceModeContext.Provider value={mode}>{children}</DeviceModeContext.Provider>;
}

/** What kind of tablet this is. See `../model/device-mode.schema.ts`. */
export function useDeviceMode(): DeviceMode {
  return useContext(DeviceModeContext);
}
