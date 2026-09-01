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
 * The read's entire input: the store-day window's start, as an ISO instant.
 * The api does no date math of its own — the window is the model's decision,
 * which keeps this module a thin, typed, testable boundary.
 */
export type StoreDayHistoryInput = {
  terminalSince: string;
};

/**
 * The store-day history screen's data source: the TERMINAL orders — completed
 * and cancelled — that became terminal at or after the window's start,
 * ordered newest-created first.
 *
 * The prefilter is EXACT decision-2 semantics: an order belongs to the day it
 * became terminal, so the read bounds on the terminal timestamps themselves —
 * `status in ('completed','cancelled') AND (completed_at ≥ dayStart OR
 * cancelled_at ≥ dayStart)`. With status pinned to the two terminal values the
 * OR is safe: a completed order has `completed_at` set and `cancelled_at`
 * null (the coherence constraints make cross-matches impossible), so exactly
 * one branch can match each row. A `created_at`-keyed bound (the original
 * shape) would silently exclude an order created days earlier and cancelled
 * today — a weekend-stale order cancelled Monday — from Monday's history
 * (T06-R01).
 *
 * Which of the fetched rows belong to the CURRENT store day (the window's end
 * bound, DST-length days included) is decided client-side by the model's
 * terminal-timestamp filter, not here.
 *
 * Deliberately NO `order_items` embed: history rows render display number,
 * time, status and assignment; item detail is the details screen's concern,
 * so this read stays lean.
 *
 * A direct table read, not an RPC: the `orders_internal_select` policy
 * (migration 20260826050013) lets an active preparation session select ALL
 * rows and the client filters here. PostgREST returns exactly the columns the
 * migration declares, so the generated `Tables<"orders">` type IS the
 * contract — direct reads are deliberately not Zod-revalidated
 * (docs/data-and-supabase.md, "Direct table access").
 */
export async function fetchStoreDayHistory(
  input: StoreDayHistoryInput,
): Promise<Tables<"orders">[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("orders")
    // The whole row and nothing else — no embed (see the docblock).
    .select("*")
    // The two TERMINAL statuses; rides orders_status_created_idx together
    // with the ordering below.
    .in("status", ["completed", "cancelled"] as const)
    // The terminal-timestamp prefilter: an OR over the two terminal columns,
    // bounded by the window's start. The status filter above guarantees
    // exactly one of the two columns is non-null per row.
    .or(`completed_at.gte.${input.terminalSince},cancelled_at.gte.${input.terminalSince}`)
    // Newest-created first, riding orders_status_created_idx.
    .order("created_at", { ascending: false });

  if (error) throw toAppError(error);
  return data;
}
