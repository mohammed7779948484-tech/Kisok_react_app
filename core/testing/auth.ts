import { setSupabaseClient, type KisokSupabaseClient } from "@/core/supabase";
import type { ActiveProfile, AppRole } from "@/core/auth";

import type { RpcResponse } from "./supabase";

/** A ready-made active profile. Override only the fields a test cares about. */
export const TEST_PROFILE: ActiveProfile = {
  id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
  display_name: "Test Kiosk",
  role: "customer",
  is_active: true,
};

export type MockAuthOptions = {
  /** Omit to start signed out. */
  profile?: ActiveProfile | null;
  role?: AppRole;
  /** Handlers for the feature's own RPCs, alongside `current_active_profile`. */
  rpc?: Record<string, (args: unknown) => RpcResponse | Promise<RpcResponse>>;
  /**
   * Override `auth.signOut`. Use it to exercise the failure paths — a sign-out
   * that errors but clears storage, versus one that errors and leaves the
   * session behind. Defaults to succeeding.
   */
  signOut?: (options?: { scope?: string }) => Promise<{ error: { message: string } | null }>;
  /**
   * What `getSession` returns AFTER a sign-out attempt. Defaults to the normal
   * behaviour of reporting no session.
   */
  sessionAfterSignOut?: unknown;
};

/**
 * Install a Supabase client that reports an authenticated session and profile.
 *
 * Most feature screens live behind the auth gate, so almost every feature test
 * needs this. Without it each agent hand-rolls the same fake client, and they
 * drift. Pair it with `renderWithProviders(ui, { withAuth: true })`.
 *
 *   const supabase = installMockAuth({
 *     role: "preparation",
 *     rpc: { update_order_status: () => ({ data: {...}, error: null }) },
 *   });
 *   await renderWithProviders(<OrderBoard />, { withAuth: true });
 *   supabase.restore();
 */
export function installMockAuth({
  profile,
  role,
  rpc = {},
  signOut,
  sessionAfterSignOut = null,
}: MockAuthOptions = {}) {
  const resolved =
    profile === null ? null : { ...TEST_PROFILE, ...(role ? { role } : {}), ...(profile ?? {}) };

  const session = resolved
    ? { access_token: "test-access-token", user: { id: resolved.id } }
    : null;

  const calls: { name: string; args: unknown }[] = [];
  const signOutCalls: ({ scope?: string } | undefined)[] = [];
  let signedOut = false;
  let authCallback: ((event: string, session: unknown) => void) | null = null;

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: signedOut ? sessionAfterSignOut : session },
        error: null,
      }),
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        authCallback = fn;
        // Mirror supabase-js: the initial event arrives on its own.
        queueMicrotask(() => fn("INITIAL_SESSION", session));
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signInWithPassword: async () => ({ data: { session }, error: null }),
      signOut: async (options?: { scope?: string }) => {
        signOutCalls.push(options);
        signedOut = true;
        return signOut ? await signOut(options) : { error: null };
      },
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
    realtime: { setAuth: async () => {} },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "current_active_profile") {
        return { data: resolved ? [resolved] : [], error: null };
      }
      const handler = rpc[name];
      if (!handler) {
        throw new Error(
          `No mock handler registered for rpc "${name}". Add one to installMockAuth({ rpc: … }).`,
        );
      }
      return handler(args);
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: async () => {},
  } as unknown as KisokSupabaseClient;

  setSupabaseClient(client);

  return {
    client,
    profile: resolved,
    calls,
    callsTo: (name: string) => calls.filter((call) => call.name === name),
    /** Every `auth.signOut` call, with the options it was given. */
    signOutCalls,
    /** Drive a later auth event, e.g. a sign-out or a token refresh. */
    emit: (event: string, next: unknown) => authCallback?.(event, next),
    restore: () => setSupabaseClient(null),
  };
}
