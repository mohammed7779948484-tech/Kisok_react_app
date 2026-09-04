import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { installMockSupabase } from "@/core/testing";

import type { CreateOrderResponse } from "../model/create-order-response.schema";

import { submitOrder, type SubmitOrderInput } from "./submit-order";

let supabase: ReturnType<typeof installMockSupabase> | undefined;

beforeEach(() => {
  // callRpc logs a warning on every RPC failure and an error on every schema
  // mismatch; this suite exercises both paths by design.
  setLogSink(() => {});
});

afterEach(() => {
  supabase?.restore();
  supabase = undefined;
  resetLogging();
});

/** A canonical-uuid idempotency identity, as the attempt store will mint one. */
const CLIENT_REQUEST_ID = "5b21a8e0-3f47-4c6d-9e2b-7d8f1a4b6c3e";

/** The exact `items` payload T02's normalized request produces (its two keys). */
const ITEMS = [
  { variant_id: "1a2b3c4d-5e6f-4071-8a9b-0c1d2e3f4a5b", quantity: 2 },
  { variant_id: "9a8b7c6d-5e4f-4031-8a2b-6c7d8e9f0a1b", quantity: 1 },
];

const input: SubmitOrderInput = {
  clientRequestId: CLIENT_REQUEST_ID,
  items: ITEMS,
};

const successResponse: CreateOrderResponse = {
  kind: "success",
  order_id: "c3d4e5f6-a7b8-40c9-8d0e-1f2a3b4c5d6e",
  display_number: "MN4P7Q",
  created_at: "2026-08-26T05:07:00+00:00",
};

/** A successful call that created no order (migration lines 187–206). */
const stockConflictResponse: CreateOrderResponse = {
  kind: "stock_conflict",
  conflicts: [
    {
      variant_id: "9a8b7c6d-5e4f-4031-8a2b-6c7d8e9f0a1b",
      requested_quantity: 2,
      available_quantity: 1,
    },
  ],
};

/** The snake_case argument object the RPC's generated `Args` type demands. */
const expectedArgs = {
  client_request_id: CLIENT_REQUEST_ID,
  items: ITEMS,
};

describe("submitOrder", () => {
  it("submits create_order exactly once with the exact snake_case args and returns the validated success payload", async () => {
    supabase = installMockSupabase({
      rpc: {
        create_order: () => ({ data: successResponse, error: null }),
      },
    });

    await expect(submitOrder(input)).resolves.toEqual(successResponse);
    expect(supabase.callsTo("create_order")).toEqual([
      { name: "create_order", args: expectedArgs },
    ]);
  });

  it("returns the validated stock_conflict payload as a successful call, never as an exception", async () => {
    supabase = installMockSupabase({
      rpc: {
        create_order: () => ({ data: stockConflictResponse, error: null }),
      },
    });

    await expect(submitOrder(input)).resolves.toEqual(stockConflictResponse);
    expect(supabase.callsTo("create_order")).toHaveLength(1);
  });

  it.each([
    // userMessage expectations are the mapped values in core/errors/index.ts
    // (KISOK_CODE_MAP for the K-codes, SQLSTATE_MAP for 42501/PGRST301):
    // callRpc's AppError must pass through this boundary UNCHANGED. A
    // regression that re-wraps the mapped AppError instead of letting it
    // through would replace the code-specific wording with the generic
    // fallback — exactly what these rows pin.
    {
      code: "K1001",
      kind: "validation",
      retryable: false,
      userMessage: "We couldn't process that request. Please try again.",
    },
    {
      code: "K1002",
      kind: "unavailable",
      retryable: false,
      userMessage: "Some items are no longer available.",
    },
    // K1003 is the idempotency conflict: a definite server answer that must
    // never be auto-retried (plan D11).
    {
      code: "K1003",
      kind: "idempotency-conflict",
      retryable: false,
      userMessage: "This order was already submitted with different items.",
    },
    {
      code: "K1006",
      kind: "server",
      retryable: true,
      userMessage: "Something went wrong on our side. Please try again.",
    },
    {
      code: "42501",
      kind: "forbidden",
      retryable: false,
      userMessage: "You don't have access to do that.",
    },
    // An expired session is the one D3-reachable `auth` kind at this boundary:
    // PostgREST answers PGRST301, a definite server answer (plan D3).
    {
      code: "PGRST301",
      kind: "auth",
      retryable: false,
      userMessage: "Your session expired. Please sign in again.",
    },
  ])(
    "maps a $code RPC error response to an AppError (kind $kind, retryable $retryable)",
    async ({ code, kind, retryable, userMessage }) => {
      supabase = installMockSupabase({
        rpc: {
          create_order: () => ({
            data: null,
            error: {
              code,
              message: `raised ${code}`,
              details: "",
              hint: "",
              name: "PostgrestError",
            },
          }),
        },
      });

      const failure = await submitOrder(input).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AppError);
      expect(failure).toMatchObject({ kind, code, retryable });
      // The mapped userMessage arrives intact, never re-wrapped.
      expect((failure as AppError).userMessage).toBe(userMessage);
    },
  );

  it("rejects a malformed success payload (right kind, missing field) as an AppError of kind server with code RPC_SCHEMA_MISMATCH", async () => {
    const malformed: unknown = {
      kind: "success",
      display_number: "MN4P7Q",
      created_at: "2026-08-26T05:07:00+00:00",
      // order_id is missing: the kind discriminates, the shape does not.
    };
    supabase = installMockSupabase({
      rpc: {
        create_order: () => ({ data: malformed, error: null }),
      },
    });

    const failure = await submitOrder(input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "server", code: "RPC_SCHEMA_MISMATCH" });
  });

  it("converts a raw transport rejection (TypeError: fetch failed) to an AppError of kind network — the D3 ambiguity signal", async () => {
    supabase = installMockSupabase({
      rpc: {
        create_order: () => {
          throw new TypeError("fetch failed");
        },
      },
    });

    const failure = await submitOrder(input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "network", retryable: true });
  });

  it("converts an unrecognized rejection to an AppError of kind unknown, preserving its detail", async () => {
    supabase = installMockSupabase({
      rpc: {
        create_order: () => {
          throw new Error("weird internal");
        },
      },
    });

    const failure = await submitOrder(input).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ kind: "unknown", technicalMessage: "weird internal" });
  });
});
