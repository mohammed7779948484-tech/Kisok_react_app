import type { ZodType } from "zod";

import { AppError, toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";

import { getSupabaseClient } from "./client";
import type { Database } from "./database.types";

const log = createLogger("supabase.rpc");

/**
 * The Postgres functions the MOBILE client may call.
 *
 * The database also defines Admin-only functions — `admin_update_profile`,
 * `search_admin_profiles`, `apply_inventory_adjustment`, `set_inventory_quantity`,
 * `get_media_asset_usage`, `reorder_items`. Those belong to the separate Admin
 * web app and are reached through a service-role Edge Function; this client has
 * no business naming them. Typing `callRpc` against the whole generated
 * `Functions` map offered every one of them in autocomplete, which is an
 * invitation to write a call that can only ever fail at runtime with `42501`.
 *
 * This is a **client-contract boundary, not a security control**. Database
 * grants and RLS remain the authority — a narrowed TypeScript type stops a
 * mistake, never an attacker. It is also not a feature registry: it is the list
 * of backend functions this application is built against, which changes only
 * when the backend contract does.
 *
 * Derived here rather than in `database.types.ts`: that file is a GENERATED
 * artifact reproduced verbatim by `pnpm db:types`, so project-owned helpers live
 * outside it. Editing the generated file to add conveniences is how a schema
 * refresh silently reverts them.
 */
export const MOBILE_RPC_NAMES = [
  "current_active_profile",
  "get_customer_catalog",
  "create_order",
  "update_order_status",
] as const satisfies readonly (keyof Database["public"]["Functions"])[];

/**
 * `satisfies` above ties this list to the generated types: rename an RPC in a
 * migration, regenerate, and this stops compiling instead of failing at runtime.
 */
export type MobileRpcName = (typeof MOBILE_RPC_NAMES)[number];

export type DbFunctions = Pick<Database["public"]["Functions"], MobileRpcName>;

/**
 * Arguments plus schema, or — for a function that takes none — just the schema.
 *
 * Supabase generates a zero-argument function as `Args: never`, which nothing
 * can satisfy, not even `{}`. So the argument slot disappears entirely for those
 * and `callRpc("get_customer_catalog", schema)` is the only spelling that
 * compiles. Adding an argument to the function in a migration turns the
 * two-argument form back on, and every call site fails to compile until updated.
 */
type RpcInvocation<Name extends keyof DbFunctions, Parsed> = [DbFunctions[Name]["Args"]] extends [
  never,
]
  ? [schema: ZodType<Parsed>]
  : [args: DbFunctions[Name]["Args"], schema: ZodType<Parsed>];

/**
 * Call a Postgres function and validate its payload.
 *
 * Why validation is not optional: the JSON-returning business RPCs return
 * `jsonb`, which Supabase generates as the wide `Json` union. Without a schema
 * the rest of the app would be casting blindly and a backend change would show
 * up as a runtime crash deep inside a screen instead of a clear error here.
 *
 * Errors are normalised to `AppError`, so callers branch on `error.kind` and
 * never inspect Postgres codes themselves.
 */
export async function callRpc<Name extends keyof DbFunctions, Parsed>(
  name: Name,
  ...invocation: RpcInvocation<Name, Parsed>
): Promise<Parsed> {
  const [first, second] = invocation as [unknown, ZodType<Parsed>?];
  const hasArgs = second !== undefined;
  const args = hasArgs ? first : undefined;
  const schema = (hasArgs ? second : first) as ZodType<Parsed>;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc(name as never, args as never);

  if (error) {
    const appError = toAppError(error);
    log.warn(`rpc ${String(name)} failed`, appError.toLogContext());
    throw appError;
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // The database answered but not in the shape we expect. This is a contract
    // break — surface it loudly rather than letting `undefined` propagate.
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    log.error(`rpc ${String(name)} returned an unexpected payload`, { detail });
    throw new AppError({
      kind: "server",
      userMessage: "Something went wrong on our side. Please try again.",
      technicalMessage: `rpc ${String(name)} payload did not match its schema — ${detail}`,
      code: "RPC_SCHEMA_MISMATCH",
    });
  }

  return parsed.data;
}
