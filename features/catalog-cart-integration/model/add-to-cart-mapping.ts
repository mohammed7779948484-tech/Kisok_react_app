import type { AddToCartInput } from "@/features/cart";

/**
 * The pure mapper from a structural Catalog selection to the cart's public
 * `AddToCartInput` — the anti-duplication heart of the catalog-cart seam
 * (plan decisions 2-4).
 *
 * Product Detail computes a `CatalogCartSource` from its OWN resolved view
 * (Catalog owns its shapes); this module owns the translation into the cart's
 * line contract and nothing else. It stays structural on purpose: no Catalog
 * view types are imported, and the output carries exactly the seven
 * `AddToCartInput` fields — no price, stock, brand, category, sku, barcode, or
 * availability ever crosses the seam. The cart's own schema validates the
 * result again at `addItem()`.
 *
 * The label rule (brief AC-04) mirrors catalog-view's fallback semantics for
 * the no-option families while deliberately diverging for the option-backed
 * one: the option TYPE names become the label, and the option VALUES reach the
 * cart row caption only through `optionSelections`. `CartItemRow` renders
 * `[variantLabel, ...optionValueLabels].join(" · ")`, and Catalog's own label
 * for option-backed variants is the joined option pairs — mapping that label
 * would duplicate every option value in the caption ("Flavor: Watermelon ·
 * Watermelon").
 */

/**
 * The structural source Product Detail derives from its resolved product and
 * selected variant.
 *
 * `variant.isAvailable` is deliberately NOT consumed by the mapper: the
 * AddToCartButton owns the disabled state (plan decision 7), and availability
 * must never leak into the cart line snapshot.
 */
export type CatalogCartSource = {
  productId: string;
  productName: string;
  variant: {
    id: string;
    /** Raw title_override from the catalog snapshot (mapper trims). */
    titleOverride: string | null;
    isAvailable: boolean;
    /** variant.primaryMedia?.secureUrl ?? null (cover fallback already applied by the catalog view). */
    primaryImageUri: string | null;
    options: {
      optionTypeId: string;
      optionValueId: string;
      optionValueLabel: string;
      /** The option TYPE name, e.g. "Flavor". */
      optionTypeName: string;
    }[];
  };
  /** product.variants.length */
  variantCount: number;
  /** 0-based index of this variant in product.variants. */
  variantIndex: number;
};

/**
 * The AC-04 label rule, in precedence order:
 *
 * 1. trimmed `titleOverride` when non-empty — used verbatim, never recomposed;
 * 2. option-backed without an override — the option TYPE names joined ", "
 *    (the values arrive in the caption only via `optionSelections`);
 * 3. a no-option single variant — "Standard option";
 * 4. a no-option variant among several — `Option ${index + 1}`.
 */
function deriveVariantLabel(source: CatalogCartSource): string {
  const trimmedOverride = source.variant.titleOverride?.trim() ?? "";
  if (trimmedOverride.length > 0) {
    return trimmedOverride;
  }
  if (source.variant.options.length > 0) {
    return source.variant.options.map((option) => option.optionTypeName).join(", ");
  }
  if (source.variantCount === 1) {
    return "Standard option";
  }
  return `Option ${source.variantIndex + 1}`;
}

/** Maps a structural Catalog selection to the cart's public AddToCartInput. */
export function buildAddToCartInput(source: CatalogCartSource): AddToCartInput {
  return {
    variantId: source.variant.id,
    productId: source.productId,
    productDisplayName: source.productName,
    variantLabel: deriveVariantLabel(source),
    optionSelections: source.variant.options.map((option) => ({
      optionTypeId: option.optionTypeId,
      optionValueId: option.optionValueId,
      optionValueLabel: option.optionValueLabel,
    })),
    imageUri: source.variant.primaryImageUri,
    quantity: 1,
  };
}
