import type { CartLine } from "@/features/cart";

import { checkoutAttemptSchema } from "./checkout-attempt.schema";
import type { NormalizedRequest } from "./normalized-request";
import { MAX_NORMALIZED_ITEMS, normalizeCartLines } from "./normalized-request";

/**
 * Integration test for the model layer's T02 → T03 seam (R1-02): the durable
 * attempt record's `items` and `fingerprint` are not independent shapes that
 * merely resemble `normalizeCartLines` output — they ARE its output, embedded
 * byte-identically at write time. Every case here feeds real normalization
 * output through `checkoutAttemptSchema.safeParse`, so a divergence between
 * the normalizer and the record schema (a cap moved in one module, a bound
 * retuned in the other) fails at the SEAM instead of leaving two green unit
 * suites that no longer compose.
 *
 * The unit suites pin each module alone (normalized-request.test.ts,
 * checkout-attempt.schema.test.ts); this file pins the COMPOSITION, at the
 * contract's boundary caps: a 100-distinct-variant cart (the RPC's own entry
 * ceiling), one variant spanning TWO option-selection lines that normalization
 * merges, and the 2147483647 RPC quantity ceiling a real cart can never reach
 * but the restore boundary must still honor.
 *
 * Fixtures reuse the checkout feature's cappuccino/water conventions and the
 * sibling suites' deterministic uuid generator, so the model tests stay
 * continuous with each other.
 */

const OWNER_ID = "d94a2f7b-1c3e-4b5a-9f8d-6e2c7b1a4d3e";
const CLIENT_REQUEST_ID = "0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f";
const ORDER_ID = "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const DISPLAY_NUMBER = "K7QM2W";
// PostgreSQL renders a timestamptz inside jsonb with a +00:00 offset.
const CREATED_AT = "2026-08-26T05:00:07.123456+00:00";

const CAPPUCCINO_VARIANT_ID = "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f";

const SIZE_OPTION_TYPE_ID = "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d";
const SIZE_OPTION_VALUE_ID = "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b";
const REGULAR_OPTION_VALUE_ID = "77b1e2c4-9d3a-4e5f-b0a1-2c3d4e5f6a7b";
const OAT_MILK_OPTION_TYPE_ID = "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d";
const OAT_MILK_OPTION_VALUE_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const sizeSelection: CartLine["optionSelections"][number] = {
  optionTypeId: SIZE_OPTION_TYPE_ID,
  optionValueId: SIZE_OPTION_VALUE_ID,
  optionValueLabel: "Large",
};

const regularSelection: CartLine["optionSelections"][number] = {
  optionTypeId: SIZE_OPTION_TYPE_ID,
  optionValueId: REGULAR_OPTION_VALUE_ID,
  optionValueLabel: "Regular",
};

const oatMilkSelection: CartLine["optionSelections"][number] = {
  optionTypeId: OAT_MILK_OPTION_TYPE_ID,
  optionValueId: OAT_MILK_OPTION_VALUE_ID,
  optionValueLabel: "Oat Milk",
};

/**
 * A minimal CartLine factory (normalized-request.test.ts's convention):
 * normalization reads only `variantId` and `quantity`, but every fixture stays
 * a type-complete real cart line. `lineId` mirrors the cart's derivation
 * (variantId + sorted optionValueIds joined with `|`) so same-variant fixtures
 * carry DISTINCT line ids — exactly how a real cart legitimately holds two
 * lines of one variant (different option selections).
 */
function makeLine(input: {
  variantId: string;
  quantity: number;
  optionSelections?: CartLine["optionSelections"];
  productDisplayName?: string;
}): CartLine {
  const selections = input.optionSelections ?? [];
  const lineId = [
    input.variantId.toLowerCase(),
    ...selections.map((selection) => selection.optionValueId.toLowerCase()).sort(),
  ].join("|");
  return {
    lineId,
    variantId: input.variantId,
    productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
    productDisplayName: input.productDisplayName ?? "Cappuccino",
    variantLabel: "Large · Oat Milk",
    optionSelections: selections,
    imageUri: null,
    quantity: input.quantity,
  };
}

