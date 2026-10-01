import { toAppError } from "@/core/errors";
import { callRpc } from "@/core/supabase";

import {
  createOrderResponseSchema,
  type CreateOrderResponse,
} from "../model/create-order-response.schema";
import type { NormalizedOrderItem } from "../model/normalized-request";

/**
 * A write. Like every module in `api/`, this is the only layer allowed to reach
 * Supabase — and the single door for the whole checkout feature (plan D13: the
 * review screen's mutation hook AND the store's recovery replay both go through
 * this one function, never a second wrapper).
 *
 * Writes in KISOK go through RPCs that own correctness server-side:
 * `create_order(client_request_id, items)` already handles idempotency, request
 * fingerprinting, deterministic stock locking, conflict reporting, immutable
 * snapshots and the inventory ledger. Do NOT reimplement any of it here.
 *
 * A `kind: "stock_conflict"` result is a successful call, never an exception —
 * it is routed to the conflict panel, not the error path. Both return families
 * (success and stock_conflict) are runtime-validated by `callRpc` against
 * `createOrderResponseSchema`, so a backend change fails loudly at this
 * boundary instead of surfacing as `undefined` in a screen.
 *
 * Retry safety: if this write must be retried after an ambiguous result, reuse
 * the SAME client_request_id rather than generating a new one — a fresh id can
 * create a second real order. See docs/data-and-supabase.md and the checkout
 * plan's ambiguity rules (D3).
 *
 * Boundary contract: a failure escaping this function is ALWAYS an `AppError`.
 * `callRpc` already maps RPC error responses and schema mismatches, but a
 * rejected promise (transport failure, a client-side throw) would otherwise
 * propagate a raw error — so every rejection is funneled through `toAppError`
 * here. The attempt store's ambiguity classification (plan D3) branches on
 * `AppError.kind`: a raw TypeError leaking through this boundary would be
 * unclassifiable and break the definite-vs-ambiguous split (AGENTS.md §5:
 * convert everything to AppError at the api/ boundary).
 */
export type SubmitOrderInput = {
  clientRequestId: string;
  items: NormalizedOrderItem[];
};

/**
 * How long an order request may go unanswered. React Native's Android HTTP
 * client never times out on its own, so a connection that silently died would
 * leave the customer on "Sending…" forever. Past this, the request is
 * cancelled and its outcome is unknown: checkout re-sends the SAME request,
 * which the server deduplicates.
 */
export const SUBMIT_ORDER_TIMEOUT_MS = 30_000;

export async function submitOrder(input: SubmitOrderInput): Promise<CreateOrderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUBMIT_ORDER_TIMEOUT_MS);
  try {
    return await callRpc(
      "create_order",
      { client_request_id: input.clientRequestId, items: input.items },
      createOrderResponseSchema,
      { signal: controller.signal },
    );
  } catch (error) {
    // An AppError (RPC error response or schema mismatch, already mapped by
    // callRpc) passes through unchanged; everything else becomes one.
    throw toAppError(error, "We couldn't submit your order.");
  } finally {
    clearTimeout(timer);
  }
}
