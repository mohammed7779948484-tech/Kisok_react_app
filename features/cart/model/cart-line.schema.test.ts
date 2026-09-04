import {
  addToCartInputSchema,
  cartLineSchema,
  MAX_LINE_QUANTITY,
  MIN_LINE_QUANTITY,
} from "./cart-line.schema";

/**
 * Colocated with the schema it protects: the test is right there when the
 * schema changes, instead of in a __tests__ bucket nobody opens.
 *
 * Guard tests assert the failing field, so a line is rejected for the reason
 * the domain requires — never incidentally.
 */

/** Field paths the schema complained about; empty when parsing succeeded. */
function issuePaths(
  result: { success: true } | { success: false; error: { issues: { path: PropertyKey[] }[] } },
) {
  return result.success ? [] : result.error.issues.map((issue) => issue.path);
}

const sizeSelection = {
  optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
  optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  optionValueLabel: "Large",
};

const milkSelection = {
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  optionValueLabel: "Oat Milk",
};

/** A cappuccino variant with two ordered option selections. */
const validLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|e5d3c8a1|1a2b3c4d",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Large · Oat Milk",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

/**
 * A plain variant: no options to select, no image. Nothing but the variant
 * distinguishes the line, so its derived identity is the bare variantId.
 */
const validPlainLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

describe("cart-line schema", () => {
  it("accepts a well-formed line", () => {
    expect(cartLineSchema.safeParse(validLine).success).toBe(true);
  });

  it("accepts a plain line with no options and no image", () => {
    expect(cartLineSchema.safeParse(validPlainLine).success).toBe(true);
  });

  it("rejects quantity 0 — the minimum is one", () => {
    const result = cartLineSchema.safeParse({ ...validLine, quantity: 0 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["quantity"]);
  });

  it("pins the exported bounds: MIN_LINE_QUANTITY is 1, below MAX, and the schema range is exactly [MIN, MAX]", () => {
    // Mirrors the MAX round-trip convention in cart-rules.test.ts: the exported
    // constants ARE the schema's bounds — MIN parses, MIN − 1 rejects (R-T06-02).
    expect(MIN_LINE_QUANTITY).toBe(1);
    expect(MIN_LINE_QUANTITY).toBeLessThan(MAX_LINE_QUANTITY);
    expect(cartLineSchema.safeParse({ ...validLine, quantity: MIN_LINE_QUANTITY }).success).toBe(
      true,
    );
    expect(
      cartLineSchema.safeParse({ ...validLine, quantity: MIN_LINE_QUANTITY - 1 }).success,
    ).toBe(false);
  });

  it("rejects quantity 100 — the cap is ninety-nine", () => {
    const result = cartLineSchema.safeParse({ ...validLine, quantity: 100 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["quantity"]);
  });

  it("rejects a non-integer quantity", () => {
    const result = cartLineSchema.safeParse({ ...validLine, quantity: 1.5 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["quantity"]);
  });

  it("rejects a variantId that is not a uuid", () => {
    const result = cartLineSchema.safeParse({ ...validLine, variantId: "large" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["variantId"]);
  });

  it("rejects an empty productDisplayName", () => {
    const result = cartLineSchema.safeParse({ ...validLine, productDisplayName: "" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["productDisplayName"]);
  });

  it("rejects an empty variantLabel", () => {
    const result = cartLineSchema.safeParse({ ...validLine, variantLabel: "" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["variantLabel"]);
  });

  it("rejects an empty optionValueLabel inside a selection", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      optionSelections: [{ ...sizeSelection, optionValueLabel: "" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["optionSelections", 0, "optionValueLabel"]);
  });

  it("rejects a productId that is not a uuid", () => {
    const result = cartLineSchema.safeParse({ ...validLine, productId: "cappuccino" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["productId"]);
  });

  it("rejects an optionValueId that is not a uuid", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      optionSelections: [{ ...sizeSelection, optionValueId: "large" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["optionSelections", 0, "optionValueId"]);
  });

  it("rejects an empty lineId", () => {
    const result = cartLineSchema.safeParse({ ...validLine, lineId: "" });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["lineId"]);
  });

  it("accepts an add-to-cart input without a lineId", () => {
    const { lineId: _derivedByRules, ...input } = validLine;
    expect(addToCartInputSchema.safeParse(input).success).toBe(true);
  });

  it("rejects quantity 0 on the add-to-cart input too", () => {
    const { lineId: _derivedByRules, ...input } = validLine;
    const result = addToCartInputSchema.safeParse({ ...input, quantity: 0 });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["quantity"]);
  });

  // --- Canonical PostgreSQL uuid contract (B-REMEDIATE-UUID) -----------------
  //
  // PostgreSQL's uuid type accepts any 8-4-4-4-12 hex — no RFC 9562
  // version/variant nibble rule, and no migration CHECK constrains ids to
  // gen_random_uuid()'s v4 shape. Catalog validates ids with exactly this
  // canonical shape, so ids the whole server chain accepts must parse here:
  // a rejected add-to-cart input is a logged no-op in the store's add path.

  it("accepts a variantId whose version nibble is 0 (canonical, not RFC 9562)", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      variantId: "0f4a9d3e-2b1c-0f8a-8e7d-5c6b8a3f1d2e",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a productId whose version nibble is 9", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      productId: "0f4a9d3e-2b1c-9f8a-8e7d-5c6b8a3f1d2e",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optionTypeId whose variant nibble is 0", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      optionSelections: [
        { ...sizeSelection, optionTypeId: "b2e1a4c3-8f7d-4a2b-0c6e-1d3f5a7b9c2d" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an optionValueId whose variant nibble is f", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      optionSelections: [
        { ...sizeSelection, optionValueId: "e5d3c8a1-6f2b-4c9d-fe7e-3b1f4d6c8a2b" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a line whose ids are near-nil canonical hex (not the exact nil uuid)", () => {
    const nearNilLine = {
      ...validLine,
      lineId: "00000000-0000-0000-0000-000000000001|00000000-0000-0000-0000-000000000004",
      variantId: "00000000-0000-0000-0000-000000000001",
      productId: "00000000-0000-0000-0000-000000000002",
      optionSelections: [
        {
          optionTypeId: "00000000-0000-0000-0000-000000000003",
          optionValueId: "00000000-0000-0000-0000-000000000004",
          optionValueLabel: "Large",
        },
      ],
    };
    expect(cartLineSchema.safeParse(nearNilLine).success).toBe(true);
  });

  it("accepts a canonical non-RFC uuid on the add-to-cart input — Catalog's payload", () => {
    const { lineId: _derivedByRules, ...input } = validLine;
    const result = addToCartInputSchema.safeParse({
      ...input,
      variantId: "3a7f2c1d-9b4e-ad6a-0f2c-7e1b5d9a4c3f",
    });
    expect(result.success).toBe(true);
  });

  // Controls: the loosening is to PostgreSQL's canonical uuid TEXT shape only —
  // every malformed id stays rejected exactly as before.

  it("still rejects a 36-hex-character id with no grouping", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      variantId: "3a7f2c1d9b4e4d6a8f2c7e1b5d9a4c3f",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["variantId"]);
  });

  it("still rejects a 36-character id with a non-hex character", () => {
    const result = cartLineSchema.safeParse({
      ...validLine,
      variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3g",
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["variantId"]);
  });

  it("still rejects an empty-string id and a non-string id", () => {
    expect(cartLineSchema.safeParse({ ...validLine, variantId: "" }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...validLine, variantId: 42 }).success).toBe(false);
  });
});
