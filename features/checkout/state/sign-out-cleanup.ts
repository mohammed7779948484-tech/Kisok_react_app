import { registerSignOutCleanup, registerSignOutGuard, type SignOutGuardResult } from "@/core/auth";
import { storage, storageKey } from "@/core/storage";

import { useAttemptStore } from "./attempt-store";

/**
 * Checkout's sign-out guard + destructive cleanup (AC-12) — registered at
 * import, never consumed directly.
 *
 * WHY a guard at all (the hard KISOK invariant, `core/auth/sign-out.ts`): if
 * a checkout attempt's outcome is still AMBIGUOUS, wiping its idempotency
 * metadata could cause a duplicate order — the next submission would mint a
 * fresh `client_request_id` while the first may have landed server-side. The
 * guard DECIDES that sign-out must wait; it never destroys anything itself
 * (`docs/state-management.md` Phase 1: guards decide, they do not mutate).
 *
 * WHY only `unresolved` blocks — a deliberate scoping decision: `unresolved`
 * is the one state where wiping creates duplicate-order risk. A CONFIRMED
 * record (even with cleanup still pending) does NOT block sign-out: the
 * order is already server-confirmed, so discarding the record on sign-out
 * loses nothing a replay would need — there is nothing left to replay. The
 * confirmed-with-unsafe-cleanup case is the SUCCESS flow's business, owned
 * in-session by the reset gate (AC-11/AC-14: block Next Customer, retry the
 * clear); making it a sign-out concern would conflate "the tablet is unsafe
 * to hand over" with "this customer's success screen cannot reset yet".
 *
 * EDGE TIMING, honestly: the guard reads the IN-MEMORY record
 * (`useAttemptStore.getState()`), which may not reflect disk yet if recovery
 * has not run this session (`recordLoaded === false`) — until recovery's read
 * lands, disk may still hold a record left by a prior session of this tablet
 * while memory shows `record: null`, and the guard would approve. That
 * residual window is real and is not closed here: the recovery-gate
 * composition (plan D7, T12) owns closing it at session start — and a guard
 * that read DISK would duplicate that job and turn the side-effect-free
 * decision into IO.
 *
 * WHY the cleanup is a separate task, and why it THROWS on a failed durable
 * clear: the guard and the wipe must never be one function (core/auth: a
 * combined task would make the safety property depend on registration
 * order). The cleanup runs only after every guard approved and the session
 * is gone, so an UNRESOLVED attempt can never be wiped by it in a legal
 * flow — the guard above is exactly what blocks that. On a rejected remove
 * it THROWS (the cart precedent) so `runSignOutCleanup` records the failure
 * and core/auth's emergency `clearKisokStorage` wipe owns disk — swallowing
 * it would leave the previous customer's attempt record durably on disk with
 * no one left to clear it.
 *
 * WHY its own `storage.remove` instead of the store's `resetForNextCustomer`:
 * that action is GATED (confirmed + cleanup done) — the Next-Customer reset
 * it serves must refuse while the attempt is unresolved or cleanup unsafe.
 * Sign-out needs an UNGATED durable wipe, so the cleanup removes the key
 * directly and then resets the in-memory envelope itself, mirroring how the
 * cart's cleanup drives its store's `clear()` (the attempt store has no
 * ungated clear action to drive).
 *
 * KNOWN INTERLEAVING, accepted: the raw remove deliberately does NOT enqueue
 * on the store's serialized durable-op chain, so a sign-out landing in the
 * post-confirm tail of `resolveSuccess` can have the store's later tracker
 * write land AFTER this remove, resurrecting the confirmed record on disk.
 * The harm is bounded and the trade accepted: a CONFIRMED record is never
 * replayed, so a resurrected one carries no duplicate-order risk, and the
 * next session's `recover()` self-heals it (the foreign-owner discard
 * removes it; a same-owner confirmed flow resolves it through the success
 * path).
 */

// Plan decision D1: the ONE durable record this feature owns. The cleanup
// must wipe exactly this key.
const ATTEMPT_KEY = storageKey("checkout", "attempt");

// The exact reason text is contract (`docs/state-management.md`'s motivating
// example): the sign-out UI surfaces it verbatim.
const UNRESOLVED_BLOCK_REASON = "An order submission is still unresolved.";

/**
 * Reset the in-memory envelope after the durable wipe. `recordLoaded: false`
 * is deliberate: the next session's `recover()` must run a REAL read against
 * whatever disk holds then — never a shortcut on pre-sign-out memory. On the
 * failure path `persistence` is "unknown", not "clearFailed": after the
 * throw, core/auth's emergency wipe owns disk, and a stale `clearFailed`
 * would keep warning about data that may already be gone (the cart's H-F02
 * reasoning); "unknown" forces the next `recover()` to find out.
 */
const resetAttemptEnvelope = (persistence: "persisted" | "unknown") => {
  useAttemptStore.setState({
    record: null,
    recordLoaded: false,
    phase: "idle",
    conflict: null,
    failure: null,
    persistence,
  });
};

/**
 * Exported for its TEST ONLY (sign-out-cleanup.test.ts drives it directly to
 * pin the throw and the memory reset). T12/T13 must NOT re-export it from
 * `features/checkout/index.ts` — the registration side-effect below is this
 * module's live surface; callers go through `runSignOutCleanup()`.
 */
export const clearCheckoutForSignOut = async (): Promise<void> => {
  const removed = await storage.remove(ATTEMPT_KEY);
  if (removed.status === "rejected") {
    // The memory reset comes BEFORE the throw (the cart's H-F02 precedent):
    // once the failure propagates, core/auth's emergency wipe owns DISK, but
    // nothing after the throw would ever reset MEMORY — a stale record would
    // block the NEXT session's sign-out for the previous customer's attempt,
    // and a stale phase/persistence would misreport state the wipe erased.
    resetAttemptEnvelope("unknown");
    // Propagate: runSignOutCleanup records the failure and core/auth's
    // emergency kisok:* namespace reset runs. Swallowing it here would leave
    // the previous customer's attempt record on disk with no one to clear it.
    throw new Error(
      `Checkout sign-out cleanup could not durably clear the attempt record: ${removed.error.message}`,
    );
  }
  // Success: the remove proved the durable wipe — mirror the store's own
  // discard-success semantics ("persisted"), the honest status for surfaces.
  resetAttemptEnvelope("persisted");
};

/**
 * The guard: side-effect-free by contract — reads `useAttemptStore.getState()`
 * ONLY. It never writes, clears, or removes anything.
 */
const runCheckoutSignOutGuard = (): SignOutGuardResult => {
  const { record } = useAttemptStore.getState();
  return record?.status === "unresolved"
    ? { status: "blocked", reason: UNRESOLVED_BLOCK_REASON }
    : { status: "ok" };
};

// Registration happens at import (plan decision 10 / D7, the cart index
// precedent): the feature's public API (`features/checkout/index.ts`) imports
// this module, so loading the feature makes the guard + cleanup live — the
// customer layout's module load (D7) is what registers them in production.
registerSignOutGuard({ name: "checkout", run: runCheckoutSignOutGuard });
registerSignOutCleanup({ name: "checkout-cleanup", run: clearCheckoutForSignOut });
