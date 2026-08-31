import { callRpc } from "@/core/supabase";

import {
  orderStatusUpdateSchema,
  type OrderStatusUpdate,
} from "../model/order-status-update.schema";

/**
 * A write. Like every module in `api/`, this is the only layer allowed to reach
 * Supabase.
 *
 * This is the feature's ONLY write path and its safety-critical core: every
 * board action — start preparing, mark ready, cancel — rides the
 * `update_order_status` RPC, which owns transition legality server-side
 * (migration 20260826050008): `new → preparing` claims the order to the actor,
 * `preparing → ready` is assignee-only, cancel is allowed from `new`|
 * `preparing`, and anything else is rejected. This layer NEVER pre-validates
 * those rules — it sends the request and surfaces the server's verdict;
 * T07's model mirrors them for UI hints only. A rejected transition arrives
 * from `callRpc` as an `AppError` (typically `state-conflict` for K1004,
 * `forbidden` for 42501), which the UI shows as feedback and never retries
 * blindly.
 */

/**
 * The three transitions the preparation UI can request. The server accepts all
 * five `order_status` values, but this client never legitimately requests
 * `completed` (Admin web app only) or `new` (not a tablet target) — the union
 * is the honest client boundary, not a re-implementation of the server's
 * rules.
 */
export type UpdateOrderStatusInput = {
  orderId: string;
  targetStatus: "preparing" | "ready" | "cancelled";
  /**
   * Pass-through to the RPC's `reason` argument. This feature's UI does not
   * capture a reason (plan decision 4 — cancel confirms destructively without
   * one); the field exists because the RPC accepts it, and a future additive
   * change may use it.
   */
  reason?: string;
};

export async function updateOrderStatus(input: UpdateOrderStatusInput): Promise<OrderStatusUpdate> {
  return callRpc(
    "update_order_status",
    {
      // The RPC's argument names are snake_case (order_id, target_status,
      // reason); the input follows the feature's camelCase convention. An
      // undefined reason serializes away, so the RPC applies its own
      // `reason text default null` when none is provided.
      order_id: input.orderId,
      target_status: input.targetStatus,
      reason: input.reason,
    },
    // callRpc validates the jsonb projection with T01's schema and maps
    // failures to AppError — the api boundary's whole error contract.
    orderStatusUpdateSchema,
  );
}
