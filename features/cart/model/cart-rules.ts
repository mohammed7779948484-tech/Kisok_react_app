import { MAX_LINE_QUANTITY } from "./cart-line.schema";
import type { AddToCartInput, CartLine } from "./cart-line.schema";

/**
 * Pure cart domain rules — no IO. The store composes these so every surface
 * derives line identity, merge semantics, quantity bounds, and summaries the
 * same way from the one cart model (AC-03, AC-08).
 */

export function deriveLineId(input: {
  variantId: string;
  optionSelections: { optionValueId: string }[];
}): string {
  // Canonicalized identity (H-F01, hardening decision 1): PostgreSQL compares
  // uuid text case-insensitively, so the UUID components (variantId and each
  // optionValueId) are lowercased BEFORE sorting and joining — two differently
  // cased spellings of one uuid are ONE identity, and a later add of the same
  // selection merges. The parse boundary (postgresUuidSchema) still mirrors
  // PostgreSQL's case-insensitive acceptance; only the derived id is canonical.
  const optionValueIds = input.optionSelections
    .map((selection) => selection.optionValueId.toLowerCase())
    .sort();
  return [input.variantId.toLowerCase(), ...optionValueIds].join("|");
}

export function addLine(lines: CartLine[], input: AddToCartInput): CartLine[] {
  const lineId = deriveLineId(input);
  const existing = lines.find((line) => line.lineId === lineId);
  if (!existing) {
    // Derived identity last: a stray lineId on the input never wins (cart-line.schema documents strip-mode).
    return [...lines, { ...input, lineId }];
  }
  // Capped: local UX guard only; availability reconciliation is out of scope (plan decision 7).
  return lines.map((line) =>
    line.lineId === lineId
      ? { ...line, quantity: Math.min(existing.quantity + input.quantity, MAX_LINE_QUANTITY) }
      : line,
  );
}

export function setLineQuantity(lines: CartLine[], lineId: string, quantity: number): CartLine[] {
  // Non-integers floor (documented policy), then clamp into 1..MAX_LINE_QUANTITY.
  // Non-finite input is a caller bug: NaN fails safe to 1, +Infinity clamps to the max —
  // either way the line stays valid and persistable.
  const bounded = Number.isFinite(quantity)
    ? Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.floor(quantity)))
    : quantity > 0
      ? MAX_LINE_QUANTITY
      : 1;
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity: bounded } : line));
}

export function removeLine(lines: CartLine[], lineId: string): CartLine[] {
  return lines.filter((line) => line.lineId !== lineId);
}

export function deriveTotalQuantity(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function deriveDistinctLineCount(lines: CartLine[]): number {
  return lines.length;
}
