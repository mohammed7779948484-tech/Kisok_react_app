import type { CartLine } from "@/features/cart";

/**
 * The server's per-item quantity ceiling: `parsed_quantity <= 0 or
 * parsed_quantity > 2147483647` → K1001
 * (`20260826050007_lean_create_order.sql` lines 81–85). An `integer` column
 * bound, mirrored here so an invalid sum never leaves the device. Shared with
 * checkout-attempt.schema.ts, which re-validates persisted items against the
 * same ceiling on restore — one source, so the pre-write rule and the restore
 * boundary cannot drift apart.
 */
export const MAX_RPC_QUANTITY = 2147483647;

/**
 * The server's entry-count cap: more than 100 items → K1001 (migration lines
 * 46–50). After normalization one item == one distinct variant, so this is
 * the distinct-variant ceiling for a submittable cart.
 */
export const MAX_NORMALIZED_ITEMS = 100;

/**
 * The domain tag leading the server's canonical fingerprint text
 * (migration line 107): `'kiosk.checkout.lean.v1' || E'\n' || …`.
 */
const FINGERPRINT_DOMAIN = "kiosk.checkout.lean.v1";

/** One entry of the `create_order` items array — EXACTLY the two RPC keys. */
export type NormalizedOrderItem = {
  variant_id: string;
  quantity: number;
};

/**
 * The normalized checkout request: the exact `items` payload for
 * `create_order`, plus the client-side fingerprint bound to it.
 */
export type NormalizedRequest = {
  items: NormalizedOrderItem[];
  fingerprint: string;
};

/**
 * ONE canonical fingerprint derivation — the server-canonical form mirrored
 * client-side (migration lines 107–114: `'kiosk.checkout.lean.v1' || E'\n' ||
 * string_agg(variant_id || ':' || quantity, E'\n' order by r.variant_id)`):
 * the leading domain tag, one `variant_id:quantity` row per item, rows joined
 * by `\n`. Derives over the items EXACTLY AS GIVEN — `normalizeCartLines`
 * emits items sorted by `variant_id`, which is the row order the server's own
 * `order by r.variant_id` produces, so the normalizer's output and the
 * derivation agree byte-for-byte.
 *
 * Exported because TWO boundaries need the SAME algorithm: the normalizer
 * stamps it onto a fresh request (D2's idempotency-identity binding), and the
 * persisted attempt record's restore boundary re-derives it from the stored
 * items to reject a tampered fingerprint (F-08). Recomputing the form in a
 * second place would let the two drift — a record the store minted could
 * fail its own restore, or a tampered one could pass it. The derivation does
 * NOT travel to the server: the server computes its own over the items it
 * receives; this text exists so the client can bind a persisted
 * `client_request_id` to the logical request locally — a changed cart
 * produces a different fingerprint and can never silently reuse an existing
 * idempotency identity.
 */
export function deriveRequestFingerprint(items: readonly NormalizedOrderItem[]): string {
  return [FINGERPRINT_DOMAIN, ...items.map((item) => `${item.variant_id}:${item.quantity}`)].join(
    "\n",
  );
}

/**
 * Pure checkout domain rules — no IO — mapping the current Cart lines to the
 * exact `create_order` items payload (AC-05), plus the client-side
 * fingerprint that binds an idempotency identity to the logical request.
 *
 * Source of truth: `supabase/migrations/20260826050007_lean_create_order.sql`
 * — the RPC accepts ONLY an array of at most 100 objects with exactly the two
 * keys `variant_id` (uuid text) and `quantity` (integer 1..2147483647), and
 * REJECTS duplicate `variant_id`s (K1001, lines 46–105).
 *
 * Normalization (plan decision D2 + AC-05): lines are grouped by canonical
 * (lowercased) `variantId` — PostgreSQL compares uuid text case-insensitively
 * and the cart already lowercases uuids for line identity
 * (`features/cart/model/cart-rules.ts` `deriveLineId`) — so lines sharing a
 * variant (different option selections, different hex casing) merge into ONE
 * item whose quantity is the SUM of the line quantities. Items are sorted by
 * `variant_id`, so the same logical cart yields a byte-identical request
 * regardless of input line order or casing.
 *
 * The returned fingerprint is `deriveRequestFingerprint(items)` — the ONE
 * canonical derivation above, shared with the attempt record's restore
 * boundary (F-08).
 *
 * Item order uses plain code-unit comparison of canonical lowercase uuid
 * text — deliberately NOT `localeCompare`: for lowercase hex the code-unit
 * order matches PostgreSQL's uuid byte ordering (dashes sit at identical
 * positions and '0'..'9' sort before 'a'..'f'), so the client's row order
 * matches the server's `order by r.variant_id`. A collation-aware compare
 * could reorder rows and break fingerprint stability.
 *
 * Violations throw a plain `Error` with a specific message; the caller (the
 * attempt store) maps and surfaces them honestly. This is deliberately NOT
 * the cart-rules clamping policy: a cart quantity is recoverable UX state, so
 * it clamps — but these are hard stop conditions for a money-adjacent write,
 * and silently reshaping what the customer confirmed is worse than failing
 * before the network. The per-variant quantity bound is a defensive
 * invariant: each CartLine quantity is bounded 1..99, and while the
 * per-variant LINE count has no cart-level cap (one variant can span many
 * lines via different option selections), reaching 2147483647 would take
 * over 21 million max-quantity lines of a single variant — unreachable
 * through any real cart by ~6 orders of magnitude. This rule still must not
 * assume its caller's schema, because the `CartLine` type widens `quantity`
 * to plain `number`. Uuid well-formedness is likewise owned
 * by the cart boundary (`cart-line.schema.ts` `postgresUuidSchema`) and is
 * not re-validated here.
 */
export function normalizeCartLines(lines: readonly CartLine[]): NormalizedRequest {
  if (lines.length === 0) {
    throw new Error("An empty cart cannot be normalized into a checkout request.");
  }

  // Group by canonical uuid text; the same variant with different option
  // selections or hex casing lands in one bucket and its quantities sum.
  const quantityByVariant = new Map<string, number>();
  for (const line of lines) {
    const variantId = line.variantId.toLowerCase();
    quantityByVariant.set(variantId, (quantityByVariant.get(variantId) ?? 0) + line.quantity);
  }

  if (quantityByVariant.size > MAX_NORMALIZED_ITEMS) {
    throw new Error(
      `A checkout request supports at most ${MAX_NORMALIZED_ITEMS} distinct variants (got ${quantityByVariant.size}).`,
    );
  }

  const items: NormalizedOrderItem[] = Array.from(quantityByVariant.entries())
    .sort(([leftVariantId], [rightVariantId]) =>
      leftVariantId < rightVariantId ? -1 : leftVariantId > rightVariantId ? 1 : 0,
    )
    .map(([variantId, quantity]) => {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_RPC_QUANTITY) {
        throw new Error(
          `The requested quantity for variant ${variantId} must be an integer between 1 and ${MAX_RPC_QUANTITY}.`,
        );
      }
      return { variant_id: variantId, quantity };
    });

  const fingerprint = deriveRequestFingerprint(items);

  return { items, fingerprint };
}
