import { AppError } from "@/core/errors";
import { setSupabaseClient, type KisokSupabaseClient, type Tables } from "@/core/supabase";
import { installMockSupabase } from "@/core/testing";

import { fetchStoreSettings, type StoreSettingsRow } from "./fetch-store-settings";

/**
 * The api module IS the feature's Supabase boundary, so these tests exercise
 * it against the client seam rather than mocking the module itself — the same
 * two-seam setup as fetch-active-orders.test.ts and fetch-order-detail.test.ts.
 *
 * Two seams, because they prove different things:
 *
 * - `installMockSupabase` (shared, deliberately chain-agnostic) proves WHICH
 *   table was read, how many times, and how data/null/error mapping behaves.
 * - The recording stub below captures the actual builder arguments. TypeScript
 *   does type the select-string projection for well-formed literals — a
 *   `select("store_timezone")` would narrow the row away from the declared
 *   `StoreSettingsRow | null` return and fail to compile — but two blind
 *   spots remain: a `.single()` call compiles invisibly against the nullable
 *   return (and the shared mock's `single` and `maybeSingle` are the same
 *   function), and ADDED chain calls (.eq/.limit) are unchecked — so the
 *   exact `select("*")` argument, the zero-rows-means-null (not error)
 *   semantics of the read's maybeSingle termination, and the exact builder
 *   sequence (no ADDED calls — a redundant `.eq("id", true)` or
 *   `.limit(1)` would claim the singleton guarantee needs client help) are
 *   enforced HERE, by the recording-stub assertions, and nowhere else.
 */

/** The singleton settings row — the shape migration 20260826050002 declares. */
const storeSettings = {
  id: true,
  store_name: "Kisok Roasters",
  logo_media_asset_id: null,
  global_low_stock_threshold: 5,
  customer_success_reset_seconds: 25,
  // An IANA name; the migration's btrim check only enforces non-blank text.
  store_timezone: "Australia/Sydney",
  created_at: "2026-08-26T05:00:00.000000+00:00",
  updated_at: "2026-08-26T05:00:00.000000+00:00",
};

type RecordedCall = { method: string; args: unknown[] };

/**
 * A chain stub that RECORDS the builder arguments of the store-settings read —
 * the shared mock discards them by design, and the read's shape is behaviour
 * worth pinning. EVERY read-builder chain method records, not just the two
 * this read uses today, so the exact-sequence assertion in the tests below
 * fails on a call ADDED to the chain (e.g. a `.limit(1)`) as well as on a
 * removed one. The terminal `maybeSingle()` resolves ONE row (or null) —
 * never an array — matching how supabase-js behaves. Installs itself through
 * `setSupabaseClient` (the same seam `installMockSupabase` uses); call
 * `restore()` when done.
 */
function installRecordingStoreSettingsStub(row: unknown) {
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

describe("fetchStoreSettings", () => {
  let supabase: ReturnType<typeof installMockSupabase> | undefined;
  let recording: ReturnType<typeof installRecordingStoreSettingsStub> | undefined;

  afterEach(() => {
    supabase?.restore();
    recording?.restore();
  });

  it("resolves the singleton row the store_settings table returns, in one read", async () => {
    supabase = installMockSupabase({
      from: { store_settings: () => ({ data: storeSettings, error: null }) },
    });

    await expect(fetchStoreSettings()).resolves.toEqual(storeSettings);
    expect(supabase.callsTo("store_settings")).toHaveLength(1);
  });

  it("resolves null when the singleton row is absent (maybeSingle semantics)", async () => {
    supabase = installMockSupabase({
      from: { store_settings: () => ({ data: null, error: null }) },
    });

    // No migration seeds the row (plan decision 8): an unseeded project is
    // "settings absent", not a failure. The device-timezone fallback is T06's
    // model concern; here null IS the honest signal.
    await expect(fetchStoreSettings()).resolves.toBeNull();
    expect(supabase.callsTo("store_settings")).toHaveLength(1);
  });

  it("maps a PostgREST error to an AppError via toAppError", async () => {
    supabase = installMockSupabase({
      from: {
        store_settings: () => ({
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

    const failure = await fetchStoreSettings().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: "forbidden",
      code: "42501",
      userMessage: "You don't have access to do that.",
    });
  });

  it("reads the whole singleton row, terminating in maybeSingle, and nothing else", async () => {
    recording = installRecordingStoreSettingsStub(storeSettings);

    await expect(fetchStoreSettings()).resolves.toEqual(storeSettings);

    // One read of store_settings.
    expect(recording.fromCalls).toEqual(["store_settings"]);
    // The whole row — `select("*")`, because every column (not just
    // store_timezone) is the generated Tables<"store_settings"> contract.
    expect(recording.builderCalls.filter((call) => call.method === "select")).toEqual([
      { method: "select", args: ["*"] },
    ]);
    // The read terminates in maybeSingle, so zero rows resolve null rather
    // than erroring — drop it (or switch to single) and this fails.
    expect(recording.builderCalls.filter((call) => call.method === "maybeSingle")).toEqual([
      { method: "maybeSingle", args: [] },
    ]);
    // The EXACT builder sequence, and nothing more. Every chain method is
    // recorded above, so a call ADDED to this read fails here rather than
    // passing silently — the singleton's `id boolean primary key check (id)`
    // already caps the table at one row, so a filter or limit would be
    // redundant narrowing with nothing to narrow.
    expect(recording.builderCalls.map((call) => call.method)).toEqual(["select", "maybeSingle"]);
  });
});

/**
 * Compile-time proof that the read resolves the generated store_settings row
 * or null — the distinction consumers branch on ("settings absent" is data,
 * not an error). Nothing here runs: `pnpm typecheck` is what enforces it. If
 * the declared return type stops being nullable, or the exported row type
 * drifts off the generated `Tables<"store_settings">` shape, this fails to
 * compile instead of silently degrading every store-timezone time display.
 */

/** True only when A and B are the same type, not merely mutually assignable. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type SettingsResult = Awaited<ReturnType<typeof fetchStoreSettings>>;
type RowMatchesGenerated = Expect<Equals<StoreSettingsRow, Tables<"store_settings">>>;
type ResultIsRowOrNull = Expect<Equals<SettingsResult, StoreSettingsRow | null>>;
const rowMatchesGenerated: RowMatchesGenerated = true;
const resultIsRowOrNull: ResultIsRowOrNull = true;

describe("the store-settings read contract", () => {
  it("resolves the generated store_settings row, or null", () => {
    // The type assertions above are the real check; asserting the values here
    // keeps the constants referenced and gives a failure a readable message,
    // the same way the RPC-surface proof in core/supabase works.
    expect(rowMatchesGenerated).toBe(true);
    expect(resultIsRowOrNull).toBe(true);
  });
});
