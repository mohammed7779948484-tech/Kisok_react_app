import { z } from "zod";

/**
 * The single source of the per-line quantity cap for the whole model layer:
 * min 1 is the domain rule; within persisted format v1 the 1–99 range is part
 * of the restore contract — changing it requires bumping the envelope version.
 * As a UX guard the server still validates at order time.
 */
export const MAX_LINE_QUANTITY = 99;

/**
 * One cart line — in memory and inside the persisted cart payload.
 *
 * The display snapshot (names, labels, imageUri) lets a line render itself
 * without Catalog: the cart never carries live catalog state — no prices,
 * stock, or availability. `lineId` is the derived line identity (variantId +
 * ordered optionValueIds, computed by the cart rules) persisted per line, so
 * a restored payload is self-describing.
 */
export const cartLineSchema = z.object({
  lineId: z.string().min(1),
  variantId: z.uuid(),
  productId: z.uuid(),
  productDisplayName: z.string().min(1),
  variantLabel: z.string().min(1),
  optionSelections: z.array(
    z.object({
      optionTypeId: z.uuid(),
      optionValueId: z.uuid(),
      optionValueLabel: z.string().min(1),
    }),
  ),
  // null when the variant has no image — AppImage renders its fallback.
  imageUri: z.string().nullable(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});

/**
 * The input a future Catalog "Add to cart" passes: a line minus its derived identity.
 * Zod strip-mode means a payload carrying a lineId parses silently — consumers
 * derive identity via deriveLineId and never trust a supplied one.
 */
export const addToCartInputSchema = cartLineSchema.omit({ lineId: true });

export type CartLine = z.infer<typeof cartLineSchema>;
export type AddToCartInput = z.infer<typeof addToCartInputSchema>;
