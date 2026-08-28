import type { ZodType } from "zod";

import { AppError, toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";

import { getSupabaseClient } from "./client";
import type { Database } from "./database.types";

const log = createLogger("supabase.rpc");

/**
 * Every Postgres function this client may call.
 *
 * Derived here rather than in `database.types.ts`: that file is a GENERATED
 * artifact reproduced verbatim by `pnpm db:types`, so project-owned helpers live
 * outside it. Editing the generated file to add conveniences is how a schema
 * refresh silently reverts them.
 */
export type DbFunctions = Database["public"]["Functions"];

/**
 * Arguments plus schema, or — for a function that takes none — just the schema.
 *
 * Supabase generates a zero-argument function as `Args: never`, which nothing
 * can satisfy, not even `{}`. So the argument slot disappears entirely for those
 * and `callRpc("get_customer_catalog", schema)` is the only spelling that
 * compiles. Adding an argument to the function in a migration turns the
 * two-argument form back on, and every call site fails to compile until updated.
 */
type RpcInvocation<Name extends keyof DbFunctions, Parsed> = [
  DbFunctions[Name]["Args"],
] extends [never]
  ? [schema: ZodType<Parsed>]
  : [args: DbFunctions[Name]["Args"], schema: ZodType<Parsed>];

/**
 * Call a Postgres function and validate its payload.
 *
 * Why validation is not optional: every KISOK RPC returns `jsonb`, and Supabase
 * generates `jsonb` as the wide `Json` union. Without a schema at this boundary
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
