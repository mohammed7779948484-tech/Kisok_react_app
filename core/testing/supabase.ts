import type { KisokSupabaseClient } from "@/core/supabase";
import { setSupabaseClient } from "@/core/supabase";

export type RpcResponse = { data: unknown; error: unknown };

/**
 * Mock the Supabase client at the CLIENT boundary.
 *
 * KISOK's mobile surface is almost entirely RPC calls, so stubbing `.rpc()` is
 * both simpler and more honest than intercepting HTTP. Register a handler per
 * function name; an unregistered call fails loudly rather than returning
 * `undefined` and producing a confusing downstream error.
 *
 *   const supabase = installMockSupabase({
 *     current_active_profile: () => ({ data: [profile], error: null }),
 *   });
 */
export function installMockSupabase(
  handlers: Record<string, (args: unknown) => RpcResponse | Promise<RpcResponse>> = {},
) {
  const calls: { name: string; args: unknown }[] = [];

  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) {
        throw new Error(
          `No mock handler registered for rpc "${name}". Add one to installMockSupabase().`,
        );
      }
      return handler(args);
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
    /** Assert which RPCs ran, and with what. */
    callsTo: (name: string) => calls.filter((call) => call.name === name),
    restore: () => setSupabaseClient(null),
  };
}
