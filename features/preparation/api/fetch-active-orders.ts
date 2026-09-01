import { toAppError } from "@/core/errors";
import { getSupabaseClient, type Tables } from "@/core/supabase";

/**
 * A read. This module and its siblings in `api/` are the ONLY place in the
 * feature allowed to reach Supabase — ESLint enforces it. Screens, components,
 * stores and query hooks all go through here.
 *
 * Keeping the network in one module per operation is what makes the feature
 * testable: a test mocks this file, not the whole client.
 */

/**
 * One active order with its immutable item snapshot, as the board read returns
 * it. `order_items` is the embedded side of the `order_items_order_id_fkey`
 * relationship (a to-many embed, so always an array — possibly empty).
 */
export type ActiveOrderRow = Tables<"orders"> & {
  order_items: Tables<"order_items">[];
};

/**
 * The preparation board's data source: every ACTIVE order — new, preparing and
 * ready (`ready` stays visible display-only; terminal orders are the history
 * screen's concern) — newest first, with the item snapshot embedded in the same
 * read so the cards can render their summary without a second round trip.
 *
 * A direct table read, not an RPC: the `orders_internal_select` policy
 * (migration 20260826050013) lets an active preparation session select ALL rows
 * and the client filters here. PostgREST returns exactly the columns the
 * migration declares, so the generated `Tables<"orders">` type IS the contract —
 * direct reads are deliberately not Zod-revalidated (docs/data-and-supabase.md,
 * "Direct table access").
 */
export async function fetchActiveOrders(): Promise<ActiveOrderRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("orders")
    // One read for the board: the embed rides the order_items_order_id_fkey
    // relationship the generated types declare.
    .select("*, order_items(*)")
    // The three ACTIVE statuses. Rides orders_status_created_idx together with
    // the ordering below.
    .in("status", ["new", "preparing", "ready"] as const)
    // Newest first — the most recently placed order leads the board — matching
    // the plan's created_at desc and riding orders_status_created_idx.
    .order("created_at", { ascending: false });

  if (error) throw toAppError(error);
  return data;
}
