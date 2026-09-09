import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { installMockSupabase } from "@/core/testing";

import { type OrderStatusUpdate } from "../model/order-status-update.schema";

import { updateOrderStatus, type UpdateOrderStatusInput } from "./update-order-status";

/**
 * The safety-critical write of the feature, tested at the client seam: every
 * board action (start preparing, mark ready, cancel) rides this one RPC, so
 * what gets pinned here is the wire contract — argument names, the T01
 * validation boundary, and the AppError kinds the UI branches on
 * (AC-04/05/06/10).
 *
 * Transition legality is deliberately NOT tested and NOT implemented here:
 * migration 20260826050008's `update_order_status` is authoritative
 * server-side, and a rejected transition must surface as `state-conflict`
 * feedback (AC-10), never as a client-side fabrication.
 */

// callRpc logs failures by design (rpc error → warn, schema mismatch →
// error); capture the output so the expected failures below do not look like
// a broken run.
beforeEach(() => setLogSink(() => {}));
afterEach(() => {
  resetLogging();
});

const ORDER_ID = "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";

/** A `new → preparing` success — the jsonb projection migration 08 returns. */
const preparingResult: OrderStatusUpdate = {
  order_id: ORDER_ID,
  display_number: "AB2CD4",
  status: "preparing",
  assigned_preparation_id: "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88",
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  updated_at: "2026-08-26T05:00:08.123456+00:00",
};

/** A `preparing → ready` success — the flow the mark-ready action runs. */
const readyResult: OrderStatusUpdate = { ...preparingResult, status: "ready" };

describe("updateOrderStatus", () => {
  let supabase: ReturnType<typeof installMockSupabase> | undefined;

  afterEach(() => {
    supabase?.restore();
  });

  it("resolves the validated OrderStatusUpdate and sends the RPC's argument names", async () => {
    supabase = installMockSupabase({
      rpc: { update_order_status: () => ({ data: preparingResult, error: null }) },
    });

    const result = await updateOrderStatus({
      orderId: ORDER_ID,
      targetStatus: "preparing",
      reason: "Claimed from the board",
    });

    expect(result).toEqual(preparingResult);
    // camelCase input → the RPC's snake_case argument names, exactly these.
    expect(supabase.callsTo("update_order_status")).toHaveLength(1);
    expect(supabase.callsTo("update_order_status")[0]?.args).toStrictEqual({
      order_id: ORDER_ID,
      target_status: "preparing",
      reason: "Claimed from the board",
    });
  });

  it("sends no reason when the input has none — the RPC's null default applies", async () => {
    supabase = installMockSupabase({
      rpc: { update_order_status: () => ({ data: readyResult, error: null }) },
    });

    await updateOrderStatus({ orderId: ORDER_ID, targetStatus: "ready" });

    // Pinned: the implementation passes the key with an undefined value;
    // JSON serialization drops it before the wire, so the server sees no
    // reason and applies the migration's `reason text default null`.
    expect(supabase.callsTo("update_order_status")[0]?.args).toStrictEqual({
      order_id: ORDER_ID,
      target_status: "ready",
      reason: undefined,
    });
  });

  it("maps a server-rejected transition to the AppError the UI branches on", async () => {
    // K1004: order already final / already assigned / transition not allowed —
    // the conflict AC-10 requires surfacing, never swallowing.
    supabase = installMockSupabase({
      rpc: {
        update_order_status: () => ({
          data: null,
          error: {
            code: "K1004",
            message: "The order is already final.",
            details: "",
            hint: "",
            name: "PostgrestError",
          },
        }),
      },
    });

    const failure = await updateOrderStatus({
      orderId: ORDER_ID,
      targetStatus: "preparing",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: "state-conflict",
      code: "K1004",
      userMessage: "This order has already been updated.",
    });
  });

  it("maps the assignee-only rejection to a forbidden AppError", async () => {
    // 42501: the `preparing → ready` path is assignee-only (migration 08,
    // lines 158-162) — the other branch AC-10 names. Marking a colleague's
    // order ready is forbidden, not a state conflict: it must surface with
    // the kind the UI renders as feedback (and never as a retry candidate).
    supabase = installMockSupabase({
      rpc: {
        update_order_status: () => ({
          data: null,
          error: {
            code: "42501",
            message: "Only the assigned Preparation employee can mark this order ready.",
            details: "",
            hint: "",
            name: "PostgrestError",
          },
        }),
      },
    });

    const failure = await updateOrderStatus({
      orderId: ORDER_ID,
      targetStatus: "ready",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({
      kind: "forbidden",
      code: "42501",
      userMessage: "You don't have access to do that.",
    });
  });

  it("REJECTS a payload that does not match the T01 schema", async () => {
    // A backend change must break loudly at this boundary, not surface as
    // `undefined` deep inside a screen. "Completed" is not an enum member.
    supabase = installMockSupabase({
      rpc: {
        update_order_status: () => ({
          data: { ...preparingResult, status: "Completed" },
          error: null,
        }),
      },
    });

    const failure = await updateOrderStatus({
      orderId: ORDER_ID,
      targetStatus: "ready",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "server", code: "RPC_SCHEMA_MISMATCH" });
  });
});

/**
 * Compile-time proof of the two type contracts this module owns. Nothing here
 * runs — `pnpm typecheck` is what enforces it.
 */

/** True only when A and B are the same type, not merely mutually assignable. */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The write resolves the T01-validated projection, not an untyped jsonb.
type MutationResult = Awaited<ReturnType<typeof updateOrderStatus>>;
type ResultIsTheValidatedProjection = Expect<Equals<MutationResult, OrderStatusUpdate>>;
const resultIsTheValidatedProjection: ResultIsTheValidatedProjection = true;

// The target union is exactly the three tablet actions. Widening it to the
// full five-value enum would let this client request transitions it never
// legitimately makes: `completed` is the Admin web app's (brief, out of
// scope) and `new` is not a tablet target.
type TargetUnion = UpdateOrderStatusInput["targetStatus"];
type TargetsAreTheThreeTabletActions = Expect<
  Equals<TargetUnion, "preparing" | "ready" | "cancelled">
>;
const targetsAreTheThreeTabletActions: TargetsAreTheThreeTabletActions = true;

describe("the write contract", () => {
  it("resolves the validated projection and admits only the three tablet targets", () => {
    // The type assertions above are the real checks; asserting the values
    // here keeps them referenced and gives a failure a readable message, the
    // same way the RPC-surface proof in core/supabase works.
    expect(resultIsTheValidatedProjection).toBe(true);
    expect(targetsAreTheThreeTabletActions).toBe(true);
  });
});
