import type { CartLine } from "@/features/cart";

/** The server's per-item quantity ceiling (an `integer` column; K1001 above it). */
export const MAX_RPC_QUANTITY = 2147483647;

/**
 * The server's entry-count cap: more than 100 items → K1001. After
 * normalization one item is one distinct variant.
 */
export const MAX_NORMALIZED_ITEMS = 100;

/** One entry of the `create_order` items array — exactly the two RPC keys. */
export type NormalizedOrderItem = {
  variant_id: string;
  quantity: number;
};

/**
 * Map cart lines to the exact `create_order` items payload
 * (`20260826050007_lean_create_order.sql`): lines sharing a variant (different
 * option selections) merge into one item with the summed quantity — the RPC
 * rejects duplicate `variant_id`s — and items are sorted, so the same cart
 * always yields the same request.
 *
 * Throws when the cart cannot become a valid request (empty, or more distinct
 * variants than the server accepts); the caller explains it to the customer.
 */
export function normalizeCartLines(lines: readonly CartLine[]): NormalizedOrderItem[] {
  if (lines.length === 0) throw new Error("An empty cart cannot be ordered.");

  const quantityByVariant = new Map<string, number>();
  for (const line of lines) {
    const variantId = line.variantId.toLowerCase();
    quantityByVariant.set(variantId, (quantityByVariant.get(variantId) ?? 0) + line.quantity);
  }
  if (quantityByVariant.size > MAX_NORMALIZED_ITEMS) {
    throw new Error(`An order supports at most ${MAX_NORMALIZED_ITEMS} distinct variants.`);
  }

  return Array.from(quantityByVariant.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([variantId, quantity]) => ({
      variant_id: variantId,
      quantity: Math.min(Math.max(1, Math.floor(quantity)), MAX_RPC_QUANTITY),
    }));
}
