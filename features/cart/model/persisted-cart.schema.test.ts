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

/**
 * The canonical line the app actually persists: variantId + the SORTED
 * optionValueIds (oat milk's sorts before size's), joined with "|" — exactly
 * what deriveLineId produces from these fields.
 */
const validLine = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
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

/**
 * A plain variant's persisted line — the other real-world payload shape. With
 * no option values the derived identity is the bare variantId.
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

/**
 * The same selection as validLine with every uuid field spelled in UPPERCASE
 * hex — PostgreSQL accepts either spelling at the parse boundary.
 */
function uppercaseCappuccinoLine(lineId: string) {
  return {
    ...validLine,
    lineId,
    variantId: "3A7F2C1D-9B4E-4D6A-8F2C-7E1B5D9A4C3F",
    optionSelections: [
      {
        optionTypeId: "B2E1A4C3-8F7D-4A2B-9C6E-1D3F5A7B9C2D",
        optionValueId: "E5D3C8A1-6F2B-4C9D-8A7E-3B1F4D6C8A2B",
        optionValueLabel: "Large",
      },
      {
        optionTypeId: "C9D8B1F2-4A6E-4C3B-8D9A-2E7F1C5B3A4D",
        optionValueId: "1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D",
        optionValueLabel: "Oat Milk",
      },
    ],
  };
}

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

  // --- Line identity is not trusted from storage ------------------------------
  //
  // The schema checks shape only. Line identities are re-derived (and duplicate
  // selections merged) by the store on restore, so a stale, wrong or duplicated
  // lineId is not a reason to throw the customer's cart away. The store tests
  // pin the re-derivation; these pin that the schema lets such payloads through.

  it("accepts lines that share a lineId — the store merges them on restore", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [validLine, validLine],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a lineId that is not the derived identity — the store re-derives it", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [{ ...validLine, lineId: "garbage-id" }, validPlainLine],
    });
    expect(result.success).toBe(true);
  });

  it("still rejects an empty lineId", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [{ ...validLine, lineId: "" }],
    });
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toContainEqual(["lines", 0, "lineId"]);
  });

  it("accepts uppercase uuid fields (PostgreSQL accepts either hex case)", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [uppercaseCappuccinoLine(validLine.lineId)],
    });
    expect(result.success).toBe(true);
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
