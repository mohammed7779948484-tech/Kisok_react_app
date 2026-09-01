import { useQuery } from "@tanstack/react-query";

import { fetchActiveOrders } from "../api/fetch-active-orders";

import { preparationKeys } from "./keys";

/**
 * Server state for this read.
 *
 * TanStack Query is the only server-state cache in the app — do not mirror this
 * data into a Zustand store. Client-owned state (a cart, a selection, a draft)
 * belongs in `state/`; anything that came from the database belongs here.
 *
 * Retry behaviour comes from the shared QueryClient, which only retries errors
 * that could plausibly succeed. Do not override `retry` without a reason.
 */
export function useActiveOrders() {
  return useQuery({
    // This read takes no parameters, so the key needs no input beyond its
    // "active-orders" segment under the feature root.
    queryKey: [...preparationKeys.all, "active-orders"] as const,
    queryFn: fetchActiveOrders,
  });
}
