import { FlashList } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { View } from "react-native";

import { Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { ActiveOrderRow } from "../../../api/fetch-active-orders";
import { STATUS_META } from "../../../components/order-status-badge";

export type LaneStatus = "new" | "preparing" | "ready";

export const LANE_COPY: Record<LaneStatus, { title: string; hint: string; empty: string }> = {
  new: { title: "Incoming", hint: "Waiting to be picked up", empty: "No new orders" },
  preparing: { title: "In preparation", hint: "Being put together", empty: "Nothing in progress" },
  ready: { title: "Ready for pickup", hint: "Waiting at the counter", empty: "Nothing waiting" },
};

export type StatusLaneProps = {
  status: LaneStatus;
  orders: ActiveOrderRow[];
  renderTicket: (order: ActiveOrderRow) => ReactElement;
  /** Draw the lane header (the tab layout shows it in the tab instead). */
  showHeader?: boolean;
  /** Tickets per row inside the lane (portrait/tab layout uses two on wide screens). */
  columns?: number;
  extraData?: unknown;
  className?: string;
};

/**
 * One status region of the board: a tinted lane with its count, and the
 * orders in it — oldest first, because the oldest order is the one to act on.
 */
export function StatusLane({
  status,
  orders,
  renderTicket,
  showHeader = true,
  columns = 1,
  extraData,
  className,
}: StatusLaneProps) {
  const meta = STATUS_META[status];
  const copy = LANE_COPY[status];

  return (
    <View className={cn("min-h-0 overflow-hidden rounded-3xl bg-muted/45", className)}>
      {showHeader ? (
        <View className="flex-row items-center gap-3 px-4 pb-3 pt-4">
          <View className={cn("h-9 w-9 items-center justify-center rounded-full", meta.surface)}>
            <Icon as={meta.icon} size={18} className={meta.ink} />
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="title" numberOfLines={1}>
              {copy.title}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {copy.hint}
            </Text>
          </View>
          <View
            accessible
            accessibilityLabel={`${orders.length} ${copy.title}`}
            className="min-w-10 items-center rounded-full bg-card px-3 py-1"
          >
            <Text className="font-display-semibold text-title">{orders.length}</Text>
          </View>
        </View>
      ) : null}
      {orders.length === 0 ? (
        <View className="mx-3 mb-3 min-h-32 items-center justify-center rounded-2xl border border-dashed border-border">
          <Text variant="meta" tone="muted">
            {copy.empty}
          </Text>
        </View>
      ) : (
        <FlashList
          data={orders}
          numColumns={columns}
          keyExtractor={(order) => order.id}
          extraData={extraData}
          renderItem={({ item }) => <View className="px-1.5 pb-3">{renderTicket(item)}</View>}
          contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 6 }}
        />
      )}
    </View>
  );
}
