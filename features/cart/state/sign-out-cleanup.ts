import { registerSignOutCleanup } from "@/core/auth";

import { useCartStore } from "./cart-store";

/**
 * The cart's sign-out cleanup (AC-07) — registered, not exported.
 *
 * WHY a cleanup at all: on a shared store tablet a Supabase session can be
 * gone while the previous customer's cart still sits in memory and on disk
 * (`docs/state-management.md`, Phase 3). The tablet is only safe for the next
 * customer once every feature proves its own state is gone, so the cart
 * registers a destructive cleanup task with `core/auth`'s public registry —
 * it runs only after sign-out has been approved and the session removed.
 *
 * WHY it THROWS on a failed durable clear instead of swallowing:
 * `runSignOutCleanup` records the failure, and `core/auth`'s emergency
 * fallback then wipes the whole `kisok:*` storage namespace
 * (`finishSignOutHandoff` → `clearKisokStorage`). Swallowing the rejection
 * here would leave the previous customer's cart durably on disk with no one
 * left to clear it.
 *
 * WHY the cart registers NO sign-out guard: a guard exists for ONE invariant
 * — an unresolved checkout attempt must not be wiped — and that belongs to
 * future Checkout, never to the cart (`core/auth/sign-out.ts`, the
 * `SignOutGuard` contract, and "Never combine guards and cleanup"). The cart
 * has nothing sign-out must wait for, so it must never be able to block one.
 *
 * The session envelope reset PRECEDES the throw (H-F02). On a failed durable
 * clear the reset is the COMPLETE session-scoped envelope —
 * `locked: false, ownerId: null, hydrated: false, persistence: "unknown"` —
 * applied after `clear()` resolves (lines are already `[]` from its
 * synchronous set) and before the rejection propagates. The auth pipeline's
 * emergency wipe (`finishSignOutHandoff` → `clearKisokStorage`) makes DISK
 * clean, but nothing after the throw would ever reset MEMORY: without the
 * pre-throw reset the stale envelope survives the whole cycle — a stale
 * `locked` silently no-ops the next session's mutations (R-T04-01), a stale
 * `clearFailed` warns about data the emergency wipe already removed, and a
 * stale `ownerId`/`hydrated` lets `restore()`'s same-owner hydrate shortcut
 * no-op, so the SAME customer's next sign-in inherits the stale state. With
 * `hydrated === false` the shortcut is unreachable with stale state: the
 * next hydrate runs a REAL restore against the emergency-wiped disk —
 * empty, unlocked, coherent.
 *
 * On the success path the reset stays minimal (`locked` only): `clear()`
 * proved the durable wipe, `persistence` keeps its honest `persisted` for
 * the cart surfaces, and the next session's `hydrate()` owns the rest — a
 * different owner through its owner-switch reset, the same owner through a
 * shortcut that is now provably non-stale.
 */
/**
 * Exported for its TEST ONLY (sign-out-cleanup.test.ts drives it directly to
 * pin the throw and the memory reset). T10 must NOT re-export it from
 * `features/cart/index.ts` — the registration side-effect below is this
 * module's live surface; callers go through `runSignOutCleanup()`.
 */
export const clearCartForSignOut = async (): Promise<void> => {
  const store = useCartStore.getState();
  const result = await store.clear();
  if (result.status === "rejected") {
    // The session envelope reset comes BEFORE the throw (H-F02): once the
    // failure propagates, core/auth's emergency kisok:* namespace reset owns
    // DISK, but nothing else would ever reset MEMORY. Without this, the
    // stale envelope survives the whole cycle — a stale lock no-ops the next
    // session's mutations (R-T04-01), a stale clearFailed warns about data
    // that no longer exists, and a stale ownerId/hydrated lets restore()'s
    // same-owner shortcut no-op the re-hydrate. Lines are already [] from
    // clear()'s synchronous set; `hydrated === false` then forces the next
    // hydrate to run a real restore against the emergency-wiped disk.
    useCartStore.setState({
      locked: false,
      ownerId: null,
      hydrated: false,
      persistence: "unknown",
    });
    // Propagate: runSignOutCleanup records the failure and core/auth's
    // emergency kisok:* namespace reset runs. Swallowing it here would leave
    // the previous customer's cart on disk with no one left to clear it.
    throw new Error(
      `Cart sign-out cleanup could not durably clear the cart: ${result.error.message}`,
    );
  }
  // Success path: clear() proved the durable wipe and already reported the
  // honest `persisted`, so only the lock needs resetting — a stale lock must
  // never silently no-op the next customer's mutations (R-T04-01).
  useCartStore.setState({ locked: false });
};

// Registration happens at import (plan decision 10): the feature's public API
// (`features/cart/index.ts`, T10) imports this module, so loading the feature
// makes the cleanup live. `clearCartForSignOut` above is exported for its test
// only — the registration side-effect is this module's public surface.
registerSignOutCleanup({ name: "cart", run: clearCartForSignOut });
