import { normalizeCatalogSearchText, type CatalogProductView } from "./catalog-view";

export type SearchMatchReason = { field: string; value: string };

/**
 * Why a product is in the results, in the order a customer would expect to
 * be told. A name match needs no explanation, so it returns null. The fields
 * checked are exactly those the catalog view searches — never SKU or barcode.
 */
export function searchMatchReason(
  product: CatalogProductView,
  normalizedQuery: string,
): SearchMatchReason | null {
  if (normalizedQuery.length === 0) return null;
  const hit = (text: string | null | undefined) =>
    Boolean(text) && normalizeCatalogSearchText(text ?? "").includes(normalizedQuery);

  if (hit(product.name)) return null;
  if (product.brand && hit(product.brand.name)) {
    return { field: "Brand", value: product.brand.name };
  }
  for (const category of product.categories) {
    if (hit(category.name)) return { field: "Category", value: category.name };
    if (category.parent && hit(category.parent.name)) {
      return { field: "Category", value: category.parent.name };
    }
  }
  for (const variant of product.variants) {
    for (const option of variant.options) {
      if (hit(option.value.value)) return { field: option.type.name, value: option.value.value };
    }
    if (hit(variant.title_override))
      return { field: "Option", value: variant.title_override ?? "" };
  }
  for (const variant of product.variants) {
    for (const option of variant.options) {
      if (hit(option.type.name)) return { field: "Has", value: `${option.type.name} options` };
    }
  }
  const keyword = [
    ...(product.search_keywords ?? []),
    ...product.variants.flatMap((variant) => variant.search_keywords ?? []),
  ].find((candidate) => hit(candidate));
  return keyword ? { field: "Keyword", value: keyword } : null;
}
