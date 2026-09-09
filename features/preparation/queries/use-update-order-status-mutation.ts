import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateOrderStatus, type UpdateOrderStatusInput } from "../api/update-order-status";

import { preparationKeys } from "./keys";

/**
 * A write, with the cache invalidation it implies.
 *
 * Mutations never retry automatically — the shared QueryClient disables it —
 * because a blind retry of a write can duplicate it. Retry deliberately, from
 * the UI, reusing the same request identity where the server expects one.
 *
 * Guard against double submission in the UI too: disable the control while
 * `isPending` and ignore repeat presses. That is a usability guard; the server's
 * idempotency contract is what actually prevents a duplicate.
 */
export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateOrderStatusInput) => updateOrderStatus(input),
    onSuccess: () => {
      // Invalidate the whole feature by KEY TOPOLOGY: every key this feature
      // registers nests under ["preparation"], and a status change can move
      // an order between board groups, out of the board into history, and
      // change the detail projection — so orders-derived queries are all
      // stale together. One `.all` invalidation is simpler and safer than
      // enumerating per-key scopes, which drift the moment a query is added
      // (T06's history read is next). The trade it accepts: the store-settings
      // singleton does NOT read orders, so it is refetched too — one harmless
      // extra read of a single row, accepted for that simplicity.
      void queryClient.invalidateQueries({ queryKey: preparationKeys.all });
    },
  });
}
