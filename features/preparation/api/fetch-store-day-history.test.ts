import { AppError } from "@/core/errors";
import { setSupabaseClient, type KisokSupabaseClient, type Tables } from "@/core/supabase";

import { type StoreDayOrder, type StoreTimezoneSource } from "../model/store-day";

import { fetchStoreDayHistory } from "./fetch-store-day-history";

/**
 * The api module IS the feature's Supabase boundary, so these tests exercise
 * it against the client seam rather than mocking the module itself — the
 * same approach as the other reads' tests.
 *
 * ONE seam here, and the header records why: the history read is the app's
 * FIRST `.or()` read, and the shared `installMockSupabase` builder whitelist
 * (core/testing/supabase.ts) predates it — it has no `or` method, so its
 * chain throws before resolving. Extending that shared helper is a
 * Lead-owned change outside this task's file scope, so every test below uses
 * the recording stub, installed through the same `setSupabaseClient` seam:
 *
 * - table + response mapping: the stub's `fromCalls` prove WHICH table was
 *   read and how many times, and its resolved `{data, error}` proves the
 *   data/error mapping — the assertions the shared mock normally carries.
 * - builder arguments: the stub RECORDS the actual arguments. What
 *   TypeScript enforces on this query is almost nothing: postgrest-js `in()`
 *   accepts any enum member, `ascending` is a plain boolean, the `.or()`
 *   argument is an opaque string the compiler never inspects, and a `.gte()`
 *   value is an opaque string too — so the status filter contents, the
 *   terminal-timestamp prefilter string, the ordering direction, the
 *   `select("*")` projection (NO order_items embed — history rows render
 *   from the order columns alone) and the exact builder sequence (no ADDED
 *   calls) are enforced HERE, by the recording-stub assertions, and nowhere
 *   else.
 */

/** One terminal order row — the full generated `Tables<"orders">` shape. */
const completedOrder: Tables<"orders"> = {
  id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
  display_number: "AB2CD4",
  client_request_id: "0d4a9d2e-7f3b-4c5a-8e6f-1a2b3c4d5e6f",
  request_fingerprint: "8f2b1c0d4e6a",
  status: "completed",
  created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  assigned_preparation_id: "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88",
  completed_by: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b",
  completed_at: "2026-08-26T12:34:56.000000+00:00",
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: "2026-08-26T05:00:08.123456+00:00",
  updated_at: "2026-08-26T12:34:56.000000+00:00",
};

/** A PostgREST-style rejection, the shape toAppError maps from. */
const forbiddenError = {
  code: "42501",
  message: "denied",
  details: "",
  hint: "",
  name: "PostgrestError",
};

type RecordedCall = { method: string; args: unknown[] };

/**
 * A chain stub that RECORDS the builder arguments of the history read and
 * resolves a fixed `{data, error}` response — the same client seam
 * `installMockSupabase` installs through, extended with what that shared
 * helper lacks for this read (an `or` chain method; see the file docblock).
 * EVERY read-builder chain method records, so the exact-sequence assertion
 * below fails on a call ADDED to the chain (e.g. a `.limit(1)`) as well as on
 * a removed or reordered one. The chain is awaitable at any point, matching
 * how supabase-js behaves. Installs itself through `setSupabaseClient`; call
 * `restore()` when done.
 */
