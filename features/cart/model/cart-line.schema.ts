import { z } from "zod";

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
  // min 1 is the domain rule; 99 is a UX guard, not a domain invariant.
  quantity: z.number().int().min(1).max(99),
});

/** The input a future Catalog "Add to cart" passes: a line minus its derived identity. */
export const addToCartInputSchema = cartLineSchema.omit({ lineId: true });

export type CartLine = z.infer<typeof cartLineSchema>;
export type AddToCartInput = z.infer<typeof addToCartInputSchema>;