/** Cappuccino, both options selected. */
function cappuccinoLine(quantity: number): CartLine {
  return makeLine({
    variantId: CAPPUCCINO_VARIANT_ID,
    quantity,
    optionSelections: [sizeSelection, oatMilkSelection],
  });
}

/** Cappuccino, regular size only — a DIFFERENT selection of the SAME variant. */
function regularCappuccinoLine(quantity: number): CartLine {
  return makeLine({
    variantId: CAPPUCCINO_VARIANT_ID,
    quantity,
    optionSelections: [regularSelection],
    productDisplayName: "Cappuccino",
  });
}

/**
 * Deterministic, distinct, canonical 8-4-4-4-12 uuids for the 100-variant
 * fixture (same construction as the sibling suites): the zero-padded hex index
 * occupies the first two groups, the rest is fixed.
 */
function distinctVariantId(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-000000000000`;
}

/**
 * The capped cart the attempt store would actually mint: MAX_NORMALIZED_ITEMS
 * distinct variants (the RPC's entry ceiling), one of them — the cappuccino —
 * spanning TWO lines with different option selections, quantities summing to
 * 5. 101 lines, 100 distinct variants: the cart is exactly at the seam's cap.
 */
function cappedCartLines(): CartLine[] {
  const lines = [cappuccinoLine(2), regularCappuccinoLine(3)];
  for (let index = 0; index < MAX_NORMALIZED_ITEMS - 1; index += 1) {
    lines.push(
      makeLine({
        variantId: distinctVariantId(index),
        quantity: 1,
        productDisplayName: `Kiosk Item ${index + 1}`,
      }),
    );
  }
  return lines;
}

/**
 * The record the attempt store writes from a normalization output: the items
 * and fingerprint embedded EXACTLY as produced, plus one display snapshot per
 * submitted cart line — the CartLine display shape is the snapshot shape (T03
 * pins the structural identity at the type level), so both cappuccino lines
 * persist their own snapshot while the merged item carries the summed
 * quantity. `extra` spreads in the branch-specific payload (status, success,
 * cleanup).
 */
function attemptRecordFrom(
  normalized: NormalizedRequest,
  lines: readonly CartLine[],
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    version: 1,
    ownerId: OWNER_ID,
    clientRequestId: CLIENT_REQUEST_ID,
    items: normalized.items,
    fingerprint: normalized.fingerprint,
    lineSnapshots: lines.map((line) => ({ ...line })),
    ...extra,
  };
}

const SUCCESS_PAYLOAD = {
  orderId: ORDER_ID,
  displayNumber: DISPLAY_NUMBER,
  createdAt: CREATED_AT,
};

function expectIssueAt(payload: unknown, path: string): void {
  const result = checkoutAttemptSchema.safeParse(payload);

  expect(result.success).toBe(false);
  if (result.success) {
    return;
  }

  expect(result.error.issues.some((issue) => issue.path.join(".") === path)).toBe(true);
}

describe("checkout model integration: normalizeCartLines → checkoutAttemptSchema", () => {
  describe("a cart at the boundary caps round-trips into the durable record", () => {
    const lines = cappedCartLines();
    const normalized = normalizeCartLines(lines);

    it("normalizes the capped cart to exactly MAX_NORMALIZED_ITEMS items, the merged variant summed", () => {
      expect(normalized.items).toHaveLength(MAX_NORMALIZED_ITEMS);

      const cappuccinoItems = normalized.items.filter(
        (item) => item.variant_id === CAPPUCCINO_VARIANT_ID,
      );
      expect(cappuccinoItems).toEqual([{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 5 }]);
    });

    it("restores an UNRESOLVED record built from that normalization output (101 snapshots, 100 items)", () => {
      const result = checkoutAttemptSchema.safeParse(
        attemptRecordFrom(normalized, lines, { status: "unresolved" }),
      );

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      expect(result.data.status).toBe("unresolved");
      // The record replays the exact normalized items — both caps intact — and
      // keeps one snapshot per submitted line: the two arrays legitimately
      // differ in length (parity is variant-SET equality, T03-R1).
      expect(result.data.items).toEqual(normalized.items);
      expect(result.data.items).toHaveLength(MAX_NORMALIZED_ITEMS);
      expect(result.data.lineSnapshots).toHaveLength(MAX_NORMALIZED_ITEMS + 1);
    });

    it("restores a CONFIRMED record carrying the same normalization output plus success and cleanup", () => {
      const confirmedRecord = attemptRecordFrom(normalized, lines, {
        status: "confirmed",
        success: SUCCESS_PAYLOAD,
        cleanup: { cartClear: "pending" },
      });
      const result = checkoutAttemptSchema.safeParse(confirmedRecord);

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      // Whole-record equality (the attempt suite's confirmed-record
      // precedent): the confirmed branch's payload rides alongside the exact
      // SAME normalization output as the unresolved branch — items,
      // fingerprint, and all 101 snapshots included.
      expect(result.data).toEqual(confirmedRecord);
    });

    it("carries the fingerprint EXACTLY as normalizeCartLines produced it (binding, not recomputation)", () => {
      // The binding discipline (D2): the persisted clientRequestId is bound to
      // the logical request by the fingerprint STRING the normalizer emitted —
      // the record must restore that exact string, byte-identical, never a
      // value recomputed from the restored items (a recomputation could drift
      // from the algorithm that minted the identity and silently orphan it).
      for (const extra of [
        { status: "unresolved" },
        { status: "confirmed", success: SUCCESS_PAYLOAD, cleanup: { cartClear: "pending" } },
      ]) {
        const result = checkoutAttemptSchema.safeParse(attemptRecordFrom(normalized, lines, extra));

        expect(result.success).toBe(true);
        if (!result.success) {
          return;
        }

        expect(result.data.fingerprint).toBe(normalized.fingerprint);
      }

      // And the bound string is the real canonical form for this cart: the
      // domain tag leading one `variant_id:quantity` row per normalized item.
      expect(normalized.fingerprint).toBe(
        [
          "kiosk.checkout.lean.v1",
          ...normalized.items.map((item) => `${item.variant_id}:${item.quantity}`),
        ].join("\n"),
      );
    });
  });

  describe("the RPC quantity ceiling round-trips", () => {
    // A real cart cannot reach 2147483647 — each line is bounded 1..99 — but
    // the CartLine TYPE widens quantity to plain `number` (normalized-request's
    // own defensive-invariant premise), so the seam is still fed exactly the
    // value the restore boundary must honor.
    const ceiling = normalizeCartLines([
      makeLine({ variantId: CAPPUCCINO_VARIANT_ID, quantity: 2147483647 }),
    ]);
    // The submitted display line the record snapshots alongside the ceiling
    // item — a cart-legal per-line quantity (snapshots mirror the cart's
    // 1..99 line bounds; the ceiling lives on the summed ITEM, not the line).
    const displayLine = cappuccinoLine(2);

    it("restores a record whose single item sits at exactly 2147483647, with its fingerprint bound", () => {
      expect(ceiling.items).toEqual([{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2147483647 }]);

      const result = checkoutAttemptSchema.safeParse(
        attemptRecordFrom(ceiling, [displayLine], { status: "unresolved" }),
      );

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }

      expect(result.data.items).toEqual([
        { variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2147483647 },
      ]);
      expect(result.data.fingerprint).toBe(ceiling.fingerprint);
    });

    it("rejects a persisted item one past the ceiling — the schema is normalization's re-validation twin", () => {
      // Pre-write, T02 rejects the wide quantity before it can leave the
      // device; post-write, the record schema rejects the same value on
      // restore, so a persisted item is always a payload create_order would
      // accept on replay.
      expect(() =>
        normalizeCartLines([makeLine({ variantId: CAPPUCCINO_VARIANT_ID, quantity: 2147483648 })]),
      ).toThrow("between 1 and 2147483647");

      expectIssueAt(
        attemptRecordFrom(
          {
            items: [{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2147483648 }],
            // A well-formed fingerprint for the wide quantity — every other
            // field of this record is valid, so the rejection is attributable
            // to the quantity alone.
            fingerprint: `kiosk.checkout.lean.v1\n${CAPPUCCINO_VARIANT_ID}:2147483648`,
          },
          [displayLine],
          { status: "unresolved" },
        ),
        "items.0.quantity",
      );
    });
  });
});
