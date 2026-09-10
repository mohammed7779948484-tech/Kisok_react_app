import { Badge, Text } from "@/components/ui";

export type AvailabilityBadgeProps = {
  /** True if available */
  isAvailable: boolean;
  /** Whether this badge represents product-level or variant-level availability */
  type?: "product" | "variant";
  /** Optional custom text override */
  label?: string;
  className?: string;
};

export function AvailabilityBadge({
  isAvailable,
  type = "variant",
  label: customLabel,
  className,
}: AvailabilityBadgeProps) {
  const resolvedLabel =
    customLabel ??
    (isAvailable
      ? type === "product"
        ? "Options available"
        : "Available"
      : "Currently unavailable");

  return (
    <Badge
      variant={isAvailable ? "success" : "destructive"}
      accessibilityLabel={resolvedLabel}
      className={className}
    >
      <Text variant="caption" className="font-semibold">
        {resolvedLabel}
      </Text>
    </Badge>
  );
}
