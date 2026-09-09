import type { OrderStatus } from "./store-day";

/**
 * The order-action eligibility rules: which buttons the Preparation UI may
 * OFFER for an order. They MIRROR the transition matrix the server enforces in
 * `update_order_status`
 * (supabase/migrations/20260826050008_lean_order_operations.sql, the
 * preparation branches of lines 54–184):
 *
 * - new + unassigned → "start preparing" (new→preparing CLAIMS the order to
 *   the actor, setting `assigned_preparation_id`; the RPC raises K1004 for an
 *   already-assigned new order — migration 04's `orders_assignment_coherent`
 *   makes that combination impossible server-side, but the model mirrors the
 *   rule anyway).
 * - preparing + assigned to the ACTOR → "mark ready" (preparing→ready is
 *   assignee-only; the RPC raises 42501 when
 *   `assigned_preparation_id IS DISTINCT FROM` the actor).
 * - new | preparing → "cancel" (the RPC's cancel branch checks only the
 *   status for the preparation role — cancellation is NOT
 *   assignment-restricted; any active preparation employee may cancel any
 *   eligible order, including a colleague's).
 * - ready → NO preparation action (completion is admin-only in the separate
 *   web app; there is no ready→preparing path).
 * - completed | cancelled (terminal) → NO action (the RPC refuses with K1004
 *   "already final" before any branch runs).
 *
 * These rules are for UI affordances ONLY — which buttons to render, enable,
 * or hide. The `update_order_status` RPC is the authority: it re-checks the
 * actor, the status, and the assignment under the row lock. A server rejection
 * (state conflict, forbidden) is surfaced as feedback near the action and the
 * affected data is refreshed — it is never pre-validated away, never retried
 * blindly, and never fabricated locally. An affordance granted here is a hint,
 * not a right; one denied here hides a button but does not gate a request.
 *
 * PURE domain rules, per the model/ boundary: no IO, no React, and no Supabase
 * imports — ESLint confines `@/core/supabase` to `api/**`, so
 * {@link OrderActionOrder} is structural (the T06 `store-day` precedent): a
 * generated `Tables<"orders">` row satisfies it field-for-field. `OrderStatus`
 * is imported from `./store-day`, where T06 already defined it — not
 * duplicated here.
 *
 * The model is TOTAL over its input type. Migration 04's coherence constraints
 * make some combinations unreachable server-side (a coherent `new` row is
 * always unassigned; `preparing`/`ready`/`completed` always carry an
 * assignment), but the rules mirror the RPC's own checks — which the RPC runs
 * defensively regardless — so every expressible row has an answer.
 */

/**
 * The order fields the eligibility rules key on. Structural: every
 * `Tables<"orders">` row satisfies it, and nothing else is read.
 */
export type OrderActionOrder = {
  status: OrderStatus;
  assigned_preparation_id: string | null;
};

/** The full affordance set for one order, as a card footer consumes it. */
export type OrderActions = {
  startPreparing: boolean;
  markReady: boolean;
  cancel: boolean;
};

/**
 * Whether the actor may claim this order with "start preparing": a NEW order
 * that is still unassigned. Mirrors the RPC's new→preparing branch, including
 * its K1004 "The order is already assigned." guard — succeeding claims the
 * order to the actor.
 */
export function canStartPreparing(order: OrderActionOrder): boolean {
  return order.status === "new" && order.assigned_preparation_id === null;
}

/**
 * Whether the actor may mark this order ready: a PREPARING order assigned to
 * them. Mirrors the RPC's assignee-only guard (`IS DISTINCT FROM` → 42501) —
 * a colleague's order, or an unassigned one, is not markable. Any string
 * actor id is distinct from a null assignment, exactly as the SQL is.
 */
export function canMarkReady(order: OrderActionOrder, actorPreparationId: string): boolean {
  return order.status === "preparing" && order.assigned_preparation_id === actorPreparationId;
}

/**
 * Whether the actor may cancel this order: NEW or PREPARING, regardless of
 * assignment — the RPC's cancel branch is the one transition with no assignee
 * check, so any active preparation employee may cancel any eligible order,
 * including a colleague's. `ready` is admin territory and terminal statuses
 * are final, so neither is ever cancel-eligible.
 */
export function canCancel(order: OrderActionOrder): boolean {
  return order.status === "new" || order.status === "preparing";
}

/**
 * The whole affordance set in one call — the shape a card footer or details
 * action bar consumes per render. Composed from the three rules above, so it
 * can never drift from them.
 */
export function allowedOrderActions(
  order: OrderActionOrder,
  actorPreparationId: string,
): OrderActions {
  return {
    startPreparing: canStartPreparing(order),
    markReady: canMarkReady(order, actorPreparationId),
    cancel: canCancel(order),
  };
}
