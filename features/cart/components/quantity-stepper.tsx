import { QuantityStepper as QuantityStepperControl } from "@/design-system";

import { MIN_LINE_QUANTITY, MAX_LINE_QUANTITY } from "../model/cart-line.schema";

/**
 * The cart's quantity control: the design system's `QuantityStepper` with the
 * cart's own bounds applied. Presentational only: it receives a quantity and
 * reports the next one upward.
 *
 * Scope: shared across the cart feature — every cart surface's quantity
 * control. The visual control and its accessibility contract live in the
 * design system; the bounds — which are cart rules — live here.
 *
 * It must not fetch, must not read a store, and must not import the Supabase
 * client. Keeping it controlled and dumb is what makes it testable without a
 * provider tree and reusable across the quick sheet and the Full Cart screen.
 *
 * Accessibility contract (AC-12): both buttons are icon-only, so their
 * `accessibilityLabel` ("Increase quantity" / "Decrease quantity") IS the
 * accessible name; the value is announced politely through
 * `accessibilityLiveRegion` with an explicit `Quantity: N` label so a screen
 * reader says what changed, not just a bare number; bounds are expressed as
 * disabled accessibility state, never as ignored taps. Both buttons keep the
 * 48dp touch target.
 */
export type QuantityStepperProps = {
  /** Current quantity. Controlled: the stepper never stores this locally. */
  value: number;
  /**
   * Inclusive lower bound. Defaults to the model's MIN_LINE_QUANTITY (1) — the
   * domain minimum (AC-04: decrement is disabled at 1; removal is always the
   * separate remove action).
   */
  min?: number;
  /**
   * Inclusive upper bound. Defaults to the model's UX guard `MAX_LINE_QUANTITY`
   * (99): a UI affordance, not a domain invariant — the single literal lives in
   * the schema (plan design decision 7), and the server still validates at
   * order time.
   */
  max?: number;
  /**
   * Units of this item already in the cart line. The line cap then leaves
   * room only for the rest, so a picker adding to an existing line can never
   * offer more than the line may hold.
   */
  reserved?: number;
  /** Reports the next quantity from an enabled button press. */
  onValueChange: (next: number) => void;
  /** Disables the whole control (e.g. a locked cart) for both buttons. */
  disabled?: boolean;
  /** `inverse` draws the control for an evergreen panel. */
  tone?: "default" | "inverse";
  className?: string;
};

export function QuantityStepper({
  min = MIN_LINE_QUANTITY,
  max = MAX_LINE_QUANTITY,
  reserved = 0,
  ...props
}: QuantityStepperProps) {
  // A caller's bound (stock, say) never lifts the line cap, and units already
  // in the line count against it. Never below `min`, so the control stays valid.
  const bound = Math.max(min, Math.min(max, MAX_LINE_QUANTITY - reserved));
  // The control fails safe on a non-finite value (displays and emits `min`),
  // mirroring the domain layer (cart-rules.ts) — R-T06-01.
  return <QuantityStepperControl min={min} max={bound} {...props} />;
}
