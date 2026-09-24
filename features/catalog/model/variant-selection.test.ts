import { describe, expect, it } from "@jest/globals";

import type { CatalogVariantView } from "./catalog-view";
import {
  deriveVariantSelectionStrategy,
  findVariantByOptionValues,
  formatOptionCompatibility,
  formatProductAvailability,
  formatVariantAvailability,
  formatVariantDetails,
  getValidOptionValuesForDimension,
  resolveContextualOptionState,
  resolveDefaultVariant,
  resolveVariantByOptionValues,
} from "./variant-selection";

function makeMockVariant(
  id: string,
  options: { typeId: string; typeName: string; valueId: string; value: string }[],
  isAvailable = true,
  titleOverride: string | null = null,
): CatalogVariantView {
  return {
    id,
    product_id: "00000000-0000-4000-8000-000000000001",
    sku: `SKU-${id}`,
    barcode: null,
    search_keywords: null,
    display_order: 1,
    title_override: titleOverride,
    is_available: isAvailable,
    label: `Variant ${id}`,
    media: [],
    primaryMedia: null,
    mediaSource: "none",
    options: options.map((opt, index) => ({
      type: { id: opt.typeId, name: opt.typeName, display_order: index + 1 },
      value: {
        id: opt.valueId,
        option_type_id: opt.typeId,
        value: opt.value,
        display_order: index + 1,
      },
      label: `${opt.typeName}: ${opt.value}`,
    })),
  };
}

