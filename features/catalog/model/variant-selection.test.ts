import { describe, expect, it } from "@jest/globals";

import type { CatalogVariantView } from "./catalog-view";
import {
  deriveVariantSelectionStrategy,
  findVariantByOptionValues,
  formatOptionCompatibility,
  formatVariantAvailability,
  getValidOptionValuesForDimension,
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

    it("detects clean-multi-dimension when all variants share uniform dimensions and unique signatures", () => {
      const variants = [
        makeMockVariant("v1", [
          { typeId: "t1", typeName: "Format", valueId: "fmt1", value: "Pod" },
          { typeId: "t2", typeName: "Strength", valueId: "str1", value: "20mg" },
        ]),
        makeMockVariant("v2", [
          { typeId: "t2", typeName: "Strength", valueId: "str2", value: "50mg" },
          { typeId: "t1", typeName: "Format", valueId: "fmt1", value: "Pod" },
        ]),
        makeMockVariant("v3", [
          { typeId: "t1", typeName: "Format", valueId: "fmt2", value: "Disposable" },
          { typeId: "t2", typeName: "Strength", valueId: "str1", value: "20mg" },
        ]),
      ];

      const strategy = deriveVariantSelectionStrategy(variants);
      expect(strategy.type).toBe("clean-multi-dimension");
      expect(strategy.dimensions).toHaveLength(2);
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
});
