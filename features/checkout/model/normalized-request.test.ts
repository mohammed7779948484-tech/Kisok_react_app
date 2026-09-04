import type { CartLine } from "@/features/cart";

import { MAX_NORMALIZED_ITEMS, normalizeCartLines } from "./normalized-request";

/**
 * Behavior tests for the pure checkout normalization rules (AC-05): cart
 * lines → the exact `create_order` items payload — unique `variant_id`
 * entries with positive integer quantities, deterministic for the same
 * logical cart — plus the client-side fingerprint that binds an idempotency
 * identity to the logical request.
 *
 * Every case traces to
 * `supabase/migrations/20260826050007_lean_create_order.sql`: at most 100
 * entries (lines 46–50), exactly the two keys per item with an integer
 * quantity 1..2147483647 (lines 56–93), duplicate `variant_id`s rejected
 * (K1001, lines 95–105), and the server fingerprint
 * `'kiosk.checkout.lean.v1' || E'\n' || string_agg(variant_id || ':' ||
 * quantity, E'\n' order by r.variant_id)` (lines 107–114). Fixtures reuse the
 * cart feature's cappuccino/water pair: one variant with option selections,
 * one plain variant with none.
 */

const CAPPUCCINO_VARIANT_ID = "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f";
const WATER_VARIANT_ID = "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d";
// A third distinct variant for the fingerprint-binding case: swapping water
// for tea changes ONLY the variant identity (quantities held identical).
const TEA_VARIANT_ID = "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a";

const SIZE_OPTION_TYPE_ID = "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d";
const SIZE_OPTION_VALUE_ID = "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b";
const REGULAR_OPTION_VALUE_ID = "77b1e2c4-9d3a-4e5f-b0a1-2c3d4e5f6a7b";
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
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: OAT_MILK_OPTION_VALUE_ID,
  optionValueLabel: "Oat Milk",
};

/**
 * A minimal CartLine factory. Normalization must read ONLY `variantId` and
 * `quantity` — the display fields are filler and are never asserted on, but
 * they stay type-complete so every fixture is a real cart line. `lineId`
 * mirrors the cart's derivation (variantId + sorted optionValueIds, joined
 * with `|`) so same-variant fixtures carry DISTINCT line ids — exactly how a
 * real cart legitimately holds two lines of one variant (different option
 * selections).
 */
function makeLine(input: {
  variantId: string;
  quantity: number;
  optionSelections?: CartLine["optionSelections"];
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
    productDisplayName: "Cappuccino",
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
  });
}

/** A plain variant — no options, so only the variantId identifies it. */
function waterLine(quantity: number): CartLine {
  return makeLine({ variantId: WATER_VARIANT_ID, quantity });
}

/**
 * Deterministic, distinct, canonical 8-4-4-4-12 uuids for the >100-variant
 * fixture: the zero-padded hex index occupies the first two groups, the rest
 * is fixed — 101 ids built programmatically, none hand-written.
 */
