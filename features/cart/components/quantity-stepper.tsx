import { Minus, Plus } from "lucide-react-native";
import { View } from "react-native";

import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import { MIN_LINE_QUANTITY, MAX_LINE_QUANTITY } from "../model/cart-line.schema";

/**
 * Presentational only: it receives a quantity and reports the next one upward.
 *
 * Scope: shared across the cart feature — every cart surface's quantity
 * control. Ownership follows the nearest stable consumer — move it up only
 * when a second consumer actually appears, not in anticipation of one.
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
 * 48dp `size="icon"` touch target.
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
  /** Reports the next quantity from an enabled button press. */
  onValueChange: (next: number) => void;
  /** Disables the whole control (e.g. a locked cart) for both buttons. */
  disabled?: boolean;
  className?: string;
};

export function QuantityStepper({
  value,
  min = MIN_LINE_QUANTITY,
  max = MAX_LINE_QUANTITY,
  onValueChange,
  disabled = false,
  className,
}: QuantityStepperProps) {
  // Non-finite value is a caller bug: fail safe to min for display, disabled
  // logic, and emission — mirroring the domain layer (cart-rules.ts), so the
  // control can never render or emit NaN/±Infinity (R-T06-01).
  const safeValue = Number.isFinite(value) ? value : min;

  const decrement = () => {
    // Clamp defensively so a stray re-render can never emit an out-of-bounds value.
    const next = Math.max(min, safeValue - 1);
    if (next !== safeValue) onValueChange(next);
  };

  const increment = () => {
    const next = Math.min(max, safeValue + 1);
    if (next !== safeValue) onValueChange(next);
  };

  return (
    <View className={cn("flex-row items-center gap-2", className)}>
      <Button
        variant="outline"
        size="icon"
        accessibilityLabel="Decrease quantity"
        disabled={disabled || safeValue <= min}
        onPress={decrement}
      >
        <Icon as={Minus} />
      </Button>
      <Text
        variant="body"
        accessibilityLabel={`Quantity: ${safeValue}`}
        accessibilityLiveRegion="polite"
      >
        {safeValue}
      </Text>
      <Button
        variant="outline"
        size="icon"
        accessibilityLabel="Increase quantity"
        disabled={disabled || safeValue >= max}
        onPress={increment}
      >
        <Icon as={Plus} />
      </Button>
    </View>
  );
}
