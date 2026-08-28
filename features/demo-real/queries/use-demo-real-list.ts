import { useQuery } from "@tanstack/react-query";

import { fetchDemoRealList } from "../api/demo-real-api";

import { demoRealKeys } from "./keys";

/**
 * Server state for this feature.
 *
 * TanStack Query is the only server-state cache in the app — do not mirror this
 * data into a Zustand store. Client-owned state (a cart, a selection, a draft)
 * belongs in `state/`; anything that came from the database belongs here.
 *
 * Retry behaviour comes from the shared QueryClient, which only retries errors
 * that could plausibly succeed. Do not override `retry` without a reason.
 */
export function useDemoRealList() {
  return useQuery({
    queryKey: demoRealKeys.list(),
    queryFn: fetchDemoRealList,
  });
}
