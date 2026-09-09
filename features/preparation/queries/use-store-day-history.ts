import { useQuery } from "@tanstack/react-query";

import { fetchStoreDayHistory } from "../api/fetch-store-day-history";
import {
  currentStoreDayWindow,
  effectiveTimezone,
  isTerminalInDay,
  resolveStoreTimezone,
} from "../model/store-day";

import { preparationKeys } from "./keys";
import { useStoreSettings } from "./use-store-settings";

/**
 * Server state for this read.
 *
 * TanStack Query is the only server-state cache in the app — do not mirror this
 * data into a Zustand store. Client-owned state (a cart, a selection, a draft)
 * belongs in `state/`; anything that came from the database belongs here.
 *
 * Retry behaviour comes from the shared QueryClient, which only retries errors
 * that could plausibly succeed. Do not override `retry` without a reason.
 *
 * The history read composes three things: the store settings (T04), the
 * current store-day window computed from the resolved timezone (the model —
 * including the device-zone fallback for an unseeded settings row, plan
 * decision 8), and the terminal-timestamp-prefiltered read whose rows are then
 * filtered client-side to the ones that became terminal inside the day window
 * `[start, end)` (plan decision 2 — the prefilter bounds the transfer, the
 * model owns the day). The resolved data is `{ window, orders }` — the screen
 * groups the orders via the model's helper, not a re-implementation.
 */
export function useStoreDayHistory() {
  const settingsQuery = useStoreSettings();

  // The settings row may resolve null (no migration seeds the singleton — plan
  // decision 8): that is a RESOLVED state, and effectiveTimezone degrades to
  // the device zone for it. Only a pending or errored settings query leaves
  // the window unresolved.
  const dayWindow =
    settingsQuery.data !== undefined
      ? currentStoreDayWindow(
          new Date(),
          effectiveTimezone(resolveStoreTimezone(settingsQuery.data)),
        )
      : null;

  const historyQuery = useQuery({
    // The day rides the key as the window's startUtc ISO string — and the
    // window (and therefore the key) is recomputed on every RENDER, because
    // the day boundary is a property of `new Date()` at render time. So the
    // key rolls to the new day on the next render after the store-day
    // boundary — any re-render (navigation, dialogs, data changes, realtime
    // invalidation, window focus) recomputes the window and rolls the query
    // to the new day's key and queryFn. A mounted screen with ZERO renders
    // across the boundary keeps serving the previous day until one happens,
    // and a refetch of the still-cached old-day key re-runs that key's
    // captured closure (its own window) rather than the new day. Deliberately
    // no refetchInterval here: a timed rollover policy is the history screen's
    // decision (T14), not the read's. While settings are unresolved the key
    // holds a placeholder segment — the query is disabled then, so it never
    // fetches under it.
    queryKey: [
      ...preparationKeys.all,
      "store-day-history",
      dayWindow === null ? "settings-unresolved" : dayWindow.startUtc.toISOString(),
    ] as const,
    // Disabled until the window exists: no timezone to key the day on, no
    // bound to send. TanStack never runs a disabled query's queryFn, but
    // manual refetch() bypasses `enabled` (verified in query-core), which is
    // why the exposed refetch below composes instead of passing through.
    enabled: dayWindow !== null,
    queryFn: async () => {
      if (dayWindow === null) {
        throw new Error(
          "useStoreDayHistory bug: the history queryFn ran before the settings query resolved a store-day window.",
        );
      }
      // The prefilter bound is the window's START — the terminal timestamps
      // themselves, exact decision-2 semantics. The day's END bound is
      // decided HERE, on the terminal instant, inside [start, end).
      const orders = await fetchStoreDayHistory({
        terminalSince: dayWindow.startUtc.toISOString(),
      });
      return {
        window: dayWindow,
        orders: orders.filter((order) => isTerminalInDay(order, dayWindow)),
      };
    },
  });

  // Settings gate the read, so their state is part of this hook's truth — but
  // a settings error only takes the hook over when there is no history data to
  // show: while cached history data is present, a failed settings refetch is
  // transient noise under the data, not a reason to drop the day's orders. The
  // overrides keep every standard result field — status, isPending, isError,
  // isLoading, error — telling the same story instead of only data doing so.
  const settingsErrorDominates = settingsQuery.isError && historyQuery.data === undefined;
  const status = settingsErrorDominates ? "error" : historyQuery.status;

  return {
    ...historyQuery,
    // Retry goes to the settings query FIRST (the gate; query-core's manual
    // refetch bypasses `enabled`, so a passed-through refetch would run the
    // disabled history query under the placeholder key instead of re-running
    // the failing settings read), then refreshes the history under whatever
    // window the fresh settings resolve.
    refetch: async () => {
      await settingsQuery.refetch();
      return historyQuery.refetch();
    },
    status,
    isPending: status === "pending",
    isError: status === "error",
    isSuccess: status === "success",
    isLoading: historyQuery.isLoading || settingsQuery.isLoading,
    error: settingsErrorDominates ? settingsQuery.error : historyQuery.error,
  };
}
