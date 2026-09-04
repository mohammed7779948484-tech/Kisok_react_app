import { registerSignOutCleanup, registerSignOutGuard, type SignOutGuardResult } from "@/core/auth";

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
 * WHY a LIVE submission blocks, in both its shapes (R2-01(a)): an UNRESOLVED
 * record (the outcome is still ambiguous — wiping it is the duplicate-order
 * hazard above) OR phase `submitting` (a submission in flight RIGHT NOW,
 * including the prepare-mint window where the durable write has started but
 * the record is not yet in memory — `applyPrepare` sets the phase
 * synchronously BEFORE the write precisely so this guard can see it with
 * zero race). One reason string covers both, deliberately: the documented
 * contract text is accurate for a submission in flight and for one whose
 * outcome is unknown. A CONFIRMED record (even with cleanup still pending)
 * does NOT block sign-out: the order is already server-confirmed, so
 * discarding the record on sign-out loses nothing a replay would need —
 * there is nothing left to replay. The confirmed-with-unsafe-cleanup case is
 * the SUCCESS flow's business, owned in-session by the reset gate
 * (AC-11/AC-14: block Next Customer, retry the clear); making it a sign-out
 * concern would conflate "the tablet is unsafe to hand over" with "this
 * customer's success screen cannot reset yet".
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
 * WHY it drives the store's `clearForSignOut` (mirroring how the cart's
 * cleanup drives the cart store's `clear()`): `resetForNextCustomer` is
 * GATED (confirmed + cleanup done) — the Next-Customer reset it serves must
 * refuse while the attempt is unresolved or cleanup unsafe — so sign-out
 * needs the store's UNGATED wipe action. `clearForSignOut` chain-enqueues
 * its remove on the store's serialized durable-op chain and resets the full
 * in-memory envelope itself, so the wipe can never be INTERLEAVED with an
 * in-flight prepare write or recover read: the remove runs strictly after
 * every earlier-enqueued op, and it can no longer destroy an unresolved
 * identity mid-flight the way the old raw `storage.remove` did (R2-01
 * closed — and the post-confirm tail interleaving that raw remove also
 * admitted, a tracker write resurrecting the confirmed record after the
 * remove, is gone for the same reason).
 */

// The exact reason text is contract (`docs/state-management.md`'s motivating
// example): the sign-out UI surfaces it verbatim. Accurate for BOTH blocking
// shapes — an unresolved record and a live in-flight submission.
const UNRESOLVED_BLOCK_REASON = "An order submission is still unresolved.";

/**
 * Exported for its TEST ONLY (sign-out-cleanup.test.ts drives it directly to
 * pin the throw and the envelope reset the store's action applies). T12/T13
 * must NOT re-export it from `features/checkout/index.ts` — the registration
 * side-effect below is this module's live surface; callers go through
 * `runSignOutCleanup()`.
 */
export const clearCheckoutForSignOut = async (): Promise<void> => {
  // Chain-enqueued through the store: if a durable op is in flight (a
  // prepare write, a recover read), the wipe WAITS for it instead of racing
  // it, and the store resets the in-memory envelope itself on BOTH the
  // success and the rejection path, BEFORE any throw can propagate.
  const removed = await useAttemptStore.getState().clearForSignOut();
  if (removed.status === "rejected") {
    // The store's clearForSignOut has already reset the memory envelope (the
    // cart's H-F02 precedent): once this failure propagates, core/auth's
    // emergency wipe owns DISK, but nothing after the throw would ever reset
    // MEMORY — a stale record would block the NEXT session's sign-out for
    // the previous customer's attempt.
    // Propagate: runSignOutCleanup records the failure and core/auth's
    // emergency kisok:* namespace reset runs. Swallowing it here would leave
    // the previous customer's attempt record on disk with no one to clear
    // it.
    throw new Error(
      `Checkout sign-out cleanup could not durably clear the attempt record: ${removed.error.message}`,
    );
  }
};

/**
 * The guard: side-effect-free by contract — reads `useAttemptStore.getState()`
 * ONLY. It never writes, clears, or removes anything. Blocks on a LIVE
 * submission in either shape (see the module doc): an unresolved record, or
 * phase "submitting".
 */
const runCheckoutSignOutGuard = (): SignOutGuardResult => {
  const { record, phase } = useAttemptStore.getState();
  return record?.status === "unresolved" || phase === "submitting"
    ? { status: "blocked", reason: UNRESOLVED_BLOCK_REASON }
    : { status: "ok" };
};

// Registration happens at import (plan decision 10 / D7, the cart index
// precedent): the feature's public API (`features/checkout/index.ts`) imports
// this module, so loading the feature makes the guard + cleanup live — the
// customer layout's module load (D7) is what registers them in production.
registerSignOutGuard({ name: "checkout", run: runCheckoutSignOutGuard });
registerSignOutCleanup({ name: "checkout-cleanup", run: clearCheckoutForSignOut });
