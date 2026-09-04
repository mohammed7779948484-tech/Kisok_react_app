import { useCallback, useEffect, useState } from "react";

import { useDevicePolicyStore } from "../state/device-policy-store";
import { MaintenanceEntry } from "./maintenance-entry";
import { MaintenanceSheet } from "./maintenance-sheet";

/**
 * The root maintenance overlay (AC-05) — the ORCHESTRATOR, and the one place
 * the maintenance UI reads the feature's own store.
 *
 * - Renders NOTHING unless the derived policy role is `customer-kiosk`
 *   (employee tablets keep today's app exactly; the overlay is invisible).
 *   A kiosk role derived from an UNSETTLED (provisional) bundle still mounts
 *   the overlay — routing is routing — but the sheet's unlock surface shows
 *   its settling state until a settled read lands (RD5-04 / R5-11).
 * - Renders the corner entry; a long press opens the sheet. The sheet's
 *   open/close state lives here — and it RESETS when the role leaves
 *   `customer-kiosk` (R5-10): React preserves this component's state for as
 *   long as it stays mounted, and returning null on a standard role does NOT
 *   unmount it, so an open sheet would otherwise survive a kiosk→standard→kiosk
 *   transition and reappear over the kiosk UI on return.
 * - The sheet's unlock attempts go through the store's `tryUnlock`; the
 *   session state comes back through `isMaintenanceUnlocked` — the store is
 *   the truth, this component only wires it to the sheet.
 * - Owns the unlock expiry timer the store docstring assigns to the overlay:
 *   `clearMaintenance` scheduled for the session's `expiresAt`, re-armed
 *   whenever a new unlock lands (a new `expiresAt`), disarmed when the
 *   session is cleared, and cleaned up on unmount.
 * - When the panel's account switch completes, clears the session (the brief:
 *   the unlock "clears … when the account is switched") and closes the sheet
 *   so no panel lingers over the sign-in screen.
 *
 * AppState-background clearing is the sync hook's job (T04) — deliberately
 * NOT duplicated here.
 */
export function KioskMaintenanceOverlay() {
  const role = useDevicePolicyStore((state) => state.policy.role);
  const restrictionsSettled = useDevicePolicyStore((state) => state.policy.restrictionsSettled);
  const tryUnlock = useDevicePolicyStore((state) => state.tryUnlock);
  const expiresAt = useDevicePolicyStore((state) => state.maintenance.expiresAt);
  const unlocked = useDevicePolicyStore((state) => state.isMaintenanceUnlocked());

  const [sheetOpen, setSheetOpen] = useState(false);

  const handleAccountSwitched = useCallback(() => {
    // The switch succeeded: the account session is gone. End the maintenance
    // session too (AC-05) and close the sheet — the expiry timer disarms
    // itself below when `expiresAt` returns to null.
    useDevicePolicyStore.getState().clearMaintenance();
    setSheetOpen(false);
  }, []);

  // The expiry timer. `Math.max(0, …)` so a session whose window already
  // elapsed (e.g. the app was frozen) clears immediately rather than never.
  useEffect(() => {
    if (expiresAt === null) return;
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = setTimeout(() => {
      useDevicePolicyStore.getState().clearMaintenance();
    }, delay);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  // R5-10: the overlay stays MOUNTED while the role is standard (it returns
  // null — React preserves the component's state at its position in the
  // tree), so `sheetOpen` would survive a kiosk→standard→kiosk round trip
  // and the sheet would reappear, open, over the kiosk UI. Reset it when the
  // role leaves `customer-kiosk` — before the early return, with the other
  // hooks.
  useEffect(() => {
    if (role !== "customer-kiosk") setSheetOpen(false);
  }, [role]);

  // Standard devices render nothing at all: no entry, no sheet.
  if (role !== "customer-kiosk") return null;

  return (
    <>
      <MaintenanceEntry visible onLongPress={() => setSheetOpen(true)} />
      <MaintenanceSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        unlocked={unlocked}
        restrictionsSettled={restrictionsSettled}
        onTryUnlock={tryUnlock}
        onAccountSwitched={handleAccountSwitched}
      />
    </>
  );
}
