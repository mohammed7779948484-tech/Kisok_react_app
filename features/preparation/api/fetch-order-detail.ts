import { toAppError } from "@/core/errors";
import { getSupabaseClient } from "@/core/supabase";

import { type ActiveOrderRow } from "./fetch-active-orders";

/**
 * A read. This module and its siblings in `api/` are the ONLY place in the
 * feature allowed to reach Supabase — ESLint enforces it. Screens, components,
 * stores and query hooks all go through here.
 *
 * Keeping the network in one module per operation is what makes the feature
 * testable: a test mocks this file, not the whole client.
 */

/**
 * The Order Details screen's data source: one order with its immutable item
 * snapshot embedded in the same read, so the screen renders from a single
 * consistency point. Reuses the board read's row type — the embed shape is
 * identical (a to-many embed via `order_items_order_id_fkey`, so always an
 * array, possibly empty).
 *
 * A direct table read, not an RPC: the `orders_internal_select` policy
 * (migration 20260826050013) lets an active preparation session select ALL
 * rows and the client filters by id here. PostgREST returns exactly the
 * columns the migration declares, so the generated `Tables<"orders">` type IS
 * the contract — direct reads are deliberately not Zod-revalidated
 * (docs/data-and-supabase.md, "Direct table access").
 */
export async function fetchOrderDetail(orderId: string): Promise<ActiveOrderRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("orders")
    // One read for the details: the embed rides the order_items_order_id_fkey
    // relationship the generated types declare.
    .select("*, order_items(*)")
    .eq("id", orderId)
    // maybeSingle, not single: a wrong or unknown id returns zero rows, and
    // the details screen must distinguish "no such order" (data null, no
    // error) from a failure (AppError).
    .maybeSingle();

  if (error) throw toAppError(error);
  return data;
}