describe("variant-selection", () => {
  describe("resolveDefaultVariant", () => {
    it("prefers the first available variant in existing backend order", () => {
      const v1 = makeMockVariant("v1", [], false); // unavailable
      const v2 = makeMockVariant("v2", [], true); // available
      const v3 = makeMockVariant("v3", [], true); // available

      expect(resolveDefaultVariant([v1, v2, v3])?.id).toBe("v2");
    });

    it("falls back to the first variant if no variant is available", () => {
      const v1 = makeMockVariant("v1", [], false);
      const v2 = makeMockVariant("v2", [], false);

      expect(resolveDefaultVariant([v1, v2])?.id).toBe("v1");
    });

    it("returns undefined for empty variant array", () => {
      expect(resolveDefaultVariant([])).toBeUndefined();
    });
  });

  describe("deriveVariantSelectionStrategy", () => {
    it("returns 'single' when product has 0 or 1 variant", () => {
      expect(deriveVariantSelectionStrategy([])).toEqual({
        type: "single",
        variantCount: 0,
      });

      const single = [makeMockVariant("v1", [])];
      expect(deriveVariantSelectionStrategy(single)).toEqual({
        type: "single",
        variantCount: 1,
      });
    });

    it("detects clean-single-dimension-inline when 2 to 6 unique options exist", () => {
      const variants = [
        makeMockVariant("v1", [{ typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" }]),
        makeMockVariant("v2", [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
        ]),
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Flavor", valueId: "f3", value: "Mango" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("clean-single-dimension-inline");
      expect(strategy.variantCount).toBe(3);
      expect(strategy.primaryDimension?.typeName).toBe("Flavor");
      expect(strategy.primaryDimension?.values).toHaveLength(3);
    });

    it("separates fixed dimensions from discriminating dimensions", () => {
      // 3 flavors, but Strength is fixed at 20mg across all variants
      const variants = [
        makeMockVariant("v1", [
          { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ]),
        makeMockVariant("v2", [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ]),
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Flavor", valueId: "f3", value: "Mango" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      // Because Strength only has 1 value, only Flavor discriminates!
      expect(strategy.type).toBe("clean-single-dimension-inline");
      expect(strategy.primaryDimension?.typeName).toBe("Flavor");
      expect(strategy.fixedDimensions).toHaveLength(1);
      expect(strategy.fixedDimensions?.[0]?.typeName).toBe("Strength");
      expect(strategy.fixedDimensions?.[0]?.value).toBe("20mg");
    });

    it("detects clean-single-dimension-picker when 7+ unique options exist", () => {
      const variants = Array.from({ length: 10 }, (_, i) =>
        makeMockVariant(`v${i}`, [
          { typeId: "t1", typeName: "Flavor", valueId: `f${i}`, value: `Flavor ${i}` },
        ]),
      );

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("clean-single-dimension-picker");
      expect(strategy.variantCount).toBe(10);
      expect(strategy.primaryDimension?.typeName).toBe("Flavor");
      expect(strategy.primaryDimension?.values).toHaveLength(10);
    });

    it("detects clean-multi-dimension when a dense Cartesian matrix exists", () => {
      // 2 Formats x 2 Strengths = 4 combinations, all 4 present
      const variants = [
        makeMockVariant("v1", [
          { typeId: "t1", typeName: "Format", valueId: "fmt1", value: "Pod" },
          { typeId: "t2", typeName: "Strength", valueId: "str1", value: "20mg" },
        ]),
        makeMockVariant("v2", [
          { typeId: "t1", typeName: "Format", valueId: "fmt1", value: "Pod" },
          { typeId: "t2", typeName: "Strength", valueId: "str2", value: "50mg" },
        ]),
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Format", valueId: "fmt2", value: "Disposable" },
          { typeId: "t2", typeName: "Strength", valueId: "str1", value: "20mg" },
        ]),
        makeMockVariant("v4", [
          { typeId: "t1", typeName: "Format", valueId: "fmt2", value: "Disposable" },
          { typeId: "t2", typeName: "Strength", valueId: "str2", value: "50mg" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("clean-multi-dimension");
      expect(strategy.dimensions).toHaveLength(2);
    });

    it("falls back to concrete picker when multi-dimensional matrix is sparse to avoid user trapping", () => {
      // 2 Formats x 2 Strengths = 4 combinations, but only 3 exist (sparse matrix)
      const variants = [
        makeMockVariant("v1", [
          { typeId: "t1", typeName: "Format", valueId: "fmt1", value: "Pod" },
          { typeId: "t2", typeName: "Strength", valueId: "str1", value: "20mg" },
        ]),
        makeMockVariant("v2", [
          { typeId: "t1", typeName: "Format", valueId: "fmt1", value: "Pod" },
          { typeId: "t2", typeName: "Strength", valueId: "str2", value: "50mg" },
        ]),
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Format", valueId: "fmt2", value: "Disposable" },
          { typeId: "t2", typeName: "Strength", valueId: "str1", value: "20mg" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      // Because variantCount (3) < expectedCombinations (4), fallback to small-concrete (<=4 variants)
      expect(strategy.type).toBe("small-concrete");
    });

    it("falls back to small-concrete when variants (<= 4) have incomplete or missing options", () => {
      const variants = [
        makeMockVariant("v1", [{ typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" }]),
        makeMockVariant("v2", []), // missing options
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("small-concrete");
      expect(strategy.variantCount).toBe(3);
    });

    it("falls back to large-concrete-picker when variants (>= 5) have incomplete or mixed options", () => {
      const variants = [
        makeMockVariant("v1", [{ typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" }]),
        makeMockVariant("v2", []), // missing options
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
        ]),
        makeMockVariant("v4", [
          { typeId: "t2", typeName: "Format", valueId: "fmt1", value: "Pod" },
        ]),
        makeMockVariant("v5", [
          { typeId: "t1", typeName: "Flavor", valueId: "f3", value: "Mango" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("large-concrete-picker");
      expect(strategy.variantCount).toBe(5);
    });

    it("falls back to large-concrete-picker when variants have duplicate option signatures", () => {
      // 5 variants where two have the exact same option signature
      const variants = [
        makeMockVariant("v1", [{ typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" }]),
        makeMockVariant("v2", [{ typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" }]), // duplicate signature
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
        ]),
        makeMockVariant("v4", [
          { typeId: "t1", typeName: "Flavor", valueId: "f3", value: "Mango" },
        ]),
        makeMockVariant("v5", [
          { typeId: "t1", typeName: "Flavor", valueId: "f4", value: "Peach" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("large-concrete-picker");
    });

    it("does not treat a dimension as fixed if coverage is less than variant count", () => {
      // 3 variants: v1 has Flavor + Strength; v2 has Flavor + Strength; v3 has Flavor only.
      // Strength has only 1 value ("20mg") but coverage is 2/3 variants.
      const variants = [
        makeMockVariant("v1", [
          { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ]),
        makeMockVariant("v2", [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ]),
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Flavor", valueId: "f3", value: "Mango" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      // Because topology is non-uniform, falls back to small-concrete with fixedDimensions = undefined
      expect(strategy.type).toBe("small-concrete");
      expect(strategy.fixedDimensions).toBeUndefined();
    });
  });

  describe("resolveVariantByOptionValues & findVariantByOptionValues", () => {
    const variants = [
      makeMockVariant("v1", [
        { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" },
        { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
      ]),
      makeMockVariant("v2", [
        { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" },
        { typeId: "t2", typeName: "Strength", valueId: "s2", value: "50mg" },
      ]),
      makeMockVariant("v3", [
        { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
        { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
      ]),
    ];

    it("returns resolved when exactly 1 variant matches", () => {
      const result = resolveVariantByOptionValues(variants, { t1: "f1", t2: "s1" });
      expect(result).toEqual({ type: "resolved", variant: variants[0] });

      const found = findVariantByOptionValues(variants, { t1: "f1", t2: "s1" });
      expect(found?.id).toBe("v1");
    });

    it("returns unresolved when 0 variants match", () => {
      const result = resolveVariantByOptionValues(variants, { t1: "f2", t2: "s2" });
      expect(result).toEqual({ type: "unresolved" });

      const found = findVariantByOptionValues(variants, { t1: "f2", t2: "s2" });
      expect(found).toBeUndefined();
    });

    it("returns ambiguous and does NEVER silently pick candidate[0] when 2+ variants match", () => {
      // Searching only Flavor "Mint", matching both v1 and v2
      const result = resolveVariantByOptionValues(variants, { t1: "f1" });
      expect(result.type).toBe("ambiguous");
      if (result.type === "ambiguous") {
        expect(result.candidates).toHaveLength(2);
      }

      // findVariantByOptionValues must return undefined rather than guessing candidate[0]
      const found = findVariantByOptionValues(variants, { t1: "f1" });
      expect(found).toBeUndefined();
    });
  });

  describe("resolveContextualOptionState", () => {
    const variants = [
      makeMockVariant(
        "v1",
        [
          { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ],
        true,
      ),
      makeMockVariant(
        "v2",
        [
          { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Mint" },
          { typeId: "t2", typeName: "Strength", valueId: "s2", value: "50mg" },
        ],
        false, // out of stock
      ),
      makeMockVariant(
        "v3",
        [
          { typeId: "t1", typeName: "Flavor", valueId: "f2", value: "Berry" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ],
        true,
      ),
    ];

    it("resolves compatible and in-stock option state", () => {
      // Current selection: Flavor = Mint. Candidate: Strength = 20mg (v1, in-stock)
      const state = resolveContextualOptionState(variants, "t2", "s1", { t1: "f1" });
      expect(state.isCompatible).toBe(true);
      expect(state.isAvailable).toBe(true);
      expect(state.variant?.id).toBe("v1");
    });

    it("resolves compatible and out-of-stock option state", () => {
      // Current selection: Flavor = Mint. Candidate: Strength = 50mg (v2, out of stock)
      const state = resolveContextualOptionState(variants, "t2", "s2", { t1: "f1" });
      expect(state.isCompatible).toBe(true);
      expect(state.isAvailable).toBe(false);
      expect(state.variant?.id).toBe("v2");
    });

    it("resolves incompatible option state for non-existent combinations", () => {
      // Current selection: Flavor = Berry. Candidate: Strength = 50mg (no variant exists)
      const state = resolveContextualOptionState(variants, "t2", "s2", { t1: "f2" });
      expect(state.isCompatible).toBe(false);
      expect(state.isAvailable).toBe(false);
      expect(state.variant).toBeUndefined();
    });
  });

  describe("getValidOptionValuesForDimension", () => {
    const variants = [
      makeMockVariant("v1", [
        { typeId: "color", typeName: "Color", valueId: "red", value: "Red" },
        { typeId: "size", typeName: "Size", valueId: "s", value: "Small" },
      ]),
      makeMockVariant("v2", [
        { typeId: "color", typeName: "Color", valueId: "red", value: "Red" },
        { typeId: "size", typeName: "Size", valueId: "m", value: "Medium" },
      ]),
      makeMockVariant("v3", [
        { typeId: "color", typeName: "Color", valueId: "blue", value: "Blue" },
        { typeId: "size", typeName: "Size", valueId: "l", value: "Large" },
      ]),
    ];

    it("returns only sizes compatible with selected color", () => {
      // If Color = Red is selected, valid sizes are Small and Medium (not Large)
      const validSizes = getValidOptionValuesForDimension(variants, "size", { color: "red" });
      expect(validSizes.has("s")).toBe(true);
      expect(validSizes.has("m")).toBe(true);
      expect(validSizes.has("l")).toBe(false);
    });

    it("returns only colors compatible with selected size", () => {
      // If Size = Large is selected, only Blue is valid
      const validColors = getValidOptionValuesForDimension(variants, "color", { size: "l" });
      expect(validColors.has("blue")).toBe(true);
      expect(validColors.has("red")).toBe(false);
    });
  });

  describe("availability vs compatibility semantics", () => {
    it("separates concrete variant stock availability from option compatibility", () => {
      const inStock = makeMockVariant("v1", [], true);
      const outOfStock = makeMockVariant("v2", [], false);

      expect(formatVariantAvailability(inStock)).toEqual({
        isAvailable: true,
        label: "Available",
        tone: "success",
      });

      expect(formatVariantAvailability(outOfStock)).toEqual({
        isAvailable: false,
        label: "Currently unavailable",
        tone: "destructive",
      });

      expect(formatOptionCompatibility(true)).toEqual({
        isCompatible: true,
        label: "Compatible",
      });

      expect(formatOptionCompatibility(false)).toEqual({
        isCompatible: false,
        label: "Not available with current selection",
      });
    });
  });

  describe("formatVariantDetails", () => {
    it("formats structured option types and values", () => {
      const v = makeMockVariant("v1", [
        { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Watermelon" },
        { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
      ]);

      expect(formatVariantDetails(v)).toBe("Flavor: Watermelon · Strength: 20mg");
    });

    it("suppresses redundant detail when title_override already communicates that value", () => {
      const v = makeMockVariant(
        "v1",
        [
          { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Watermelon" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ],
        true,
        "Watermelon",
      );

      // Flavor: Watermelon is suppressed because title_override === "Watermelon"
      expect(formatVariantDetails(v)).toBe("20mg");
    });

    it("suppresses embedded option tokens cleanly at token boundaries", () => {
      const v = makeMockVariant(
        "v1",
        [
          { typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Frozen Watermelon" },
          { typeId: "t2", typeName: "Strength", valueId: "s1", value: "20mg" },
        ],
        true,
        "Frozen Watermelon 20mg",
      );

      // Both Frozen Watermelon and 20mg are embedded at token boundaries in title_override
      expect(formatVariantDetails(v)).toBeNull();
    });

    it("protects short option tokens from accidental substring collision", () => {
      const v1 = makeMockVariant(
        "v1",
        [{ typeId: "t1", typeName: "Size", valueId: "m", value: "M" }],
        true,
        "Medium Roast",
      );
      // "M" does not token-boundary-match inside "Medium"
      expect(formatVariantDetails(v1)).toBe("M");

      const v2 = makeMockVariant(
        "v2",
        [{ typeId: "t1", typeName: "Model", valueId: "mod9", value: "9" }],
        true,
        "Device 900",
      );
      // "9" does not token-boundary-match inside "900"
      expect(formatVariantDetails(v2)).toBe("9");
    });

    it("returns null when all attributes match title_override or no options exist", () => {
      const vSingle = makeMockVariant(
        "v1",
        [{ typeId: "t1", typeName: "Flavor", valueId: "f1", value: "Watermelon" }],
        true,
        "Watermelon",
      );
      expect(formatVariantDetails(vSingle)).toBeNull();

      const vNone = makeMockVariant("v2", []);
      expect(formatVariantDetails(vNone)).toBeNull();
    });
  });

  describe("formatProductAvailability", () => {
    it("returns Available for single-variant in-stock product", () => {
      expect(formatProductAvailability(true, 1)).toEqual({
        isAvailable: true,
        label: "Available",
        tone: "success",
      });
    });

    it("returns Options available for multi-variant in-stock product", () => {
      expect(formatProductAvailability(true, 3)).toEqual({
        isAvailable: true,
        label: "Options available",
        tone: "success",
      });
    });

    it("returns Currently unavailable for out-of-stock product", () => {
      expect(formatProductAvailability(false, 3)).toEqual({
        isAvailable: false,
        label: "Currently unavailable",
        tone: "destructive",
      });
    });
  });
});
