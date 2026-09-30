import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { preparationKeys } from "../queries/keys";
import { useUpdateOrderStatusMutation } from "../queries/use-update-order-status-mutation";

export type OrderTransition = "preparing" | "ready" | "cancelled";
export type OrderActionError = { orderId: string; error: unknown };

/**
 * One order transition at a time, with its in-flight and rejected state.
 *
 * The server decides every transition (`update_order_status`): another
 * employee may have claimed, finished or cancelled the order a moment
 * earlier. A rejection is shown beside the order it was for and the board is
 * refreshed to the server's truth — nothing is changed locally on a guess.
 * Success refreshes through the mutation's own invalidation and Realtime.
 */
export function useOrderActions() {
  const queryClient = useQueryClient();
  const mutation = useUpdateOrderStatusMutation();
  const [error, setError] = useState<OrderActionError | null>(null);

  const run = (
    orderId: string,
    targetStatus: OrderTransition,
    options: { reason?: string; onSuccess?: () => void; onSettled?: () => void } = {},
  ) => {
    if (mutation.isPending) return;
    setError(null);
    mutation.mutate(
      { orderId, targetStatus, reason: options.reason },
      {
        onSuccess: () => options.onSuccess?.(),
        onError: (caught: unknown) => {
          setError({ orderId, error: caught });
          void queryClient.invalidateQueries({ queryKey: preparationKeys.all });
        },
        onSettled: () => options.onSettled?.(),
      },
    );
  };

  const pending = mutation.isPending && mutation.variables ? mutation.variables : null;

  return {
    run,
    /** The transition in flight, if any. */
    pending: pending ? { orderId: pending.orderId, target: pending.targetStatus } : null,
    busy: mutation.isPending,
    error,
    clearError: () => setError(null),
  };
}
