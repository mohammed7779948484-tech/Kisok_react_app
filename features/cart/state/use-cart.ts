import { useEffect, useRef } from "react";

import { useActiveProfile } from "@/core/auth";

import type { AddToCartInput, CartLine } from "../model/cart-line.schema";
import {
  selectDistinctLineCount,
  selectTotalQuantity,
  useCartStore,
  type PersistenceStatus,
} from "./cart-store";

// The public TYPES, re-exported from their sources so `features/cart/index.ts`
// has ONE public types source. Types only — never the store itself (plan
// decision 11: exporting `useCartStore` would freeze the whole state shape as
// public contract, so Zustand stays an implementation detail).
export type { AddToCartInput, CartLine } from "../model/cart-line.schema";
export type { PersistenceStatus } from "./cart-store";

/**
 * The narrow view plus bound actions `useCart()` returns to React consumers.
 * Destructure what you need (`const { lines, addItem } = useCart()`) — the
 * object's identity is per-render, so a whole-view dependency array entry
 * would re-run its effect every render.
 */
export type CartView = {
  lines: CartLine[];
  totalQuantity: number;
  distinctLineCount: number;
  persistence: PersistenceStatus;
  hydrated: boolean;
  locked: boolean;
  addItem: (input: AddToCartInput) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
  lockCart: () => void;
  unlockCart: () => void;
};

/**
 * A frozen-in-time plain read of the single cart model, for non-React callers.
 *
 * The fields are typed readonly and the values are captured at call time: the
 * store's rules only ever REPLACE the `lines` array and its line objects
 * (immutable updates), so the returned reference never changes under a caller
 * — but treat it as data, not as a live handle to the store.
 */
export type CartSnapshot = {
  readonly lines: CartLine[];
  readonly totalQuantity: number;
  readonly distinctLineCount: number;
  readonly persistence: PersistenceStatus;
  readonly hydrated: boolean;
  readonly locked: boolean;
  readonly ownerId: string | null;
};

/**
 * The cart's narrow public API for React consumers (plan decision 11, AC-13).
 *
 * This module — via `features/cart/index.ts` — is the ONLY sanctioned way for
 * another feature to touch the cart: a view of the single cart model plus
 * bound actions, with Zustand itself kept as an implementation detail. The
 * rejected alternative, exporting the raw `useCartStore`, would freeze the
 * whole state shape (every field, every status, the persistence queue) as
 * public contract; the narrow view lets the store evolve behind it.
 *
 * Hydration ownership (the T09 carry-forward): this hook is the ONE place the
 * store gets hydrated for the active customer. It reads the profile from
 * `useActiveProfile()` and, in an effect, calls the store's serialized,
 * idempotent `hydrate(profile.id)` — re-running exactly when the profile id
 * CHANGES, because that is a customer switch: the store's owner-switch reset
 * discards the previous owner's in-memory cart (and its lock), and its
 * mismatch path durably discards the previous owner's persisted envelope.
 * Double-fire protection is the store's own (serialized hydration + same-owner
 * no-op); the `lastHydratedOwner` ref is effect hygiene only, so React's
 * double-invoked effects in development never enqueue a redundant read.
 *
 * The hook is only used inside authenticated surfaces: `useActiveProfile()`
 * throwing outside them is core/auth's contract, not a defect to code around.
 */
export function useCart(): CartView {
  const profile = useActiveProfile();

  // Subscriptions are per-slice on the REAL singleton, so a consumer
  // re-renders only when a field it can see changes.
  const lines = useCartStore((state) => state.lines);
  const persistence = useCartStore((state) => state.persistence);
  const hydrated = useCartStore((state) => state.hydrated);
  const locked = useCartStore((state) => state.locked);
  // Derived through the existing module selectors — totals are NEVER mirrored
  // in hook state; two truths would drift (AC-08).
  const totalQuantity = useCartStore(selectTotalQuantity);
  const distinctLineCount = useCartStore(selectDistinctLineCount);

  const lastHydratedOwner = useRef<string | null>(null);
  useEffect(() => {
    const ownerId = profile.id;
    if (lastHydratedOwner.current === ownerId) return;
    lastHydratedOwner.current = ownerId;
    // Fire-and-forget: the store serializes hydration behind its durable-op
    // chain, and a later request for a different owner waits and then wins.
    void useCartStore.getState().hydrate(ownerId);
  }, [profile.id]);

  return {
    lines,
    totalQuantity,
    distinctLineCount,
    persistence,
    hydrated,
    locked,
    // The module-level delegates below: one stable identity per name, and
    // every call resolves the CURRENT store through `getState()` — never a
    // captured, possibly stale action reference.
    addItem,
    setLineQuantity,
    removeLine,
    clearCart,
    lockCart,
    unlockCart,
  };
}

// ---- plain action functions (non-React callers, future Checkout) ----------
// Thin delegates onto the same single store the hook reads. They exist so a
// future Checkout feature can drive the cart without a React tree — locking
// around a submission, hydrating, and clearing after confirmed success —
// through the public API only, never the store. Callers outside a mounted
// useCart() consumer must hydrate first (`hydrateCart`, or a mounted
// `useCart()` elsewhere) — until the store hydrates, their mutations are
// logged no-ops: the store gates on `hydrated` by design. One window the
// gate does NOT cover: after `clearCartForSignOut`, `hydrated` stays true
// with the previous ownerId until the next hydrate — unreachable in the
// delivered app (every mutation source unmounts at the auth gate) and
// covered by the owner-mismatch discard at the next different-owner hydrate
// (B-FR-02 carry-forward; future programmatic integrators must re-hydrate
// before driving mutations). Name mapping onto
// the store's actions: public lockCart/unlockCart/hydrateCart →
// store lock/unlock/hydrate.

/** Add a selection (merge-same-selection / distinct-line) to the current cart. */
export function addItem(input: AddToCartInput): void {
  useCartStore.getState().addItem(input);
}

/** Set a line's quantity (floored, clamped into the domain bounds). */
export function setLineQuantity(lineId: string, quantity: number): void {
  useCartStore.getState().setLineQuantity(lineId, quantity);
}

/**
 * Remove one line — in UI this is a confirmed action; the delegate is the
 * store's own no-op-guarded path.
 */
export function removeLine(lineId: string): void {
  useCartStore.getState().removeLine(lineId);
}

/** Clear the cart: memory immediately, durable key through the honest remove→fallback. */
export function clearCart(): void {
  useCartStore.getState().clearCart();
}

/** Lock user-driven mutations for a critical operation (future Checkout). */
export function lockCart(): void {
  useCartStore.getState().lock();
}

/** Re-enable user-driven mutations. */
export function unlockCart(): void {
  useCartStore.getState().unlock();
}

/**
 * Hydrate the singleton for an owner: owner-scoped durable restore, with the
 * mismatch/corrupt discard paths the store owns. Idempotent for the same
 * owner; a different owner takes over.
 */
export function hydrateCart(ownerId: string): Promise<void> {
  return useCartStore.getState().hydrate(ownerId);
}

/**
 * A plain read-only snapshot of the cart, derived through the same module
 * selectors as the hook's view — a snapshot, never a live store handle. The
 * values stand still after the call: the store's rules replace state
 * immutably, so later mutations never rewrite what this returned.
 */
export function getCartSnapshot(): CartSnapshot {
  const state = useCartStore.getState();
  return {
    lines: state.lines,
    totalQuantity: selectTotalQuantity(state),
    distinctLineCount: selectDistinctLineCount(state),
    persistence: state.persistence,
    hydrated: state.hydrated,
    locked: state.locked,
    ownerId: state.ownerId,
  };
}
