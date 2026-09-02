import { Badge, Text } from "@/components/ui";

export type AvailabilityBadgeProps = {
  isAvailable: boolean;
  className?: string;
};

export function AvailabilityBadge({ isAvailable, className }: AvailabilityBadgeProps) {
  return (
    <Badge variant={isAvailable ? "success" : "destructive"} className={className}>
      <Text>{isAvailable ? "Available" : "Out of stock"}</Text>
    </Badge>
  );
}
