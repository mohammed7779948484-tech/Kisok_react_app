import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ArrowLeft, ChevronRight, History } from "lucide-react-native";

import {
  Button,
  ErrorState,
  Eyebrow,
  Icon,
  InlineError,
  Screen,
  SkeletonList,
  Text,
  usePageGutter,
} from "@/design-system";
import { cn } from "@/core/utils";

import type { fetchStoreDayHistory } from "../../api/fetch-store-day-history";
import { STATUS_META } from "../../components/order-status-badge";
import { formatCreatedAt } from "../../model/order-display";
import {
  effectiveTimezone,
  groupTerminalOrders,
  orderTerminalInstant,
  resolveStoreTimezone,
} from "../../model/store-day";
import { useStoreDayHistory } from "../../queries/use-store-day-history";
import { useStoreSettings } from "../../queries/use-store-settings";

type HistoryRow = Awaited<ReturnType<typeof fetchStoreDayHistory>>[number];
type Filter = "all" | "completed" | "cancelled";

function formatDay(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(instant);
}

function HistoryEntry({
  order,
  timezone,
  onPress,
}: {
  order: HistoryRow;
  timezone: string;
  onPress: (order: HistoryRow) => void;
}) {
  const meta = STATUS_META[order.status];
  const terminal = orderTerminalInstant(order);
  const at = terminal ? formatCreatedAt(terminal.toISOString(), timezone) : "—";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.display_number}, ${meta.label} at ${at}`}
      onPress={() => onPress(order)}
      className="min-h-touch flex-row items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 active:bg-secondary/40"
    >
      <Text className="w-14 font-sans-bold text-body tabular-nums">{at}</Text>
      <View className={cn("h-9 w-9 items-center justify-center rounded-full", meta.surface)}>
        <Icon as={meta.icon} size={16} className={meta.ink} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-mono text-title tracking-[2px]">{order.display_number}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {order.status === "cancelled"
            ? `Cancelled${order.cancellation_reason ? ` · ${order.cancellation_reason}` : ""}`
            : "Completed"}
          {` · placed ${formatCreatedAt(order.created_at, timezone)}`}
        </Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

/**
 * What happened today: every order completed or cancelled in the current
 * store day (the store's timezone decides where the day starts), newest
 * first, filterable by outcome.
 */
export function StoreDayHistoryScreen() {
  const router = useRouter();
  const gutter = usePageGutter();
  const history = useStoreDayHistory();
  const storeSettings = useStoreSettings();
  const timezone = effectiveTimezone(resolveStoreTimezone(storeSettings.data ?? null));
  const [filter, setFilter] = useState<Filter>("all");

  const data = history.data;
  const dayOrders = data?.orders ?? [];
  const groups = groupTerminalOrders(dayOrders);
  const byLatest = (left: HistoryRow, right: HistoryRow) =>
    (orderTerminalInstant(right)?.getTime() ?? 0) - (orderTerminalInstant(left)?.getTime() ?? 0);
  const shown = (filter === "all" ? dayOrders : groups[filter]).slice().sort(byLatest);

  const openOrder = (order: HistoryRow) =>
    router.push({ pathname: "/order-details", params: { orderId: order.id } });
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(preparation)"));

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: dayOrders.length },
    { value: "completed", label: "Completed", count: groups.completed.length },
    { value: "cancelled", label: "Cancelled", count: groups.cancelled.length },
  ];

  let body: ReactNode;
  if (history.isPending) {
    body = <SkeletonList itemClassName="h-16" />;
  } else if (history.isError && data === undefined) {
    body = <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  } else if (dayOrders.length === 0) {
    body = (
      <View className="flex-1 items-center justify-center gap-4 rounded-3xl bg-muted/45 p-10">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-card">
          <Icon as={History} size={32} className="text-primary" />
        </View>
        <Text variant="h2" className="text-center">
          Nothing finished yet today
        </Text>
        <Text tone="muted" className="max-w-md text-center">
          Completed and cancelled orders appear here through the day.
        </Text>
      </View>
    );
  } else {
    body = (
      <View className="min-h-0 flex-1 gap-4">
        <View accessibilityRole="tablist" className="flex-row flex-wrap gap-2">
          {filters.map((option) => {
            const selected = filter === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setFilter(option.value)}
                className={cn(
                  "min-h-touch flex-row items-center gap-2 rounded-full border px-4",
                  selected ? "border-primary bg-primary" : "border-border bg-card active:bg-muted",
                )}
              >
                <Text
                  className={cn(
                    "font-sans-semibold text-body",
                    selected ? "text-primary-foreground" : "text-foreground",
                  )}
                >
                  {option.label}
                </Text>
                <Text
                  className={cn(
                    "text-body tabular-nums",
                    selected ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {option.count}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {shown.length === 0 ? (
          <Text tone="muted" className="py-8 text-center">
            {filter === "completed"
              ? "No completed orders yet today."
              : "No cancelled orders today."}
          </Text>
        ) : (
          <FlashList
            data={shown}
            keyExtractor={(order) => order.id}
            renderItem={({ item }) => (
              <View className="pb-2">
                <HistoryEntry order={item} timezone={timezone} onPress={openOrder} />
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    );
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View
        className="min-h-0 w-full max-w-3xl flex-1 gap-5 self-center py-5"
        style={{ paddingHorizontal: gutter }}
      >
        <Button variant="tonal" onPress={back}>
          <Icon as={ArrowLeft} size={18} />
          <Text>Back to the board</Text>
        </Button>
        <View className="gap-2">
          <Eyebrow rule>{data ? formatDay(data.window.startUtc, timezone) : "Today"}</Eyebrow>
          <Text variant="display" accessibilityRole="header">
            Today’s history
          </Text>
          {data ? (
            <Text tone="muted">
              {`${groups.completed.length} completed · ${groups.cancelled.length} cancelled`}
            </Text>
          ) : null}
        </View>
        {history.isError && data !== undefined ? <InlineError error={history.error} /> : null}
        {body}
      </View>
    </Screen>
  );
}
