import type { CartLine } from "@/features/cart";

import { checkoutAttemptSchema } from "./checkout-attempt.schema";
import type { NormalizedOrderItem } from "./normalized-request";

/**
 * Colocated contract tests for the durable checkout attempt record — the ONE
 * JSON object the attempt store (T06) persists under
 * `storageKey("checkout", "attempt")` and re-validates on every restore.
 *
 * Every case traces to the record contract in the feature's plan.md (design
 * decisions D1/D4) plus each field's own source: `items` mirrors the RPC rules
 * of `supabase/migrations/20260826050007_lean_create_order.sql` (1..100
 * entries lines 46–50, exactly the two keys and a positive integer quantity
 * bounded 1..2147483647 lines 56–85/81–85, duplicate variant ids rejected
 * lines 95–105), `displayNumber`
 * and `createdAt` are pinned exactly as in create-order-response.schema.ts
 * (the `display_number` check on `public.orders`, and timestamptz rendered
 * with an explicit offset), and the line snapshots mirror the cart's
 * `cartLineSchema` field shapes (per-line quantity 1..99). The parity cases
 * pin that the snapshot variant SET always equals the items' variant set,
 * never empty, so a restore can never degrade the success screen or the
 * conflict join. Fixtures reuse the checkout feature's cappuccino/water pair
 * so the record stays realistic against the same data T02's normalization
 * tests use.
 *
 * Schema tests are the cheapest guard against a contract change — here the
 * contract is client-owned, so what they guard is the RESTORE boundary: a
 * corrupt, foreign, or future-versioned payload must fail loudly on the exact
 * field that mismatches, never parse halfway into a lifecycle decision.
 */

const OWNER_ID = "d94a2f7b-1c3e-4b5a-9f8d-6e2c7b1a4d3e";
const CLIENT_REQUEST_ID = "0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f";
const ORDER_ID = "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const DISPLAY_NUMBER = "K7QM2W";
// PostgreSQL renders a timestamptz inside jsonb with a +00:00 offset.
const CREATED_AT = "2026-08-26T05:00:07.123456+00:00";

const CAPPUCCINO_VARIANT_ID = "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f";
const WATER_VARIANT_ID = "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d";
// A third variant, and the size option's Regular value — the parity and
// multi-snapshot fixtures (same ids as normalized-request.test.ts, so the
// model tests stay continuous with each other).
const TEA_VARIANT_ID = "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a";
const REGULAR_OPTION_VALUE_ID = "77b1e2c4-9d3a-4e5f-b0a1-2c3d4e5f6a7b";

/** The display snapshot of the cappuccino line — a variant with two options. */
const cappuccinoSnapshot = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  variantId: CAPPUCCINO_VARIANT_ID,
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Large · Oat Milk",
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
      optionValueLabel: "Large",
    },
    {
      optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
      optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      optionValueLabel: "Oat Milk",
    },
  ],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

