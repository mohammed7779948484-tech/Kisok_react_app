import { z } from "zod";

import { cartLineSchema } from "./cart-line.schema";
import { postgresUuidSchema } from "./pg-uuid";

/**
 * The persisted cart payload, validated when restored from storage.
 *
 * No RPC returns this shape — the cart is client-owned local state. `version`
 * must match exactly, so a payload written by another build fails loudly here
 * instead of silently mismatching; the store then starts clean. `ownerId` is
 * the profile the cart belongs to — a mismatched owner is discarded, never
 * surfaced. Lines must carry unique `lineId`s: a duplicate would restore an
 * ambiguous cart, so the whole payload rejects.
 */
export const persistedCartSchema = z
  .object({
    version: z.literal(1),
    ownerId: postgresUuidSchema,
    lines: z.array(cartLineSchema),
  })
  .refine((cart) => new Set(cart.lines.map((line) => line.lineId)).size === cart.lines.length, {
    message: "persisted cart lines must have unique lineIds",
  });

export type PersistedCart = z.infer<typeof persistedCartSchema>;
