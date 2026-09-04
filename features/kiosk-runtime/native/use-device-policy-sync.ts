import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { createLogger } from "@/core/logging";

import { useDevicePolicyStore } from "../state/device-policy-store";
import {
  isPolicyModuleAbsenceExpected,
  readDevicePolicySnapshot,
  subscribeToRestrictionsChanges,
} from "./policy-source";

const log = createLogger("kiosk-runtime.devicePolicySync");

/**
 * Binds the native device policy to the app-wide store (plan Design decision
 * 3, remediation RD-01): read on mount, re-read on restrictions changes and
 * when the app returns to the foreground, and clear the maintenance session
 * the moment the app leaves the foreground (AC-05 — the unlock is ephemeral).
 *
 * This hook is also what drives the store's READINESS verdict: a completed
 * snapshot resolves it (inside `applySnapshot`), a null read resolves it via
 * `markModuleAbsent` ONLY when module absence is EXPECTED on this platform
 * (RD5-01: non-Android — the standard default IS the platform verdict; on
 * Android an unexpected module absence is a broken build, so readiness
 * stays pending and the device holds at the fail-closed startup target),
 * and a rejected read leaves it untouched (no evidence — the restrictions-
 * change EVENT is the one exception that destroys a stale verdict, via
 * `onRestrictionsChanged`, RD5-02).
 *
 * T21-R1 (the epoch guard): a read is evidence about the world AS IT WAS
 * when the read was dispatched. A restrictions-change event that lands
 * while a read is in flight SUPERSEDES that read — the listener bumps a
 * closure epoch synchronously, and the in-flight refresh discards its
 * result entirely (no `applySnapshot`, no `markModuleAbsent`, no log) so a
 * slow PRE-change snapshot or rejection can never resurrect the permissive
 * verdict the event just destroyed. The re-entrant guard guarantees exactly
 * one queued post-event re-run in that situation, which fetches the new
 * state. AppState re-reads are refresh points, not invalidation signals,
 * and do NOT bump the epoch: a failure that no event superseded still keeps
 * last-known-good (RD5-02's non-event rule).
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
    // T21-R1: bumped synchronously by the restrictions-change listener. A
    // refresh that captured an older value is a read the event superseded —
    // see the guard after the await below.
    let epoch = 0;

    const refresh = async (): Promise<void> => {
      if (refreshInFlight) {
        rerunRequested = true;
        return;
      }
      refreshInFlight = true;
      const myEpoch = epoch;
      try {
        const snapshot = await readDevicePolicySnapshot();
        if (epoch !== myEpoch) {
          // A restrictions-change event landed after this read was
          // dispatched, so the snapshot it returned is PRE-change evidence
          // about a superseded world. Discard it entirely — no apply, no
          // markModuleAbsent, nothing: the listener's re-entrant refresh
          // call already queued exactly one post-event re-run, and that
          // re-run will fetch the new state.
          return;
        }
        if (snapshot !== null) {
          useDevicePolicyStore.getState().applySnapshot(snapshot);
        } else if (isPolicyModuleAbsenceExpected()) {
          // null + non-Android (web/jest/ios): the module cannot exist there,
          // so its absence is the platform verdict — the store's fail-closed
          // standard default resolves readiness; those platforms must never
          // hold at the startup target. Absence is synchronous and is not an
          // error.
          useDevicePolicyStore.getState().markModuleAbsent();
        }
        // null + android: the module is UNEXPECTEDLY absent (RD5-01) — NOT a
        // verdict. Readiness stays "pending" and the device holds at the
        // fail-closed startup target. Deliberately nothing else happens
        // here: absence is not a snapshot application, not a policy change,
        // and not a failure to log.
      } catch {
        // One error, no payload — the maintenance code travels inside the
        // restrictions, so nothing from a failed read may reach a log. A
        // failed read is not evidence for any role: keep the last-known-good
        // policy AND the last-known readiness verdict — a failed read can
        // neither create nor destroy a verdict; the one exception is a read
        // failure that follows a restrictions-change EVENT, where the EVENT
        // (not this failure) already destroyed the stale verdict via
        // `onRestrictionsChanged` (RD5-02). A queued re-run or the next
        // refresh point retries.
        //
        // T21-R1: a rejection superseded mid-flight by an event is discarded
        // the same way a superseded snapshot is — it is not evidence about
        // the current world, so it is not even logged; the queued post-event
        // re-run is the authoritative retry.
        if (epoch === myEpoch) {
          log.error(
            "Failed to read the device-policy snapshot; keeping the last-known-good policy",
          );
        }
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
    //
    // The event means the restrictions CHANGED and were already persisted
    // (the system broadcasts AFTER the write — RD5-02): the old verdict is
    // evidence about a superseded world. Invalidate it SYNCHRONOUSLY — the
    // store action runs here in the listener, BEFORE the async re-read below
    // is dispatched — so a failed or slow re-read can never keep a stale
    // permissive verdict or an unlocked maintenance session alive.
    //
    // T21-R1: bumping the epoch (before the re-read is dispatched) also
    // supersedes any read already in flight — its PRE-change result will be
    // discarded by the guard in `refresh`, so it cannot resurrect the
    // verdict this listener just destroyed.
    const unsubscribeRestrictions = subscribeToRestrictionsChanges(() => {
      epoch += 1;
      useDevicePolicyStore.getState().onRestrictionsChanged();
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
