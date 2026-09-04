import { z } from "zod";

// The three wire-contract primitives (postgres uuid text, display number,
// created_at) are imported from create-order-response.schema.ts — the round
// gate consolidated the formerly duplicated local definitions, so the
// persisted record and the RPC contract are now mechanically one shape: a
// change to a primitive fails this module's suite too, not just the wire
// schema's own.
import {
  createdAtSchema,
  displayNumberSchema,
  postgresUuidSchema,
} from "./create-order-response.schema";
import { MAX_NORMALIZED_ITEMS, MAX_RPC_QUANTITY } from "./normalized-request";

/**
 * ONE display snapshot of a submitted cart line — checkout-owned, with
 * exactly the CartLine field shapes the Order Success screen renders and the
 * stock-conflict join (plan D9) consumes: productDisplayName, variantLabel,
 * optionSelections (optionTypeId/optionValueId/optionValueLabel), imageUri
 * (null when the variant has no image), quantity, variantId, productId,
 * lineId.
 *
 * Deliberately NOT an import of the cart's `cartLineSchema`: that would be a
 * cross-feature runtime dependency, and this is a PERSISTED record whose
 * restore must not depend on another feature's schema evolution — if the cart
 * later changes its own persisted format, a checkout attempt a customer is
 * mid-recovery on must still validate exactly as the day it was written. The
 * type-level pin in the colocated test keeps the two shapes honest against
 * each other at compile time without coupling them at runtime.
 *
 * `quantity` mirrors the cart's per-line bounds 1..99
 * (`features/cart/model/cart-line.schema.ts` MIN/MAX_LINE_QUANTITY): the
 * snapshot records what the customer actually submitted, and a line outside
 * those bounds never existed in a submittable cart.
 */
const lineSnapshotSchema = z.strictObject({
  lineId: z.string().min(1),
  variantId: postgresUuidSchema,
  productId: postgresUuidSchema,
  productDisplayName: z.string().min(1),
  variantLabel: z.string().min(1),
  optionSelections: z.array(
    z.strictObject({
      optionTypeId: postgresUuidSchema,
      optionValueId: postgresUuidSchema,
      optionValueLabel: z.string().min(1),
    }),
  ),
  // null when the variant has no image — the success screen renders the same
  // fallback the cart does.
  imageUri: z.string().nullable(),
  quantity: z.number().int().min(1).max(99),
});

/**
 * The embedded normalized request items — EXACTLY T02's `NormalizedOrderItem`
 * (the colocated test pins the type-level identity): the two RPC keys, strict,
 * so a persisted item can only ever be a payload `create_order` itself would
 * accept. Source of truth: `20260826050007_lean_create_order.sql` — 1..100
 * entries (lines 46–50, mirrored here via T02's MAX_NORMALIZED_ITEMS so the
 * cap has ONE source), each item exactly `{variant_id, quantity}` with a
 * positive integer quantity up to the RPC's own 2147483647 ceiling (lines
 * 56–85 — `parsed_quantity <= 0 or parsed_quantity > 2147483647` → K1001,
 * lines 81–85), duplicate variant ids rejected (K1001, lines 95–105). The
 * record must replay byte-identical items, so it enforces the same rules —
 * ceiling included, mirrored via T02's exported MAX_RPC_QUANTITY so that
 * bound also has ONE source (the round gate consolidated it). The ceiling
 * makes "a persisted item is always a payload create_order would accept"
 * literally true at the RESTORE boundary too; normalized-request remains the
 * single pre-write enforcement point, this is its re-validation twin.
 */
const attemptItemsSchema = z
  .array(
    z.strictObject({
      variant_id: postgresUuidSchema,
      quantity: z.number().int().positive().max(MAX_RPC_QUANTITY),
    }),
  )
  .min(1)
  .max(MAX_NORMALIZED_ITEMS)
  .refine(
    (items) => new Set(items.map((item) => item.variant_id.toLowerCase())).size === items.length,
    {
      // Duplicates are compared the way PostgreSQL compares uuids — as
      // parsed 16-byte values, hex case irrelevant (the RPC casts each
      // `variant_id` to uuid before its distinct-count, line 72) — so two ids
      // differing only in hex casing are the same variant here, exactly as
      // the server would reject them.
      message: "checkout attempt items must have distinct variant_ids",
    },
  );

/**
 * Items ↔ snapshots parity — this module's own boundary contract ("fail
 * loudly at this boundary … never parse halfway into a lifecycle decision")
 * made mechanical: the SET of lowercased snapshot `variantId`s must EQUAL the
 * set of lowercased item `variant_id`s. Every submitted variant must carry
 * its display snapshot (the success screen and the D9 conflict join render
 * from the snapshots, never the live cart), and no snapshot may name a
 * variant the request never carried. SET equality, not a count or a pairing:
 * multiple snapshots of one variant are the normal persisted shape (one cart
 * line per option selection — T02 merges them into ONE item), so the two
 * arrays legitimately differ in length. A cross-field refine, following the
 * persisted-cart schema's own precedent (its unique-lineId and
 * derived-identity invariants, persisted-cart.schema.ts:31–36).
 */
function snapshotVariantParity(record: {
  items: readonly { variant_id: string }[];
  lineSnapshots: readonly { variantId: string }[];
}): boolean {
  const itemVariants = new Set(record.items.map((item) => item.variant_id.toLowerCase()));
  const snapshotVariants = new Set(
    record.lineSnapshots.map((snapshot) => snapshot.variantId.toLowerCase()),
  );
  if (itemVariants.size !== snapshotVariants.size) {
    return false;
  }
  return Array.from(snapshotVariants).every((variant) => itemVariants.has(variant));
}

