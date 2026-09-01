import { create } from "zustand";

import { createLogger } from "@/core/logging";
import {
  storage,
  storageKey,
  type JsonStorage,
  type StorageReadResult,
  type StorageWriteResult,
} from "@/core/storage";

import type { CartLine } from "../model/cart-line.schema";
import { persistedCartSchema, type PersistedCart } from "../model/persisted-cart.schema";

const log = createLogger("cart.store");

// Plan decision 1: ONE key, the owner INSIDE the payload. At most one cart is
// ever on disk (the most recent), so sign-out and the auth emergency reset
// each clear exactly one key, and a restore can always tell whose cart it is.
const STORAGE_KEY = storageKey("cart", "lines");

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Client-owned cart state — the single cart model (the backend has no cart).
 *
 * Only for data the CLIENT owns — a cart, a selection, a draft. Anything that
 * came from the database belongs in a TanStack Query hook instead; two caches
 * for the same data will drift.
 *
 * Note `persistence`: KISOK deliberately surfaces storage-write failures rather
 * than swallowing them. If a write fails the change is still in memory, but the
 * UI must be able to say so — telling a customer their cart is saved when it is
 * not is a correctness bug. This is why the store writes through
 * `@/core/storage` instead of zustand's `persist` middleware, which has no hook
 * for reporting a failed write.
 *
 * `clearFailed` is a DIFFERENT failure from `memoryOnly` and must never be
 * collapsed into it: `memoryOnly` means "the current value only lives in
 * memory", which is fine to show as a minor warning. A failed CLEAR means the
 * PREVIOUS customer's data is still sitting on disk — on a shared kiosk
 * tablet, the next `hydrate()` (the next cold start, possibly for a different
 * customer) would read it straight back. That is a safety bug, not a nuisance.
 */
export type PersistenceStatus = "unknown" | "persisted" | "memoryOnly" | "clearFailed";

/** The payload every durable write persists: version, owner, lines — one key. */
type CartEnvelope = { version: 1; ownerId: string | null; lines: CartLine[] };

type CartState = {
  lines: CartLine[];
  /** The profile the in-memory cart belongs to — null until the first hydrate. */
  ownerId: string | null;
  persistence: PersistenceStatus;
  hydrated: boolean;
  /** Owner-scoped restore: reads the persisted envelope, discards anything that is not this owner's. */
  hydrate: (ownerId: string) => Promise<void>;
  /**
   * Write the current state and report whether it was durably saved. Every
   * mutation calls this fire-and-forget (T04 wires that); the serialized
   * durable-operation chain means the writes never interleave.
   *
   * Before the first `hydrate` there is no owner to attribute the cart to, so
   * the durable write is SKIPPED: the call resolves `{ status: "rejected" }`
   * without touching storage and leaves `persistence` at "unknown" — the
   * skip is not a storage failure, and an ownerless envelope would fail the
   * persisted-cart schema on the next restore anyway.
   */
  persistNow: () => Promise<StorageWriteResult>;
  clear: () => Promise<StorageWriteResult>;
};

/**
 * A factory, not a bare `create(...)`, so a test can inject a fake backend
 * instead of the real `AsyncStorage` singleton — in particular
 * `createJsonStorage(createMemoryStore({ failOn: "removeItem" }))` from
 * `@/core/storage` and `@/core/testing`, which exists specifically to prove
 * what `clear()` does when the durable remove fails. Real code never passes
 * an argument here; see `useCartStore` below.
 */