/** The display snapshot of a plain variant — no options, no image. */
const waterSnapshot = {
  lineId: WATER_VARIANT_ID,
  variantId: WATER_VARIANT_ID,
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

/** A snapshot of a THIRD variant — the parity fixtures' foreign snapshot. */
const teaSnapshot = {
  lineId: TEA_VARIANT_ID,
  variantId: TEA_VARIANT_ID,
  productId: "7a8b9c0d-1e2f-4a3b-8c7d-9e0f1a2b3c4d",
  productDisplayName: "Iced Tea",
  variantLabel: "500 ml Can",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

/** Typed as T02's item type — the fixture cannot drift from what T02 emits. */
const CAPPUCCINO_ITEM: NormalizedOrderItem = { variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2 };
const WATER_ITEM: NormalizedOrderItem = { variant_id: WATER_VARIANT_ID, quantity: 1 };

/**
 * The exact fingerprint T02's `normalizeCartLines` produces for the
 * cappuccino(2) + water(1) cart: the domain tag, then `variant_id:quantity`
 * rows sorted by variant_id, joined with newlines.
 */
const FINGERPRINT = [
  "kiosk.checkout.lean.v1",
  `${CAPPUCCINO_VARIANT_ID}:2`,
  `${WATER_VARIANT_ID}:1`,
].join("\n");

const validUnresolvedRecord = {
  version: 1,
  ownerId: OWNER_ID,
  clientRequestId: CLIENT_REQUEST_ID,
  items: [CAPPUCCINO_ITEM, WATER_ITEM],
  fingerprint: FINGERPRINT,
  lineSnapshots: [cappuccinoSnapshot, waterSnapshot],
  status: "unresolved",
};

const validSuccessPayload = {
  orderId: ORDER_ID,
  displayNumber: DISPLAY_NUMBER,
  createdAt: CREATED_AT,
};

const validConfirmedRecord = {
  ...validUnresolvedRecord,
  status: "confirmed",
  success: validSuccessPayload,
  cleanup: { cartClear: "pending" },
};

function withoutField(payload: Record<string, unknown>, field: string): Record<string, unknown> {
  const copy = { ...payload };
  delete copy[field];
  return copy;
}

function expectRejectedAt(payload: unknown, path: string): void {
  const result = checkoutAttemptSchema.safeParse(payload);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
}

/**
 * The refinement message the schema emits for an items↔lineSnapshots parity
 * mismatch — the persisted-cart test's refinement-message precedent: the
 * issue lands at the record root with exactly this message.
 */
const SNAPSHOTS_MISMATCH_MESSAGE =
  "checkout attempt lineSnapshots must cover exactly the items' variants";

function expectRefinementMessage(payload: unknown): void {
  const result = checkoutAttemptSchema.safeParse(payload);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(
    result.error.issues.some(
      (issue) => issue.path.length === 0 && issue.message === SNAPSHOTS_MISMATCH_MESSAGE,
    ),
  ).toBe(true);
}

/**
 * Deterministic, distinct, canonical 8-4-4-4-12 uuids for the >100-item
 * fixture (same construction as normalized-request.test.ts): the zero-padded
 * hex index occupies the first two groups, the rest is fixed.
 */
function distinctVariantId(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-000000000000`;
}

describe("checkout-attempt record schema", () => {
  it("accepts a well-formed unresolved record and preserves its fields", () => {
    const result = checkoutAttemptSchema.safeParse(validUnresolvedRecord);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    // Type-level pins (precedent: catalog-cart-integration's mapping test):
    // `pnpm typecheck` fails these declarations if the record's embedded
    // shapes drift from T02's NormalizedOrderItem or the cart's public
    // CartLine. Jest strips types, so the runtime equality keeps the suite
    // honest.
    const items: readonly NormalizedOrderItem[] = result.data.items;
    const snapshots: readonly CartLine[] = result.data.lineSnapshots;

    expect(result.data).toEqual(validUnresolvedRecord);
    expect(items).toEqual(validUnresolvedRecord.items);
    expect(snapshots).toEqual(validUnresolvedRecord.lineSnapshots);
    expect(result.data.status).toBe("unresolved");
  });

  it("accepts a well-formed confirmed record with success and cleanup, and preserves them", () => {
    const result = checkoutAttemptSchema.safeParse(validConfirmedRecord);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data).toEqual(validConfirmedRecord);
  });

  it("rejects a record missing clientRequestId (the idempotency identity is mandatory)", () => {
    // AC-06's durable core: an attempt without its idempotency identity can
    // neither be replayed safely nor recovered, so it must never restore.
    expectRejectedAt(withoutField(validUnresolvedRecord, "clientRequestId"), "clientRequestId");
  });

  it.each([
    ["success missing", withoutField(validConfirmedRecord, "success"), "success"],
    ["success explicitly null", { ...validConfirmedRecord, success: null }, "success"],
    ["cleanup missing", withoutField(validConfirmedRecord, "cleanup"), "cleanup"],
    ["cleanup explicitly null", { ...validConfirmedRecord, cleanup: null }, "cleanup"],
  ])(
    "rejects a confirmed record with %s (D4: both payloads are mandatory)",
    (_case, payload, path) => {
      expectRejectedAt(payload, path);
    },
  );

  it("rejects an unresolved record carrying success/cleanup — the combination is unrepresentable", () => {
    // An unresolved attempt is exactly "we do not know the server's answer":
    // claiming a success payload (or a cleanup tracker) alongside it is a
    // corrupt record, and strict mode rejects the unknown keys at the root.
    expectRejectedAt(
      { ...validUnresolvedRecord, success: validSuccessPayload, cleanup: { cartClear: "pending" } },
      "",
    );
  });

  it.each([
    ["a wrong version", { ...validUnresolvedRecord, version: 2 }],
    ["a string version", { ...validUnresolvedRecord, version: "1" }],
    ["no version at all", withoutField(validUnresolvedRecord, "version")],
  ])("rejects a record with %s (versioned envelope must match exactly)", (_case, payload) => {
    expectRejectedAt(payload, "version");
  });

  it.each([
    ["ownerId", { ...validUnresolvedRecord, ownerId: "customer-7" }],
    ["clientRequestId", { ...validUnresolvedRecord, clientRequestId: "not-a-uuid" }],
    [
      "success.orderId",
      { ...validConfirmedRecord, success: { ...validSuccessPayload, orderId: 42 } },
    ],
  ])("rejects a record whose %s is not a canonical uuid", (field, payload) => {
    expectRejectedAt(payload, field);
  });

  it("rejects an item whose variant_id is not a canonical uuid", () => {
    expectRejectedAt(
      { ...validUnresolvedRecord, items: [{ variant_id: "not-a-uuid", quantity: 1 }] },
      "items.0.variant_id",
    );
  });

  it.each(["variantId", "productId"])(
    "rejects a line snapshot whose %s is not a canonical uuid",
    (field) => {
      expectRejectedAt(
        {
          ...validUnresolvedRecord,
          lineSnapshots: [{ ...cappuccinoSnapshot, [field]: "not-a-uuid" }],
        },
        `lineSnapshots.0.${field}`,
      );
    },
  );

  it("rejects an option selection whose optionValueId is not a canonical uuid", () => {
    expectRejectedAt(
      {
        ...validUnresolvedRecord,
        lineSnapshots: [
          {
            ...cappuccinoSnapshot,
            optionSelections: [
              { ...cappuccinoSnapshot.optionSelections[0]!, optionValueId: "not-a-uuid" },
            ],
          },
        ],
      },
      "lineSnapshots.0.optionSelections.0.optionValueId",
    );
  });

  it("accepts canonical non-RFC uuids (PostgreSQL uuid text has no version/variant nibble rule)", () => {
    // Same guard as the persisted cart's ownerId: the regex must accept ANY
    // canonical 8-4-4-4-12 hex, because the server's uuid type does — a
    // server-issued ownerId or orderId must not be treated as corrupt.
    const result = checkoutAttemptSchema.safeParse({
      ...validUnresolvedRecord,
      ownerId: "d94a2f7b-1c3e-9b5a-0f8d-6e2c7b1a4d3e", // version nibble 9, variant nibble 0
      clientRequestId: "00000000-0000-0000-0000-000000000001",
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["an empty fingerprint", { ...validUnresolvedRecord, fingerprint: "" }],
    ["a non-string fingerprint", { ...validUnresolvedRecord, fingerprint: 42 }],
    ["no fingerprint at all", withoutField(validUnresolvedRecord, "fingerprint")],
  ])("rejects a record with %s", (_case, payload) => {
    expectRejectedAt(payload, "fingerprint");
  });

  it("rejects a record with an empty items array", () => {
    // The RPC rejects zero-entry items (migration lines 46–50): an attempt
    // always embeds at least one variant.
    expectRejectedAt({ ...validUnresolvedRecord, items: [] }, "items");
  });

  it("rejects a record with more than 100 items", () => {
    // MAX_NORMALIZED_ITEMS (T02) is the same distinct-variant ceiling the RPC
    // enforces; a persisted record must not exceed what a replay could send.
    const items = Array.from({ length: 101 }, (_, index) => ({
      variant_id: distinctVariantId(index),
      quantity: 1,
    }));

    expectRejectedAt({ ...validUnresolvedRecord, items }, "items");
  });

  it.each([
    [
      "exactly the same variant_id twice",
      [
        { variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2 },
        { variant_id: CAPPUCCINO_VARIANT_ID, quantity: 1 },
      ],
    ],
    [
      "the same variant_id in different hex casing",
      [
        { variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2 },
        { variant_id: CAPPUCCINO_VARIANT_ID.toUpperCase(), quantity: 1 },
      ],
    ],
  ])("rejects duplicate items: %s (K1001 mirrors the RPC)", (_case, items) => {
    // PostgreSQL compares uuids as parsed 16-byte values — hex case is
    // irrelevant server-side — so both spellings are the same variant here.
    expectRejectedAt({ ...validUnresolvedRecord, items }, "items");
  });

  it.each([
    ["zero", 0],
    ["negative", -2],
    ["a float", 1.5],
    ["a string", "2"],
  ])("rejects an item whose quantity is %s", (_case, quantity) => {
    expectRejectedAt(
      { ...validUnresolvedRecord, items: [{ variant_id: CAPPUCCINO_VARIANT_ID, quantity }] },
      "items.0.quantity",
    );
  });

  it("accepts an item quantity at the RPC's own 2147483647 ceiling", () => {
    // T02's sum bound is inclusive of 2147483647 (MAX_RPC_QUANTITY), so a
    // ceiling quantity is a legitimately normalizable request the record
    // must keep replayable — the bound accepts exactly what it rejects above.
    expect(
      checkoutAttemptSchema.safeParse({
        ...validUnresolvedRecord,
        items: [{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2147483647 }, WATER_ITEM],
      }).success,
    ).toBe(true);
  });

  it("rejects an item quantity above the RPC's 2147483647 ceiling", () => {
    // The RPC's own `parsed_quantity > 2147483647` check (migration lines
    // 81–85 → K1001), restated at this boundary so a persisted item is
    // always a payload `create_order` would accept on replay.
    expectRejectedAt(
      {
        ...validUnresolvedRecord,
        items: [{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2147483648 }, WATER_ITEM],
      },
      "items.0.quantity",
    );
  });

  it("rejects an item missing variant_id", () => {
    expectRejectedAt({ ...validUnresolvedRecord, items: [{ quantity: 1 }] }, "items.0.variant_id");
  });

  it("rejects an item carrying a third key", () => {
    // The RPC accepts ONLY {variant_id, quantity} (exactly two keys,
    // migration lines 59–62): the record embeds the normalized payload, so
    // it must not accept anything a replay could not send.
    expectRejectedAt(
      { ...validUnresolvedRecord, items: [{ ...CAPPUCCINO_ITEM, note: "extra" }] },
      "items.0",
    );
  });

  it.each([
    "lineId",
    "variantId",
    "productId",
    "productDisplayName",
    "variantLabel",
    "optionSelections",
    "imageUri",
    "quantity",
  ])("rejects a line snapshot missing %s", (field) => {
    expectRejectedAt(
      { ...validUnresolvedRecord, lineSnapshots: [withoutField(cappuccinoSnapshot, field)] },
      `lineSnapshots.0.${field}`,
    );
  });

  it("accepts a line snapshot whose imageUri is null (variant has no image)", () => {
    expect(
      checkoutAttemptSchema.safeParse({
        ...validUnresolvedRecord,
        lineSnapshots: [{ ...cappuccinoSnapshot, imageUri: null }, waterSnapshot],
      }).success,
    ).toBe(true);
  });

  it("accepts a line snapshot with an empty optionSelections array (plain variant)", () => {
    // The water line in the base fixture is already this case; asserted
    // explicitly because a variant with no options is a real payload. The
    // cappuccino snapshot keeps its place so the parity invariant stays
    // satisfied — this case is about optionSelections, not coverage.
    expect(
      checkoutAttemptSchema.safeParse({
        ...validUnresolvedRecord,
        lineSnapshots: [{ ...cappuccinoSnapshot, optionSelections: [] }, waterSnapshot],
      }).success,
    ).toBe(true);
  });

  it("accepts a line snapshot quantity at the cart's 1..99 bounds", () => {
    expect(
      checkoutAttemptSchema.safeParse({
        ...validUnresolvedRecord,
        lineSnapshots: [{ ...cappuccinoSnapshot, quantity: 99 }, waterSnapshot],
      }).success,
    ).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["above the cart cap", 100],
    ["a float", 1.5],
    ["a string", "2"],
  ])("rejects a line snapshot whose quantity is %s", (_case, quantity) => {
    // Snapshot quantities mirror the cart's per-line bounds — a submitted
    // line outside 1..99 never existed in a submittable cart.
    expectRejectedAt(
      { ...validUnresolvedRecord, lineSnapshots: [{ ...cappuccinoSnapshot, quantity }] },
      "lineSnapshots.0.quantity",
    );
  });

  it("rejects a line snapshot carrying an unknown field", () => {
    expectRejectedAt(
      { ...validUnresolvedRecord, lineSnapshots: [{ ...cappuccinoSnapshot, unitPrice: 450 }] },
      "lineSnapshots.0",
    );
  });

  it("rejects an option selection carrying an unknown field", () => {
    expectRejectedAt(
      {
        ...validUnresolvedRecord,
        lineSnapshots: [
          {
            ...cappuccinoSnapshot,
            optionSelections: [
              { ...cappuccinoSnapshot.optionSelections[0]!, optionTypeName: "Size" },
            ],
          },
        ],
      },
      "lineSnapshots.0.optionSelections.0",
    );
  });

  it("rejects an option selection missing optionValueLabel", () => {
    expectRejectedAt(
      {
        ...validUnresolvedRecord,
        lineSnapshots: [
          {
            ...cappuccinoSnapshot,
            optionSelections: [
              withoutField(cappuccinoSnapshot.optionSelections[0]!, "optionValueLabel"),
            ],
          },
        ],
      },
      "lineSnapshots.0.optionSelections.0.optionValueLabel",
    );
  });

  // --- items ↔ lineSnapshots parity (T03-R1) --------------------------------
  //
  // The restore boundary must not parse halfway into a degraded lifecycle
  // decision: the snapshots ARE the success screen's and the conflict join's
  // data (D9), so a record whose snapshots do not cover exactly the items'
  // variants is corrupt, however well-formed each individual field is.

  describe("items ↔ lineSnapshots parity", () => {
    it("rejects a record with an empty lineSnapshots array", () => {
      // items.min(1) mirrors this: an attempt always embeds at least one
      // submitted line, so zero snapshots would render an empty success
      // screen for a submitted order.
      expectRejectedAt({ ...validUnresolvedRecord, lineSnapshots: [] }, "lineSnapshots");
    });

    it("rejects a snapshot whose variant is absent from items", () => {
      // The tea snapshot names a variant the request never carried — it
      // would render a line the customer never submitted.
      expectRefinementMessage({
        ...validUnresolvedRecord,
        lineSnapshots: [cappuccinoSnapshot, waterSnapshot, teaSnapshot],
      });
    });

    it("rejects an item variant with no snapshot", () => {
      // Dropping the cappuccino snapshot silently degrades AC-07's confirmed
      // content to fewer items than were submitted.
      expectRefinementMessage({ ...validUnresolvedRecord, lineSnapshots: [waterSnapshot] });
    });

    it("accepts multiple snapshots of one variant — parity is set equality, not counts", () => {
      // One cart line per option selection: two cappuccino lines (large+oat
      // qty 2, regular qty 1) normalize into ONE quantity-3 item (T02's
      // merge case) while BOTH snapshots persist — so the two arrays
      // legitimately differ in length and only the variant SETS may be
      // compared.
      const regularCappuccinoSnapshot = {
        lineId: `${CAPPUCCINO_VARIANT_ID}|${REGULAR_OPTION_VALUE_ID}`,
        variantId: CAPPUCCINO_VARIANT_ID,
        productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
        productDisplayName: "Cappuccino",
        variantLabel: "Regular",
        optionSelections: [
          {
            optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
            optionValueId: REGULAR_OPTION_VALUE_ID,
            optionValueLabel: "Regular",
          },
        ],
        imageUri: null,
        quantity: 1,
      };

      const result = checkoutAttemptSchema.safeParse({
        ...validUnresolvedRecord,
        items: [{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 3 }, WATER_ITEM],
        fingerprint: [
          "kiosk.checkout.lean.v1",
          `${CAPPUCCINO_VARIANT_ID}:3`,
          `${WATER_VARIANT_ID}:1`,
        ].join("\n"),
        lineSnapshots: [cappuccinoSnapshot, regularCappuccinoSnapshot, waterSnapshot],
      });

      expect(result.success).toBe(true);
    });

    it("enforces parity on the confirmed branch too — that record IS the success payload", () => {
      // The confirmed branch carries the same refine; without this case a
      // regression that dropped it there would fail no test.
      expectRefinementMessage({ ...validConfirmedRecord, lineSnapshots: [waterSnapshot] });
    });
  });

  it.each([
    ["the letter I", "K7QM2I"],
    ["the letter O", "K7QMO2"],
    ["lowercase characters", "k7qm2w"],
    ["only five characters", "K7QM2"],
    ["seven characters", "K7QM2WX"],
    ["no characters at all", ""],
  ])("rejects a success payload whose displayNumber contains %s", (_case, displayNumber) => {
    // Same pinned kiosk alphabet as create-order-response.schema.ts — this
    // value is what the Order Success screen shows a customer reading it
    // aloud across a counter.
    expectRejectedAt(
      { ...validConfirmedRecord, success: { ...validSuccessPayload, displayNumber } },
      "success.displayNumber",
    );
  });

  it.each([
    // A naive local timestamp parses as a datetime but is NOT this contract —
    // the explicit offset is what timestamptz jsonb text always carries.
    ["a naive local timestamp", "2026-08-26T05:00:07"],
    ["a date only", "2026-08-26"],
    ["a space-separated timestamp", "2026-08-26 05:00:07+00"],
    ["a plain string", "not-a-timestamp"],
    ["a unix epoch number", 1756168807],
  ])("rejects a success payload whose createdAt is %s", (_case, createdAt) => {
    expectRejectedAt(
      { ...validConfirmedRecord, success: { ...validSuccessPayload, createdAt } },
      "success.createdAt",
    );
  });

  it.each(["orderId", "displayNumber", "createdAt"])(
    "rejects a success payload missing %s",
    (field) => {
      expectRejectedAt(
        { ...validConfirmedRecord, success: withoutField(validSuccessPayload, field) },
        `success.${field}`,
      );
    },
  );

  it("rejects a success payload carrying an unknown field", () => {
    // Every other strict object in the record has an unknown-key case;
    // `success` is one too — strict mode was already correct at runtime, this
    // pins it (T03-R3).
    expectRejectedAt(
      { ...validConfirmedRecord, success: { ...validSuccessPayload, note: "extra" } },
      "success",
    );
  });

  it.each(["pending", "done", "failed"])(
    "accepts a confirmed record with cartClear %s",
    (cartClear) => {
      expect(
        checkoutAttemptSchema.safeParse({ ...validConfirmedRecord, cleanup: { cartClear } })
          .success,
      ).toBe(true);
    },
  );

  it.each([
    ["an unknown status", "succeeded"],
    ["the empty string", ""],
    ["a non-string", 42],
  ])("rejects a cleanup tracker with cartClear %s", (_case, cartClear) => {
    expectRejectedAt({ ...validConfirmedRecord, cleanup: { cartClear } }, "cleanup.cartClear");
  });

  it("rejects a cleanup tracker missing cartClear", () => {
    expectRejectedAt({ ...validConfirmedRecord, cleanup: {} }, "cleanup.cartClear");
  });

  it("rejects a cleanup tracker carrying an unknown field", () => {
    expectRejectedAt(
      { ...validConfirmedRecord, cleanup: { cartClear: "pending", retries: 2 } },
      "cleanup",
    );
  });

  it.each([
    ["an unknown status", "failed"],
    ["a wrong-cased status", "Unresolved"],
    ["a non-string status", 42],
  ])("rejects a record with %s", (_case, status) => {
    // Definite failure and stock-conflict outcomes are never persisted (D1) —
    // only "unresolved" and "confirmed" are durable states.
    expectRejectedAt({ ...validUnresolvedRecord, status }, "status");
  });

  it("rejects a record missing status entirely", () => {
    expectRejectedAt(withoutField(validUnresolvedRecord, "status"), "status");
  });

  it("rejects unknown fields on both record families", () => {
    // The empty path is the unrecognized-keys issue at the record root.
    expectRejectedAt({ ...validUnresolvedRecord, resolvedAt: "2026-08-26" }, "");
    expectRejectedAt({ ...validConfirmedRecord, resolvedAt: "2026-08-26" }, "");
  });

  it.each([
    ["a bare string", "unresolved"],
    ["a bare number", 42],
    ["a bare array", [validUnresolvedRecord]],
    ["null", null],
  ])("rejects a non-object root payload: %s", (_case, payload) => {
    // The record arrives from JSON.parse of the stored text
    // (createJsonStorage read), so a non-object root is representable and
    // the schema must reject it at the root path, not throw.
    expectRejectedAt(payload, "");
  });
});
