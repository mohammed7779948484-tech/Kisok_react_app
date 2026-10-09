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
 * gets the honest "not known yet" answer. This classification does not delay
 * workspace access for either authorized tablet role.
 */
const DeviceModeContext = createContext<DeviceMode>("unknown");

/**
 * How many times an unresolved read is retried before the mode settles on
 * `unavailable`, and the delay before each retry.
 *
 * A failed read or persistent `restrictions_pending` eventually becomes a
 * terminal descriptive state. Workspace access never waits for these retries.
 */
const RETRY_DELAYS_MS = [500, 1000, 2000] as const;

export function DeviceModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DeviceMode>("unknown");
  // Reads are disk I/O with no ordering guarantee, and two change broadcasts
  // in quick succession can resolve out of order. Only the newest read may
  // publish, so a late earlier result cannot overwrite current classification.
  const latestRead = useRef(0);
  // The last verdict a read actually produced, or null before the first one.
  // The existing classification retention policy keeps a kiosk verdict during
  // transient re-read failures. It does not control account-role access.
  const lastSettled = useRef<DeviceMode | null>(null);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = (attempt: number) => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      const token = (latestRead.current += 1);

      void readDeviceMode().then((next) => {
        if (!active || token !== latestRead.current) return;

        if (next !== "unknown") {
          lastSettled.current = next;
          setMode(next);
          return;
        }

        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          // Out of attempts. Stop trusting an earlier classification: a change
          // broadcast can mean that the managed configuration changed.
          setMode("unavailable");
          return;
        }

        // Preserve the existing classification policy: retain a kiosk verdict
        // while retrying; replace other stale verdicts with `unknown`.
        // Authorized workspaces remain available through either result.
        if (lastSettled.current !== "customer-kiosk") setMode("unknown");
        retryTimer = setTimeout(() => refresh(attempt + 1), delay);
      });
    };

    // Subscribe BEFORE the first read, so a change broadcast that arrives
    // while that read is in flight is not lost. A broadcast restarts the
    // attempt count — the MDM changing something is exactly the event that
    // can turn an unreadable device into a readable one.
    const unsubscribe = subscribeToManagedConfigurationChanges(() => refresh(0));
    refresh(0);

    return () => {
      active = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      unsubscribe();
    };
  }, []);

  return <DeviceModeContext.Provider value={mode}>{children}</DeviceModeContext.Provider>;
}

/** What kind of tablet this is. See `../model/device-mode.schema.ts`. */
export function useDeviceMode(): DeviceMode {
  return useContext(DeviceModeContext);
}
