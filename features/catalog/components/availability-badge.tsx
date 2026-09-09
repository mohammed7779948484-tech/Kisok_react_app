import { Badge, Text } from "@/components/ui";

/**
 * Textual availability for a customer-visible product or variant.
 *
 * The brief is explicit: availability is boolean only, and the words must
 * always be there — colour only never carries this meaning (AC-03/AC-07).
 * The badge colour merely reinforces the text, never replaces it.
 *
 * Presentational only: the boolean arrives as a prop; no fetching, no store,
 * no Supabase client.
 */
export type AvailabilityBadgeProps = {
  /** Product-level availability is derived by the Catalog view: any available variant. */
  isAvailable: boolean;
  className?: string;
};

export function AvailabilityBadge({ isAvailable, className }: AvailabilityBadgeProps) {
  const label = isAvailable ? "Available" : "Out of stock";

  return (
    <Badge
      variant={isAvailable ? "success" : "destructive"}
      accessibilityLabel={label}
      className={className}
    >
      <Text>{label}</Text>
    </Badge>
  );
}
