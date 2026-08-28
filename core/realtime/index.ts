import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { createLogger } from "@/core/logging";
import { getSupabaseClient } from "@/core/supabase";

const log = createLogger("realtime");

export type RealtimeTable = "orders";

export type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type RealtimeSubscriptionOptions = {
  /** Unique channel name. Two components using the same name share a channel. */
  channel: string;
  table: RealtimeTable;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Optional PostgREST filter, e.g. `status=eq.new`. */
  filter?: string;
  onChange: (payload: RealtimePayload) => void;
  enabled?: boolean;
};

/**
 * Subscribe to Postgres changes for as long as the component is mounted.
 *
 * Lives outside `core/supabase` on purpose: a Realtime subscription is a
 * query-invalidation concern, so a feature's `queries/` layer may use it, while
 * the Supabase client itself stays restricted to `api/`.
 *
 * KISOK treats Realtime as an INVALIDATION SIGNAL, never as a second source of
 * truth: an event says the server state moved, then you refetch the
 * authoritative query. Do not build UI from payload contents — the payload is
 * not filtered the way your query is, and the two will drift.
 *
 * RLS applies to Realtime. Only `public.orders` is published, and only
 * Admin/Preparation can read it — a customer session receives nothing.
 * See docs/data-and-supabase.md.
 *
 * The handler is held in a ref rather than listed as an effect dependency.
 * Callers naturally pass an inline arrow function, which is a new value on every
 * render; depending on it would tear down and rebuild the websocket subscription
 * on each one. The subscription therefore depends only on what actually
 * identifies it — channel, table, event, filter — while still calling the latest
 * handler. This also makes the hook safe under StrictMode's double-mount,
 * because the effect's cleanup always removes the channel it created.
 */
export function useRealtimeSubscription({
  channel,
  table,
  event = "*",
  filter,
  onChange,
  enabled = true,
}: RealtimeSubscriptionOptions) {
  const handlerRef = useRef(onChange);

  // Kept current on every render, so a re-subscribe is never needed just to see
  // a new closure.
  useEffect(() => {
    handlerRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseClient();
    const subscription = supabase
      .channel(channel)
      .on(
        "postgres_changes",
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: RealtimePayload) => handlerRef.current(payload),
      )
      .subscribe((status) => {
        log.debug("channel status", { channel, status });
      });

    // Always remove the channel. Without this, StrictMode's double-mount and
    // every navigation leak a subscription until the server drops it.
    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [channel, table, event, filter, enabled]);
}

/**
 * The common case: when the table changes, mark a query stale so TanStack Query
 * refetches the authoritative read.
 *
 *   useRealtimeInvalidation({
 *     channel: "preparation-orders",
 *     table: "orders",
 *     queryClient,
 *     queryKey: preparationKeys.all,
 *   });
 *
 * `queryKey` is compared by value, not identity, so passing a fresh array
 * literal on every render does not churn the subscription.
 */
export function useRealtimeInvalidation({
  channel,
  table,
  event,
  filter,
  queryClient,
  queryKey,
  enabled = true,
}: {
  channel: string;
  table: RealtimeTable;
  event?: RealtimeSubscriptionOptions["event"];
  filter?: string;
  queryClient: QueryClient;
  queryKey: readonly unknown[];
  enabled?: boolean;
}) {
  useRealtimeSubscription({
    channel,
    table,
    event,
    filter,
    enabled,
    // Recreated every render, which is fine: useRealtimeSubscription holds the
    // handler in a ref, so this closure always sees the current queryKey without
    // the subscription depending on its identity.
    onChange: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
