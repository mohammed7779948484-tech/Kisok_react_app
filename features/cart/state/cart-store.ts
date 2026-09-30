import { create } from "zustand";

import { createLogger } from "@/core/logging";
import { storage, storageKey, type JsonStorage } from "@/core/storage";

import type { AddToCartInput, CartLine } from "../model/cart-line.schema";
import { addToCartInputSchema } from "../model/cart-line.schema";
import {
  addLine,
  deriveDistinctLineCount,
  deriveTotalQuantity,
  removeLine as removeLineRule,
  setLineQuantity as setQuantityRule,
} from "../model/cart-rules";
import { persistedCartSchema } from "../model/persisted-cart.schema";

const log = createLogger("cart.store");

/** One key; the owner lives inside the payload, so a restore can tell whose cart it is. */
const STORAGE_KEY = storageKey("cart", "lines");

/**
 * Client-owned cart state — the single cart model (the backend has no cart).
 *
 * - `ownerId`: the customer profile the cart belongs to. A restore for a
 *   different profile starts empty and discards what was on disk, so one
 *   customer's selections never reach another.
 * - `hydrated`: the owner's saved cart has been read. Edits before that are
 *   ignored, because the restore would overwrite them.
 * - `locked`: an order is being submitted; user edits are ignored until the
 *   outcome is known. `clear()` is not blocked — a confirmed order clears
 *   the cart while it is still locked.
 * - `saveFailed`: the last write to the tablet failed. The cart still works
 *   in memory; the UI may say changes might not survive a restart.
 */
export type CartState = {
  lines: CartLine[];
  ownerId: string | null;
  hydrated: boolean;
  locked: boolean;
  saveFailed: boolean;
  hydrate: (ownerId: string) => Promise<void>;
  addItem: (input: AddToCartInput) => void;
  setLineQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  /** Empty the cart in memory now and on the tablet; resolves once the write has settled. */
  clear: () => Promise<void>;
  lock: () => void;
  unlock: () => void;
};

/** A factory so a test can pass a fake storage backend. */
export function createCartStore(backend: JsonStorage = storage) {
  return create<CartState>((set, get) => {
    // Every storage operation runs through this one queue, in order, so a
    // write can never land after a later clear or restore.
    let queue: Promise<void> = Promise.resolve();
    const enqueue = (operation: () => Promise<void>): Promise<void> => {
      queue = queue.then(operation).catch((error: unknown) => {
        log.error("Cart storage operation failed", { error: String(error) });
      });
      return queue;
    };

    // Rapid edits coalesce: while a save is waiting its turn, later edits
    // ride along, because the save reads the latest state when it runs.
    let saveQueued = false;
    const save = (): Promise<void> => {
      if (saveQueued) return queue;
      saveQueued = true;
      return enqueue(async () => {
        saveQueued = false;
        const { ownerId, lines } = get();
        if (!ownerId) return;
        const result =
          lines.length > 0
            ? await backend.write(STORAGE_KEY, { version: 1, ownerId, lines })
            : await backend.remove(STORAGE_KEY);
        if (result.status === "rejected") log.warn("Cart change was not saved to the tablet");
        set({ saveFailed: result.status === "rejected" });
      });
    };

    let hydration: { ownerId: string; done: Promise<void> } | null = null;

    const restore = (ownerId: string) =>
      enqueue(async () => {
        const result = await backend.read(STORAGE_KEY, (raw) => persistedCartSchema.parse(raw));
        // A newer hydrate for another customer took over while this one waited.
        if (get().ownerId !== ownerId) return;

        if (result.status === "hit" && result.value.ownerId === ownerId) {
          // Re-derive identities so a restored line always merges with a new add.
          const lines = result.value.lines.reduce<CartLine[]>(addLine, []);
          set({ lines, hydrated: true });
          return;
        }
        if (result.status !== "miss") {
          // Another customer's cart, or a payload this build cannot read.
          log.info("Discarding a saved cart that does not belong to this customer");
          await backend.remove(STORAGE_KEY);
        }
        set({ lines: [], hydrated: true });
      });

    /** Every user edit shares these gates: restored, unlocked. */
    const editable = (action: string) => {
      const { hydrated, locked } = get();
      if (!hydrated || locked) {
        log.debug(`${action} ignored`, { hydrated, locked });
        return false;
      }
      return true;
    };

    return {
      lines: [],
      ownerId: null,
      hydrated: false,
      locked: false,
      saveFailed: false,

      hydrate: (ownerId) => {
        if (hydration?.ownerId === ownerId) return hydration.done;
        // A different customer: nothing of the previous session survives in memory.
        set({ lines: [], ownerId, hydrated: false, locked: false, saveFailed: false });
        const done = restore(ownerId);
        hydration = { ownerId, done };
        return done;
      },

      addItem: (input) => {
        if (!editable("addItem")) return;
        const parsed = addToCartInputSchema.safeParse(input);
        if (!parsed.success) {
          log.warn("addItem ignored: invalid selection");
          return;
        }
        set({ lines: addLine(get().lines, parsed.data) });
        void save();
      },

      setLineQuantity: (lineId, quantity) => {
        if (!editable("setLineQuantity")) return;
        set({ lines: setQuantityRule(get().lines, lineId, quantity) });
        void save();
      },

      removeLine: (lineId) => {
        if (!editable("removeLine")) return;
        set({ lines: removeLineRule(get().lines, lineId) });
        void save();
      },

      clear: () => {
        if (!get().hydrated) return Promise.resolve();
        set({ lines: [] });
        return save();
      },

      lock: () => set({ locked: true }),
      unlock: () => set({ locked: false }),
    };
  });
}

export const useCartStore = createCartStore();

/** Sum of all line quantities. */
export const selectTotalQuantity = (state: CartState): number => deriveTotalQuantity(state.lines);

/** How many distinct lines the cart holds. */
export const selectDistinctLineCount = (state: CartState): number =>
  deriveDistinctLineCount(state.lines);
