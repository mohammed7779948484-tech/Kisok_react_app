import { Check, CircleDashed, PackageCheck, Timer, X } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { OrderStatus } from "../model/store-day";

/**
 * Every place an order status appears reads from this one map: its words,
 * its mark, and its tone — status is always a word plus a mark, never colour
 * alone.
 */
export const STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    icon: LucideIcon;
    /** Soft surface for chips and lane headers. */
    surface: string;
    /** Foreground on that surface. */
    ink: string;
    /** A solid accent (lane rail, timeline dot). */
    accent: string;
  }
> = {
  new: {
    label: "New",
    icon: CircleDashed,
    surface: "bg-accent-soft",
    ink: "text-foreground",
    accent: "bg-accent",
  },
  preparing: {
    label: "Preparing",
    icon: Timer,
    surface: "bg-secondary",
    ink: "text-primary",
    accent: "bg-primary",
  },
  ready: {
    label: "Ready",
    icon: Check,
    surface: "bg-success/15",
    ink: "text-success",
    accent: "bg-success",
  },
  completed: {
    label: "Completed",
    icon: PackageCheck,
    surface: "bg-muted",
    ink: "text-muted-foreground",
    accent: "bg-muted-foreground",
  },
  cancelled: {
    label: "Cancelled",
    icon: X,
    surface: "bg-destructive/10",
    ink: "text-destructive",
    accent: "bg-destructive",
  },
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_META[status].label;
}

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <View
      className={cn(
        "flex-row items-center gap-1.5 self-start rounded-full px-3 py-1.5",
        meta.surface,
        className,
      )}
    >
      <Icon as={meta.icon} size={14} className={meta.ink} />
      <Text className={cn("font-sans-bold text-caption", meta.ink)}>{meta.label}</Text>
    </View>
  );
}
