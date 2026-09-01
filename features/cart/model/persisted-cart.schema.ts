import { z } from "zod";

import { cartLineSchema } from "./cart-line.schema";

/**
 * The persisted cart payload, validated when restored from storage.
 *
 * No RPC returns this shape — the cart is client-owned local state. `version`
 * must match exactly, so a payload written by another build fails loudly here
 * instead of silently mismatching; the store then starts clean. `ownerId` is
 * the profile the cart belongs to — a mismatched owner is discarded, never
 * surfaced.
 */
export const persistedCartSchema = z.object({
  version: z.literal(1),
  ownerId: z.uuid(),
  lines: z.array(cartLineSchema),
});

export type PersistedCart = z.infer<typeof persistedCartSchema>;
