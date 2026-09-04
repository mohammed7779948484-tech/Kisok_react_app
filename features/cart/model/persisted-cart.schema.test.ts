import { persistedCartSchema } from "./persisted-cart.schema";

/**
 * Colocated with the schema it protects: the test is right there when the
 * schema changes, instead of a __tests__ bucket nobody opens.
 *
 * These guards are what a foreign or older-build payload hits on restore: it
 * must fail loudly on the exact field that mismatches, never parse halfway
 * into a cart it must not surface.
 */

/** Field paths the schema complained about; empty when parsing succeeded. */
function issuePaths(result: ReturnType<typeof persistedCartSchema.safeParse>) {
  return result.success ? [] : result.error.issues.map((issue) => issue.path);
}

const validLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|e5d3c8a1|1a2b3c4d",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Large · Oat Milk",
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
      optionValueLabel: "Large",
    },
    {
      optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
      optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      optionValueLabel: "Oat Milk",
    },
  ],
  imageUri: null,
  quantity: 2,
};

const validCart = {
  version: 1,
  ownerId: "d94a2f7b-1c3e-4b5a-9f8d-6e2c7b1a4d3e",
  lines: [validLine],
};

describe("persisted-cart schema", () => {
  it("accepts a well-formed persisted cart", () => {
    expect(persistedCartSchema.safeParse(validCart).success).toBe(true);
  });

  it("accepts an empty cart (no lines yet)", () => {
    expect(persistedCartSchema.safeParse({ ...validCart, lines: [] }).success).toBe(true);
  });

  it("rejects a payload with the wrong envelope version", () => {
    const result = persistedCartSchema.safeParse({ ...validCart, version: 2 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["version"]);
  });

  it("rejects a payload missing ownerId", () => {
    const result = persistedCartSchema.safeParse({ version: 1, lines: [validLine] });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ownerId"]);
  });

  it("rejects an ownerId that is not a uuid", () => {
    const result = persistedCartSchema.safeParse({ ...validCart, ownerId: "customer-7" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["ownerId"]);
  });

  it("rejects a line the line schema rejects — the guard is nested", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [{ ...validLine, quantity: 0 }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["lines", 0, "quantity"]);
  });

  it("rejects a payload whose lines share a lineId", () => {
    const duplicate = persistedCartSchema.safeParse({
      ...validCart,
      lines: [validLine, validLine],
    });
    expect(duplicate.success).toBe(false);
    // Control: only the second lineId differs — the parse then succeeds, so
    // the rejection above is the uniqueness refinement, not another guard.
    const distinct = persistedCartSchema.safeParse({
      ...validCart,
      lines: [validLine, { ...validLine, lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d" }],
    });
    expect(distinct.success).toBe(true);
  });

  // --- Canonical PostgreSQL uuid contract (B-REMEDIATE-UUID) -----------------
  //
  // ownerId is a server-issued profile id: PostgreSQL's uuid text is any
  // 8-4-4-4-12 hex with no version/variant nibble rule, so a canonical
  // non-RFC ownerId must restore, not be discarded as a corrupt payload.

  it("accepts a canonical non-RFC ownerId (version nibble 9, variant nibble 0)", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      ownerId: "d94a2f7b-1c3e-9b5a-0f8d-6e2c7b1a4d3e",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a near-nil canonical ownerId (not the exact nil uuid)", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      ownerId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  // Controls: malformed ownerIds stay rejected — the loosening never widens
  // beyond the canonical uuid TEXT shape.

  it("still rejects an ownerId with wrong grouping or non-hex characters", () => {
    const grouped = persistedCartSchema.safeParse({
      ...validCart,
      ownerId: "d94a2f7b1c3e4b5a9f8d6e2c7b1a4d3e",
    });
    expect(grouped.success).toBe(false);
    expect(issuePaths(grouped)).toContainEqual(["ownerId"]);

    const nonHex = persistedCartSchema.safeParse({
      ...validCart,
      ownerId: "d94a2f7b-1c3e-4b5a-9f8d-6e2c7b1a4d3g",
    });
    expect(nonHex.success).toBe(false);
    expect(issuePaths(nonHex)).toContainEqual(["ownerId"]);
  });

  it("still rejects an empty-string ownerId and a non-string ownerId", () => {
    expect(persistedCartSchema.safeParse({ ...validCart, ownerId: "" }).success).toBe(false);
    expect(persistedCartSchema.safeParse({ ...validCart, ownerId: 42 }).success).toBe(false);
  });
});
