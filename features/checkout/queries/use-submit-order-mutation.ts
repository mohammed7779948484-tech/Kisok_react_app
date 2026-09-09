import { useMutation } from "@tanstack/react-query";

import { submitOrder, type SubmitOrderInput } from "../api/submit-order";

/**
 * A write, with the cache effects it implies — which for Checkout are none.
 *
 * Mutations never retry automatically — the shared QueryClient disables it —
 * because a blind retry of a write can duplicate it. Retry deliberately, from
 * the unknown-result flow, reusing the SAME client_request_id rather than
 * generating a new one — a fresh id can create a second real order. See
 * docs/data-and-supabase.md.
 *
 * Guard against double submission in the UI too: disable the control while
 * `isPending` and ignore repeat presses. That is a usability guard; the server's
 * idempotency contract is what actually prevents a duplicate.
 *
 * No cache invalidation on success: Checkout owns no queries, and plan D12
 * (features/checkout/docs/plan.md) forbids cross-feature catalog invalidation —
 * there is no public invalidation seam, the customer gets no Realtime, and the
 * catalog refetches on its own terms. This write invalidates nothing this
 * feature reads, so `queryClient` is not used at all.
 *
 * Deliberately thin (plan D8/D13): this hook is only the review screen's
 * transport. The attempt lifecycle — persist-before-submit, outcome resolution,
 * confirmed-before-clear — lives in the checkout attempt store.
 */
export function useSubmitOrderMutation() {
  return useMutation({
    mutationFn: (input: SubmitOrderInput) => submitOrder(input),
  });
}
