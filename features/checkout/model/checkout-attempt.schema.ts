import type { AppErrorKind } from "@/core/errors";
import { z } from "zod";

// The three wire-contract primitives (postgres uuid text, display number,
// created_at) are imported from create-order-response.schema.ts — the round
// gate consolidated the formerly duplicated local definitions, so the
// persisted record and the RPC contract are now mechanically one shape: a
// change to a primitive fails this module's suite too, not just the wire
// schema's own. The stock-conflict ITEM shape is imported for the same
// reason: the TERMINAL record's embedded conflict entries are the wire
// contract's own rows (R5 design).
import {
  createdAtSchema,
  displayNumberSchema,
  postgresUuidSchema,
  stockConflictItemSchema,
} from "./create-order-response.schema";
import {
  MAX_NORMALIZED_ITEMS,
  MAX_RPC_QUANTITY,
  deriveRequestFingerprint,
  type NormalizedOrderItem,
} from "./normalized-request";

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
 * its display snapshot (the success screen renders from the snapshots; the
 * D9 conflict join uses the LIVE locked cart lines — reconciled at Round 3
 * review R3-04: the record is discarded at the definite conflict resolve,
 * so no capture exists at render time; the lock guarantees the lines are
 * the submission context), and no snapshot may name a
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

/** The refinement message a non-canonical stored fingerprint fails with (F-08). */
const FINGERPRINT_NOT_CANONICAL_MESSAGE =
  "checkout attempt fingerprint must equal the canonical fingerprint of its items";

/** The refinement message a per-variant snapshot quantity aggregate mismatch fails with (F-08). */
const SNAPSHOTS_QUANTITY_MESSAGE =
  "checkout attempt lineSnapshots quantities must aggregate to the items' quantities per variant";

/**
 * F-08 / RT02-3: the items themselves must be in MINT form — lowercase hex,
 * sorted by code-unit order of the lowercase uuid text — exactly what
 * `normalizeCartLines` emits. Consistency alone (a fingerprint recomputed
 * over the stored rows) would accept reordered or uppercase-hex items no
 * minting path produces; canonicality closes that.
 */
const ITEMS_NOT_CANONICAL_MESSAGE =
  "checkout attempt items must be lowercase and sorted by variant_id (mint form)";

function itemsAreCanonical(items: readonly NormalizedOrderItem[]): boolean {
  return (
    items.every((item) => item.variant_id === item.variant_id.toLowerCase()) &&
    items.every(
      (item, index) =>
        index === 0 || items[index - 1].variant_id.toLowerCase() < item.variant_id.toLowerCase(),
    )
  );
}

/**
 * F-08 / RT02-2: a TERMINAL stock-conflict record's conflict entries are
 * computed by the RPC over the REQUEST rows it received (migration lines
 * 199–204), so every conflict variant is one of the submitted variants. A
 * conflict naming a variant the request never carried is a record no write
 * path can produce.
 */
const CONFLICTS_NOT_IN_ITEMS_MESSAGE =
  "checkout attempt terminal conflicts must name the items' variants";

function conflictsBelongToItems(record: {
  items: readonly { variant_id: string }[];
  outcome: { kind: string; conflicts?: readonly { variant_id: string }[] };
}): boolean {
  if (record.outcome.kind !== "stock-conflict") return true;
  const requested = new Set(record.items.map((item) => item.variant_id.toLowerCase()));
  return (record.outcome.conflicts ?? []).every((entry) =>
    requested.has(entry.variant_id.toLowerCase()),
  );
}

/**
 * F-08: the stored fingerprint must equal the canonical fingerprint of the
 * stored items — `deriveRequestFingerprint`, the ONE derivation the normalizer
 * stamps at mint time (normalized-request, D2). A structurally-valid record
 * whose binding no minting path could have produced (tampered, or minted for
 * a different logical request) is corrupt and must not restore: the
 * fingerprint is what binds a persisted idempotency identity to its logical
 * request, and restoring a drifted binding would replay one request under
 * another's identity.
 */
function fingerprintIsCanonical(record: {
  items: readonly NormalizedOrderItem[];
  fingerprint: string;
}): boolean {
  return record.fingerprint === deriveRequestFingerprint(record.items);
}

/**
 * F-08: per-variant snapshot quantity aggregates must equal the item
 * quantities. A genuine record cannot disagree: `normalizeCartLines` derives
 * each item's quantity as the SUM of that variant's line quantities, and the
 * snapshots persist exactly those lines — so `sum(lineSnapshots quantities
 * grouped by variant) == the item quantity` holds by construction on every
 * record the store writes. Variant ids are matched lowercased, the way
 * PostgreSQL compares uuids (the set-parity precedent above). Set parity
 * alone would accept a record whose quantities disagree — this refine is
 * what makes the quantities honest.
 */
