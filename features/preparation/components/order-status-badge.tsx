import type { VariantProps } from "class-variance-authority";

import { Badge, Text, badgeVariants } from "@/components/ui";

import type { OrderStatus } from "../model/store-day";

/**
 * Presentational only: it receives data and reports interactions upward.
 *
 * Scope: shared across the preparation feature.
 * Ownership follows the nearest stable consumer — move it up only when a
 * second consumer actually appears, not in anticipation of one.
 *
 * It must not fetch, must not read a store, and must not import the Supabase
 * client. Keeping components dumb is what makes them testable without a
 * provider tree and reusable across screens.
 *
 * Use design-system components and semantic token classes — never a raw hex
 * colour or an inline dimension that should be a token.
 */

/** The Badge variant, derived from the primitive's own cva definition. */
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/**
 * The status → label + Badge variant mapping, following the ui-lab precedent
 * (components/app/ui-lab.tsx, the New/Preparing/Ready/Cancelled badge demo).
 * Terminal `completed` is deliberately calm — outline, not a loud fill.
 *
 * `Record<OrderStatus, …>` makes the mapping total: TypeScript rejects a new
 * status without a badge, so the board can never render an unlabelled order.
 */
const STATUS_BADGE: Record<OrderStatus, { label: string; variant: BadgeVariant }> = {
  new: { label: "New", variant: "neutral" },
  preparing: { label: "Preparing", variant: "primary" },
  ready: { label: "Ready", variant: "success" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

/**
 * The status's display label — the exact words the badge renders, exported so
 * other surfaces (the order card's accessible name) can compose the SAME
 * words instead of re-deriving them and drifting from the badge. The badge
 * itself renders through this function, so the two cannot disagree.
 */
export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_BADGE[status].label;
}

export type OrderStatusBadgeProps = {
  status: OrderStatus;
  className?: string;
};

/**
 * An order's status as a badge: the shared `Badge` primitive plus its text
 * label, so the status is always communicated in words, never by colour
 * alone. The badge text is the accessible name.
 */
export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const { variant } = STATUS_BADGE[status];

  return (
    <Badge variant={variant} className={className}>
      <Text>{orderStatusLabel(status)}</Text>
    </Badge>
  );
}
