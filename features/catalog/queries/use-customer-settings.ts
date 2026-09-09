import { useQuery } from "@tanstack/react-query";

import { fetchCatalog } from "../api/fetch-catalog";
import type { CatalogSnapshot } from "../model/catalog-snapshot.schema";

import { catalogKeys } from "./keys";

/**
 * The customer-facing store settings another feature may read from the
 * catalog snapshot, narrowed to the one field a consumer needs today.
 *
 * `customerSuccessResetSeconds` is `undefined` when the store has no
 * `store_settings` row — the snapshot's settings is then the empty `{}` union
 * member — and the CALLER applies its own fallback (Checkout uses 25s).
 */
export type CustomerCatalogSettings = {
  customerSuccessResetSeconds: number | undefined;
};

function selectCustomerCatalogSettings(snapshot: CatalogSnapshot): CustomerCatalogSettings {
  const settings = snapshot.settings;
  return {
    customerSuccessResetSeconds:
      "customer_success_reset_seconds" in settings
        ? settings.customer_success_reset_seconds
        : undefined,
  };
}

/**
 * Narrow Catalog-owned read of the customer store settings, selected from the
 * EXISTING catalog query.
 *
 * This is the settings seam of checkout plan D6 (`features/checkout/docs/plan.md`):
 * same `catalogKeys.all` key and same `fetchCatalog` queryFn as `useCatalog()`,
 * so TanStack dedupes the two observers — mounting this next to the catalog
 * screens fires NO second `get_customer_catalog()` RPC and the cache stays the
 * single server-state truth (one raw snapshot under one key). A separate
 * `useQuery` (rather than deriving from `useCatalog()`) keeps this hook's
 * re-renders scoped to the settings object instead of any `CatalogView` change.
 *
 * The query result passes through untouched: `isPending` while the shared query
 * is in flight, `isError` if it failed, and `data` narrowed by `select`. Note
 * `select` receives the RAW cached snapshot — the same value
 * `queryClient.getQueryData(catalogKeys.all)` returns — not the `CatalogView`
 * `useCatalog()` derives.
 */
export function useCustomerCatalogSettings() {
  return useQuery({
    queryKey: catalogKeys.all,
    queryFn: fetchCatalog,
    select: selectCustomerCatalogSettings,
  });
}
