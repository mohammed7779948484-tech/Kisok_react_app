import { z } from "zod";

import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { callRpc } from "@/core/supabase";
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

    await expect(callRpc("current_active_profile", {}, schema)).resolves.toEqual(VALID);
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

    await expect(callRpc("get_customer_catalog", {}, schema)).rejects.toMatchObject({
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

    const failure = await callRpc("get_customer_catalog", {}, schema).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "server", code: "RPC_SCHEMA_MISMATCH" });
    supabase.restore();
  });

  it("keeps the schema-mismatch detail out of the customer-facing message", async () => {
    const supabase = installMockSupabase({
      rpc: { get_customer_catalog: () => ({ data: "nonsense", error: null }) },
    });

    const failure = (await callRpc("get_customer_catalog", {}, schema).catch(
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
