import { callRpc } from "@/core/supabase";

import { catalogSnapshotSchema, type CatalogSnapshot } from "../model/catalog-snapshot.schema";

/**
 * Fetch and runtime-validate the complete customer-safe Catalog snapshot.
 * v2 is v1 plus each variant's `available_quantity`; v1 stays in place for
 * installed clients that parse its shape strictly.
 */
export function fetchCatalog(): Promise<CatalogSnapshot> {
  return callRpc("get_customer_catalog_v2", catalogSnapshotSchema);
}
