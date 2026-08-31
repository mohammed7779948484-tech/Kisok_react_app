import { useQuery } from "@tanstack/react-query";

import { fetchStoreSettings } from "../api/fetch-store-settings";

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
export function useStoreSettings() {
  return useQuery({
    // This read takes no parameters, so the key needs no input beyond its
    // "store-settings" segment under the feature root. The data may resolve
    // null (unseeded singleton); that is a value the cache can hold, not an
    // error state.
    queryKey: [...preparationKeys.all, "store-settings"] as const,
    queryFn: fetchStoreSettings,
  });
}
