import type { AddToCartInput } from "@/features/cart";
import { buildAddToCartInput, type CatalogCartSource } from "./add-to-cart-mapping";

/**
 * Colocated with the mapper it protects: the test sits next to the module when
 * the cart contract or the label rule changes, instead of in a __tests__ bucket
 * nobody opens.
 *
 * The caption hazard these tests guard against: `CartItemRow` renders
 * `[variantLabel, ...optionSelections.map(s => s.optionValueLabel)].join(" · ")`
 * (features/cart/components/cart-item-row.tsx). Catalog's own label for
 * option-backed variants IS the joined option pairs, so mapping that label
 * verbatim would duplicate every option value in the row caption — the exact
 * negative shape pinned below.
 */

const productId = "6f1b8a2d-3c4e-4f5a-9b8c-7d2e1f0a4b6c";
const variantId = "a2c9e1f0-4b6d-4a3c-8e2f-1d5a7b9c3e6f";

/** Source option literals: the structural shape Product Detail derives. */
const flavorOption = {
  optionTypeId: "c4d2e6a8-1b3f-4a5c-9d7e-2f4a6b8d0c2e",
  optionValueId: "e6a4c8b0-2d5f-4b7a-8c9d-3e5a7c1f9b3d",
  optionValueLabel: "Watermelon",
  optionTypeName: "Flavor",
};

const strengthOption = {
  optionTypeId: "d8b0f2a4-3c6e-4a9b-8d1f-4a6c8e0b2d4f",
  optionValueId: "f0c6a2d4-4e8b-4b2c-9a3d-5b7d9f1c3e5a",
  optionValueLabel: "Strong",
  optionTypeName: "Strength",
};

/** An option-backed variant with a title override — the override wins. */
const overrideSource: CatalogCartSource = {
  productId,
  productName: "Energy Syrup",
  variant: {
    id: variantId,
    titleOverride: "Watermelon Ice",
    isAvailable: true,
    primaryImageUri: "https://images.example.com/products/energy-syrup.jpg",
    options: [flavorOption],
  },
  variantCount: 2,
  variantIndex: 0,
};

/** An option-backed variant without an override — the duplication hazard. */
const optionBackedSource: CatalogCartSource = {
  productId,
  productName: "Energy Syrup",
  variant: {
    id: variantId,
    titleOverride: null,
    isAvailable: true,
    primaryImageUri: "https://images.example.com/products/energy-syrup.jpg",
    options: [flavorOption, strengthOption],
  },
  variantCount: 2,
  variantIndex: 0,
};

/** A plain product's variant: no options, no override, no image. */
function noOptionSource(variantCount: number, variantIndex: number): CatalogCartSource {
  return {
    productId: "0b3d7f1a-5c9e-4a2b-8d4f-6e8a0c2b4d6f",
    productName: "Sparkling Water",
    variant: {
      id: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
      titleOverride: null,
      isAvailable: true,
      primaryImageUri: null,
      options: [],
    },
    variantCount,
    variantIndex,
  };
}

