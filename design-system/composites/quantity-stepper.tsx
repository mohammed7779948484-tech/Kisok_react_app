import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

export type QuantityStepperProps = {
  /** Current quantity. Controlled: the stepper never stores this locally. */
  value: number;
  /** Inclusive lower bound. */
  min: number;
  /**
   * Inclusive upper bound. Omit when the caller has no authoritative limit —
   * the control then never blocks increment on its own.
   */
  max?: number;
  onValueChange: (next: number) => void;
  disabled?: boolean;
  /** `inverse` draws the control for an evergreen panel. */
  tone?: "default" | "inverse";
  className?: string;
};

/**
 * Value, bounds and events — nothing else. Which bounds apply (a cart limit,
 * a stock limit) is the caller's decision, never this component's.
 */
export function QuantityStepper({
  value,
  min,
  max,
  onValueChange,
  disabled = false,
  tone = "default",
  className,
}: QuantityStepperProps) {
  const safeValue = Number.isFinite(value) ? value : min;
  const canDecrement = !disabled && safeValue > min;
  const canIncrement = !disabled && (max === undefined || safeValue < max);
  const inverse = tone === "inverse";

  const step = (delta: number) => {
    const next = safeValue + delta;
    const bounded = Math.max(min, max === undefined ? next : Math.min(max, next));
    if (bounded !== safeValue) onValueChange(bounded);
  };

  const buttonClass = cn(
    "h-touch w-touch items-center justify-center rounded-md",
    inverse ? "active:bg-primary-foreground/10" : "active:bg-muted",
  );
  const iconClass = inverse ? "text-primary-foreground" : "text-foreground";

  return (
    <View
      className={cn(
        "h-control flex-row items-center justify-between rounded-md border px-0.5",
        inverse ? "border-primary-foreground/20" : "border-border bg-card",
        className,
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        accessibilityState={{ disabled: !canDecrement }}
        disabled={!canDecrement}
        onPress={() => step(-1)}
        className={cn(buttonClass, !canDecrement && "opacity-30")}
      >
        <Icon as={Minus} size={16} className={iconClass} />
      </Pressable>
      <Text
        className={cn(
          "min-w-9 text-center font-display-semibold text-title-lg tabular-nums",
          inverse ? "text-primary-foreground" : "text-foreground",
        )}
        accessibilityLabel={`Quantity: ${safeValue}`}
        accessibilityLiveRegion="polite"
      >
        {safeValue}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        accessibilityState={{ disabled: !canIncrement }}
        disabled={!canIncrement}
        onPress={() => step(1)}
        className={cn(buttonClass, !canIncrement && "opacity-30")}
      >
        <Icon as={Plus} size={16} className={iconClass} />
      </Pressable>
    </View>
  );
}