function snapshotQuantityParity(record: {
  items: readonly { variant_id: string; quantity: number }[];
  lineSnapshots: readonly { variantId: string; quantity: number }[];
}): boolean {
  const aggregated = new Map<string, number>();
  for (const snapshot of record.lineSnapshots) {
    const key = snapshot.variantId.toLowerCase();
    aggregated.set(key, (aggregated.get(key) ?? 0) + snapshot.quantity);
  }
  return record.items.every(
    (item) => aggregated.get(item.variant_id.toLowerCase()) === item.quantity,
  );
}

/**
 * Fields every attempt record carries regardless of status: the versioned
 * envelope, the owner, the idempotency identity, the exact normalized request,
 * its binding fingerprint, and the display snapshots — never empty, and
 * parity-checked against `items` on every branch below (variant-SET parity,
 * canonical fingerprint, and per-variant quantity aggregate — the F-08
 * semantic invariants, properties of the record rather than of any lifecycle
 * state). Spread into EVERY branch of the union — shared field definitions,
 * never a shared schema object, so no branch can accidentally validate the
 * other's exclusive payload.
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
  // (normalized-request, plan D2). Not opaque at this boundary (F-08): the
  // per-branch refine below re-derives the canonical fingerprint from the
  // stored items — through `deriveRequestFingerprint`, the ONE derivation the
  // normalizer itself uses — so a structurally-valid but semantically-corrupt
  // record (a tampered or drifted binding) fails loudly instead of restoring.
  fingerprint: z.string().min(1),
  // Never empty: an attempt always embeds at least one submitted line
  // (items.min(1) + the per-branch parity refine). A record with zero
  // snapshots would restore an order whose success screen renders nothing.
  lineSnapshots: z.array(lineSnapshotSchema).min(1),
};

/**
 * The TERMINAL record's embedded failure kind — the DEFINITE subset of
 * AppErrorKind, defined locally with the compile-time tie the repository
 * already uses (core/supabase/rpc.ts MOBILE_RPC_NAMES precedent: `as const
 * satisfies …`). A TYPE-ONLY import from `@/core/errors` keeps this a mirror
 * with zero runtime coupling: the list fails to compile if one of its strings
 * stops being an AppErrorKind (a rename in core surfaces here at compile
 * time, never as a runtime restore failure), while core stays free to add
 * kinds — the terminal record simply keeps accepting the ones it was written
 * with.
 *
 * `"network"` and `"unknown"` are DELIBERATELY ABSENT: they are the AMBIGUOUS
 * kinds — `classifySubmitOutcome` routes them to the unknown outcome, never a
 * definite failure — so a record claiming `status: "terminal"` (a durable
 * DEFINITE no-order verdict) with an ambiguous failure kind is an oxymoron no
 * write path can produce, and the restore boundary rejects it (RT02-1).
 */
const failureKindSchema = z.enum([
  "auth",
  "forbidden",
  "validation",
  "unavailable",
  "idempotency-conflict",
  "state-conflict",
  "server",
] as const satisfies readonly [AppErrorKind, ...AppErrorKind[]]);

