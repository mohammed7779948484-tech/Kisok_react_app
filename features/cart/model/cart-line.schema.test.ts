import { cartLineSchema } from "./cart-line.schema";

/**
 * Colocated with the schema it protects: the test is right there when the
 * schema changes, instead of in a __tests__ bucket nobody opens.
 *
 * Guard tests assert the failing field, so a line is rejected for the reason
 * the domain requires — never incidentally.
 */

/** Field paths the schema complained about; empty when parsing succeeded. */
function issuePaths(result: ReturnType<typeof cartLineSchema.safeParse>) {
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
});
