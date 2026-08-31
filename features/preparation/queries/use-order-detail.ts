import { useQuery } from "@tanstack/react-query";

import { fetchOrderDetail } from "../api/fetch-order-detail";

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
export function useOrderDetail(orderId: string) {
  return useQuery({
    // The id rides in BOTH the key and the query function: a parameterized key
    // is what stops the cache from serving one order's data for another. The
    // details screen mounts this hook only with a real id (from the route
    // param), so no enabled guard is needed.
    queryKey: [...preparationKeys.all, "order-detail", orderId] as const,
    queryFn: () => fetchOrderDetail(orderId),
  });
}
