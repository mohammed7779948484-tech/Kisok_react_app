import { cartLineSchema, MAX_LINE_QUANTITY } from "./cart-line.schema";
import type { AddToCartInput, CartLine } from "./cart-line.schema";
import {
  addLine,
  deriveDistinctLineCount,
  deriveLineId,
  deriveTotalQuantity,
  removeLine,
  setLineQuantity,
} from "./cart-rules";

/**
 * Behavior tests for the pure cart rules — line identity, merge/append
 * semantics, quantity bounds, and summaries (AC-03, AC-08). Fixtures reuse the
 * schema tests' cappuccino/water pair: one variant with two option selections,
 * one plain variant with none.
 */

const CAPPUCCINO_VARIANT_ID = "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f";
const WATER_VARIANT_ID = "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d";

const SIZE_OPTION_VALUE_ID = "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b";
const OAT_MILK_OPTION_VALUE_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const sizeSelection = {
  optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
  optionValueId: SIZE_OPTION_VALUE_ID,
  optionValueLabel: "Large",
};

const oatMilkSelection = {
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: OAT_MILK_OPTION_VALUE_ID,
  optionValueLabel: "Oat Milk",
};

// Oat milk's id sorts before size's, so the derived identity disagrees with
// the display order — that is exactly what the ordering tests pin.
const CAPPUCCINO_LINE_ID = [
  CAPPUCCINO_VARIANT_ID,
  OAT_MILK_OPTION_VALUE_ID,
  SIZE_OPTION_VALUE_ID,
].join("|");

/** The input a future Catalog "Add to cart" hands the cart. */
function cappuccinoInput(quantity: number): AddToCartInput {
  return {
    variantId: CAPPUCCINO_VARIANT_ID,
    productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
    productDisplayName: "Cappuccino",
    variantLabel: "Large · Oat Milk",
    optionSelections: [sizeSelection, oatMilkSelection],
    imageUri: "https://images.example.com/products/cappuccino.jpg",
    quantity,
  };
}

/** A plain variant — no options, no image: only the variantId identifies it. */
function waterInput(quantity: number): AddToCartInput {
  return {
    variantId: WATER_VARIANT_ID,
    productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
    productDisplayName: "Sparkling Water",
    variantLabel: "500 ml Bottle",
    optionSelections: [],
    imageUri: null,
    quantity,
  };
}

/** A cappuccino line as the cart holds it after addLine. */
function cappuccinoLine(quantity: number): CartLine {
  return { lineId: CAPPUCCINO_LINE_ID, ...cappuccinoInput(quantity) };
}

describe("deriveLineId", () => {
  it("derives a plain variant's identity as the bare variantId", () => {
    expect(deriveLineId({ variantId: WATER_VARIANT_ID, optionSelections: [] })).toBe(
      WATER_VARIANT_ID,
    );
  });

  it("joins the variantId with the optionValueIds in sorted order", () => {
    const id = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [sizeSelection, oatMilkSelection],
    });
    expect(id).toBe(CAPPUCCINO_LINE_ID);
  });

  it("derives the same id for the same selection in a different order", () => {
    const sizeFirst = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [sizeSelection, oatMilkSelection],
    });
    const milkFirst = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [oatMilkSelection, sizeSelection],
    });
    expect(milkFirst).toBe(sizeFirst);
  });

  it("derives one identity for the same uuids spelled with different hex case (PostgreSQL semantics)", () => {
    // PostgreSQL compares uuid text case-insensitively, so identity must too —
    // or two differently-cased copies of one selection are two lines that
    // never merge (H-F01). Upper vs lower hex, plus a different array order:
    // still one identity.
    const lower = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [sizeSelection, oatMilkSelection],
    });
    const upperReordered = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID.toUpperCase(),
      optionSelections: [
        { ...oatMilkSelection, optionValueId: OAT_MILK_OPTION_VALUE_ID.toUpperCase() },
        { ...sizeSelection, optionValueId: SIZE_OPTION_VALUE_ID.toUpperCase() },
      ],
    });
    expect(upperReordered).toBe(lower);
    // Both are the canonical lowercase derivation — not some third spelling.
    expect(lower).toBe(CAPPUCCINO_LINE_ID);
  });

  it("derives a different id for a different option-value set", () => {
    const bothOptions = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [sizeSelection, oatMilkSelection],
    });
    const sizeOnly = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [sizeSelection],
    });
    expect(sizeOnly).not.toBe(bothOptions);
  });

  it("derives a different id for a different variant with the same selection", () => {
    const cappuccino = deriveLineId({
      variantId: CAPPUCCINO_VARIANT_ID,
      optionSelections: [sizeSelection],
    });
    const otherVariant = deriveLineId({
      variantId: WATER_VARIANT_ID,
      optionSelections: [sizeSelection],
    });
    expect(otherVariant).not.toBe(cappuccino);
  });
});