/**
 * The durable checkout attempt record — the ONE JSON object the attempt store
 * (T06) writes under `storageKey("checkout", "attempt")` through
 * `@/core/storage`, and re-validates with this schema on every restore
 * (plan D1: one record, single key). FOUR statuses are durable (the R5
 * remediation design): `unresolved` and `confirmed` as originally planned
 * (definite failures and stock conflicts are discarded immediately when their
 * discard succeeds), plus `held` and `terminal` for the two cases where the
 * discard path itself must leave durable evidence. The confirmed record
 * doubles as the Order Success payload and is removed at the Next Customer
 * reset.
 *
 * `status` is a DISCRIMINATED UNION over four object shapes, not one object
 * with optional `success`/`cleanup`/`hold`/`outcome`: status decides what the
 * record MEANS (needs recovery vs. needs cleanup tracking vs. must block
 * minting vs. is a durable definite outcome), and the impossible combinations
 * are made UNREPRESENTABLE rather than merely discouraged. Strict mode turns
 * each violation into a loud parse failure at an exact field — an UNRESOLVED
 * record carrying `success`/`cleanup` (claiming knowledge an ambiguous
 * network result never gave us) rejects on the unknown keys, and a CONFIRMED
 * record missing either payload (D4: the success capture and the cleanup
 * tracker are both mandatory once confirmed) rejects on the missing field.
 *
 * EVERY branch additionally enforces the same three SEMANTIC invariants
 * (F-08) — they are properties of the record, not of a lifecycle state:
 * variant-SET parity between `lineSnapshots` and `items` (never empty,
 * variant sets equal), a CANONICAL fingerprint (`fingerprint` must equal
 * `deriveRequestFingerprint(items)`), and per-variant QUANTITY aggregate
 * (the snapshots' summed quantities must equal each item's quantity). A
 * structurally-valid but semantically-corrupt record therefore cannot
 * restore into a silently degraded success or conflict surface, whatever
 * its status.
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
  // union option, and a failed base parse short-circuits before the refines,
  // so field-level issues keep their exact paths.
  z
    .strictObject({
      ...attemptRecordFields,
      status: z.literal("unresolved"),
    })
    .refine(snapshotVariantParity, { message: SNAPSHOTS_MISMATCH_MESSAGE })
    .refine(fingerprintIsCanonical, { message: FINGERPRINT_NOT_CANONICAL_MESSAGE })
    .refine(snapshotQuantityParity, { message: SNAPSHOTS_QUANTITY_MESSAGE })
    .refine((record) => itemsAreCanonical(record.items), {
      message: ITEMS_NOT_CANONICAL_MESSAGE,
    }),
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
    // Same invariants as the unresolved branch: the confirmed record
    // IS the Order Success payload (D1), so a snapshot/items or fingerprint
    // mismatch here would silently degrade exactly what the customer is
    // shown (AC-07).
    .refine(snapshotVariantParity, { message: SNAPSHOTS_MISMATCH_MESSAGE })
    .refine(fingerprintIsCanonical, { message: FINGERPRINT_NOT_CANONICAL_MESSAGE })
    .refine(snapshotQuantityParity, { message: SNAPSHOTS_QUANTITY_MESSAGE })
    .refine((record) => itemsAreCanonical(record.items), {
      message: ITEMS_NOT_CANONICAL_MESSAGE,
    }),
  // HELD — the K1003 fail-closed hold (R5 design): the server answered that
  // an order ALREADY EXISTS for this client_request_id under a different
  // actor or fingerprint. The record is evidence + a hold: it must survive
  // restart, must not auto-replay, must block fresh minting. `hold.reason`
  // is a closed enum — "k1003" is the only hold cause the design defines, so
  // any other reason text is a record this build never wrote.
  z
    .strictObject({
      ...attemptRecordFields,
      status: z.literal("held"),
      hold: z.strictObject({
        reason: z.enum(["k1003"]),
      }),
    })
    // Same invariants as every branch (F-08): the hold's evidence —
    // the exact request and its binding — must itself be intact.
    .refine(snapshotVariantParity, { message: SNAPSHOTS_MISMATCH_MESSAGE })
    .refine(fingerprintIsCanonical, { message: FINGERPRINT_NOT_CANONICAL_MESSAGE })
    .refine(snapshotQuantityParity, { message: SNAPSHOTS_QUANTITY_MESSAGE })
    .refine((record) => itemsAreCanonical(record.items), {
      message: ITEMS_NOT_CANONICAL_MESSAGE,
    }),
  // TERMINAL — the durable definite no-order outcome (R5 design, F-06):
  // persisted when the attempt record's discard FAILED, so a restart
  // restores the definite outcome instead of auto-replaying an unresolved
  // record. The embedded payload is plain data: the store's AttemptFailure
  // shape for failures (`kind` mirrors AppErrorKind via failureKindSchema,
  // `userMessage`, `retryable`), and the wire conflict entries for conflicts
  // (stockConflictItemSchema — create-order-response's own row shape).
  z
    .strictObject({
      ...attemptRecordFields,
      status: z.literal("terminal"),
      outcome: z.discriminatedUnion("kind", [
        z.strictObject({
          kind: z.literal("stock-conflict"),
          // min(1) mirrors the wire contract's own rule (create-order-
          // response: jsonb_agg yields null over zero rows, so a genuine
          // conflicts array is never empty).
          conflicts: z.array(stockConflictItemSchema).min(1),
        }),
        z.strictObject({
          kind: z.literal("definite-failure"),
          failure: z.strictObject({
            kind: failureKindSchema,
            userMessage: z.string().min(1),
            retryable: z.boolean(),
          }),
        }),
      ]),
    })
    // Same invariants as every branch (F-08): the durable outcome's
    // record must carry the intact request it is the verdict on — and its
    // conflict entries must name that request's own variants (RT02-2).
    .refine(snapshotVariantParity, { message: SNAPSHOTS_MISMATCH_MESSAGE })
    .refine(fingerprintIsCanonical, { message: FINGERPRINT_NOT_CANONICAL_MESSAGE })
    .refine(snapshotQuantityParity, { message: SNAPSHOTS_QUANTITY_MESSAGE })
    .refine((record) => itemsAreCanonical(record.items), {
      message: ITEMS_NOT_CANONICAL_MESSAGE,
    })
    .refine(conflictsBelongToItems, { message: CONFLICTS_NOT_IN_ITEMS_MESSAGE }),
]);

export type CheckoutAttempt = z.infer<typeof checkoutAttemptSchema>;
