import { z } from "zod";

import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { callRpc, MOBILE_RPC_NAMES } from "@/core/supabase";
import type { DbFunctions } from "@/core/supabase";
import { installMockSupabase } from "@/core/testing";

const schema = z.array(z.object({ id: z.uuid(), label: z.string() }));

const VALID = [{ id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b", label: "Example" }];

// callRpc logs failures by design; capture the output so an expected failure
// does not look like a broken run.
beforeEach(() => setLogSink(() => {}));
afterEach(() => {
  resetLogging();
});

describe("callRpc", () => {
  it("returns the parsed payload on success", async () => {
    const supabase = installMockSupabase({
      rpc: { current_active_profile: () => ({ data: VALID, error: null }) },
    });

    await expect(callRpc("current_active_profile", schema)).resolves.toEqual(VALID);
    expect(supabase.callsTo("current_active_profile")).toHaveLength(1);
    supabase.restore();
  });

  it("forwards the arguments it was given", async () => {
    const supabase = installMockSupabase({
      rpc: { create_order: () => ({ data: VALID, error: null }) },
    });

    await callRpc("create_order", { client_request_id: "abc", items: [] }, schema);

    expect(supabase.callsTo("create_order")[0]?.args).toEqual({
      client_request_id: "abc",
      items: [],
    });
    supabase.restore();
  });

  it("converts a Postgres error into a mapped AppError", async () => {
    const supabase = installMockSupabase({
      rpc: {
        get_customer_catalog: () => ({
          data: null,
          error: {
            code: "42501",
            message: "denied",
            details: "",
            hint: "",
            name: "PostgrestError",
          },
        }),
      },
    });

    await expect(callRpc("get_customer_catalog", schema)).rejects.toMatchObject({
      kind: "forbidden",
      code: "42501",
    });
    supabase.restore();
  });

  it("REJECTS a payload that does not match its schema", async () => {
    // A contract break must surface here, loudly, rather than propagating as
    // `undefined` into a screen.
    const supabase = installMockSupabase({
      rpc: { get_customer_catalog: () => ({ data: [{ id: "not-a-uuid" }], error: null }) },
    });

    const failure = await callRpc("get_customer_catalog", schema).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "server", code: "RPC_SCHEMA_MISMATCH" });
    supabase.restore();
  });

  it("keeps the schema-mismatch detail out of the customer-facing message", async () => {
    const supabase = installMockSupabase({
      rpc: { get_customer_catalog: () => ({ data: "nonsense", error: null }) },
    });

    const failure = (await callRpc("get_customer_catalog", schema).catch(
      (error: unknown) => error,
    )) as AppError;

    expect(failure.userMessage).not.toContain("schema");
    expect(failure.technicalMessage).toContain("get_customer_catalog");
    supabase.restore();
  });
});

describe("installMockSupabase table reads", () => {
  it("supports the chainable builder Preparation uses on orders", async () => {
    const orders = [{ id: "1", display_number: "A7K2M9" }];
    const supabase = installMockSupabase({
      from: { orders: () => ({ data: orders, error: null }) },
    });

    const result = await supabase.client
      .from("orders")
      .select("*")
      .in("status", ["new", "preparing"])
      .order("created_at");

    expect(result).toEqual({ data: orders, error: null });
    expect(supabase.callsTo("orders")).toHaveLength(1);
    supabase.restore();
  });

  it("fails loudly for a table with no registered handler", async () => {
    const supabase = installMockSupabase();

    await expect(supabase.client.from("order_items").select("*")).rejects.toThrow(
      /No mock handler registered for table "order_items"/,
    );
    supabase.restore();
  });
});

/**
 * Compile-time proof that `callRpc` is restricted to the mobile RPC surface.
 *
 * Nothing here runs — these are type assertions, and `pnpm typecheck` is what
 * enforces them. Widening `DbFunctions` back to the whole generated `Functions`
 * map breaks the build rather than silently re-offering Admin-only functions in
 * autocomplete.
 *
 * The database grants and RLS are the real authority; this only stops a call
 * that could never have succeeded from being written in the first place.
 */

/** True only when A and B are the same type, not merely mutually assignable. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The surface is EXACTLY these four. Adding or losing one fails to compile,
// which is the point: the mobile RPC surface changes only when the backend
// contract does, and that should be a deliberate edit here.
type SurfaceIsExactlyTheMobileFour = Expect<
  Equals<
    keyof DbFunctions,
    "current_active_profile" | "get_customer_catalog" | "create_order" | "update_order_status"
  >
>;
const surfaceIsExactlyTheMobileFour: SurfaceIsExactlyTheMobileFour = true;

function mobileRpcSurfaceIsRestricted() {
  const anySchema = z.unknown();

  // The four the mobile client is built against.
  void callRpc("current_active_profile", anySchema);
  void callRpc("get_customer_catalog", anySchema);
  void callRpc("create_order", { client_request_id: "", items: [] }, anySchema);
  void callRpc("update_order_status", { order_id: "", target_status: "ready" }, anySchema);

  // Admin-only, reached by the Admin web app through a service-role Edge
  // Function. The arguments below are the CORRECT ones from the generated
  // types, deliberately: the only thing wrong with this call is the name. If
  // DbFunctions widens, this compiles, the expected error disappears, and
  // typecheck fails on the unused @ts-expect-error.
  // @ts-expect-error admin_update_profile is not part of the mobile RPC surface
  void callRpc("admin_update_profile", { actor_id: "", changes: {}, target_id: "" }, anySchema);

  // @ts-expect-error search_admin_profiles is not part of the mobile RPC surface
  void callRpc("search_admin_profiles", { search_term: "" }, anySchema);

  // @ts-expect-error an RPC that does not exist in the database at all
  void callRpc("definitely_not_an_rpc", anySchema);
}
void mobileRpcSurfaceIsRestricted;

describe("the mobile RPC surface", () => {
  it("is exactly the four RPCs a tablet may call", () => {
    // The type assertion above is what enforces this at compile time; asserting
    // the value here keeps the runtime list and the type from drifting apart,
    // and gives the failure a readable message rather than a TS error code.
    expect(surfaceIsExactlyTheMobileFour).toBe(true);
    expect([...MOBILE_RPC_NAMES].sort()).toEqual([
      "create_order",
      "current_active_profile",
      "get_customer_catalog",
      "update_order_status",
    ]);
  });
});
