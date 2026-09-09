import { useQuery } from "@tanstack/react-query";

import { fetchCatalog } from "../api/fetch-catalog";
import { createCatalogView } from "../model/catalog-view";

import { catalogKeys } from "./keys";

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
export function useCatalog() {
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: fetchCatalog,
    select: createCatalogView,
  });
}
