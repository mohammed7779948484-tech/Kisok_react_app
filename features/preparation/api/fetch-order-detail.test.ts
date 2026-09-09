import { AppError } from "@/core/errors";
import { setSupabaseClient, type KisokSupabaseClient } from "@/core/supabase";
import { installMockSupabase } from "@/core/testing";

import { type ActiveOrderRow } from "./fetch-active-orders";
import { fetchOrderDetail } from "./fetch-order-detail";

/**
 * The api module IS the feature's Supabase boundary, so these tests exercise
 * it against the client seam rather than mocking the module itself — the same
 * two-seam setup as fetch-active-orders.test.ts.
 *
 * Two seams, because they prove different things:
 *
 * - `installMockSupabase` (shared, deliberately chain-agnostic) proves WHICH
 *   table was read, how many times, and how data/null/error mapping behaves.
 * - The recording stub below captures the actual builder arguments. What
 *   TypeScript enforces on this query is only the embed relationship typing
 *   (the compile-time proof at the bottom of this file): postgrest-js `eq()`
 *   accepts any string, and the shared mock's `single` and `maybeSingle` are
 *   the same function — so the id filter, the zero-rows-means-null (not
 *   error) semantics of the read's maybeSingle termination, and the exact
 *   builder sequence (no ADDED calls — a status filter would silently hide
 *   the terminal orders history links to) are enforced HERE, by the
 *   recording-stub assertions, and nowhere else.
 */

const ORDER_ID = "6d2f9a4b-1c3e-4f5a-9b7d-8e2f1a4c6b9d";

/** One order with its embedded item snapshot — the details-screen shape. */
const orderDetail = {
  id: ORDER_ID,
  display_number: "K7MN2P",
  client_request_id: "2b7e1a9c-4d6f-4e8a-b0c1-3d5e7f9a1b2c",
  request_fingerprint: "3c1f8e2a9d40",
  status: "new",
  created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  assigned_preparation_id: null,
  completed_by: null,
  completed_at: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: "2026-08-26T06:12:03.246810+00:00",
  updated_at: "2026-08-26T06:12:03.246810+00:00",
  order_items: [
    {
      id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      order_id: ORDER_ID,
      product_id: "d1e2f3a4-5b6c-4d7e-8f9a-0b1c2d3e4f5a",
      variant_id: "e2f3a4b5-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
      product_name: "Single Origin Coffee",
      variant_name: "250g · Whole Bean",
      variant_sku: "SO-250G-WB",
      // Snapshot shape from migration 20260826050007: {type, value} pairs.
      variant_options: [{ type: "Grind", value: "Whole bean" }],
      brand_name: "Kisok Roasters",
      image_public_id: null,
      image_secure_url: null,
      quantity: 2,
    },
    {
      id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      order_id: ORDER_ID,
      product_id: "f3a4b5c6-7d8e-4f9a-0b1c-2d3e4f5a6b7c",
      variant_id: "0a1b2c3d-4e5f-4a6b-8c9d-2e3f4a5b6c7d",
      product_name: "Cold Brew Concentrate",
      variant_name: "500ml · Ready to drink",
      variant_sku: "CB-500ML-RTD",
      variant_options: [],
      brand_name: null,
      image_public_id: null,
      image_secure_url: null,
      quantity: 1,
    },
  ],
};

type RecordedCall = { method: string; args: unknown[] };

/**
 * A chain stub that RECORDS the builder arguments of the order-detail read —
 * the shared mock discards them by design, and the read's shape is behaviour
 * worth pinning. EVERY read-builder chain method records, not just the three
 * this read uses today, so the exact-sequence assertion in the tests below
 * fails on a call ADDED to the chain (e.g. a status filter) as well as on a
 * removed one. The terminal `maybeSingle()` resolves ONE row (or null) —
 * never an array — matching how supabase-js behaves. Installs itself through
 * `setSupabaseClient` (the same seam `installMockSupabase` uses); call
 * `restore()` when done.
 */