describe("addLine", () => {
  it("appends the first line with its derived identity", () => {
    const lines = addLine([], cappuccinoInput(2));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ lineId: CAPPUCCINO_LINE_ID, ...cappuccinoInput(2) });
  });

  it("merges a re-added selection by summing quantities", () => {
    const lines = addLine(addLine([], cappuccinoInput(2)), cappuccinoInput(3));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(5);
  });

  it("merges a re-add whose selections arrive in a different order", () => {
    const reordered: AddToCartInput = {
      ...cappuccinoInput(3),
      optionSelections: [oatMilkSelection, sizeSelection],
    };
    const lines = addLine(addLine([], cappuccinoInput(2)), reordered);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(5);
  });

  it("caps a merge at the maximum line quantity", () => {
    const lines = addLine(addLine([], cappuccinoInput(50)), cappuccinoInput(60));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("merges a re-add of the same selection spelled with different uuid hex casing", () => {
    // The runtime consequence of canonical identity: the SAME selection to
    // PostgreSQL must merge into ONE line even when the caller's uuid hex
    // casing differs (H-F01 sub-finding).
    const upperCased: AddToCartInput = {
      ...cappuccinoInput(3),
      variantId: CAPPUCCINO_VARIANT_ID.toUpperCase(),
      optionSelections: [
        { ...sizeSelection, optionValueId: SIZE_OPTION_VALUE_ID.toUpperCase() },
        { ...oatMilkSelection, optionValueId: OAT_MILK_OPTION_VALUE_ID.toUpperCase() },
      ],
    };
    const lines = addLine(addLine([], cappuccinoInput(2)), upperCased);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(5);
    // The merged line keeps the canonical lowercase identity.
    expect(lines[0]?.lineId).toBe(CAPPUCCINO_LINE_ID);
  });

  it("caps a cross-casing merge at the maximum line quantity", () => {
    const upperCased: AddToCartInput = {
      ...cappuccinoInput(60),
      variantId: CAPPUCCINO_VARIANT_ID.toUpperCase(),
      optionSelections: [
        { ...sizeSelection, optionValueId: SIZE_OPTION_VALUE_ID.toUpperCase() },
        { ...oatMilkSelection, optionValueId: OAT_MILK_OPTION_VALUE_ID.toUpperCase() },
      ],
    };
    const lines = addLine(addLine([], cappuccinoInput(50)), upperCased);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("appends a distinct line for a different selection", () => {
    const sizeOnly: AddToCartInput = {
      ...cappuccinoInput(1),
      optionSelections: [sizeSelection],
    };
    const lines = addLine(addLine([], cappuccinoInput(2)), sizeOnly);
    expect(lines.map((line) => line.lineId)).toEqual([
      CAPPUCCINO_LINE_ID,
      `${CAPPUCCINO_VARIANT_ID}|${SIZE_OPTION_VALUE_ID}`,
    ]);
  });

  it("never mutates the lines it is given", () => {
    const original: CartLine[] = [cappuccinoLine(2)];
    const before = JSON.parse(JSON.stringify(original)) as CartLine[];
    addLine(original, cappuccinoInput(3)); // merge path
    addLine(original, waterInput(2)); // append path
    expect(original).toEqual(before);
  });

  it("ignores a stray lineId on the input — the derived identity wins", () => {
    // AddToCartInput carries no lineId by contract; a caller that smuggles one
    // in must not be able to seed a line with a foreign identity.
    const stray = { ...cappuccinoInput(2), lineId: "not-the-derived-id" } as AddToCartInput;
    const lines = addLine([], stray);
    expect(lines[0]?.lineId).toBe(CAPPUCCINO_LINE_ID);
    expect(lines[0]).toEqual(cappuccinoLine(2));

    // The same selection re-added still MERGES onto that line — one line, summed.
    const merged = addLine(lines, cappuccinoInput(3));
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(5);
  });
});

describe("setLineQuantity", () => {
  it("sets the target line's quantity", () => {
    const lines = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, 7);
    expect(lines[0]?.quantity).toBe(7);
  });

  it("clamps the quantity below the minimum and above the cap", () => {
    const tooLow = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, 0);
    const tooHigh = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, 150);
    expect(tooLow[0]?.quantity).toBe(1);
    expect(tooHigh[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("floors a non-integer quantity, then clamps (documented policy: floor)", () => {
    const floored = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, 2.7);
    const flooredBelowOne = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, 0.9);
    expect(floored[0]?.quantity).toBe(2);
    expect(flooredBelowOne[0]?.quantity).toBe(1);
  });

  it("fails safe on a NaN quantity (caller bug → minimum, not an invalid line)", () => {
    const lines = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, NaN);
    expect(lines[0]?.quantity).toBe(1);
  });

  it("clamps a +Infinity quantity to the maximum", () => {
    const lines = setLineQuantity([cappuccinoLine(2)], CAPPUCCINO_LINE_ID, Infinity);
    expect(lines[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it("leaves the lines unchanged for an unknown lineId", () => {
    const lines = [cappuccinoLine(2)];
    expect(setLineQuantity(lines, "no-such-line", 7)).toEqual(lines);
  });
});

describe("removeLine", () => {
  it("removes only the targeted line", () => {
    const lines = addLine(addLine([], cappuccinoInput(5)), waterInput(2));
    const after = removeLine(lines, CAPPUCCINO_LINE_ID);
    expect(after).toHaveLength(1);
    expect(after[0]?.lineId).toBe(WATER_VARIANT_ID);
  });
});

describe("deriveTotalQuantity and deriveDistinctLineCount", () => {
  it("sums line quantities and counts lines", () => {
    const lines = addLine(addLine([], cappuccinoInput(5)), waterInput(2));
    expect(deriveTotalQuantity(lines)).toBe(7);
    expect(deriveDistinctLineCount(lines)).toBe(2);
  });

  it("reports zero quantity and zero lines for an empty cart", () => {
    expect(deriveTotalQuantity([])).toBe(0);
    expect(deriveDistinctLineCount([])).toBe(0);
  });

  it("recomputes after a merge — the summed quantity rides on one line", () => {
    const lines = addLine(addLine([], cappuccinoInput(2)), cappuccinoInput(3));
    expect(deriveTotalQuantity(lines)).toBe(5);
    expect(deriveDistinctLineCount(lines)).toBe(1);
  });

  it("recomputes after a quantity change", () => {
    const lines = setLineQuantity(
      addLine(addLine([], cappuccinoInput(5)), waterInput(2)),
      CAPPUCCINO_LINE_ID,
      8,
    );
    expect(deriveTotalQuantity(lines)).toBe(10);
    expect(deriveDistinctLineCount(lines)).toBe(2);
  });

  it("recomputes after a remove", () => {
    const lines = removeLine(
      addLine(addLine([], cappuccinoInput(5)), waterInput(2)),
      WATER_VARIANT_ID,
    );
    expect(deriveTotalQuantity(lines)).toBe(5);
    expect(deriveDistinctLineCount(lines)).toBe(1);
  });

  it("round-trips through cartLineSchema — addLine output and the cap parse; the cap + 1 rejects", () => {
    const added = addLine([], cappuccinoInput(2));
    for (const line of added) {
      expect(cartLineSchema.safeParse(line).success).toBe(true);
    }
    expect(cartLineSchema.safeParse(cappuccinoLine(MAX_LINE_QUANTITY)).success).toBe(true);
    expect(cartLineSchema.safeParse(cappuccinoLine(MAX_LINE_QUANTITY + 1)).success).toBe(false);
  });
});
