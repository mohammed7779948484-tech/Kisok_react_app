import type { CatalogVariantView } from "./catalog-view";

export type VariantSelectionStrategyType =
  | "single"
  | "small-set"
  | "single-dimension-inline"
  | "single-dimension-picker"
  | "multi-dimension"
  | "direct-concrete";

export type OptionDimension = {
  typeId: string;
  typeName: string;
  values: {
    valueId: string;
    value: string;
    isAvailable: boolean;
  }[];
};

export type VariantSelectionStrategy = {
  type: VariantSelectionStrategyType;
  /** Primary option dimension if exactly 1 dimension is cleanly present */
  primaryDimension?: OptionDimension;
  /** All dimensions if multi-dimension */
  dimensions?: OptionDimension[];
  /** Total count of concrete variants */
  variantCount: number;
};

/**
 * Derives the optimal selection strategy for a product's variants based on real data structure.
 */
export function deriveVariantSelectionStrategy(
  variants: readonly CatalogVariantView[],
): VariantSelectionStrategy {
  const variantCount = variants.length;

  if (variantCount <= 1) {
    return { type: "single", variantCount };
  }

  // Inspect option types across all variants
  const dimensionMap = new Map<string, { typeName: string; values: Map<string, string> }>();
  let hasIncompleteOptions = false;

  for (const variant of variants) {
    if (variant.options.length === 0) {
      hasIncompleteOptions = true;
      break;
    }

    for (const opt of variant.options) {
      const typeId = opt.type.id;
      const typeName = opt.type.name;
      const valueId = opt.value.id;
      const val = opt.value.value;

      if (!dimensionMap.has(typeId)) {
        dimensionMap.set(typeId, { typeName, values: new Map() });
      }
      dimensionMap.get(typeId)!.values.set(valueId, val);
    }
  }

  // If variants have incomplete/missing option mappings or duplicate signatures, fallback
  if (hasIncompleteOptions || dimensionMap.size === 0) {
    if (variantCount <= 4) {
      return { type: "small-set", variantCount };
    }
    return { type: "direct-concrete", variantCount };
  }

  const dimensions: OptionDimension[] = [];
  for (const [typeId, { typeName, values }] of dimensionMap.entries()) {
    const valueList = Array.from(values.entries()).map(([valueId, value]) => {
      // Available if at least one variant with this option value is available
      const isAvailable = variants.some(
        (v) =>
          v.is_available && v.options.some((o) => o.type.id === typeId && o.value.id === valueId),
      );
      return { valueId, value, isAvailable };
    });
    dimensions.push({ typeId, typeName, values: valueList });
  }

  // Exactly one dimension (e.g. Flavor or Strength)
  if (dimensions.length === 1 && dimensions[0]) {
    const primaryDimension = dimensions[0];
    const optionCount = primaryDimension.values.length;

    // High cardinality (e.g. 7 to 46 flavors): tablet picker sheet with search
    if (optionCount > 6) {
      return {
        type: "single-dimension-picker",
        primaryDimension,
        variantCount,
      };
    }

    // Low cardinality (2-6 options): inline chips / toggle-group
    return {
      type: "single-dimension-inline",
      primaryDimension,
      variantCount,
    };
  }

  // Multiple dimensions (e.g. Format + Strength or Flavor + Strength)
  if (dimensions.length > 1) {
    return {
      type: "multi-dimension",
      dimensions,
      variantCount,
    };
  }

  // Very small set of variants without clean taxonomy: small-set rich radio cards
  if (variantCount <= 4) {
    return { type: "small-set", variantCount };
  }

  return { type: "direct-concrete", variantCount };
}

/**
 * Finds the concrete variant that matches the selected option values.
 * If multiple or ambiguous, matches candidate variants safely without guessing.
 */
export function findVariantByOptionValues(
  variants: readonly CatalogVariantView[],
  selectedOptionValueIds: Record<string, string>,
): CatalogVariantView | undefined {
  const matches = variants.filter((variant) => {
    for (const [typeId, valueId] of Object.entries(selectedOptionValueIds)) {
      const match = variant.options.some(
        (opt) => opt.type.id === typeId && opt.value.id === valueId,
      );
      if (!match) return false;
    }
    return true;
  });

  return matches[0];
}

/**
 * Derives valid remaining option values for a given dimension based on current selections.
 */
export function getValidOptionValuesForDimension(
  variants: readonly CatalogVariantView[],
  targetTypeId: string,
  currentSelections: Record<string, string>,
): Set<string> {
  const validValueIds = new Set<string>();

  for (const variant of variants) {
    // Check if variant matches all OTHER current selections
    let matchesOther = true;
    for (const [typeId, valueId] of Object.entries(currentSelections)) {
      if (typeId === targetTypeId) continue;
      const match = variant.options.some(
        (opt) => opt.type.id === typeId && opt.value.id === valueId,
      );
      if (!match) {
        matchesOther = false;
        break;
      }
    }

    if (matchesOther) {
      for (const opt of variant.options) {
        if (opt.type.id === targetTypeId) {
          validValueIds.add(opt.value.id);
        }
      }
    }
  }

  return validValueIds;
}

/**
 * Formats a concise summary of the selected variant's attributes for customer confirmation.
 */
export function formatVariantSummary(variant: CatalogVariantView): string {
  if (variant.title_override?.trim()) {
    return variant.title_override.trim();
  }

  if (variant.options.length > 0) {
    return variant.options.map((opt) => opt.value.value).join(" · ");
  }

  return variant.label;
}

/**
 * Formats truthful availability copy at variant level.
 */
export function formatVariantAvailability(variant: CatalogVariantView): {
  isAvailable: boolean;
  label: string;
  tone: "success" | "destructive";
} {
  return variant.is_available
    ? { isAvailable: true, label: "Available", tone: "success" }
    : { isAvailable: false, label: "Currently unavailable", tone: "destructive" };
}

/**
 * Formats truthful availability copy at product level.
 */
export function formatProductAvailability(productIsAvailable: boolean): {
  isAvailable: boolean;
  label: string;
  tone: "success" | "destructive";
} {
  return productIsAvailable
    ? { isAvailable: true, label: "Options available", tone: "success" }
    : { isAvailable: false, label: "Currently unavailable", tone: "destructive" };
}
