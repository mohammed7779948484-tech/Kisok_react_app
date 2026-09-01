import { z } from "zod";

/**
 * Runtime shape of the `update_order_status` RPC result.
 *
 * Lives in `model/` — the feature's pure domain layer: types, schemas, rules,
 * selectors. Nothing here performs IO, so it is the cheapest code to test.
 *
 * Every KISOK RPC returns `jsonb`, which Supabase types as the wide `Json`
 * union — so validating here is what turns an untyped payload into something
 * the rest of the feature can trust. A backend change then fails loudly at this
 * boundary instead of surfacing as `undefined` deep inside a screen.
 *
 * Field source of truth: the `pg_catalog.jsonb_build_object` projection in
 * supabase/migrations/20260826050008_lean_order_operations.sql. Postgres
 * renders `timestamptz` into jsonb as an ISO-8601 string with a numeric UTC
 * offset (`2026-08-26T05:00:08.123456+00:00`), and SQL NULL arrives as JSON
 * `null` — never `undefined` — so the four nullable fields are exactly-null,
 * not optional.
 */

/** ISO-8601 timestamp as Postgres renders `timestamptz` into `jsonb`. */
const isoTimestamp = z.iso.datetime({ offset: true });

/** Mirrors the `orders.display_number` check constraint (no I/O/0/1 glyphs). */
const displayNumber = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);

/**
 * The trust boundary for the `update_order_status` RPC result: parses the
 * wide `Json` payload into the feature's typed update, rejecting drift at
 * this line instead of deep inside a screen (see the module docblock).
 */
export const orderStatusUpdateSchema = z.object({
  order_id: z.uuid(),
  display_number: displayNumber,
  status: z.enum(["new", "preparing", "ready", "completed", "cancelled"]),
  assigned_preparation_id: z.uuid().nullable(),
  completed_at: isoTimestamp.nullable(),
  cancelled_at: isoTimestamp.nullable(),
  cancellation_reason: z.string().nullable(),
  updated_at: isoTimestamp,
});

/** The validated RPC result — the zod-inferred projection of the schema above. */
export type OrderStatusUpdate = z.infer<typeof orderStatusUpdateSchema>;
