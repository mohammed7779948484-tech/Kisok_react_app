import { View } from "react-native";

import { Text } from "@/design-system";
import { cn } from "@/core/utils";

export type AvailabilityBadgeProps = {
  /** True if available */
  isAvailable: boolean;
  /** Whether this badge represents product-level or variant-level availability */
  type?: "product" | "variant";
  /** Optional count of variants to accurately differentiate 1 variant vs multiple options */
  variantCount?: number;
  /** Optional custom text override */
  label?: string;
  /** For use on an evergreen panel. */
  inverse?: boolean;
  className?: string;
  "aria-hidden"?: boolean;
  accessible?: boolean;
};

/**
 * A dot and a word. Availability is stated in text, never by colour alone;
 * the dot only reinforces it.
 */
export function AvailabilityBadge({
  isAvailable,
  type = "variant",
  variantCount,
  label: customLabel,
  inverse = false,
  className,
  "aria-hidden": ariaHidden,
  accessible,
}: AvailabilityBadgeProps) {
  const resolvedLabel =
    customLabel ??
    (isAvailable
      ? type === "product"
        ? variantCount !== undefined && variantCount <= 1
          ? "Available"
          : "Options available"
        : "Available"
      : "Currently unavailable");

  return (
    <View
      accessible={accessible ?? !ariaHidden}
      accessibilityLabel={ariaHidden ? undefined : resolvedLabel}
      aria-hidden={ariaHidden}
      className={cn("shrink-0 flex-row items-center gap-1.5", className)}
    >
      <View
        aria-hidden
        className={cn(
          "h-[7px] w-[7px] rounded-full",
          isAvailable ? (inverse ? "bg-accent-soft" : "bg-success") : "bg-unavailable",
        )}
      />
      <Text
        numberOfLines={1}
        aria-hidden={ariaHidden}
        className={cn(
          "font-sans-semibold text-caption",
          inverse
            ? "text-primary-foreground/85"
            : isAvailable
              ? "text-foreground/80"
              : "text-unavailable",
        )}
      >
        {resolvedLabel}
      </Text>
    </View>
  );
}
