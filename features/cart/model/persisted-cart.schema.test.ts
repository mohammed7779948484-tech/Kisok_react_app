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

/** Refinement messages the schema complained about; empty when parsing succeeded. */
function refinementMessages(result: ReturnType<typeof persistedCartSchema.safeParse>) {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

/**
 * The canonical line the app actually persists: variantId + the SORTED
 * optionValueIds (oat milk's sorts before size's), joined with "|" — exactly
 * what deriveLineId produces from these fields. H-F01 hardened this contract:
 * a merely non-empty unique lineId no longer parses, so the fixture carries the
 * real full-uuid derivation instead of the old truncated shorthand.
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
 * hex — PostgreSQL accepts either spelling at the parse boundary. Only the
 * lineId decides whether the payload is canonical or malformed.
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

  it("rejects a payload whose lines share a lineId", () => {
    const duplicate = persistedCartSchema.safeParse({
      ...validCart,
      lines: [validLine, validLine],
    });
    expect(duplicate.success).toBe(false);
    // Control: two distinct, semantically valid lines parse — so the rejection
    // above is the uniqueness refinement, not another guard.
    const distinct = persistedCartSchema.safeParse({
      ...validCart,
      lines: [validLine, validPlainLine],
    });
    expect(distinct.success).toBe(true);
  });

  // --- Semantic line identity (H-F01) ----------------------------------------
  //
  // A shape-valid payload is not a valid cart: each persisted line must carry
  // EXACTLY the identity the domain derives from its own fields. A wrong
  // (non-empty, unique) lineId restores a line the next addLine for the same
  // selection can never merge with — the store would append a duplicate line
  // for one selection instead. The invariant reuses deriveLineId, so there is
  // exactly ONE identity algorithm in the feature.

  it("rejects a line whose lineId is a wrong non-empty unique string (H-F01)", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [{ ...validLine, lineId: "garbage-id" }],
    });
    expect(result.success).toBe(false);
    expect(refinementMessages(result)).toContain(
      "persisted cart lineId does not match its derived identity",
    );
  });

  it("rejects two semantically identical selections carrying different fake lineIds", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [
        { ...validLine, lineId: "fake-line-id-a" },
        { ...validLine, lineId: "fake-line-id-b" },
      ],
    });
    expect(result.success).toBe(false);
    // The two lineIds are distinct, so the uniqueness refinement passes — only
    // the semantic identity refinement can be the rejector here.
    expect(refinementMessages(result)).toContain(
      "persisted cart lineId does not match its derived identity",
    );
  });

  it("still accepts the canonical payload a real build writes (optioned + plain lines)", () => {
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [validLine, validPlainLine],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an uppercase-spelled derivation — identity must be the canonical lowercase join", () => {
    // Same selection as validLine, every uuid UPPERCASE, and the lineId the
    // raw uppercase strings would produce. PostgreSQL treats either hex case
    // as one uuid, but deriveLineId canonicalizes to lowercase — so the
    // uppercase join is NOT the derived identity and must not restore.
    const result = persistedCartSchema.safeParse({
      ...validCart,
      lines: [
        uppercaseCappuccinoLine(
          "3A7F2C1D-9B4E-4D6A-8F2C-7E1B5D9A4C3F|1A2B3C4D-5E6F-4A7B-8C9D-0E1F2A3B4C5D|E5D3C8A1-6F2B-4C9D-8A7E-3B1F4D6C8A2B",
        ),
      ],
    });
    expect(result.success).toBe(false);
    expect(refinementMessages(result)).toContain(
      "persisted cart lineId does not match its derived identity",
    );
  });

  it("accepts uppercase uuid FIELDS when the lineId is the canonical lowercase derivation", () => {
    // The parse boundary mirrors PostgreSQL's case-insensitive uuid acceptance
    // (postgresUuidSchema is deliberately unchanged); identity is canonical.
    // Uppercase fields with the canonical lowercase lineId are legitimate data.
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
