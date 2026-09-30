import { memo } from "react";
import { ArrowRight, Check, Clock3, Play, UserRound } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Button, Icon, InlineError, MediaFrame, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { ActiveOrderRow } from "../api/fetch-active-orders";
import { formatAge, minutesSince, summarizeItems } from "../model/order-display";
import { allowedOrderActions } from "../model/status-actions";
import type { OrderTransition } from "./use-order-actions";

/** A new order waiting this long reads as needing attention. */
const WAITING_ATTENTION_MIN = 5;

export type OrderTicketProps = {
  order: ActiveOrderRow;
  actorPreparationId: string;
  now: number;
  selected?: boolean;
  pendingTarget?: OrderTransition;
  /** Another order's transition is in flight; one at a time. */
  locked?: boolean;
  error?: unknown;
  onOpen: (order: ActiveOrderRow) => void;
  onAdvance: (order: ActiveOrderRow, target: "preparing" | "ready") => void;
};

/**
 * One order on the board: its number, how long it has been in this state,
 * what is in it at a glance, who has it — and the one next step, right on
 * the ticket. Cancelling lives in the order's detail, away from quick taps.
 */
export const OrderTicket = memo(function OrderTicket({
  order,
  actorPreparationId,
  now,
  selected = false,
  pendingTarget,
  locked = false,
  error,
  onOpen,
  onAdvance,
}: OrderTicketProps) {
  const actions = allowedOrderActions(order, actorPreparationId);
  const summary = summarizeItems(order.order_items);
  const since = order.status === "new" ? order.created_at : order.updated_at;
  const age = minutesSince(since, now);
  const waitingLong = order.status === "new" && age >= WAITING_ATTENTION_MIN;
  const mine = order.assigned_preparation_id === actorPreparationId;
  const taken = order.assigned_preparation_id !== null && !mine;
  const thumbs = order.order_items.slice(0, 3);

  const ageLabel =
    order.status === "new"
      ? `Waiting ${formatAge(age)}`
      : order.status === "preparing"
        ? `Preparing ${formatAge(age)}`
        : `Ready ${formatAge(age)}`;

  const next = actions.startPreparing
    ? { target: "preparing" as const, label: "Start preparing", busy: "Starting…", icon: Play }
    : actions.markReady
      ? { target: "ready" as const, label: "Mark ready", busy: "Marking ready…", icon: Check }
      : null;
  const busy = pendingTarget !== undefined;

  return (
    <View
      className={cn(
        "overflow-hidden rounded-2xl border bg-card",
        selected ? "border-primary" : busy ? "border-primary/50" : "border-border",
      )}
      style={selected ? { borderWidth: 2 } : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Order ${order.display_number}, ${ageLabel}, ${summary.lines} ${summary.lines === 1 ? "line" : "lines"}${mine ? ", yours" : taken ? ", taken by a colleague" : ""}`}
        accessibilityState={{ selected }}
        onPress={() => onOpen(order)}
        className="gap-3 p-4 active:bg-secondary/40"
      >
        <View className="flex-row items-start justify-between gap-3">
          <Text className="font-mono text-title-lg tracking-[2px] text-foreground">
            {order.display_number}
          </Text>
          <View
            className={cn(
              "flex-row items-center gap-1.5 rounded-full px-2.5 py-1",
              waitingLong ? "bg-warning/25" : "bg-muted",
            )}
          >
            <Icon
              as={Clock3}
              size={13}
              className={waitingLong ? "text-warning-text" : "text-muted-foreground"}
            />
            <Text
              className={cn(
                "font-sans-semibold text-caption",
                waitingLong ? "text-warning-text" : "text-muted-foreground",
              )}
            >
              {ageLabel}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-row">
            {thumbs.map((item, index) => (
              <MediaFrame
                key={item.id}
                source={item.image_secure_url}
                alt=""
                fit="contain"
                preset="row"
                inset={2}
                tint="paper"
                className="h-11 w-11 rounded-lg border border-border"
                style={index > 0 ? { marginLeft: -10 } : undefined}
              />
            ))}
          </View>
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {`${summary.units} ${summary.units === 1 ? "unit" : "units"} · ${summary.lines} ${summary.lines === 1 ? "line" : "lines"}`}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {summary.headline}
            </Text>
          </View>
        </View>

        {mine || taken ? (
          <View className="flex-row items-center gap-1.5">
            <Icon
              as={UserRound}
              size={14}
              className={mine ? "text-primary" : "text-muted-foreground"}
            />
            <Text
              className={cn(
                "text-caption",
                mine ? "font-sans-bold text-primary" : "text-muted-foreground",
              )}
            >
              {mine ? "Yours" : "Taken by a colleague"}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {next ? (
        <View className="border-t border-border bg-muted/40 p-2">
          <Button
            block
            disabled={busy || locked}
            onPress={() => onAdvance(order, next.target)}
            accessibilityLabel={`${next.label}, order ${order.display_number}`}
          >
            {busy ? null : <Icon as={next.icon} size={18} className="text-primary-foreground" />}
            <Text>{busy ? next.busy : next.label}</Text>
          </Button>
        </View>
      ) : order.status === "ready" ? (
        <Pressable
          onPress={() => onOpen(order)}
          accessibilityRole="button"
          accessibilityLabel={`Open order ${order.display_number}`}
          className="min-h-touch flex-row items-center justify-between border-t border-border px-4 active:bg-secondary/40"
        >
          <Text variant="caption" tone="muted">
            Waiting for pickup
          </Text>
          <Icon as={ArrowRight} size={16} className="text-muted-foreground" />
        </Pressable>
      ) : null}

      {error ? (
        <View className="border-t border-border p-2">
          <InlineError error={error} />
        </View>
      ) : null}
    </View>
  );
});
