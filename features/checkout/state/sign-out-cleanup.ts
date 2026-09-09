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
 * WHAT blocks sign-out, in refusal order (R5-T04 — the guard is the
 * fail-closed AUTHORITY for sign-out safety, so every shape below is one it
 * refuses, never one it guesses about):
 *
 * - `recordLoaded === false` (F-01) — the session's first durable read has
 *   not completed, and disk may still hold a record left by a prior session
 *   of this tablet that THIS session has never seen. Blocked with its OWN
 *   reason (see the constants below).
 * - The unresolved family (F-01's post-read truth): an UNRESOLVED record
 *   (the outcome is still ambiguous — wiping it is the duplicate-order
 *   hazard above) or phase `submitting` (a submission in flight RIGHT NOW,
 *   including the prepare-mint window where the durable write has started
 *   but the record is not yet in memory — `applyPrepare` sets the phase
 *   synchronously BEFORE the write precisely so this guard can see it with
 *   zero race) → the contract reason text.
 * - The STAFF-HOLD family (F-04/F-05): a HELD record or phase `held` (the
 *   K1003 hold — wiping the held record lets the same customer re-sign-in,
 *   rebuild the request, and mint a fresh identity: F-04's duplicate via
 *   sign-out) and phase `unsafe-recovery` or a non-null `unsafeHold` (the
 *   F-05 evidence hold — corrupt/foreign records are held precisely because
 *   deleting them enables duplicate orders or destroys evidence) → the
 *   staff-attention reason. These holds have NO client-side exit by design
 *   (not sign-out, not reset, not a new submission): staff clear the stored
 *   attempt, or a newer build resolves it — the fail-closed trade the R5
 *   remediation made deliberately, accepting a staff call for the rare
 *   case the server proved an order conflicts. A CONFIRMED
 *   record (even with cleanup still pending) does NOT block sign-out: the
 *   order is already server-confirmed, so discarding the record on sign-out
 *   loses nothing a replay would need — there is nothing left to replay.
 *   The confirmed-with-unsafe-cleanup case is the SUCCESS flow's business,
 *   owned in-session by the reset gate (AC-11/AC-14: block Next Customer,
 *   retry the clear); making it a sign-out concern would conflate "the
 *   tablet is unsafe to hand over" with "this customer's success screen
 *   cannot reset yet".
 *
 * CLOSED, honestly (R5-T04): the guard fails closed while
 * `recordLoaded === false` because disk may hold an unresolved attempt
 * this session has never seen — approving would let the sign-out wipe
 * destroy its idempotency identity (F-01). The recovery-gate composition
 * (plan D7, T12) still owns RUNNING the durable read at session start; the
 * guard now WAITS for that read's truth instead of guessing, and still
 * reads memory only — `recordLoaded` IS the gate's landed truth, so a
 * guard that read DISK itself would duplicate the gate's job and turn the
 * side-effect-free decision into IO.
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
// example): the sign-out UI surfaces it verbatim. Accurate for the unresolved
// shapes — an unresolved record and a live in-flight submission. The held and
// unsafe-recovery shapes get their OWN reason below (they are not unresolved —
// they are staff-attention holds).
const UNRESOLVED_BLOCK_REASON = "An order submission is still unresolved.";

/**
 * The recovery-pending sibling (R5-T04, F-01): while `recordLoaded === false`
 * the honest statement is not that a submission IS unresolved but that this
 * tablet has not finished CHECKING for one — approving on the strength of
 * empty memory would be exactly the F-01 guess. Accurate ONLY for the
 * pending-read shape, which is why it is a separate constant rather than a
 * reuse of the contract text above.
 */
const RECOVERY_PENDING_BLOCK_REASON =
  "We're still checking this tablet for an unfinished order submission.";

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
 * The staff-attention sibling (R5-T04 remediation): a HELD record (the
 * server PROVED an order exists for this identity — not "unresolved") or an
 * F-05 evidence hold blocks sign-out because wiping the hold's record is
 * exactly the destructive act the hold exists to prevent. The honest
 * statement for these shapes is that the tablet needs a human — the hold
 * has no client-side exit: not sign-out (blocked here), not reset (the gate
 * requires confirmed), not a new submission (prepare refuses). Staff clear
 * the stored attempt (or a newer build resolves it) — that is the R5 design's
 * deliberate trade: fail closed, never guess, accept that a shared kiosk
 * needs staff for the rare case the server proved an order conflicts.
 */
const STAFF_HOLD_BLOCK_REASON = "This tablet needs staff help before signing out.";

/**
 * The guard: side-effect-free by contract — reads `useAttemptStore.getState()`
 * ONLY. It never writes, clears, or removes anything. Fails closed FIRST on
 * the unknown: `recordLoaded === false` → blocked with the recovery-pending
 * reason (F-01 — disk truth has not landed this session). Then blocks on
 * the unresolved family — an unresolved record or phase "submitting"
 * (F-01's post-read truth) → the unresolved-family reason — and on the
 * STAFF-HOLD family — a held record/phase or an unsafe-recovery hold
 * (F-04/F-05) → the staff-attention reason. Only a session that has READ
 * the durable truth and holds none of those shapes approves.
 */
const runCheckoutSignOutGuard = (): SignOutGuardResult => {
  const { record, phase, recordLoaded, unsafeHold } = useAttemptStore.getState();
  if (!recordLoaded) {
    return { status: "blocked", reason: RECOVERY_PENDING_BLOCK_REASON };
  }
  if (
    record?.status === "held" ||
    phase === "held" ||
    phase === "unsafe-recovery" ||
    unsafeHold !== null
  ) {
    return { status: "blocked", reason: STAFF_HOLD_BLOCK_REASON };
  }
  if (record?.status === "unresolved" || phase === "submitting") {
    return { status: "blocked", reason: UNRESOLVED_BLOCK_REASON };
  }
  return { status: "ok" };
};

// Registration happens at import (plan decision 10 / D7, the cart index
// precedent): the feature's public API (`features/checkout/index.ts`) imports
// this module, so loading the feature makes the guard + cleanup live — the
// customer layout's module load (D7) is what registers them in production.
registerSignOutGuard({ name: "checkout", run: runCheckoutSignOutGuard });
registerSignOutCleanup({ name: "checkout-cleanup", run: clearCheckoutForSignOut });
