import type { CartLine } from "@/features/cart";

import { savedCheckoutSchema } from "./pending-order.schema";

/**
 * The one checkout record kept on the tablet. Restore parses it with this
 * schema, so whatever it accepts can be re-sent to the store under its saved
 * request id — and whatever it rejects is discarded instead of resumed.
 */

const OWNER = "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const REQUEST = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";
const ORDER = "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b";
const VARIANT = "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f";

const line: CartLine = {
  lineId: VARIANT,
  variantId: VARIANT,
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [],
  imageUri: null,
  quantity: 2,
};

const pending = {
  version: 1,
  state: "pending",
  ownerId: OWNER,
  requestId: REQUEST,
  items: [{ variant_id: VARIANT, quantity: 2 }],
  lineSnapshots: [line],
};

const confirmed = {
  version: 1,
  state: "confirmed",
  ownerId: OWNER,
  success: { orderId: ORDER, displayNumber: "KX7QR9", createdAt: "2026-02-01T10:15:30+00:00" },
  lineSnapshots: [line],
};

describe("savedCheckoutSchema", () => {
  it("accepts a pending order: the request id and exact items to re-send", () => {
    const parsed = savedCheckoutSchema.parse(pending);

    expect(parsed.state).toBe("pending");
    expect(parsed).toEqual(pending);
  });

  it("accepts a confirmed order: the store's answer and what was ordered", () => {
    const parsed = savedCheckoutSchema.parse(confirmed);

    expect(parsed.state).toBe("confirmed");
    expect(parsed).toEqual(confirmed);
  });

  it("rejects an unknown state and a missing state", () => {
    expect(savedCheckoutSchema.safeParse({ ...pending, state: "unresolved" }).success).toBe(false);
    const { state: _state, ...withoutState } = pending;
    expect(savedCheckoutSchema.safeParse(withoutState).success).toBe(false);
  });

  it("rejects a record from another version", () => {
    expect(savedCheckoutSchema.safeParse({ ...pending, version: 2 }).success).toBe(false);
    expect(savedCheckoutSchema.safeParse({ ...confirmed, version: 0 }).success).toBe(false);
  });

  it("does not let one state borrow the other's fields", () => {
    // A pending record must carry its request; a confirmed one its answer.
    expect(savedCheckoutSchema.safeParse({ ...confirmed, state: "pending" }).success).toBe(false);
    expect(savedCheckoutSchema.safeParse({ ...pending, state: "confirmed" }).success).toBe(false);
  });

  it("rejects a pending order with no items — an empty request can never be re-sent", () => {
    expect(savedCheckoutSchema.safeParse({ ...pending, items: [] }).success).toBe(false);
  });

  it.each([
    ["ownerId", { ...pending, ownerId: "not-a-uuid" }],
    ["requestId", { ...pending, requestId: "undefined" }],
    ["an item's variant_id", { ...pending, items: [{ variant_id: "abc", quantity: 1 }] }],
    ["the confirmed ownerId", { ...confirmed, ownerId: "" }],
    ["the confirmed orderId", { ...confirmed, success: { ...confirmed.success, orderId: "x" } }],
  ])("rejects a malformed uuid in %s", (_field, record) => {
    expect(savedCheckoutSchema.safeParse(record).success).toBe(false);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
  ])("rejects a %s item quantity", (_label, quantity) => {
    expect(
      savedCheckoutSchema.safeParse({ ...pending, items: [{ variant_id: VARIANT, quantity }] })
        .success,
    ).toBe(false);
  });

  it("rejects a confirmed order whose display number or timestamp the store could not have sent", () => {
    expect(
      savedCheckoutSchema.safeParse({
        ...confirmed,
        success: { ...confirmed.success, displayNumber: "KX7QR" },
      }).success,
    ).toBe(false);
    expect(
      savedCheckoutSchema.safeParse({
        ...confirmed,
        success: { ...confirmed.success, createdAt: "yesterday" },
      }).success,
    ).toBe(false);
  });

  it("rejects line snapshots that are not cart lines", () => {
    expect(
      savedCheckoutSchema.safeParse({ ...pending, lineSnapshots: [{ name: "Cappuccino" }] })
        .success,
    ).toBe(false);
  });
});
