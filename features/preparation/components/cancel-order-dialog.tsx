import { ConfirmDialog } from "@/components/feedback";

/**
 * AC-06's destructive confirmation for cancelling an order: it composes the
 * shared {@link ConfirmDialog} ("cancel an order" is that primitive's own
 * documented use case) instead of re-implementing a dialog.
 *
 * Presentational only: it receives data and reports interactions upward.
 * The screen owns `open`, the cancel mutation (T05), and the
 * rejected-transition refresh (T05-R02) — this dialog reports the employee's
 * decision upward and renders the busy state it is given. It must not fetch,
 * must not read a store, and must not import the Supabase client. Keeping
 * components dumb is what makes them testable without a provider tree and
 * reusable across screens.
 *
 * Copy (plan decision 4 — no reason capture; the RPC's `reason` stays at its
 * null default): the title names the target order, the description states
 * what cancelling DOES (items return to stock) and that it cannot be undone.
 * The dismiss button is "Keep order", not "Cancel" — a Cancel button inside a
 * cancel dialog is ambiguous about which meaning of the word applies.
 *
 * Scope: shared across the preparation feature.
 */
export type CancelOrderDialogProps = {
  /** The screen's open state — the screen opens it and closes it (on success). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order to cancel; `null` renders nothing — a dialog with no target has nothing to confirm. */
  order: { display_number: string } | null;
  /**
   * The screen's cancel handler — the dialog never calls the mutation itself.
   * Fired with the order, never the press event.
   *
   * The argument is the display echo of the target order, NOT the full row —
   * screens close over the selected row (which carries the order_id the
   * mutation needs); the narrow shape is deliberate (the dialog only ever
   * needs the number).
   */
  onCancelOrder: (order: { display_number: string }) => void;
  /** The pending cancel mutation — passes through to ConfirmDialog's busy. */
  busy?: boolean;
};

export function CancelOrderDialog({
  open,
  onOpenChange,
  order,
  onCancelOrder,
  busy = false,
}: CancelOrderDialogProps) {
  // The screen controls `open`; the dialog is only meaningful with a target.
  if (!open || !order) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancel order ${order.display_number}?`}
      description="This cancels the order and returns its items to stock. This cannot be undone."
      confirmLabel="Cancel order"
      cancelLabel="Keep order"
      // Always destructive — the action removes an order; the colour is the
      // only warning an employee gets before committing.
      destructive
      busy={busy}
      onConfirm={() => onCancelOrder(order)}
    />
  );
}
