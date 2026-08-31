import { AppError } from "@/core/errors";
import { setSupabaseClient, type KisokSupabaseClient, type Tables } from "@/core/supabase";
import { installMockSupabase } from "@/core/testing";

import { fetchActiveOrders } from "./fetch-active-orders";

/**
 * The api module IS the feature's Supabase boundary, so these tests exercise
 * it against the client seam rather than mocking the module itself.
 *
 * Two seams, because they prove different things:
 *
 * - `installMockSupabase` (shared, deliberately chain-agnostic) proves WHICH
 *   table was read, how many times, and how data/error mapping behaves.
 * - The recording stub below captures the actual builder arguments. What
 *   TypeScript enforces on this query is only the embed relationship typing
 *   (the compile-time proof at the bottom of this file): postgrest-js `in()`
 *   accepts any enum member — `["completed"]` compiles — and `ascending` is a
 *   plain boolean, so the status filter contents, the ordering direction AND
 *   the exact builder sequence are enforced HERE, by the recording-stub
 *   assertions, and nowhere else. Every read-builder chain method records, so
 *   a call ADDED to the read (e.g. a `.limit(10)` narrowing that would change
 *   which orders get action affordances) fails the sequence pin rather than
 *   passing silently.
 */

/** An active order with its embedded item snapshot — one board-shaped row. */
const activeOrder = {
  id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
  display_number: "AB2CD4",
  client_request_id: "0d4a9d2e-7f3b-4c5a-8e6f-1a2b3c4d5e6f",
  request_fingerprint: "8f2b1c0d4e6a",
  status: "preparing",
  created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  assigned_preparation_id: "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88",
  completed_by: null,
  completed_at: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: "2026-08-26T05:00:08.123456+00:00",
  updated_at: "2026-08-26T05:01:41.000000+00:00",
  order_items: [
    {
      id: "c7d8e9f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f",
      order_id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
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
  ],
};

type RecordedCall = { method: string; args: unknown[] };

/**
 * A chain stub that RECORDS the builder arguments of the board read — the
 * shared mock discards them by design, and the query shape is behaviour worth
 * pinning. EVERY read-builder chain method records, not just the three this
 * read uses today, so the exact-sequence assertion in the tests below fails on
 * a call ADDED to the chain (a status narrowing, a `.limit(10)`) as well as on
 * a removed or reordered one. Terminal `single`/`maybeSingle` are recorded too
 * (resolving the list, as supabase-js would) so a stray terminal call fails the
 * sequence pin instead of passing. Installs itself through `setSupabaseClient`
 * (the same seam `installMockSupabase` uses); call `restore()` when done.
 */
function installRecordingOrdersStub(row: unknown) {
  const fromCalls: string[] = [];
  const builderCalls: RecordedCall[] = [];

  const rows = Promise.resolve({ data: [row], error: null });

  const builder: Record<string, unknown> = {
    then: (
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => rows.then(onFulfilled, onRejected),
  };

  for (const method of [
    "select",
    "eq",
    "in",
    "or",
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
  // Terminal methods that resolve one row rather than the list — recorded so
  // a stray `.single()` fails the sequence assertion instead of passing.
  for (const method of ["single", "maybeSingle"]) {
    builder[method] = (...args: unknown[]) => {
      builderCalls.push({ method, args });
      return rows;
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

describe("fetchActiveOrders", () => {
  let supabase: ReturnType<typeof installMockSupabase> | undefined;
  let recording: ReturnType<typeof installRecordingOrdersStub> | undefined;

  afterEach(() => {
    supabase?.restore();
    recording?.restore();
  });

  it("resolves the rows the orders table returns, in one read", async () => {
    supabase = installMockSupabase({
      from: { orders: () => ({ data: [activeOrder], error: null }) },
    });

    await expect(fetchActiveOrders()).resolves.toEqual([activeOrder]);
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

    const failure = await fetchActiveOrders().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: "forbidden",
      code: "42501",
      userMessage: "You don't have access to do that.",
    });
  });

  it("queries the ACTIVE statuses, newest first, with the items embedded", async () => {
    recording = installRecordingOrdersStub(activeOrder);

    await expect(fetchActiveOrders()).resolves.toEqual([activeOrder]);

    // One read of orders — no second round trip for the item snapshot.
    expect(recording.fromCalls).toEqual(["orders"]);
    expect(recording.builderCalls.filter((call) => call.method === "select")).toEqual([
      { method: "select", args: ["*, order_items(*)"] },
    ]);
    // Exactly the three ACTIVE statuses — drop `ready` (or add `completed`)
    // and this fails.
    expect(recording.builderCalls.filter((call) => call.method === "in")).toEqual([
      { method: "in", args: ["status", ["new", "preparing", "ready"]] },
    ]);
    // Newest first — flip the board to oldest-first and this fails.
    expect(recording.builderCalls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
    ]);
    // The EXACT builder sequence, and nothing more. Every chain method is
    // recorded above, so a call ADDED to this read fails here rather than
    // passing silently — e.g. a future `.eq` assignment filter or `.limit(10)`
    // would narrow which orders reach the board and silently change which
    // ones get action affordances (T07 reads this query's result).
    expect(recording.builderCalls.map((call) => call.method)).toEqual(["select", "in", "order"]);
  });
});

/**
 * Compile-time proof that the order_items embed resolved against the generated
 * database types — the plan's T02 risk. Nothing here runs: `pnpm typecheck` is
 * what enforces it. If the select string loses the embed, or the declared
 * return type drops the `order_items` field, this fails to compile instead of
 * silently degrading every board card.
 */

/** True only when A and B are the same type, not merely mutually assignable. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type BoardRow = Awaited<ReturnType<typeof fetchActiveOrders>>[number];
type RowCarriesEmbeddedItems = Expect<Equals<BoardRow["order_items"], Tables<"order_items">[]>>;
const rowCarriesEmbeddedItems: RowCarriesEmbeddedItems = true;

describe("the board read contract", () => {
  it("returns rows with the order_items snapshot embedded", () => {
    // The type assertion above is the real check; asserting the value here
    // keeps the constant referenced and gives a failure a readable message,
    // the same way the RPC-surface proof in core/supabase works.
    expect(rowCarriesEmbeddedItems).toBe(true);
  });
});
