import { z } from "zod";

import { cartLineSchema } from "./cart-line.schema";
import { deriveLineId } from "./cart-rules";
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
 *
 * Semantic identity invariant (H-F01, hardening decision 2): each line's
 * stored `lineId` must BE the identity `deriveLineId` derives from the line's
 * own fields. A shape-valid payload carrying a wrong (non-empty, unique)
 * lineId would restore a line the next `addLine` for the same selection can
 * never merge with — the store would append a duplicate line for one
 * selection. The refine reuses the ONE domain helper (no second identity
 * algorithm here to drift), so schema and rules can never disagree.
 */
export const persistedCartSchema = z
  .object({
    version: z.literal(1),
    ownerId: postgresUuidSchema,
    lines: z.array(cartLineSchema),
  })
  .refine((cart) => new Set(cart.lines.map((line) => line.lineId)).size === cart.lines.length, {
    message: "persisted cart lines must have unique lineIds",
  })
  .refine((cart) => cart.lines.every((line) => line.lineId === deriveLineId(line)), {
    message: "persisted cart lineId does not match its derived identity",
  });

export type PersistedCart = z.infer<typeof persistedCartSchema>;
