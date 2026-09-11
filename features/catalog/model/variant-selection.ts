import type { CatalogVariantView } from "./catalog-view";

export type VariantSelectionStrategyType =
  | "single"
  | "small-concrete"
  | "clean-single-dimension-inline"
  | "clean-single-dimension-picker"
  | "clean-multi-dimension"
  | "large-concrete-picker";

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

export type FixedOptionDimension = {
  typeId: string;
  typeName: string;
  valueId: string;
  value: string;
};

export type VariantSelectionStrategy = {
  type: VariantSelectionStrategyType;
  /** Primary option dimension if cleanly single-dimension */
  primaryDimension?: OptionDimension;
  /** Discriminating dimensions if clean multi-dimension */
  dimensions?: OptionDimension[];
  /** Fixed dimensions that do not vary across variants */
  fixedDimensions?: FixedOptionDimension[];
  /** Total count of concrete variants */
  variantCount: number;
};

/**
 * Resolves the preferred initial variant for a product.
 * Prefers the first available variant in existing backend order.
 * If no variant is available, falls back to the first variant.
 */
export function resolveDefaultVariant(
  variants: readonly CatalogVariantView[],
): CatalogVariantView | undefined {
  return variants.find((v) => v.is_available) ?? variants[0];
}

/**
 * Derives the optimal selection strategy for a product's variants based on real data structure.
 * Rigorously differentiates clean single-dimension, reachable multi-dimension, small concrete sets,
 * and large concrete picker sets.
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

  // Collect option types, signatures, and variant coverage count
  const dimensionMap = new Map<
    string,
    { typeName: string; values: Map<string, string>; coverageCount: number }
  >();
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

    // Accumulate dimensions and track unique variant coverage
    const seenTypesInVariant = new Set<string>();
    for (const opt of variant.options) {
      const typeId = opt.type.id;
      const typeName = opt.type.name;
      const valueId = opt.value.id;
      const val = opt.value.value;

      if (!dimensionMap.has(typeId)) {
        dimensionMap.set(typeId, { typeName, values: new Map(), coverageCount: 0 });
      }
      const entry = dimensionMap.get(typeId)!;
      entry.values.set(valueId, val);
      if (!seenTypesInVariant.has(typeId)) {
        seenTypesInVariant.add(typeId);
        entry.coverageCount += 1;
      }
    }
  }

  // Build full dimension objects with availability metadata
  const dimensions: OptionDimension[] = [];
  for (const [typeId, { typeName, values }] of dimensionMap.entries()) {
    const valueList: OptionDimensionValue[] = Array.from(values.entries()).map(
      ([valueId, value]) => {
        const isAvailable = variants.some(
          (v) =>
            v.is_available && v.options.some((o) => o.type.id === typeId && o.value.id === valueId),
        );
        return { valueId, value, isAvailable };
      },
    );
    dimensions.push({ typeId, typeName, values: valueList });
  }

  // Separate fixed dimensions (only 1 value AND covers all variants) from discriminating dimensions (>1 values)
  const fixedDimensions: FixedOptionDimension[] = [];
  const discriminatingDimensions: OptionDimension[] = [];

  for (const dim of dimensions) {
    const entry = dimensionMap.get(dim.typeId);
    const coverage = entry?.coverageCount ?? 0;
    if (coverage === variantCount && dim.values.length === 1 && dim.values[0]) {
      fixedDimensions.push({
        typeId: dim.typeId,
        typeName: dim.typeName,
        valueId: dim.values[0].valueId,
        value: dim.values[0].value,
      });
    } else if (dim.values.length > 1) {
      discriminatingDimensions.push(dim);
    }
  }

  // Uniform dimensions and unique signatures check
  if (isUniformDimensions && !hasDuplicateSignatures) {
    // Case 1: Exactly 1 discriminating dimension (e.g. only Flavor varies; Strength is fixed)
    if (discriminatingDimensions.length === 1 && discriminatingDimensions[0]) {
      const primaryDimension = discriminatingDimensions[0];
      const optionCount = primaryDimension.values.length;

      if (optionCount > 6) {
        return {
          type: "clean-single-dimension-picker",
          primaryDimension,
          fixedDimensions: fixedDimensions.length > 0 ? fixedDimensions : undefined,
          variantCount,
        };
      }

      return {
        type: "clean-single-dimension-inline",
        primaryDimension,
        fixedDimensions: fixedDimensions.length > 0 ? fixedDimensions : undefined,
        variantCount,
      };
    }

    // Case 2: 2+ discriminating dimensions
    // Must be reachably dense (full Cartesian matrix) to prevent customer trapping in sparse matrix
    if (discriminatingDimensions.length >= 2) {
      const expectedCombinations = discriminatingDimensions.reduce(
        (acc, dim) => acc * dim.values.length,
        1,
      );

      // Full Cartesian matrix: 100% reachable without dead ends
      if (variantCount === expectedCombinations) {
        return {
          type: "clean-multi-dimension",
          dimensions: discriminatingDimensions,
          fixedDimensions: fixedDimensions.length > 0 ? fixedDimensions : undefined,
          variantCount,
        };
      }
      // Sparse matrix fallback below to ensure predictable customer navigation
    }
  }

  // Condition 3: Small Concrete Set (<= 4 variants)
  if (variantCount <= 4) {
    return {
      type: "small-concrete",
      fixedDimensions:
        isUniformDimensions && fixedDimensions.length > 0 ? fixedDimensions : undefined,
      variantCount,
    };
  }

  // Condition 4: Large Concrete Set (>= 5 variants)
  return {
    type: "large-concrete-picker",
    fixedDimensions:
      isUniformDimensions && fixedDimensions.length > 0 ? fixedDimensions : undefined,
    variantCount,
  };
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
 * Resolves availability and compatibility for a candidate option value in a multi-dimensional selection.
 * Checks whether selecting candidateValueId alongside current sibling selections produces a valid variant,
 * and whether that candidate variant is in stock.
 */