function installRecordingOrdersStub(row: unknown) {
  const fromCalls: string[] = [];
  const builderCalls: RecordedCall[] = [];

  const single = Promise.resolve({ data: row, error: null });

  const builder: Record<string, unknown> = {
    then: (
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => single.then(onFulfilled, onRejected),
    maybeSingle: () => {
      builderCalls.push({ method: "maybeSingle", args: [] });
      return single;
    },
  };

  for (const method of [
    "select",
    "eq",
    "in",
    "neq",
    "is",
    "gte",
    "lte",
    "order",
    "limit",
    "range",
  ]) {
    builder[method] = (...args: unknown[]) => {
      builderCalls.push({ method, args });
      return builder;
    };
  }

  const client = {
    from: (table: string) => {
      fromCalls.push(table);
      return builder;
    },
  } as unknown as KisokSupabaseClient;

  setSupabaseClient(client);

  return { fromCalls, builderCalls, restore: () => setSupabaseClient(null) };
}

describe("fetchOrderDetail", () => {
  let supabase: ReturnType<typeof installMockSupabase> | undefined;
  let recording: ReturnType<typeof installRecordingOrdersStub> | undefined;

  afterEach(() => {
    supabase?.restore();
    recording?.restore();
  });

  it("resolves the one row the orders table returns, in one read", async () => {
    supabase = installMockSupabase({
      from: { orders: () => ({ data: orderDetail, error: null }) },
    });

    await expect(fetchOrderDetail(ORDER_ID)).resolves.toEqual(orderDetail);
    expect(supabase.callsTo("orders")).toHaveLength(1);
  });

  it("resolves null when no row matches the id (maybeSingle semantics)", async () => {
    supabase = installMockSupabase({
      from: { orders: () => ({ data: null, error: null }) },
    });

    // A wrong or unknown id is "no such order", not a failure — the details
    // screen's unavailable state is reserved for actual errors.
    await expect(fetchOrderDetail("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
    expect(supabase.callsTo("orders")).toHaveLength(1);
  });

  it("maps a PostgREST error to an AppError via toAppError", async () => {
    supabase = installMockSupabase({
      from: {
        orders: () => ({
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

    const failure = await fetchOrderDetail(ORDER_ID).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: "forbidden",
      code: "42501",
      userMessage: "You don't have access to do that.",
    });
  });

  it("reads one order by id with the items embedded, terminating in maybeSingle", async () => {
    recording = installRecordingOrdersStub(orderDetail);

    await expect(fetchOrderDetail(ORDER_ID)).resolves.toEqual(orderDetail);

    // One read of orders — no second round trip for the item snapshot.
    expect(recording.fromCalls).toEqual(["orders"]);
    expect(recording.builderCalls.filter((call) => call.method === "select")).toEqual([
      { method: "select", args: ["*, order_items(*)"] },
    ]);
    // The id the screen navigated with — filter another column (or ignore the
    // parameter) and this fails.
    expect(recording.builderCalls.filter((call) => call.method === "eq")).toEqual([
      { method: "eq", args: ["id", ORDER_ID] },
    ]);
    // The read terminates in maybeSingle, so zero rows resolve null rather
    // than erroring — drop it (or switch to single) and this fails.
    expect(recording.builderCalls.filter((call) => call.method === "maybeSingle")).toEqual([
      { method: "maybeSingle", args: [] },
    ]);
    // The EXACT builder sequence, and nothing more. Every chain method is
    // recorded above, so a call ADDED to this read fails here rather than
    // passing silently — e.g. a future status filter would hide the terminal
    // orders history links to (AC-07).
    expect(recording.builderCalls.map((call) => call.method)).toEqual([
      "select",
      "eq",
      "maybeSingle",
    ]);
  });
});

/**
 * Compile-time proof that the detail read resolves T02's row shape or null —
 * the distinction the details screen branches on ("no such order" is data,
 * not an error). Nothing here runs: `pnpm typecheck` is what enforces it. If
 * the select string loses the embed, or the declared return type stops being
 * nullable, this fails to compile instead of silently degrading the details
 * screen.
 */

/** True only when A and B are the same type, not merely mutually assignable. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type DetailResult = Awaited<ReturnType<typeof fetchOrderDetail>>;
type ResultIsRowOrNull = Expect<Equals<DetailResult, ActiveOrderRow | null>>;
const resultIsRowOrNull: ResultIsRowOrNull = true;

describe("the order-detail read contract", () => {
  it("resolves an ActiveOrderRow with the snapshot embedded, or null", () => {
    // The type assertion above is the real check; asserting the value here
    // keeps the constant referenced and gives a failure a readable message,
    // the same way the RPC-surface proof in core/supabase works.
    expect(resultIsRowOrNull).toBe(true);
  });
});