/** How many times needle occurs in haystack — for the exactly-once pins. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("buildAddToCartInput", () => {
  it("uses a present title override verbatim as the label while the option selections still carry the option", () => {
    const input = buildAddToCartInput(overrideSource);
    expect(input.variantLabel).toBe("Watermelon Ice");
    expect(input.optionSelections).toEqual([
      {
        optionTypeId: flavorOption.optionTypeId,
        optionValueId: flavorOption.optionValueId,
        optionValueLabel: "Watermelon",
      },
    ]);
  });

  it("trims surrounding whitespace from the override before using it verbatim", () => {
    const input = buildAddToCartInput({
      ...overrideSource,
      variant: { ...overrideSource.variant, titleOverride: "  Watermelon Ice  " },
    });
    expect(input.variantLabel).toBe("Watermelon Ice");
  });

  it("labels an option-backed variant with the joined option type names, never the option values", () => {
    const input = buildAddToCartInput(optionBackedSource);
    expect(input.variantLabel).toBe("Flavor, Strength");
    expect(input.variantLabel).not.toContain("Watermelon");
    expect(input.variantLabel).not.toContain("Strong");
    expect(input.optionSelections).toEqual([
      {
        optionTypeId: flavorOption.optionTypeId,
        optionValueId: flavorOption.optionValueId,
        optionValueLabel: "Watermelon",
      },
      {
        optionTypeId: strengthOption.optionTypeId,
        optionValueId: strengthOption.optionValueId,
        optionValueLabel: "Strong",
      },
    ]);
  });

  it("keeps the option-backed rule winning over the single-variant rule (precedence pin)", () => {
    // C-T01-R1: an option-backed variant of a SINGLE-variant product must
    // still take the joined type names, not "Standard option" — pins the
    // branch order in deriveVariantLabel against reordering.
    const input = buildAddToCartInput({ ...optionBackedSource, variantCount: 1, variantIndex: 0 });
    expect(input.variantLabel).toBe("Flavor, Strength");
    expect(input.variantLabel).not.toBe("Standard option");
  });

  it("accepts data-dependent overlap in the override family — the verbatim override wins (plan decision 3)", () => {
    // C-T01-R2: the exactly-once invariant applies to the MECHANICAL
    // composition (option-backed labels), not to merchant-authored override
    // text. This pin documents the accepted shape so a future reader does
    // not "fix" it by violating the verbatim rule.
    const input = buildAddToCartInput(overrideSource);
    const caption = [
      input.variantLabel,
      ...input.optionSelections.map((selection) => selection.optionValueLabel),
    ].join(" · ");
    // "Watermelon Ice" is merchant text that happens to contain the option
    // value; the override is used verbatim (plan decision 3), never
    // recomposed.
    expect(input.variantLabel).toBe("Watermelon Ice");
    expect(caption).toBe("Watermelon Ice · Watermelon");
  });

  it("composes a CartItemRow caption in which every option value appears exactly once", () => {
    const input = buildAddToCartInput(optionBackedSource);
    // Composed exactly as features/cart/components/cart-item-row.tsx renders it.
    const caption = [
      input.variantLabel,
      ...input.optionSelections.map((selection) => selection.optionValueLabel),
    ].join(" · ");

    expect(caption).toBe("Flavor, Strength · Watermelon · Strong");
    // The anti-duplication invariant: each user-visible option value exactly once.
    expect(occurrences(caption, "Watermelon")).toBe(1);
    expect(occurrences(caption, "Strong")).toBe(1);
    // The negative shape the rule exists to prevent: option values composed
    // into the label as well as carried by the selections.
    expect(caption).not.toBe("Flavor: Watermelon, Strength: Strong · Watermelon · Strong");
  });

  it('labels the single no-option variant "Standard option"', () => {
    const input = buildAddToCartInput(noOptionSource(1, 0));
    expect(input.variantLabel).toBe("Standard option");
    expect(input.optionSelections).toEqual([]);
  });

  it("labels a no-option variant among several by its 1-based position", () => {
    const input = buildAddToCartInput(noOptionSource(3, 2));
    expect(input.variantLabel).toBe("Option 3");
  });

  it("falls through a whitespace-only override to the option/standard rules", () => {
    const withOptions = buildAddToCartInput({
      ...overrideSource,
      variant: { ...overrideSource.variant, titleOverride: "   " },
    });
    expect(withOptions.variantLabel).toBe("Flavor");

    const singleNoOption = noOptionSource(1, 0);
    const standard = buildAddToCartInput({
      ...singleNoOption,
      variant: { ...singleNoOption.variant, titleOverride: "   " },
    });
    expect(standard.variantLabel).toBe("Standard option");
  });

  it("passes the variant's primary image uri through, including null", () => {
    expect(buildAddToCartInput(optionBackedSource).imageUri).toBe(
      "https://images.example.com/products/energy-syrup.jpg",
    );
    expect(buildAddToCartInput(noOptionSource(1, 0)).imageUri).toBeNull();
  });

  it("always adds exactly one unit — quantity control stays in the cart", () => {
    expect(buildAddToCartInput(overrideSource).quantity).toBe(1);
    expect(buildAddToCartInput(optionBackedSource).quantity).toBe(1);
    expect(buildAddToCartInput(noOptionSource(3, 2)).quantity).toBe(1);
  });

  it("outputs exactly the AddToCartInput keys — never price, brand, category, sku, barcode, stock, or availability fields", () => {
    const input = buildAddToCartInput(optionBackedSource);

    expect(Object.keys(input).sort()).toEqual([
      "imageUri",
      "optionSelections",
      "productDisplayName",
      "productId",
      "quantity",
      "variantId",
      "variantLabel",
    ]);

    const forbiddenFields = [
      "price",
      "unitPrice",
      "subtotal",
      "total",
      "brand",
      "brandName",
      "category",
      "categoryName",
      "sku",
      "barcode",
      "stock",
      "stockQuantity",
      "isAvailable",
      "availability",
    ];
    for (const forbidden of forbiddenFields) {
      expect(input).not.toHaveProperty(forbidden);
    }

    // The selections drop the structural optionTypeName the label rule consumed.
    for (const selection of input.optionSelections) {
      expect(Object.keys(selection).sort()).toEqual([
        "optionTypeId",
        "optionValueId",
        "optionValueLabel",
      ]);
    }
  });

  it("satisfies the cart's public AddToCartInput type and maps the whole contract", () => {
    // Type-level pin: `pnpm typecheck` fails this declaration if the mapper's
    // output drifts from the cart's public type. Jest strips types, so the
    // runtime assertion keeps the test honest inside the suite.
    const input: AddToCartInput = buildAddToCartInput(optionBackedSource);

    expect(input).toEqual({
      variantId,
      productId,
      productDisplayName: "Energy Syrup",
      variantLabel: "Flavor, Strength",
      optionSelections: [
        {
          optionTypeId: flavorOption.optionTypeId,
          optionValueId: flavorOption.optionValueId,
          optionValueLabel: "Watermelon",
        },
        {
          optionTypeId: strengthOption.optionTypeId,
          optionValueId: strengthOption.optionValueId,
          optionValueLabel: "Strong",
        },
      ],
      imageUri: "https://images.example.com/products/energy-syrup.jpg",
      quantity: 1,
    });
  });
});
