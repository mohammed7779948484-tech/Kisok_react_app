import type { CatalogVariantView } from "./catalog-view";

export type VariantSelectionStrategyType =
  | "single"
  | "small-concrete"
  | "clean-single-dimension-inline"
  | "clean-single-dimension-picker"
  | "clean-multi-dimension"
  | "large-concrete-picker"
  // Backward compatibility aliases
  | "small-set"
  | "direct-concrete"
  | "single-dimension-inline"
  | "single-dimension-picker"
  | "multi-dimension";

export type OptionDimensionValue = {
  valueId: string;
  value: string;
  isAvailable: boolean;
};

export type OptionDimension = {
  typeId: string;
  typeName: string;
  values: OptionDimensionValue[];
};

export type VariantSelectionStrategy = {
  type: VariantSelectionStrategyType;
  /** Primary option dimension if cleanly present (single dimension) */
  primaryDimension?: OptionDimension;
  /** All dimensions if clean multi-dimension */
  dimensions?: OptionDimension[];
  /** Total count of concrete variants */
  variantCount: number;
};

/**
 * Derives the optimal selection strategy for a product's variants based on real data structure.
 * Rigorously differentiates clean single-dimension, clean multi-dimension, small concrete sets,
 * and large partially structured/ambiguous sets.
 */
export function deriveVariantSelectionStrategy(
  variants: readonly CatalogVariantView[],
): VariantSelectionStrategy {
  const variantCount = variants.length;

  if (variantCount <= 1) {
    return { type: "single", variantCount };
  }

  // Check if any variant lacks options entirely
  const hasEmptyOptions = variants.some((v) => v.options.length === 0);

  // Collect option types and signatures per variant
  const dimensionMap = new Map<string, { typeName: string; values: Map<string, string> }>();
  const signatures = new Set<string>();
  let hasDuplicateSignatures = false;

  const firstVariantTypeIds = variants[0]?.options.map((o) => o.type.id).sort() ?? [];
  let isUniformDimensions = !hasEmptyOptions && firstVariantTypeIds.length > 0;

  for (const variant of variants) {
    // Check uniform dimension count and type IDs against the first variant
    const currentTypeIds = variant.options.map((o) => o.type.id).sort();
    if (
      currentTypeIds.length !== firstVariantTypeIds.length ||
      !currentTypeIds.every((id, idx) => id === firstVariantTypeIds[idx])
    ) {
      isUniformDimensions = false;
    }

    // Build signature to check for duplicate option combinations
    if (variant.options.length > 0) {
      const sig = variant.options
        .map((o) => `${o.type.id}:${o.value.id}`)
        .sort()
        .join("|");
      if (signatures.has(sig)) {
        hasDuplicateSignatures = true;
      }
      signatures.add(sig);
    }

    // Accumulate dimensions
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

  // Build full dimension objects with availability metadata
  const dimensions: OptionDimension[] = [];
  for (const [typeId, { typeName, values }] of dimensionMap.entries()) {
    const valueList: OptionDimensionValue[] = Array.from(values.entries()).map(
      ([valueId, value]) => {
        // Available if at least one variant with this option value is in stock
        const isAvailable = variants.some(
          (v) =>
            v.is_available && v.options.some((o) => o.type.id === typeId && o.value.id === valueId),
        );
        return { valueId, value, isAvailable };
      },
    );
    dimensions.push({ typeId, typeName, values: valueList });
  }

  // Condition 1: Clean Single Dimension
  // Uniform 1 dimension on every variant, unique signatures, no missing options
  if (isUniformDimensions && !hasDuplicateSignatures && dimensions.length === 1 && dimensions[0]) {
    const primaryDimension = dimensions[0];
    const optionCount = primaryDimension.values.length;

    // 7+ values: searchable AdaptiveSheet picker
    if (optionCount > 6) {
      return {
        type: "clean-single-dimension-picker",
        primaryDimension,
        variantCount,
      };
    }

    // 2-6 values: inline toggle group
    return {
      type: "clean-single-dimension-inline",
      primaryDimension,
      variantCount,
    };
  }

  // Condition 2: Clean Multi-Dimension Matrix
  // Uniform multiple dimensions on every variant, unique signatures, no missing options
  if (isUniformDimensions && !hasDuplicateSignatures && dimensions.length > 1) {
    return {
      type: "clean-multi-dimension",
      dimensions,
      variantCount,
    };
  }

  // Condition 3: Small Concrete Set (<= 4 variants)
  // Partially structured, ambiguous signatures, or unstructured small collection
  if (variantCount <= 4) {
    return { type: "small-concrete", variantCount };
  }

  // Condition 4: Large Concrete Set (>= 5 variants)
  // Searchable AdaptiveSheet concrete-variant picker so we never render 15-46 full cards
  return { type: "large-concrete-picker", variantCount };
}

export type VariantMatchResult =
  | { type: "resolved"; variant: CatalogVariantView }
  | { type: "unresolved" }
  | { type: "ambiguous"; candidates: readonly CatalogVariantView[] };

/**
 * Resolves concrete variants that match the selected option values.
 * Strictly guarantees:
 * - 0 matches => unresolved
 * - 1 match => resolved concrete variant
 * - 2+ matches => ambiguous (never silently guesses the first match!)
 */
export function resolveVariantByOptionValues(
  variants: readonly CatalogVariantView[],
  selectedOptionValueIds: Record<string, string>,
): VariantMatchResult {
  const matches = variants.filter((variant) => {
    for (const [typeId, valueId] of Object.entries(selectedOptionValueIds)) {
      const match = variant.options.some(
        (opt) => opt.type.id === typeId && opt.value.id === valueId,
      );
      if (!match) return false;
    }
    return true;
  });

  if (matches.length === 1 && matches[0]) {
    return { type: "resolved", variant: matches[0] };
  }

  if (matches.length === 0) {
    return { type: "unresolved" };
  }

  return { type: "ambiguous", candidates: matches };
}

/**
 * Finds the concrete variant that uniquely matches the selected option values.
 * Returns undefined if no match OR if multiple candidates match (ambiguous).
 * Never silently guesses a candidate.
 */
export function findVariantByOptionValues(
  variants: readonly CatalogVariantView[],
  selectedOptionValueIds: Record<string, string>,
): CatalogVariantView | undefined {
  const result = resolveVariantByOptionValues(variants, selectedOptionValueIds);
  return result.type === "resolved" ? result.variant : undefined;
}

/**
 * Derives valid/compatible remaining option values for a given dimension based on current selections.
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
 * Formats truthful availability copy at variant level (inventory stock state).
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
 * Formats truthful compatibility copy for an option combination.
 */
export function formatOptionCompatibility(isCompatible: boolean): {
  isCompatible: boolean;
  label: string;
} {
  return isCompatible
    ? { isCompatible: true, label: "Compatible" }
    : { isCompatible: false, label: "Not available with current selection" };
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
