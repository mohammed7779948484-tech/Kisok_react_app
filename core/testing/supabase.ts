import type { KisokSupabaseClient } from "@/core/supabase";
import { setSupabaseClient } from "@/core/supabase";

export type RpcResponse = { data: unknown; error: unknown };

export type TableResponse = { data: unknown; error: unknown };

export type MockSupabaseHandlers = {
  /** Keyed by Postgres function name, e.g. `get_customer_catalog`. */
  rpc?: Record<string, (args: unknown) => RpcResponse | Promise<RpcResponse>>;
  /**
   * Keyed by table name, for the direct reads Preparation is allowed:
   * `orders` and `order_items`. Customers can read no table.
   */
  from?: Record<string, () => TableResponse | Promise<TableResponse>>;
};

/**
 * Mock the Supabase client at the CLIENT boundary.
 *
 * Stubbing the client is simpler and more honest than intercepting HTTP for a
 * surface that is mostly RPC calls. Register a handler per function or table
 * name; an unregistered call fails loudly rather than returning `undefined` and
 * producing a confusing error three frames downstream.
 *
 *   const supabase = installMockSupabase({
 *     rpc: { current_active_profile: () => ({ data: [profile], error: null }) },
 *     from: { orders: () => ({ data: [order], error: null }) },
 *   });
 *
 * The `.from()` stub supports the chainable read builder
 * (`select`, `eq`, `in`, `order`, `limit`, `single`, `maybeSingle`) and is
 * awaitable at any point in the chain, matching how supabase-js behaves.
 */
export function installMockSupabase(handlers: MockSupabaseHandlers = {}) {
  const calls: { name: string; args: unknown }[] = [];

  /**
   * A thenable chain: every builder method returns the same object, so the
   * shape of the query does not change the mock. Tests assert on the data and
   * on `callsTo(table)`, not on which builder methods were used.
   */
  function tableBuilder(table: string) {
    const resolve = async (): Promise<TableResponse> => {
      const handler = handlers.from?.[table];
      if (!handler) {
        throw new Error(
          `No mock handler registered for table "${table}". Add one to installMockSupabase({ from: … }).`,
        );
      }
      return handler();
    };

    const builder: Record<string, unknown> = {
      then: (
        onFulfilled: (value: TableResponse) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => resolve().then(onFulfilled, onRejected),
    };

    for (const method of [
      "select",
      "eq",
      "neq",
      "in",
      "is",
      "gte",
      "lte",
      "order",
      "limit",
      "range",
    ]) {
      builder[method] = () => builder;
    }
    // Terminal methods that return a single row rather than a list.
    builder.single = resolve;
    builder.maybeSingle = resolve;

    return builder;
  }

  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      const handler = handlers.rpc?.[name];
      if (!handler) {
        throw new Error(
          `No mock handler registered for rpc "${name}". Add one to installMockSupabase({ rpc: … }).`,
        );
      }
      return handler(args);
    },
    from: (table: string) => {
      calls.push({ name: table, args: undefined });
      return tableBuilder(table);
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: null }),
      signOut: async () => ({ error: null }),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
    realtime: { setAuth: async () => {} },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: async () => {},
  } as unknown as KisokSupabaseClient;

  setSupabaseClient(client);

  return {
    client,
    calls,
    /** Assert which RPCs or table reads ran, and with what arguments. */
    callsTo: (name: string) => calls.filter((call) => call.name === name),
    restore: () => setSupabaseClient(null),
  };
}
