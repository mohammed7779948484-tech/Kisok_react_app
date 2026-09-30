import { z } from "zod";

import { cartLineSchema } from "@/features/cart";

import {
  createdAtSchema,
  displayNumberSchema,
  postgresUuidSchema,
} from "./create-order-response.schema";

const orderItemSchema = z.object({
  variant_id: postgresUuidSchema,
  quantity: z.number().int().positive(),
});

/**
 * The one checkout record kept on the tablet, under one key:
 *
 * - `pending`: an order was about to be sent. The SAME request id and items
 *   are replayed until the server gives a definite answer, so a lost
 *   response can never become a second order.
 * - `confirmed`: the server confirmed the order; the success screen shows it
 *   until the customer finishes.
 *
 * `lineSnapshots` are the cart lines as submitted, for display only.
 */
export const savedCheckoutSchema = z.discriminatedUnion("state", [
  z.object({
    version: z.literal(1),
    state: z.literal("pending"),
    ownerId: postgresUuidSchema,
    requestId: postgresUuidSchema,
    items: z.array(orderItemSchema).min(1),
    lineSnapshots: z.array(cartLineSchema),
  }),
  z.object({
    version: z.literal(1),
    state: z.literal("confirmed"),
    ownerId: postgresUuidSchema,
    success: z.object({
      orderId: postgresUuidSchema,
      displayNumber: displayNumberSchema,
      createdAt: createdAtSchema,
    }),
    lineSnapshots: z.array(cartLineSchema),
  }),
]);

export type SavedCheckout = z.infer<typeof savedCheckoutSchema>;
export type PendingOrder = Extract<SavedCheckout, { state: "pending" }>;
export type ConfirmedOrder = Extract<SavedCheckout, { state: "confirmed" }>;
