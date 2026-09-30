/**
 * The one way into Product Detail. `backLabel` names where the customer came
 * from ("Back to Vape Products"); going back is still a real stack pop, so
 * the previous page keeps its scroll position and filters.
 */
export function productDetailHref(productId: string, backLabel?: string) {
  return {
    pathname: "/product-detail" as const,
    params: backLabel ? { productId, backLabel } : { productId },
  };
}
