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
      // `.all` IS the narrow scope for this write: a status change can move
      // an order between board groups, move it out of the board into
      // history, and change the detail projection — every query in this
      // feature reads the same rows. Narrowing further (per-id) would leave
      // the board and history serving stale membership.
      void queryClient.invalidateQueries({ queryKey: preparationKeys.all });
    },
  });
}
