import { createOrderResponseSchema } from "./create-order-response.schema";

/**
 * Colocated contract tests for the `create_order` RPC response schema.
 *
 * Every case traces to `supabase/migrations/20260826050007_lean_create_order.sql`
 * (the two jsonb return families — success on both the fresh-create and
 * idempotent-replay paths, stock_conflict as a normal 2xx return) and to the
 * `display_number` check constraint in
 * `supabase/migrations/20260826050004_lean_inventory_orders_schema.sql`.
 *
 * Schema tests are the cheapest guard against a backend contract change.
 */
const validSuccessPayload = {
  kind: "success",
  order_id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
  display_number: "K7QM2W",
  // PostgreSQL renders a timestamptz inside jsonb with a +00:00 offset.
  created_at: "2026-08-26T05:00:07.123456+00:00",
};

const validStockConflictPayload = {
  kind: "stock_conflict",
  conflicts: [
    {
      variant_id: "11111111-1111-4111-8111-111111111111",
      requested_quantity: 3,
      available_quantity: 1,
    },
    {
      variant_id: "22222222-2222-4222-8222-222222222222",
      requested_quantity: 2,
      available_quantity: 0,
    },
  ],
};

function withoutField(payload: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...payload };
  delete copy[field];
  return copy;
}

function expectRejectedAt(payload: unknown, path: string): void {
  const result = createOrderResponseSchema.safeParse(payload);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
}

describe("create-order-response schema", () => {
  it("accepts a success payload and preserves its fields", () => {
    // Fresh create and idempotent replay return this same shape (migration
    // lines 133–139 and 357–362), so one acceptance covers both paths.
    const result = createOrderResponseSchema.safeParse(validSuccessPayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data).toEqual(validSuccessPayload);
  });

  it("accepts a success payload whose created_at uses the Z offset form", () => {
    expect(
      createOrderResponseSchema.safeParse({
        ...validSuccessPayload,
        created_at: "2026-08-26T05:00:07Z",
      }).success,
    ).toBe(true);
  });

  it("accepts a stock_conflict payload with multiple conflicts and preserves them", () => {
    const result = createOrderResponseSchema.safeParse(validStockConflictPayload);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data).toEqual(validStockConflictPayload);
  });

  it.each([
    ["an unknown kind", { ...validSuccessPayload, kind: "partial_failure" }],
    ["a wrong-cased kind", { ...validSuccessPayload, kind: "Success" }],
    ["a non-string kind", { ...validSuccessPayload, kind: 42 }],
    [
      "no kind at all",
      {
        order_id: validSuccessPayload.order_id,
        display_number: validSuccessPayload.display_number,
        created_at: validSuccessPayload.created_at,
      },
    ],
  ])("rejects a payload with %s", (_caseName, payload) => {
    expectRejectedAt(payload, "kind");
  });

  it.each(["order_id", "display_number", "created_at"])(
    "rejects a success payload missing %s",
    (field) => {
      expectRejectedAt(withoutField(validSuccessPayload, field), field);
    },
  );

  it("rejects a stock_conflict payload with no conflicts array", () => {
    expectRejectedAt({ kind: "stock_conflict" }, "conflicts");
  });

  it("rejects a stock_conflict payload with an empty conflicts array", () => {
    // jsonb_agg over zero matching rows yields null, and the RPC returns this
    // family only when conflict_items is not null — an empty array cannot come
    // from the real contract.
    expectRejectedAt({ kind: "stock_conflict", conflicts: [] }, "conflicts");
  });

  it("rejects a stock_conflict payload whose conflicts is null", () => {
    // Same migration guard from the other side: jsonb_agg's zero-row null
    // never reaches a genuine payload, but the wide Json result type makes
    // it representable, so the schema must reject it.
    expectRejectedAt({ kind: "stock_conflict", conflicts: null }, "conflicts");
  });

  it.each(["variant_id", "requested_quantity", "available_quantity"])(
    "rejects a conflict item missing %s",
    (field) => {
      expectRejectedAt(
        {
          kind: "stock_conflict",
          conflicts: [withoutField(validStockConflictPayload.conflicts[0]!, field)],
        },
        `conflicts.0.${field}`,
      );
    },
  );

  it("rejects a success payload whose order_id is not a uuid", () => {
    expectRejectedAt({ ...validSuccessPayload, order_id: "not-a-uuid" }, "order_id");
  });

  it("rejects a conflict item whose variant_id is not a uuid", () => {
    expectRejectedAt(
      {
        kind: "stock_conflict",
        conflicts: [{ ...validStockConflictPayload.conflicts[0], variant_id: "not-a-uuid" }],
      },
      "conflicts.0.variant_id",
    );
  });

  it.each([
    ["requested_quantity is a string", { requested_quantity: "3" }, "requested_quantity"],
    ["requested_quantity is a float", { requested_quantity: 1.5 }, "requested_quantity"],
    ["requested_quantity is zero", { requested_quantity: 0 }, "requested_quantity"],
    ["requested_quantity is negative", { requested_quantity: -2 }, "requested_quantity"],
    ["available_quantity is a string", { available_quantity: "1" }, "available_quantity"],
    ["available_quantity is a float", { available_quantity: 0.5 }, "available_quantity"],
    ["available_quantity is negative", { available_quantity: -1 }, "available_quantity"],
  ])("rejects a conflict item whose %s", (_caseName, overrides, field) => {
    expectRejectedAt(
      {
        kind: "stock_conflict",
        conflicts: [{ ...validStockConflictPayload.conflicts[0], ...overrides }],
      },
      `conflicts.0.${field}`,
    );
  });

  it.each([
    ["the letter I", "K7QM2I"],
    ["the letter O", "K7QMO2"],
    ["the digit 0", "K7QM20"],
    ["the digit 1", "K7QM21"],
    ["lowercase characters", "k7qm2w"],
    ["only five characters", "K7QM2"],
    ["seven characters", "K7QM2WX"],
    ["no characters at all", ""],
  ])("rejects a display number containing %s", (_caseName, displayNumber) => {
    expectRejectedAt({ ...validSuccessPayload, display_number: displayNumber }, "display_number");
  });

  it.each([
    // A naive local timestamp parses as a datetime but is NOT this contract —
    // the explicit offset is what timestamptz jsonb text always carries.
    ["a naive local timestamp", "2026-08-26T05:00:07"],
    ["a date only", "2026-08-26"],
    ["a space-separated timestamp", "2026-08-26 05:00:07+00"],
    ["a plain string", "not-a-timestamp"],
    ["a unix epoch number", 1756168807],
  ])("rejects a success payload whose created_at is %s", (_caseName, createdAt) => {
    expectRejectedAt({ ...validSuccessPayload, created_at: createdAt }, "created_at");
  });

  it("rejects unknown fields on both families", () => {
    // The empty path is the unrecognized-keys issue on the success family.
    expectRejectedAt({ ...validSuccessPayload, order_number: 7 }, "");
    expectRejectedAt(
      {
        kind: "stock_conflict",
        conflicts: [{ ...validStockConflictPayload.conflicts[0], resolved_quantity: 0 }],
      },
      "conflicts.0",
    );
  });

  it.each([
    ["a bare string", "success"],
    ["a bare number", 42],
    ["a bare array", [validSuccessPayload]],
    ["null", null],
  ])("rejects a non-object root payload: %s", (_caseName, payload) => {
    // The RPC result is typed as the wide Json union, so a non-object root is
    // representable — the union must reject it at the root path, not throw.
    expectRejectedAt(payload, "");
  });
});
