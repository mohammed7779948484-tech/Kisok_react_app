import { useQueryClient } from "@tanstack/react-query";

import { useRealtimeInvalidation } from "@/core/realtime";

import { preparationKeys } from "./keys";

/**
 * Keep this feature's queries fresh while the screen is open.
 *
 * Realtime is a SIGNAL, not a source of truth: the event only says the server
 * moved, and the authoritative refetch decides what is actually shown. Never
 * render straight from a Realtime payload — it is not filtered the way the query
 * is, and the two will drift.
 *
 * RLS applies to Realtime. Only `public.orders` is published, and only
 * Admin/Preparation can read it — a customer session receives nothing.
 */
export function useOrdersRealtime({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();

  useRealtimeInvalidation({
    channel: "preparation-orders",
    table: "orders",
    queryClient,
    queryKey: preparationKeys.all,
    enabled,
  });
}
