import { orderStatusUpdateSchema } from "./order-status-update.schema";

/**
 * Colocated with the schema it protects: the test is right there when the
 * schema changes, instead of in a __tests__ bucket nobody opens.
 *
 * Fixtures mirror the jsonb projection `update_order_status` actually returns
 * (supabase/migrations/20260826050008_lean_order_operations.sql,
 * `pg_catalog.jsonb_build_object`): Postgres renders `timestamptz` into jsonb
 * as an ISO-8601 string with a numeric UTC offset, and SQL NULL arrives as
 * JSON `null` — never `undefined`.
 */

/** A `new → preparing` success: claimed, nothing terminal yet. */
const preparingResult = {
  order_id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
  display_number: "AB2CD4",
  status: "preparing",
  assigned_preparation_id: "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88",
  completed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  updated_at: "2026-08-26T05:00:08.123456+00:00",
};

describe("order-status-update schema", () => {
  it("accepts the migration-08 projection with null optionals", () => {
    expect(orderStatusUpdateSchema.parse(preparingResult)).toEqual(preparingResult);
  });

  it("accepts a fully-populated cancellation result", () => {
    const cancelledResult = {
      ...preparingResult,
      status: "cancelled",
      assigned_preparation_id: null,
      cancelled_at: "2026-08-26T05:02:41+00:00",
      cancellation_reason: "Customer changed their mind",
    };

    expect(orderStatusUpdateSchema.parse(cancelledResult)).toEqual(cancelledResult);
  });

  it("rejects a payload missing a required field", () => {
    const payload: Record<string, unknown> = { ...preparingResult };
    delete payload.updated_at;

    expect(orderStatusUpdateSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a status outside the order_status enum", () => {
    expect(
      orderStatusUpdateSchema.safeParse({ ...preparingResult, status: "Completed" }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid order_id", () => {
    expect(
      orderStatusUpdateSchema.safeParse({ ...preparingResult, order_id: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects a non-ISO-8601 timestamp", () => {
    expect(
      orderStatusUpdateSchema.safeParse({ ...preparingResult, updated_at: "26/08/2026 05:00" })
        .success,
    ).toBe(false);
  });

  it("rejects an ISO timestamp without a UTC offset", () => {
    // Postgres always renders a numeric UTC offset into jsonb; an offset-less
    // timestamp is not a shape `update_order_status` can produce. Pins the
    // `offset: true` requirement against a regression to an offset-optional
    // variant.
    expect(
      orderStatusUpdateSchema.safeParse({
        ...preparingResult,
        updated_at: "2026-08-26T05:00:08.123456",
      }).success,
    ).toBe(false);
  });

  it("rejects a display_number that violates the orders check constraint", () => {
    // "1" is excluded from the glyph alphabet (confusable with "I").
    expect(
      orderStatusUpdateSchema.safeParse({ ...preparingResult, display_number: "AB1CD4" }).success,
    ).toBe(false);
  });

  it("rejects undefined where the contract sends an explicit null", () => {
    expect(
      orderStatusUpdateSchema.safeParse({ ...preparingResult, cancellation_reason: undefined })
        .success,
    ).toBe(false);
  });

  it("rejects null for a required field", () => {
    // Only the four contract-nullable fields may be null (pinned above);
    // the always-present fields must carry real values.
    const requiredFields = ["order_id", "display_number", "status", "updated_at"] as const;

    for (const field of requiredFields) {
      const payload = { ...preparingResult, [field]: null };

      expect(orderStatusUpdateSchema.safeParse(payload).success).toBe(false);
    }
  });
});