export function resolveContextualOptionState(
  variants: readonly CatalogVariantView[],
  targetTypeId: string,
  candidateValueId: string,
  currentSelections: Record<string, string>,
): { isCompatible: boolean; isAvailable: boolean; variant?: CatalogVariantView } {
  const hypotheticalSelections = {
    ...currentSelections,
    [targetTypeId]: candidateValueId,
  };
  const match = resolveVariantByOptionValues(variants, hypotheticalSelections);
  if (match.type === "resolved") {
    return {
      isCompatible: true,
      isAvailable: match.variant.is_available,
      variant: match.variant,
    };
  }
  if (match.type === "ambiguous") {
    const anyAvailable = match.candidates.some((v) => v.is_available);
    return {
      isCompatible: true,
      isAvailable: anyAvailable,
    };
  }
  return {
    isCompatible: false,
    isAvailable: false,
  };
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
 * Checks whether phrase appears in text bounded by non-alphanumeric characters or string boundaries.
 */
function matchesTokenBoundary(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  if (text === phrase) return true;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "u");
  return regex.test(text);
}

/**
 * Formats ordered structured variant details (e.g. "Color: Red · Size: Large"),
 * cleanly omitting information already communicated by title_override.
 */
export function formatVariantDetails(
  variant: CatalogVariantView,
  options?: { omitOptionValues?: Set<string>; useKeyPrefix?: boolean },
): string | null {
  if (variant.options.length === 0) return null;

  const normalizedTitle = variant.title_override?.normalize("NFD").toLowerCase().trim() ?? "";

  const relevantOptions = variant.options.filter((opt) => {
    const val = opt.value.value.trim();
    if (!val) return false;
    if (options?.omitOptionValues?.has(val)) return false;
    // Omit if title_override already communicates this exact value or phrase at token boundary
    if (normalizedTitle) {
      const normalizedVal = val.normalize("NFD").toLowerCase().trim();
      if (matchesTokenBoundary(normalizedTitle, normalizedVal)) {
        return false;
      }
    }
    return true;
  });

  if (relevantOptions.length === 0) return null;

  if (options?.useKeyPrefix ?? relevantOptions.length > 1) {
    return relevantOptions.map((o) => `${o.type.name}: ${o.value.value}`).join(" · ");
  }

  return relevantOptions.map((o) => o.value.value).join(" · ");
}

/**
 * Formats a concise summary of the selected variant's attributes for customer confirmation.
 */
export function formatVariantSummary(variant: CatalogVariantView): string {
  if (variant.title_override?.trim()) {
    return variant.title_override.trim();
  }

  if (variant.options.length === 0) {
    return variant.label;
  }

  if (variant.options.length === 1 && variant.options[0]) {
    return variant.options[0].value.value;
  }

  // Multiple dimensions: Type: Value pairs for clarity
  return variant.options.map((opt) => `${opt.type.name}: ${opt.value.value}`).join(" · ");
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
 * Differentiates 1 variant ("Available") from multiple variants ("Options available").
 */
export function formatProductAvailability(
  productIsAvailable: boolean,
  variantCount = 2,
): {
  isAvailable: boolean;
  label: string;
  tone: "success" | "destructive";
} {
  if (!productIsAvailable) {
    return { isAvailable: false, label: "Currently unavailable", tone: "destructive" };
  }

  if (variantCount <= 1) {
    return { isAvailable: true, label: "Available", tone: "success" };
  }

  return { isAvailable: true, label: "Options available", tone: "success" };
}
