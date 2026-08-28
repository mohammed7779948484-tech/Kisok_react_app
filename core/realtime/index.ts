import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { createLogger } from "@/core/logging";

import { getSupabaseClient } from "@/core/supabase";

const log = createLogger("supabase.realtime");

export type RealtimeTable = "orders";

export type RealtimeSubscriptionOptions = {
  /** Unique channel name. Two components using the same name share a channel. */
  channel: string;
  table: RealtimeTable;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Optional PostgREST filter, e.g. `status=eq.new`. */
  filter?: string;
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
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
 * truth: an event tells you the server state moved, then you refetch the
 * authoritative query. Do not build UI directly from payload contents — the
 * payload is not filtered the way your query is, and you will drift.
 *
 * RLS applies to Realtime. In the current schema only `public.orders` is
 * published, and only Admin/Preparation can read it — a customer session
 * receives nothing. See docs/data-and-supabase.md.
 */
export function useRealtimeSubscription({
  channel,
  table,
  event = "*",
  filter,
  onChange,
  enabled = true,
}: RealtimeSubscriptionOptions) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = getSupabaseClient();
    const subscription = supabase
      .channel(channel)
      .on(
        "postgres_changes",
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        onChange,
      )
      .subscribe((status) => {
        log.debug("channel status", { channel, status });
      });

    // Always remove the channel. Without this, React StrictMode's double-mount
    // and every navigation leak a socket subscription until the server drops it.
    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [channel, table, event, filter, onChange, enabled]);
}

/**
 * The common case: when the table changes, mark a query stale so TanStack Query
 * refetches the authoritative read.
 *
 *   useRealtimeInvalidation({
 *     channel: "preparation-orders",
 *     table: "orders",
 *     queryClient,
 *     queryKey: ["preparation", "orders"],
 *   });
 */
export function useRealtimeInvalidation({
  channel,
  table,
  filter,
  queryClient,
  queryKey,
  enabled = true,
}: {
  channel: string;
  table: RealtimeTable;
  filter?: string;
  queryClient: QueryClient;
  queryKey: readonly unknown[];
  enabled?: boolean;
}) {
  useRealtimeSubscription({
    channel,
    table,
    filter,
    enabled,
    onChange: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
