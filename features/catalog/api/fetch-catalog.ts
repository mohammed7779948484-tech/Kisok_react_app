import { callRpc } from "@/core/supabase";

import { catalogSnapshotSchema, type CatalogSnapshot } from "../model/catalog-snapshot.schema";

/** Fetch and runtime-validate the complete customer-safe Catalog snapshot. */
export function fetchCatalog(): Promise<CatalogSnapshot> {
  return callRpc("get_customer_catalog", catalogSnapshotSchema);
}