function installRecordingOrdersStub(response: { data: unknown; error: unknown }) {
  const fromCalls: string[] = [];
  const builderCalls: RecordedCall[] = [];

  const rows = Promise.resolve(response);

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

/** The store-day window start the caller computed — 2026-08-26 21:00Z. */
const TERMINAL_SINCE = "2026-08-26T21:00:00.000Z";

describe("fetchStoreDayHistory", () => {
  let recording: ReturnType<typeof installRecordingOrdersStub> | undefined;

  afterEach(() => {
    recording?.restore();
  });

  it("resolves the rows the orders table returns, in one read", async () => {
    recording = installRecordingOrdersStub({ data: [completedOrder], error: null });

    await expect(fetchStoreDayHistory({ terminalSince: TERMINAL_SINCE })).resolves.toEqual([
      completedOrder,
    ]);
    // One read of orders — the stub's from-calls carry the same assertion the
    // shared mock's callsTo would.
    expect(recording.fromCalls).toEqual(["orders"]);
  });

  it("maps a PostgREST error to an AppError via toAppError", async () => {
    recording = installRecordingOrdersStub({ data: null, error: forbiddenError });

    const failure = await fetchStoreDayHistory({ terminalSince: TERMINAL_SINCE }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: "forbidden",
      code: "42501",
      userMessage: "You don't have access to do that.",
    });
  });

  it("prefilters on the TERMINAL timestamps bounded by the window start, newest-created first, without embedding items", async () => {
    recording = installRecordingOrdersStub({ data: [completedOrder], error: null });

    await expect(fetchStoreDayHistory({ terminalSince: TERMINAL_SINCE })).resolves.toEqual([
      completedOrder,
    ]);

    // One read of orders.
    expect(recording.fromCalls).toEqual(["orders"]);
    // The whole order row and NOTHING else — no order_items embed. History
    // rows render display number/time/status/assignment; items are the
    // details screen's concern, so this read stays lean.
    expect(recording.builderCalls.filter((call) => call.method === "select")).toEqual([
      { method: "select", args: ["*"] },
    ]);
    // Exactly the two TERMINAL statuses — a status leaking in from the board
    // read (new/preparing/ready) fails here.
    expect(recording.builderCalls.filter((call) => call.method === "in")).toEqual([
      { method: "in", args: ["status", ["completed", "cancelled"]] },
    ]);
    // The terminal-timestamp prefilter, EXACT decision-2 semantics: an OR
    // over completed_at/cancelled_at bounded by the window start — the status
    // filter above guarantees exactly one of the two columns is non-null per
    // row, so the OR cannot cross-match. Revert it to a created_at bound
    // (the T06-R01 bug) and this fails; drop either branch and an order
    // terminal exactly at the window start stops being fetched.
    expect(recording.builderCalls.filter((call) => call.method === "or")).toEqual([
      {
        method: "or",
        args: [`completed_at.gte.${TERMINAL_SINCE},cancelled_at.gte.${TERMINAL_SINCE}`],
      },
    ]);
    // Newest-created first — the server-side ordering; the client-side
    // grouping re-sorts by terminal instant anyway.
    expect(recording.builderCalls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
    ]);
    // The EXACT builder sequence, and nothing more — every chain method
    // records above, so an added filter (e.g. a redundant .gte), limit or
    // terminator fails here.
    expect(recording.builderCalls.map((call) => call.method)).toEqual([
      "select",
      "in",
      "or",
      "order",
    ]);
  });
});

/**
 * Compile-time proofs. Nothing here runs: `pnpm typecheck` is what enforces
 * them.
 *
 * 1. The read returns plain generated order rows — no embed, no projection
 *    drift. If the declared return type stops being exactly
 *    `Tables<"orders">[]`, this fails to compile.
 * 2. The model seam: the pure store-day rules cannot import the generated
 *    types (the Supabase boundary is api/-only, ESLint-enforced), so they
 *    declare structural row types instead — and the generated rows must keep
 *    satisfying them. A schema change to `orders` or `store_settings` that
 *    breaks that assignability fails HERE rather than as a mystery type error
 *    in some screen.
 */

/** True only when A and B are the same type, not merely mutually assignable. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type HistoryResult = Awaited<ReturnType<typeof fetchStoreDayHistory>>;
type ResultIsPlainOrderRows = Expect<Equals<HistoryResult, Tables<"orders">[]>>;
const resultIsPlainOrderRows: ResultIsPlainOrderRows = true;

type OrdersRowSatisfiesModel = Expect<
  Equals<Tables<"orders"> extends StoreDayOrder ? true : false, true>
>;
type SettingsRowSatisfiesModel = Expect<
  Equals<Tables<"store_settings"> extends StoreTimezoneSource ? true : false, true>
>;
const ordersRowSatisfiesModel: OrdersRowSatisfiesModel = true;
const settingsRowSatisfiesModel: SettingsRowSatisfiesModel = true;

describe("the history read contract", () => {
  it("returns plain order rows the pure store-day rules can consume", () => {
    // The type assertions above are the real check; asserting the values here
    // keeps the constants referenced and gives a failure a readable message,
    // the same way the RPC-surface proof in core/supabase works.
    expect(resultIsPlainOrderRows).toBe(true);
    expect(ordersRowSatisfiesModel).toBe(true);
    expect(settingsRowSatisfiesModel).toBe(true);
  });
});
