import { Badge, Text } from "@/components/ui";

export type AvailabilityBadgeProps = {
  /** True if available */
  isAvailable: boolean;
  /** Whether this badge represents product-level or variant-level availability */
  type?: "product" | "variant";
  /** Optional count of variants to accurately differentiate 1 variant vs multiple options */
  variantCount?: number;
  /** Optional custom text override */
  label?: string;
  className?: string;
  "aria-hidden"?: boolean;
  accessible?: boolean;
};

export function AvailabilityBadge({
  isAvailable,
  type = "variant",
  variantCount,
  label: customLabel,
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
    <Badge
      variant={isAvailable ? "success" : "destructive"}
      accessibilityLabel={ariaHidden ? undefined : resolvedLabel}
      aria-hidden={ariaHidden}
      accessible={accessible ?? (ariaHidden ? false : true)}
      className={className}
    >
      <Text variant="caption" className="font-semibold" aria-hidden={ariaHidden}>
        {resolvedLabel}
      </Text>
    </Badge>
  );
}
