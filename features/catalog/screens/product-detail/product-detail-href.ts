/**
 * The one way into Product Detail. `backLabel` names where the customer came
 * from ("Back to Vape Products"); going back is still a real stack pop, so
 * the previous page keeps its scroll position and filters. `match` carries
 * Help Me Choose's committed answers (`serializeMatch`), so Product Detail can
 * list the matching choices first — it never selects one.
 */
export function productDetailHref(productId: string, backLabel?: string, match?: string | null) {
  return {
    pathname: "/product-detail" as const,
    params: {
      productId,
      ...(backLabel ? { backLabel } : {}),
      ...(match ? { match } : {}),
    },
  };
}