/** The refinement message an items↔lineSnapshots parity mismatch fails with. */
const SNAPSHOTS_MISMATCH_MESSAGE =
  "checkout attempt lineSnapshots must cover exactly the items' variants";

/**
 * Fields every attempt record carries regardless of status: the versioned
 * envelope, the owner, the idempotency identity, the exact normalized request,
 * its binding fingerprint, and the display snapshots — never empty, and
 * parity-checked against `items` on every branch below. Spread into BOTH
 * branches of the union — shared field definitions, never a shared schema
 * object, so no branch can accidentally validate the other's exclusive
 * payload.
 */
const attemptRecordFields = {
  // Versioned envelope, the cart's persisted-cart precedent: an exact
  // literal, so a record written by a different build fails loudly on restore
  // instead of half-parsing into a lifecycle decision.
  version: z.literal(1),
  // The profile that minted the attempt — the restore's foreign-owner discard
  // (plan D7) compares this against the current profile.
  ownerId: postgresUuidSchema,
  // The idempotency identity: a uuid minted client-side BEFORE the first
  // submit (AC-06) and re-sent byte-identically on every replay of the same
  // logical request. Never re-minted to "try again" (plan D11).
  clientRequestId: postgresUuidSchema,
  items: attemptItemsSchema,
  // The client fingerprint binding this identity to its logical request
  // (normalized-request, plan D2). Opaque text at this boundary: the binding
  // discipline (compare before reuse, re-mint on change) is the attempt
  // store's job at mint and retry time — recomputing T02's canonical form
  // here would duplicate the algorithm in a second place.
  fingerprint: z.string().min(1),
  // Never empty: an attempt always embeds at least one submitted line
  // (items.min(1) + the per-branch parity refine). A record with zero
  // snapshots would restore an order whose success screen renders nothing.
  lineSnapshots: z.array(lineSnapshotSchema).min(1),
};

/**
 * The durable checkout attempt record — the ONE JSON object the attempt store
 * (T06) writes under `storageKey("checkout", "attempt")` through
 * `@/core/storage`, and re-validates with this schema on every restore
 * (plan D1: one record, single key; only `unresolved` and `confirmed` are
 * durable — definite failures and stock conflicts are discarded immediately).
 * The confirmed record doubles as the Order Success payload and is removed at
 * the Next Customer reset.
 *
 * `status` is a DISCRIMINATED UNION over two object shapes, not one object
 * with optional `success`/`cleanup`: status decides what the record MEANS
 * (needs recovery vs. needs cleanup tracking), and the impossible
 * combinations are made UNREPRESENTABLE rather than merely discouraged.
 * Strict mode turns each violation into a loud parse failure at an exact
 * field — an UNRESOLVED record carrying `success`/`cleanup` (claiming
 * knowledge an ambiguous network result never gave us) rejects on the
 * unknown keys, and a CONFIRMED record missing either payload (D4: the
 * success capture and the cleanup tracker are both mandatory once
 * confirmed) rejects on the missing field. Both branches additionally
 * parity-check `lineSnapshots` against `items` (never empty, variant sets
 * equal), so a corrupt record cannot restore into a silently degraded
 * success or conflict surface.
 *
 * The restore path is `createJsonStorage.read` → `JSON.parse` → this schema,
 * so the input is wide unknown JSON — a corrupt, foreign, or future-versioned
 * record fails loudly at this boundary instead of surfacing as `undefined`
 * deep inside the recovery gate. A version-2 record from a future build
 * rejects on `version`, never half-parses into a lifecycle decision.
 *
 * Lives in `model/` — the feature's pure domain layer: types, schemas, rules,
 * selectors. Nothing here performs IO; the store owns when and where the
 * record is written.
 */
export const checkoutAttemptSchema = z.discriminatedUnion("status", [
  // UNRESOLVED — the recovery payload: what an ambiguous transport result
  // leaves behind (AC-09) and what a restart replays with the same
  // idempotency identity (AC-13). Zod 4 keeps a refined strictObject a valid
  // union option, and a failed base parse short-circuits before the refine,
  // so field-level issues keep their exact paths.
  z
    .strictObject({
      ...attemptRecordFields,
      status: z.literal("unresolved"),
    })
    .refine(snapshotVariantParity, { message: SNAPSHOTS_MISMATCH_MESSAGE }),
  // CONFIRMED — the durable success payload (plan D4: capture → durably
  // confirm → clear). `success` is exactly what create-order-response
  // validated (order_id/display_number/created_at, camelCased into this
  // envelope); `cleanup` tracks the cart clear that may only be attempted
  // AFTER this record is durable.
  z
    .strictObject({
      ...attemptRecordFields,
      status: z.literal("confirmed"),
      success: z.strictObject({
        orderId: postgresUuidSchema,
        displayNumber: displayNumberSchema,
        createdAt: createdAtSchema,
      }),
      cleanup: z.strictObject({
        // D4's cleanup tracker: "pending" (clear not yet durably finished),
        // "done" (cart durably cleared — safe to reset), "failed" (clear
        // rejected: keep the record, surface the warning, block the Next
        // Customer reset — AC-11).
        cartClear: z.enum(["pending", "done", "failed"]),
      }),
    })
    // Same parity invariant as the unresolved branch: the confirmed record
    // IS the Order Success payload (D1), so a snapshot/items mismatch here
    // would silently degrade exactly what the customer is shown (AC-07).
    .refine(snapshotVariantParity, { message: SNAPSHOTS_MISMATCH_MESSAGE }),
]);

export type CheckoutAttempt = z.infer<typeof checkoutAttemptSchema>;
