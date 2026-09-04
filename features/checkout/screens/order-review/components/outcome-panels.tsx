import { ScrollView } from "react-native";

import { Alert } from "@/components/ui";
import type { CartLine } from "@/features/cart";

import type { AttemptFailure, StockConflictItem } from "../../../state/attempt-store";

import { ConflictRow } from "../../../components/conflict-row";

/**
 * The review screen's OUTCOME panels (T09, AC-08/AC-09/AC-10) — screen-local
 * by ownership: exactly one screen consumes them, so they live under that
 * screen's `components/` (the design-system scope rule), never in the
 * feature's shared `components/` or the app-wide design system.
 *
 * ONE combined file for the three panels (the task's documented option):
 * they are the three outcome branches of the SAME submission, share one
 * presentation grammar (an honest `Alert`, plus the conflict's joined rows),
 * and are rendered from the same store selectors — one file keeps the whole
 * outcome story readable in one place.
 *
 * What these panels deliberately do NOT do:
 * - No store access: the screen subscribes (per-field selectors, plan D8)
 *   and passes PLAIN DATA; these components render state, they never drive
 *   it. A panel that could flip a phase could race the machine.
 * - No navigation and no actions: the phase-swapped footer buttons stay in
 *   the screen, bound to its own handlers (router pushes, the confirm flow,
 *   the store's replay action). Threading four callbacks here to wrap two
 *   `Button`s would be ceremony without a failure mode it prevents.
 * - No cart mutation and no auto-retry: a conflict row is DISPLAY data
 *   (AC-08), and the unknown/failure panels never retry on their own
 *   (AC-09/AC-10 — retry is the customer's explicit press, through the
 *   screen's own confirm/replay paths).
 */

/**
 * The stock-conflict panel (AC-08, plan D9 as scoped for T09): the honest
 * warning, then one row per conflict entry joined to the cart's display data
 * — the join the plan calls for, with the live lines as the join context.
 *
 * WHY live lines and not the attempt record's captured snapshots, though the
 * plan's original wording said "captured snapshots": the definite conflict
 * outcome DISCARDS the attempt record at resolve (D1 — a definite outcome
 * has no recovery value), so by the time this panel renders there IS no
 * capture to read from; and the cart was interaction-locked for the whole
 * flight, so the lines are provably the ones that were submitted. The join
 * cannot show anything the customer did not confirm. No mutation, ever.
 *
 * Bounded like the review rows it replaces (conflicts ≤ distinct variants ≤
 * 100): a plain ScrollView, no virtualization — a virtualizer would add
 * measurement complexity for no gain at this size.
 */
export function StockConflictPanel({
  conflicts,
  lines,
}: {
  /** The store's conflict payload — exactly the wire shape create_order returns. */
  conflicts: StockConflictItem[];
  /** The live cart lines the screen already renders — the join context. */
  lines: CartLine[];
}) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 py-4">
      <Alert
        variant="warning"
        title="Some items aren't available in the requested quantities"
        description="No order was submitted, and your cart wasn't changed. Return to your cart to adjust the quantities."
      />
      {conflicts.map((entry) => (
        <ConflictRow key={entry.variant_id} entry={entry} lines={lines} />
      ))}
    </ScrollView>
  );
}

/**
 * One conflict row: the product display name (and each matching line's
 * variant/options caption) with the requested/available pair. The quantities
 * are words AND numbers — never colour alone — because the pair IS the
 * message: a customer standing at a kiosk needs to read "you asked for 2,
 * there is 1".
 */

/**
 * The unknown-result panel's alert (AC-09): deliberately a WARNING, not a
 * destructive presentation — the order may already exist, and the offered
 * action (the footer's Check Again) replays the SAME idempotency identity,
 * so the copy promises exactly what the machine does: a safe check, never a
 * duplicate submission. Distinct from the failure panel by construction
 * ("unknown panel ≠ error panel").
 */
export function UnknownOutcomePanel() {
  return (
    <Alert
      variant="warning"
      title="We couldn't confirm whether your order went through"
      description="It may already exist — we'll check safely without submitting a duplicate."
    />
  );
}

/**
 * The definite-failure panel's alert (AC-10): destructive, rendering the
 * store's `failure.userMessage` — the AppError boundary already produced a
 * message that is safe and specific for a customer, so this panel never
 * re-words it and never shows `technicalMessage`.
 *
 * The failure KIND surfaces through behaviour, not text: `retryable` decides
 * the footer's Try Again affordance (a K1003 idempotency conflict is
 * non-retryable and never re-minted — D11), and kinds are staff vocabulary,
 * not customer copy.
 */
export function FailureOutcomePanel({ failure }: { failure: AttemptFailure }) {
  return (
    <Alert
      variant="destructive"
      title="Your order didn't go through"
      description={failure.userMessage}
    />
  );
}
