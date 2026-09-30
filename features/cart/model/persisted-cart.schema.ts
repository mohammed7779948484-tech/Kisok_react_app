import { z } from "zod";

import { cartLineSchema } from "./cart-line.schema";
import { postgresUuidSchema } from "./pg-uuid";

/**
 * The saved cart, validated when restored from the tablet. No RPC returns
 * this shape — the cart is client-owned local state. A payload that does not
 * parse (another build's format, a damaged write) is discarded and the cart
 * starts empty; line identities are re-derived on restore, so they are not
 * trusted from storage.
 */
export const persistedCartSchema = z.object({
  version: z.literal(1),
  ownerId: postgresUuidSchema,
  lines: z.array(cartLineSchema),
});

export type PersistedCart = z.infer<typeof persistedCartSchema>;
