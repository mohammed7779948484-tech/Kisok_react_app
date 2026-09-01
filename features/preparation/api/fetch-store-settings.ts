import { toAppError } from "@/core/errors";
import { getSupabaseClient, type Tables } from "@/core/supabase";

/**
 * A read. This module and its siblings in `api/` are the ONLY place in the
 * feature allowed to reach Supabase — ESLint enforces it. Screens, components,
 * stores and query hooks all go through here.
 *
 * Keeping the network in one module per operation is what makes the feature
 * testable: a test mocks this file, not the whole client.
 */

/** The singleton `store_settings` row, as migration 20260826050002 declares it. */
export type StoreSettingsRow = Tables<"store_settings">;

/**
 * The store-timezone source for time display (board cards, details) and the
 * history day window: the single `store_settings` row.
 *
 * A direct table read, not an RPC: the `store_settings_internal_select` policy
 * (migration 20260826050013) lets an active preparation session select the
 * row, and PostgREST returns exactly the columns the migration declares, so
 * the generated `Tables<"store_settings">` type IS the contract — direct
 * reads are deliberately not Zod-revalidated (docs/data-and-supabase.md,
 * "Direct table access").
 *
 * Null — not an error — when the row is absent: no migration seeds the
 * singleton (plan decision 8), so an unseeded project resolves `null` and
 * consumers degrade (device-timezone fallback). That fallback is T06's model
 * concern; this read just reports the honest signal.
 */
export async function fetchStoreSettings(): Promise<StoreSettingsRow | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("store_settings")
    // The whole row: every column is the generated Tables<"store_settings">
    // contract, not just store_timezone.
    .select("*")
    // maybeSingle, not single: the singleton is unseeded on some projects, and
    // zero rows means "settings absent" (null), not a failure. The primary
    // key's `check (id)` already caps the table at one row, so the read needs
    // no filter and no limit.
    .maybeSingle();

  if (error) throw toAppError(error);
  return data;
}
