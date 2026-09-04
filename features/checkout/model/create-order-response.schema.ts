import { z } from "zod";

/**
 * PostgreSQL-canonical UUID text — shared across the checkout feature's
 * model layer (the `create_order` wire contract here, and the durable attempt
 * record in checkout-attempt.schema.ts, which imports it).
 *
 * The server's `uuid` type accepts any 8-4-4-4-12 hex string — case
 * insensitive, with no RFC 9562 version or variant nibble rule — and the
 * migrations constrain nothing beyond that. Zod 4's `z.uuid()` enforces the
 * RFC nibbles, so it is stricter than the contract here: a canonical
 * `variant_id` Catalog's own canonical-uuid check already accepted must not
 * fail checkout validation. Same semantics as the cart and catalog features'
 * local uuid schemas — shared WITHIN this feature (one definition for the
 * wire contract and the persisted record, so they cannot diverge),
 * deliberately not hoisted into a cross-feature abstraction (cross-feature
 * imports go through public APIs only).
 */
export const postgresUuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: "Expected canonical PostgreSQL UUID text",
  });

/**
 * Pinned to the server's own constraint, not just non-empty text:
 * `check (display_number ~ '^[A-HJ-NP-Z2-9]{6}$')` on `public.orders`
 * (`20260826050004_lean_inventory_orders_schema.sql`) — exactly six
 * characters from the look-alike-free alphabet (no I/O/0/1). The RPC only
 * ever returns numbers drawn from that generator, so a different shape did
 * not come from this contract; and this value is what the Order Success
 * screen shows a customer reading it aloud across a counter, where an
 * ambiguous 0/O or 1/I matters. A backend format change should fail loudly
 * here. Shared with checkout-attempt.schema.ts's confirmed-record capture,
 * so the wire value and the persisted copy of it stay one contract.
 */
export const displayNumberSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/, {
  message: "Expected a 6-character display number from the kiosk alphabet",
});

/**
 * `orders.created_at` is timestamptz; embedded in the RPC's jsonb it arrives
 * as an ISO-8601 string with an explicit offset (PostgreSQL renders `+00:00`).
 * Any explicit offset form is accepted; a naive local timestamp or a date-only
 * string is not this contract. Shared with checkout-attempt.schema.ts's
 * confirmed-record capture for the same reason as the display number.
 */
export const createdAtSchema = z.iso.datetime({ offset: true });

const stockConflictItemSchema = z.strictObject({
  variant_id: postgresUuidSchema,
  requested_quantity: z.number().int().positive(),
  available_quantity: z.number().int().nonnegative(),
});

/**
 * Runtime contract of the `create_order(client_request_id, items)` RPC result.
 *
 * Source of truth: `supabase/migrations/20260826050007_lean_create_order.sql`
 * (the two `jsonb` return families — `kind: "success"` on both the fresh-create
 * and idempotent-replay paths, lines 133–139 and 357–362; `kind:
 * "stock_conflict"` as a normal 2xx JSON return with no order created, lines
 * 187–206) plus the `display_number` check constraint on `public.orders` in
 * `supabase/migrations/20260826050004_lean_inventory_orders_schema.sql`.
 *
 * The RPC returns `jsonb`, which Supabase types as the wide `Json` union — so
 * runtime validation here (via `callRpc`) is what makes the payload
 * trustworthy: a backend change fails loudly at this boundary instead of
 * surfacing as `undefined` deep inside a screen (AGENTS.md §4). A
 * `stock_conflict` result is a successful call, never an exception, and is
 * routed to the conflict panel, not the error path.
 *
 * Lives in `model/` — the feature's pure domain layer: types, schemas, rules,
 * selectors. Nothing here performs IO, so it is the cheapest code to test.
 */
export const createOrderResponseSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("success"),
    order_id: postgresUuidSchema,
    display_number: displayNumberSchema,
    created_at: createdAtSchema,
  }),
  z.strictObject({
    kind: z.literal("stock_conflict"),
    // jsonb_agg yields null over zero rows and the RPC returns this family
    // only when conflict_items is not null — so conflicts is never empty in
    // a genuine payload.
    conflicts: z.array(stockConflictItemSchema).min(1),
  }),
]);

export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
