import { callRpc } from "@/core/supabase";

import { activeProfileRowsSchema, type ActiveProfile } from "./types";

/**
 * Resolve the signed-in user's active profile.
 *
 * Customers have NO table access to `public.profiles` — RLS grants none and the
 * grant is explicitly revoked. `current_active_profile()` is the only supported
 * way to learn who is signed in. Never try to `select` from `profiles`.
 *
 * Returns `null` when the account has no active profile.
 */
export async function fetchActiveProfile(): Promise<ActiveProfile | null> {
  const rows = await callRpc("current_active_profile", {}, activeProfileRowsSchema);
  return rows[0] ?? null;
}
