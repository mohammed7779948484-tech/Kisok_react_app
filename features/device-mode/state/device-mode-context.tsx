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

/**
 * How many times an unresolved read is retried before the mode settles on
 * `unavailable`, and the delay before each retry.
 *
 * Nothing re-reads on its own unless the MDM changes something, so without
 * this a single failed read — or a `restrictions_pending` that never settles —
 * would hold a preparation employee on the startup screen indefinitely, with
 * no way to hand a kiosk tablet back. Giving up is what makes the state
 * explainable and the sign-out reachable; it does not fail open, because
 * `unavailable` still blocks preparation.
 */
const RETRY_DELAYS_MS = [500, 1000, 2000] as const;

export function DeviceModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DeviceMode>("unknown");
  // Reads are disk I/O with no ordering guarantee, and two change broadcasts
  // in quick succession can resolve out of order. Only the newest read may
  // publish: a late earlier one would silently downgrade a kiosk tablet to
  // "standard", which is the one failure this feature exists to prevent.
  const latestRead = useRef(0);
  // Whether any read has ever produced a real verdict. Used to avoid dropping
  // a working session back to `unknown` for a transient re-read failure.
  const hasSettled = useRef(false);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const refresh = (attempt: number) => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      const token = (latestRead.current += 1);

      void readDeviceMode().then((next) => {
        if (!active || token !== latestRead.current) return;

        if (next !== "unknown") {
          hasSettled.current = true;
          setMode(next);
          return;
        }

        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          // Out of attempts. Settle somewhere the UI can explain — and do NOT
          // keep trusting an earlier reading: a change broadcast is exactly
          // the event that can turn an ordinary tablet into a kiosk one.
          setMode("unavailable");
          return;
        }

        // Only publish `unknown` before anything has ever been read. Once a
        // mode is settled, a transient re-read failure must not unmount the
        // preparation stack under an employee mid-shift; the retry window is
        // short, and exhausting it still falls to `unavailable` above.
        if (!hasSettled.current) setMode("unknown");
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
