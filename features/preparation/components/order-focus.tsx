import { useState } from "react";
import { Check, Play, Tag, UserRound, X } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import {
  Button,
  EmptyState,
  ErrorState,
  Icon,
  InlineError,
  MediaFrame,
  SkeletonList,
  Text,
} from "@/design-system";
import { cn } from "@/core/utils";

import type { ActiveOrderRow } from "../api/fetch-active-orders";
import { formatAge, formatCreatedAt, minutesSince, optionTexts } from "../model/order-display";
import { allowedOrderActions } from "../model/status-actions";
import { orderTerminalInstant } from "../model/store-day";
import { useOrderDetail } from "../queries/use-order-detail";
import { CancelOrderDialog } from "./cancel-order-dialog";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderTimeline } from "./order-timeline";
import type { useOrderActions } from "./use-order-actions";

type ItemRow = ActiveOrderRow["order_items"][number];

const bySku = (left: ItemRow, right: ItemRow) =>
  left.variant_sku === right.variant_sku ? 0 : left.variant_sku < right.variant_sku ? -1 : 1;

function ItemRowView({ item }: { item: ItemRow }) {
  const options = optionTexts(item.variant_options);
  return (
    <View className="flex-row gap-4 border-b border-border/70 py-4">
      <MediaFrame
        source={item.image_secure_url}
        alt={item.variant_name ? `${item.product_name}, ${item.variant_name}` : item.product_name}
        fit="contain"
        preset="row"
        inset={4}
        tint="paper"
        fallbackLabel={item.product_name}
        className="h-20 w-20 rounded-xl border border-border"
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="title">{item.product_name}</Text>
        {item.variant_name ? <Text variant="body">{item.variant_name}</Text> : null}
        {options.length > 0 ? (
          <Text variant="meta" tone="muted">
            {options.join(" · ")}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          {item.brand_name ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={Tag} size={13} className="text-muted-foreground" />
              <Text variant="caption" tone="muted">
                {item.brand_name}
              </Text>
            </View>
          ) : null}
          <Text className="font-mono text-caption text-muted-foreground">{item.variant_sku}</Text>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={`Quantity ${item.quantity}`}
        className="h-14 min-w-14 items-center justify-center self-center rounded-xl bg-primary px-3"
      >
        <Text className="font-display-semibold text-title-lg text-primary-foreground">
          {`×${item.quantity}`}
        </Text>
      </View>
    </View>
  );
}

export type OrderFocusProps = {
  orderId: string;
  /** Shown instantly (from the board) while the full order loads. */
  fallback?: ActiveOrderRow;
  actorPreparationId: string;
  timezone: string;
  now: number;
  actions: ReturnType<typeof useOrderActions>;
  /** In the board's side panel: a close control. */
  onClose?: () => void;
};

/**
 * Everything about one order and what can be done with it next. The action
 * zone stays pinned at the bottom; the items scroll above it. Reads the
 * order live, so a colleague's change shows here as soon as it lands.
 */
export function OrderFocus({
  orderId,
  fallback,
  actorPreparationId,
  timezone,
  now,
  actions,
  onClose,
}: OrderFocusProps) {
  const detail = useOrderDetail(orderId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const order = detail.data === undefined ? fallback : detail.data;
  const error = actions.error?.orderId === orderId ? actions.error.error : null;
  const pending = actions.pending?.orderId === orderId ? actions.pending.target : undefined;

  if (order === undefined) {
    if (detail.isError) {
      return (
        <ErrorState
          title="Order unavailable"
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      );
    }
    return <SkeletonList itemClassName="h-28" />;
  }
  if (order === null) {
    return (
      <EmptyState
        title="Order unavailable"
        description="This order can’t be found. It may have been removed."
      />
    );
  }

  const allowed = allowedOrderActions(order, actorPreparationId);
  const mine = order.assigned_preparation_id === actorPreparationId;
  const taken = order.assigned_preparation_id !== null && !mine;
  const terminal = orderTerminalInstant(order);
  const units = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const items = [...order.order_items].sort(bySku);

  const primary = allowed.startPreparing
    ? { target: "preparing" as const, label: "Start preparing", busy: "Starting…", icon: Play }
    : allowed.markReady
      ? { target: "ready" as const, label: "Mark ready", busy: "Marking ready…", icon: Check }
      : null;

  const stateLine =
    order.status === "new"
      ? `Waiting ${formatAge(minutesSince(order.created_at, now))}`
      : order.status === "preparing"
        ? `In preparation for ${formatAge(minutesSince(order.updated_at, now))}`
        : order.status === "ready"
          ? `Ready for ${formatAge(minutesSince(order.updated_at, now))} — waiting for pickup`
          : terminal
            ? `${order.status === "completed" ? "Completed" : "Cancelled"} at ${formatCreatedAt(terminal.toISOString(), timezone)}`
            : null;

  return (
    <View className="min-h-0 flex-1">
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-5 pb-4">
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1 gap-2">
            <Text variant="eyebrow">Order</Text>
            <Text
              selectable
              className="font-mono text-display-sm tracking-[4px] text-foreground"
              accessibilityLabel={`Order ${order.display_number.split("").join(" ")}`}
            >
              {order.display_number}
            </Text>
            <View className="flex-row flex-wrap items-center gap-3">
              <OrderStatusBadge status={order.status} />
              <Text variant="meta" tone="muted">
                {`Placed ${formatCreatedAt(order.created_at, timezone)}`}
              </Text>
            </View>
          </View>
          {onClose ? (
            <Button variant="ghost" size="icon" accessibilityLabel="Close order" onPress={onClose}>
              <Icon as={X} size={22} />
            </Button>
          ) : null}
        </View>

        <View className="gap-3 rounded-2xl bg-muted/50 p-4">
          <OrderTimeline status={order.status} />
          {stateLine ? (
            <Text variant="meta" tone="muted">
              {stateLine}
            </Text>
          ) : null}
          {mine || taken ? (
            <View className="flex-row items-center gap-2">
              <Icon
                as={UserRound}
                size={15}
                className={mine ? "text-primary" : "text-muted-foreground"}
              />
              <Text
                className={cn(
                  "text-meta",
                  mine ? "font-sans-bold text-primary" : "text-muted-foreground",
                )}
              >
                {mine ? "You’re preparing this order" : "A colleague is preparing this order"}
              </Text>
            </View>
          ) : null}
          {order.status === "cancelled" && order.cancellation_reason ? (
            <Text variant="meta">{`Reason: ${order.cancellation_reason}`}</Text>
          ) : null}
        </View>

        <View>
          <View className="flex-row items-baseline justify-between border-b border-border pb-2">
            <Text variant="title">Items</Text>
            <Text variant="meta" tone="muted">
              {`${units} ${units === 1 ? "unit" : "units"} · ${items.length} ${items.length === 1 ? "line" : "lines"}`}
            </Text>
          </View>
          {items.length > 0 ? (
            items.map((item) => <ItemRowView key={item.id} item={item} />)
          ) : detail.isPending ? (
            <View className="pt-3">
              <SkeletonList itemClassName="h-20" />
            </View>
          ) : null}
        </View>
      </ScrollView>

      {primary || allowed.cancel || error ? (
        <View className="gap-3 border-t border-border pt-4">
          {error ? <InlineError error={error} /> : null}
          {primary ? (
            <Button
              size="large"
              block
              disabled={actions.busy}
              onPress={() => actions.run(order.id, primary.target)}
            >
              {pending === primary.target ? null : (
                <Icon as={primary.icon} size={20} className="text-primary-foreground" />
              )}
              <Text>{pending === primary.target ? primary.busy : primary.label}</Text>
            </Button>
          ) : null}
          {allowed.cancel ? (
            <Button
              variant="outline"
              block
              disabled={actions.busy}
              onPress={() => setCancelOpen(true)}
              className="border-destructive/40"
            >
              <Text className="text-destructive">
                {pending === "cancelled" ? "Cancelling…" : "Cancel order"}
              </Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      <CancelOrderDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        order={order}
        busy={pending === "cancelled"}
        onCancelOrder={(reason) =>
          actions.run(order.id, "cancelled", {
            reason,
            onSettled: () => setCancelOpen(false),
          })
        }
      />
    </View>
  );
}
