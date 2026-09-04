import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { createLogger } from "@/core/logging";

import { useDevicePolicyStore } from "../state/device-policy-store";
import { readDevicePolicySnapshot, subscribeToRestrictionsChanges } from "./policy-source";

const log = createLogger("kiosk-runtime.devicePolicySync");

/**
 * Binds the native device policy to the app-wide store (plan Design decision
 * 3, remediation RD-01): read on mount, re-read on restrictions changes and
 * when the app returns to the foreground, and clear the maintenance session
 * the moment the app leaves the foreground (AC-05 — the unlock is ephemeral).
 *
 * This hook is also what drives the store's READINESS verdict: a completed
 * snapshot resolves it (inside `applySnapshot`), a null read resolves it via
 * `markModuleAbsent` (web/jest — the standard default IS the platform
 * verdict), and a rejected read leaves it untouched (no evidence).
 *
 * Mounted exactly once at the app root (wired into `app/_layout.tsx` in
 * T07). Everything flows through the `policy-source` seam; the store owns
 * what a snapshot MEANS — validation plus fail-closed derivation (T02/T03)
 * plus the readiness verdict (T14).
 *
 * Listener/resolver separation follows the `core/auth` context shape: the
 * event listeners stay trivial, and all async resolution happens in
 * `refresh`, outside the listeners.
 */
export function useDevicePolicySync(): void {
  useEffect(() => {
    // One refresh at a time: a re-entrant event while a read is pending must
    // never interleave applies. But it must not be LOST either — on a tablet
    // that stays foregrounded for a whole shift, the last event carries the
    // freshest MDM state, and silently dropping it would pin a stale snapshot
    // until the next AppState transition. So a burst of re-entrant events
    // collapses into exactly ONE queued re-run, started from `finally` after
    // the guard is released. That re-run passes the check-and-set below like
    // any other entry (the guard is already false when it starts), so it
    // cannot recurse unboundedly: one burst, one follow-up read.
    let refreshInFlight = false;
    let rerunRequested = false;

    const refresh = async (): Promise<void> => {
      if (refreshInFlight) {
        rerunRequested = true;
        return;
      }
      refreshInFlight = true;
      try {
        const snapshot = await readDevicePolicySnapshot();
        if (snapshot !== null) {
          useDevicePolicyStore.getState().applySnapshot(snapshot);
        } else {
          // null = no native module (web/jest/non-Android): the store's
          // fail-closed standard default IS the platform verdict, so the
          // readiness resolves — those platforms must never hold at the
          // startup target. Absence is synchronous and is not an error.
          useDevicePolicyStore.getState().markModuleAbsent();
        }
      } catch {
        // One error, no payload — the maintenance code travels inside the
        // restrictions, so nothing from a failed read may reach a log. A
        // failed read is not evidence for any role: keep the last-known-good
        // policy AND the last-known readiness verdict — a failed read can
        // neither create nor destroy a verdict; a queued re-run or the next
        // refresh point retries.
        log.error("Failed to read the device-policy snapshot; keeping the last-known-good policy");
      } finally {
        refreshInFlight = false;
        if (rerunRequested) {
          rerunRequested = false;
          void refresh();
        }
      }
    };

    // Runtime: the native module signals an MDM restrictions change; JS
    // re-reads the snapshot (the event carries no payload — plan Design
    // decision 3). Registered BEFORE the initial read is dispatched: the
    // read is async, and a change broadcast landing between its snapshot and
    // this registration would be missed until the next AppState-active.
    const unsubscribeRestrictions = subscribeToRestrictionsChanges(() => {
      void refresh();
    });

    // Cold start: read once, only after the listeners above exist.
    void refresh();

    // Leaving the foreground locks the maintenance session (AC-05);
    // returning to it re-reads the policy.
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState: AppStateStatus) => {
        if (nextAppState === "active") {
          void refresh();
        } else {
          useDevicePolicyStore.getState().clearMaintenance();
        }
      },
    );

    return () => {
      unsubscribeRestrictions();
      appStateSubscription.remove();
    };
  }, []);
}