export function createCartStore(backend: JsonStorage = storage) {
  return create<CartState>((set, get) => {
    // ---- trailing-coalesced write queue (plan decision 8) --------------------
    // ONE durable write in flight at a time — enforced by the serialized
    // durable-operation chain below, which also carries `clear()`'s ops and
    // the restore read. Requests arriving while a write is running wait for
    // the next pass, which snapshots the LATEST full state: rapid mutations
    // coalesce into trailing writes that never interleave and never persist a
    // stale snapshot over a newer cart.
    let writeRunning = false;
    let writeWaiters: ((result: StorageWriteResult) => void)[] = [];

    // ---- serialized hydration ------------------------------------------------
    // Restores run one at a time: a concurrent hydrate for the SAME owner
    // becomes a no-op once the first completes (a single read), and a hydrate
    // for a DIFFERENT owner waits for the in-flight restore before taking
    // over — the last owner requested always wins.
    let hydrationChain: Promise<void> = Promise.resolve();

    // ---- ONE serialized durable-operation chain -------------------------------
    // Every durable op on STORAGE_KEY — the queue's writes, `clear()`'s
    // remove→overwrite sequence, and the restore's read+discard — runs through
    // this chain: strictly one at a time, in enqueue order, and an op that
    // throws never breaks the chain. That ordering is the guarantee the races
    // need: a clear (or mismatch discard) requested while a write is in flight
    // runs AFTER that write — the write lands, then the clear empties it — so a
    // "cleared" cart can never resurrect on disk; a write enqueued DURING a
    // restore runs after the whole read+discard op, so it lands with the
    // post-restore state and is never wiped by the discard.
    let durableChain: Promise<void> = Promise.resolve();
    const runSerialized = <T>(op: () => Promise<T>): Promise<T> => {
      const attempt = () => op();
      const next = durableChain.then(attempt, attempt);
      durableChain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    };

    const currentEnvelope = (): CartEnvelope => ({
      version: 1,
      ownerId: get().ownerId,
      lines: get().lines,
    });

    const emptyEnvelope = (): CartEnvelope => ({ version: 1, ownerId: get().ownerId, lines: [] });

    /**
     * The UN-CHAINED durable discard: remove the key; if the native remove
     * fails, overwrite it with an explicit empty envelope through the SAME
     * write path `persistNow` uses, so a remove failure that does not also
     * break a plain write still ends with disk correctly empty rather than
     * stale. Callers must run this inside `runSerialized` (directly or via
     * `durableClear`) — on its own it would leave the serialized chain.
     *
     * Failing closed when it cannot prove the discard: before an owner is
     * resolved there is no owner for a fallback envelope — `ownerId: null`
     * fails the persisted-cart schema, so writing it would leave a payload
     * our own next restore rejects as corrupt. `clearFailed` is the honest
     * report, and the auth emergency path (kiosk namespace reset) is the
     * sanctioned handler for the stale data.
     */
    const rawDiscard = async (): Promise<StorageWriteResult> => {
      try {
        const removed = await backend.remove(STORAGE_KEY);
        if (removed.status === "persisted") return removed;

        if (get().ownerId === null) {
          log.warn(
            "Durable remove failed before any owner was resolved; skipping the ownerless fallback write",
          );
          return {
            status: "rejected",
            error: new Error(
              "durable remove failed and no owner is resolved to write an empty envelope",
            ),
          };
        }

        // `removeItem` failed. Fall back to overwriting the key with an
        // explicit empty envelope — a tiny payload through the SAME write
        // path `persistNow` uses, so a native remove failure that does not
        // also break a plain write still ends with disk correctly empty
        // rather than stale.
        const overwritten = await backend.write(STORAGE_KEY, emptyEnvelope());
        if (overwritten.status === "rejected") {
          // Both failed: the previous data is genuinely still on disk. There is
          // nothing more this store can do about it; the caller decides whether
          // to retry, warn, or refuse to proceed. NEVER report this as
          // `memoryOnly` — see the note on `PersistenceStatus` above.
          log.error("Failed to durably clear the persisted cart; stale data remains on disk", {
            storage: STORAGE_KEY,
          });
        }
        return overwritten;
      } catch (error) {
        // A backend that THROWS outright (JsonStorage never does) still comes
        // back as a result — `clear()` resolves, `reportPersistence` lands on
        // clearFailed, and T05's sign-out cleanup can branch on the outcome
        // instead of catching.
        return { status: "rejected", error: asError(error) };
      }
    };

    /** The discard as ONE serialized op — `clear()` and the restore share it. */
    const durableClear = (): Promise<StorageWriteResult> => runSerialized(rawDiscard);

    const reportPersistence = (result: StorageWriteResult) =>
      set({ persistence: result.status === "persisted" ? "persisted" : "clearFailed" });

    /** What ONE serialized restore op computed, applied to state OUTSIDE the op. */
    type RestoreOutcome =
      | { kind: "hit"; lines: CartLine[] }
      | { kind: "miss" }
      | { kind: "discarded"; writeResult: StorageWriteResult };

    /** The actual restore, run serialized by `hydrate`. */
    const restore = async (ownerId: string): Promise<void> => {
      // Idempotent for the SAME owner: a second hydrate is a no-op, never a
      // re-read.
      if (get().hydrated && get().ownerId === ownerId) return;

      // A DIFFERENT owner means the session switched: whatever is in memory
      // belongs to another profile — discard it before restoring for this one.
      // The ownerId is set synchronously, so a mutation racing the restore
      // passes persistNow's pre-owner guard — the read AND the mismatch
      // discard below are ONE serialized op precisely so that write lands
      // AFTER the whole restore, with the post-restore state, instead of
      // being wiped by the discard in between.
      set({ lines: [], ownerId, persistence: "unknown", hydrated: false });

      const outcome = await runSerialized(async (): Promise<RestoreOutcome> => {
        let result: StorageReadResult<PersistedCart>;
        try {
          result = await backend.read(STORAGE_KEY, (raw) => persistedCartSchema.parse(raw));
        } catch (error) {
          // A backend read that THROWS outright is the same hazard as a
          // rejected read (JsonStorage maps its own failures that way):
          // treat it as corrupt, never let hydrate() reject.
          result = { status: "rejected", error: asError(error) };
        }

        if (result.status === "hit" && result.value.ownerId === ownerId) {
          // This profile's own cart, lines and quantities intact (AC-02).
          return { kind: "hit", lines: result.value.lines };
        }

        if (result.status === "hit") {
          // Mismatched owner (AC-01): never surface another customer's cart —
          // discard the payload durably, INLINE, so the next cold start
          // cannot read it back either.
          log.warn("Persisted cart belongs to a different profile; discarding it durably");
          return { kind: "discarded", writeResult: await rawDiscard() };
        }

        if (result.status === "miss") {
          // Nothing persisted is normal on a fresh tablet — not a failure.
          return { kind: "miss" };
        }

        // Unreadable or schema-invalid payload (plan decision 9): on a shared
        // kiosk it may be a previous customer's cart, so clear it durably
        // rather than leaving it for the next cold start to trip over. Start
        // empty either way — startup must never crash on a corrupt blob.
        log.warn("Persisted cart was unreadable; starting empty and clearing it", {
          reason: result.error.message,
        });
        return { kind: "discarded", writeResult: await rawDiscard() };
      });

      // State updates never touch the backend — apply them OUTSIDE the op.
      if (outcome.kind === "hit") {
        set({ lines: outcome.lines, persistence: "persisted", hydrated: true });
        return;
      }

      if (outcome.kind === "miss") {
        set({ lines: [], persistence: "persisted", hydrated: true });
        return;
      }

      reportPersistence(outcome.writeResult);
      set({ hydrated: true });
    };

    const flush = async (): Promise<void> => {
      if (writeRunning) return;
      writeRunning = true;
      try {
        // Repeat until clean: while a write was running, later requests piled
        // up (the trailing part of the coalescing) and each one gets a pass.
        while (writeWaiters.length > 0) {
          // Claim the requests that arrived BEFORE this pass; anything pushed
          // during the await below belongs to the next pass — its state may be
          // newer than this snapshot.
          const claimed = writeWaiters;
          writeWaiters = [];

          // Eager capture: this pass's write covers the state as of the moment
          // the write is requested. If the serialized chain makes the actual
          // write wait behind another durable op, it still lands this
          // request-time envelope — and any clear enqueued after it runs
          // after it and empties the key. Waiter semantics are unchanged:
          // every waiter resolves with the result of the actual write that
          // flushed it.
          const envelope = currentEnvelope();

          let result: StorageWriteResult;
          try {
            result = await runSerialized(() => backend.write(STORAGE_KEY, envelope));
          } catch (error) {
            // Belt-and-braces symmetry with the hydration chain: JsonStorage
            // returns results and never throws, but if a durable op ever did,
            // the claimed waiters still get an honest rejection and the queue
            // keeps running — instead of stranding them and leaking an
            // unhandled rejection out of the fire-and-forget flush.
            result = { status: "rejected", error: asError(error) };
          }

          // Status precedence (docs/state-management.md: never report
          // clearFailed as memoryOnly): a FAILED write keeps a standing
          // clearFailed — the previous customer's data still on disk is the
          // bigger hazard — while a SUCCESSFUL write physically replaces
          // that stale payload, so clearing the warning is honest.
          if (result.status === "persisted") {
            set({ persistence: "persisted" });
          } else if (get().persistence === "clearFailed") {
            log.warn(
              "Cart write failed while the durable clear had also failed; keeping clearFailed",
              {
                reason: result.error.message,
              },
            );
          } else {
            log.warn("Cart saved in memory only", { reason: result.error.message });
            set({ persistence: "memoryOnly" });
          }

          for (const resolve of claimed) resolve(result);
        }
      } finally {
        writeRunning = false;
      }
    };

    return {
      lines: [],
      ownerId: null,
      persistence: "unknown",
      hydrated: false,

      hydrate: (ownerId: string): Promise<void> => {
        const run = () => restore(ownerId);
        const next = hydrationChain.then(run, run);
        hydrationChain = next;
        return next;
      },

      persistNow: (): Promise<StorageWriteResult> => {
        if (get().ownerId === null) {
          // No owner yet: the cart is not attributable to any profile, so
          // nothing is written — an ownerless envelope would fail the
          // persisted-cart schema on the next restore and be treated as
          // corrupt. This is a skip, not a storage failure: persistence stays
          // "unknown".
          log.warn("cart not attributable to an owner yet; write skipped");
          return Promise.resolve({
            status: "rejected",
            error: new Error("Cart owner is not resolved; nothing was persisted"),
          });
        }
        // Enqueue: this resolves when the write that covers this request
        // settles, with that write's result.
        const whenFlushed = new Promise<StorageWriteResult>((resolve) => {
          writeWaiters.push(resolve);
        });
        void flush();
        return whenFlushed;
      },

      async clear() {
        // The customer in front of the tablet right now sees an empty state
        // immediately, regardless of what happens on disk below. The owner is
        // kept: clearing the cart is not a profile switch.
        set({ lines: [] });

        const result = await durableClear();
        reportPersistence(result);
        return result;
      },
    };
  });
}

export const useCartStore = createCartStore();