function distinctVariantId(index: number): string {
  const hex = index.toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-000000000000`;
}

describe("normalizeCartLines", () => {
  describe("merging cart lines into unique variants", () => {
    it("merges two lines sharing a variantId with different optionSelections into ONE summed item", () => {
      // The AC-05 core case, and the RED premise: the cart holds two distinct
      // lines (distinct lineIds, different option selections) of ONE variant —
      // the RPC demands unique variant_ids, so they must become one item.
      // Quantities 3 + 2 → 5: a normal sum stays well inside the RPC range.
      const request = normalizeCartLines([cappuccinoLine(3), regularCappuccinoLine(2)]);

      expect(request.items).toEqual([{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 5 }]);
    });

    it("merges the same variantId spelled with different hex casing into one identity", () => {
      // PostgreSQL compares uuid text case-insensitively and the cart already
      // canonicalises casing for line identity — the same logical uuid with
      // different hex casing is ONE variant (cart-rules deriveLineId, H-F01).
      const upperCased = makeLine({
        variantId: CAPPUCCINO_VARIANT_ID.toUpperCase(),
        quantity: 3,
        optionSelections: [sizeSelection],
      });

      const request = normalizeCartLines([
        makeLine({
          variantId: CAPPUCCINO_VARIANT_ID,
          quantity: 2,
          optionSelections: [oatMilkSelection],
        }),
        upperCased,
      ]);

      expect(request.items).toEqual([{ variant_id: CAPPUCCINO_VARIANT_ID, quantity: 5 }]);
    });

    it("keeps distinct variants as separate items with their own quantities", () => {
      const request = normalizeCartLines([cappuccinoLine(2), waterLine(4)]);

      expect(request.items).toEqual([
        { variant_id: CAPPUCCINO_VARIANT_ID, quantity: 2 },
        { variant_id: WATER_VARIANT_ID, quantity: 4 },
      ]);
    });

    it("passes a single plain line through as one item", () => {
      const request = normalizeCartLines([waterLine(4)]);

      expect(request.items).toEqual([{ variant_id: WATER_VARIANT_ID, quantity: 4 }]);
    });
  });

  describe("determinism and output shape", () => {
    it("produces byte-identical items and fingerprint for differently-ordered line arrays", () => {
      const logicalCart = () => [cappuccinoLine(3), waterLine(1), regularCappuccinoLine(2)];
      const original = logicalCart();
      const snapshot = JSON.parse(JSON.stringify(original)) as CartLine[];

      // The guarded array itself is the input — an implementation that
      // mutated the caller's lines (an in-place sort, say) would be caught
      // by the snapshot comparison below (R-T02-01).
      const forward = normalizeCartLines(original);
      const reversed = normalizeCartLines(logicalCart().reverse());

      expect(reversed).toEqual(forward);
      expect(reversed.items).toEqual(forward.items);
      expect(reversed.fingerprint).toBe(forward.fingerprint);

      // Pure function: the input lines are never mutated (cart-rules
      // convention) — the caller's cart is read, not rewritten.
      expect(original).toEqual(snapshot);
    });

    it("emits items with exactly the two RPC keys and no more", () => {
      const request = normalizeCartLines([cappuccinoLine(2), waterLine(1)]);

      expect(request.items).toHaveLength(2);
      for (const item of request.items) {
        expect(Object.keys(item)).toEqual(["variant_id", "quantity"]);
      }
    });

    it("lowercases variant ids in the output (canonical uuid text)", () => {
      const request = normalizeCartLines([
        makeLine({ variantId: CAPPUCCINO_VARIANT_ID.toUpperCase(), quantity: 1 }),
      ]);

      expect(request.items[0]?.variant_id).toBe(CAPPUCCINO_VARIANT_ID);
    });

    it("sorts items by variant_id regardless of input order", () => {
      // Given in reverse: water ("9c2d…") precedes cappuccino ("3a7f…").
      const request = normalizeCartLines([waterLine(1), cappuccinoLine(2)]);

      expect(request.items.map((item) => item.variant_id)).toEqual([
        CAPPUCCINO_VARIANT_ID,
        WATER_VARIANT_ID,
      ]);
    });

    it("pins the exact fingerprint format for a known small input", () => {
      const request = normalizeCartLines([
        cappuccinoLine(3),
        regularCappuccinoLine(2),
        waterLine(1),
      ]);

      // Mirrors the server's canonical form (migration lines 107–114): the
      // leading domain tag, `variant_id:quantity` rows joined by `\n`, in
      // variant_id order — and no trailing separator.
      expect(request.fingerprint).toBe(
        "kiosk.checkout.lean.v1\n" + `${CAPPUCCINO_VARIANT_ID}:5\n` + `${WATER_VARIANT_ID}:1`,
      );
      expect(request.fingerprint.endsWith("\n")).toBe(false);
    });

    it("changes the fingerprint when the logical request changes (D2 binding)", () => {
      // The flip side of determinism, and the property the module doc
      // claims: the fingerprint binds a persisted client_request_id to the
      // logical request, so a changed cart MUST produce a different
      // fingerprint — otherwise a stale identity could be silently reused
      // for a different order (R-T02-03).
      const request = normalizeCartLines([cappuccinoLine(3), waterLine(1)]);

      // (a) a changed summed quantity, same variants
      const changedQuantity = normalizeCartLines([cappuccinoLine(4), waterLine(1)]);
      expect(changedQuantity.fingerprint).not.toBe(request.fingerprint);

      // (b) a changed variant set, quantities held identical
      const changedVariantSet = normalizeCartLines([
        cappuccinoLine(3),
        makeLine({ variantId: TEA_VARIANT_ID, quantity: 1 }),
      ]);
      expect(changedVariantSet.fingerprint).not.toBe(request.fingerprint);
    });
  });

  describe("domain violations", () => {
    it("throws on an empty lines array — an empty cart must never be submitted", () => {
      expect(() => normalizeCartLines([])).toThrow("empty cart");
    });

    it("accepts a cart at exactly the 100-variant server cap", () => {
      const lines = Array.from({ length: MAX_NORMALIZED_ITEMS }, (_, index) =>
        makeLine({ variantId: distinctVariantId(index), quantity: 1 }),
      );

      const request = normalizeCartLines(lines);

      expect(request.items).toHaveLength(MAX_NORMALIZED_ITEMS);
    });

    it("throws on more than 100 distinct variants — the server's K1001 cap", () => {
      const lines = Array.from({ length: MAX_NORMALIZED_ITEMS + 1 }, (_, index) =>
        makeLine({ variantId: distinctVariantId(index), quantity: 1 }),
      );

      expect(() => normalizeCartLines(lines)).toThrow("distinct variants");
    });

    it.each([
      [
        "the summed quantity overflows the RPC cap",
        [cappuccinoLine(1073741824), cappuccinoLine(1073741824)],
      ],
      ["the summed quantity is below 1", [cappuccinoLine(0)]],
      ["the summed quantity is not an integer", [cappuccinoLine(2.5)]],
    ])("throws when %s (defensive invariant)", (_caseName: string, lines: CartLine[]) => {
      // Unreachable through the real cart — each line is bounded 1..99, and
      // although one variant can span many lines (the per-variant line count
      // has no cart-level cap), reaching 2147483647 would take over 21
      // million max-quantity lines of a single variant — but these rules
      // must not assume their caller's schema (the CartLine TYPE widens
      // quantity to plain `number`), so the invariant fails loudly instead
      // of shipping a payload the server would reject with K1001 after a
      // network round trip.
      expect(() => normalizeCartLines(lines)).toThrow("between 1 and 2147483647");
    });
  });
});
