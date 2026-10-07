import { useCallback, useEffect } from "react";

import { useActiveProfile } from "@/core/auth";

import type { AddToCartInput, CartLine } from "../model/cart-line.schema";
import { selectDistinctLineCount, selectTotalQuantity, useCartStore } from "./cart-store";

export type { AddToCartInput, CartLine } from "../model/cart-line.schema";

/** The cart view plus bound actions `useCart()` returns to React consumers. */
export type CartView = {
  lines: CartLine[];
  totalQuantity: number;
  distinctLineCount: number;
  hydrated: boolean;
  locked: boolean;
  /** The last change could not be saved to the tablet (it still works in memory). */
  saveFailed: boolean;
  addItem: (input: AddToCartInput) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clearCart: () => void;
};

/** A plain, point-in-time read of the cart for event handlers and other features. */
export type CartSnapshot = {
  readonly lines: CartLine[];
  readonly hydrated: boolean;
  readonly locked: boolean;
  readonly ownerId: string | null;
};

/**
 * The cart for React consumers. It also restores the active customer's cart:
 * the store keeps one restore per customer, so every consumer can call it.
 * Zustand stays an implementation detail behind this view.
 *
 * The public view is synchronously owner-scoped. A profile can change before
 * React runs the hydration effect; during that render the previous owner's
 * in-memory state must never be exposed or mutated by the new customer.
 */
export function useCart(): CartView {
  const profile = useActiveProfile();
  const ownerId = useCartStore((state) => state.ownerId);
  const lines = useCartStore((state) => state.lines);
  const hydrated = useCartStore((state) => state.hydrated);
  const locked = useCartStore((state) => state.locked);
  const saveFailed = useCartStore((state) => state.saveFailed);
  const totalQuantity = useCartStore(selectTotalQuantity);
  const distinctLineCount = useCartStore(selectDistinctLineCount);
  const owned = ownerId === profile.id;

  useEffect(() => {
    void useCartStore.getState().hydrate(profile.id);
  }, [profile.id]);

  const addOwnedItem = useCallback(
    (input: AddToCartInput) => {
      if (useCartStore.getState().ownerId !== profile.id) return;
      addItem(input);
    },
    [profile.id],
  );
  const setOwnedLineQuantity = useCallback(
    (lineId: string, quantity: number) => {
      if (useCartStore.getState().ownerId !== profile.id) return;
      setLineQuantity(lineId, quantity);
    },
    [profile.id],
  );
  const removeOwnedLine = useCallback(
    (lineId: string) => {
      if (useCartStore.getState().ownerId !== profile.id) return;
      removeLine(lineId);
    },
    [profile.id],
  );
  const clearOwnedCart = useCallback(() => {
    if (useCartStore.getState().ownerId !== profile.id) return;
    clearCart();
  }, [profile.id]);

  return {
    lines: owned ? lines : [],
    totalQuantity: owned ? totalQuantity : 0,
    distinctLineCount: owned ? distinctLineCount : 0,
    hydrated: owned && hydrated,
    locked: !owned || locked,
    saveFailed: owned && saveFailed,
    addItem: addOwnedItem,
    setLineQuantity: setOwnedLineQuantity,
    removeLine: removeOwnedLine,
    clearCart: clearOwnedCart,
  };
}

export function addItem(input: AddToCartInput): void {
  useCartStore.getState().addItem(input);
}

export function setLineQuantity(lineId: string, quantity: number): void {
  useCartStore.getState().setLineQuantity(lineId, quantity);
}

export function removeLine(lineId: string): void {
  useCartStore.getState().removeLine(lineId);
}

export function clearCart(): void {
  void useCartStore.getState().clear();
}

/** Restore the customer's cart; resolves when it has been read. Safe to call repeatedly. */
export function hydrateCart(ownerId: string): Promise<void> {
  return useCartStore.getState().hydrate(ownerId);
}

/** Empty the cart after a confirmed order; resolves once the write has settled. */
export function clearCartAfterOrder(): Promise<void> {
  return useCartStore.getState().clear();
}

/**
 * Discard the cart for staff sign-out on a shared account: memory now, the
 * tablet copy through the storage queue, even before hydration. `saved` is
 * false when the tablet copy could not be removed.
 */
export async function discardCart(): Promise<{ saved: boolean }> {
  return { saved: await useCartStore.getState().discard() };
}

/** Hold user edits while an order is being submitted. */
export function lockCart(): void {
  useCartStore.getState().lock();
}

export function unlockCart(): void {
  useCartStore.getState().unlock();
}

export function getCartSnapshot(): CartSnapshot {
  const { lines, hydrated, locked, ownerId } = useCartStore.getState();
  return { lines, hydrated, locked, ownerId };
}
