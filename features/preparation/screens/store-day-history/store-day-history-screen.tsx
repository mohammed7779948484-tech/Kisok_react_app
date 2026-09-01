import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { EmptyState, ErrorState, InlineError, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Text } from "@/components/ui";
import { useAuth } from "@/core/auth";

import type { ActiveOrderRow } from "../../api/fetch-active-orders";
import type { fetchStoreDayHistory } from "../../api/fetch-store-day-history";
import { OrderCard } from "../../components/order-card";
import { orderStatusLabel } from "../../components/order-status-badge";
import { formatCreatedAt } from "../../model/order-display";
import {
  effectiveTimezone,
  groupTerminalOrders,
  orderTerminalInstant,
  resolveStoreTimezone,
} from "../../model/store-day";
import { useStoreDayHistory } from "../../queries/use-store-day-history";
import { useStoreSettings } from "../../queries/use-store-settings";

/**
 * The Store Day History screen (AC-08, reached from the workspace's History
 * affordance): the CURRENT store day's terminal orders — grouped Completed
 * then Cancelled, one count per group, newest-terminal-first inside each
 * group (the model's own {@link groupTerminalOrders}; never re-derived here) —
 * read-only, under a date header derived from the window start rendered in the
 * RESOLVED store timezone.
 *
 * The screen owns no mutation, no dialog, and no timer: history is a
 * past-viewing surface. Cards render through the shared {@link OrderCard} in
 * `readOnly` mode — no action buttons — while the card PRESS still opens
 * Order Details (AC-03: read-only hides ACTIONS, not the press; terminal
 * orders then render inspection-only, T13).
 *
 * State ladder (the composed read, T06): `isPending` → skeleton; an error
 * with NO data → ErrorState wired to the hook's COMPOSED refetch
 * (settings-first — the hook owns that); a resolved day with zero terminal
 * orders → the day-level EmptyState (the per-section "No orders" handles a
 * single empty group inside a populated day — the reference's "empty state
 * per terminal section/day"). STALE-DATA POLICY (T11-R04, the workspace
 * pattern): a failed refetch WITH retained day data renders a transient
 * InlineError banner beside the content and keeps the data — history, like
 * the board, is a browsing surface, unlike the details screen which forbids
 * stale content; the banner clears on the next successful read.
 *
 * ROLLOVER (R1-05 — decided here, the hook's docblock delegates it):
 * event-driven rollover, deliberately NO `refetchInterval`. The day key rides
 * the window, which is recomputed from `new Date()` at every RENDER, so
 * navigation, realtime invalidation (the workspace beneath this screen on the
 * stack stays subscribed and invalidates the feature's queries), or any
 * interaction re-render rolls the read to the new day's key. A kiosk parked
 * on history across store midnight with ZERO re-renders keeps the day it
 * loaded under until one happens — an accepted, self-correcting edge —
 * because a `refetchInterval` would poll a read-only surface on a
 * battery-conscious store tablet to correct a window nobody is looking at.
 *
 * Time display (decision 8): the settings read degrades silently to the
 * device timezone when the row is absent or its read fails — the label zone
 * here mirrors the hook's window zone through the same resolver, so the
 * header and the day membership can never disagree about which zone decided
 * the day.
 */

/** One terminal row of the lean history read (no `order_items` embed). */
type HistoryRow = Awaited<ReturnType<typeof fetchStoreDayHistory>>[number];

/**
 * The history read is deliberately lean — no item embed (its own docblock):
 * the row adapts to the card's board-read shape with an empty placeholder
 * array, and the screen ALWAYS supplies the content caption itself, so the
 * placeholder's item count can never render. A fabricated summary would be a
 * lie; an absent one is just lean.
 */
function toCardRow(order: HistoryRow): ActiveOrderRow {
  return { ...order, order_items: [] };
}

/**
 * The day header: the window's start as a full human date in the effective
 * (store, else device) timezone — the same zone the window itself was keyed
 * in, so the label names the day the filter actually kept.
 */
function formatDayHeader(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(instant);
}

/**
 * The terminal instant as the history card's content caption — the instant
 * that decided the row's day (plan decision 2), prefixed with the SAME status
 * word the badge shows (T08's label source, so the words cannot drift).
 * Unreachable null branch: the hook's day filter drops rows with no terminal
 * instant; total anyway, rendering the status word alone — never a fabricated
 * time and never the placeholder item count.
 */
function terminalSummaryLabel(order: HistoryRow, timezone: string): string {
  const instant = orderTerminalInstant(order);
  if (instant === null) return orderStatusLabel(order.status);
  return `${orderStatusLabel(order.status)} ${formatCreatedAt(instant.toISOString(), timezone)}`;
}

type HistoryGroupProps = {
  title: string;
  orders: HistoryRow[];
  /** The signed-in employee's profile id — the assignment comparison. */
  actorPreparationId: string;
  /** The effective (store, else device) timezone for the time captions. */
  timezone: string;
  onPress: (order: HistoryRow) => void;
};

/**
 * One history group: the label with its count and the group's read-only
 * cards. Screen-internal composition on purpose (the plan's note: column
 * layouts, action bars and groupings live inside the generated screen files)
 * — simpler than the board's section, which carries action callbacks and
 * rejection feedback history never has.
 */
function HistoryGroup({ title, orders, actorPreparationId, timezone, onPress }: HistoryGroupProps) {
  return (
    <View className="gap-3">
      <Text variant="h3">{`${title} (${orders.length})`}</Text>
      {orders.length === 0 ? (
        // A group can be legitimately empty while its sibling is not — words,
        // not a blank panel (the board section's own convention).
        <Text variant="body" tone="muted">
          No orders
        </Text>
      ) : (
        <View className="gap-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={toCardRow(order)}
              actorPreparationId={actorPreparationId}
              readOnly
              createdAtLabel={formatCreatedAt(order.created_at, timezone)}
              itemSummaryLabel={terminalSummaryLabel(order, timezone)}
              onPress={onPress}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function StoreDayHistoryScreen() {
  const router = useRouter();
  // Decision 3: the assignment comparison is by id, never names. The route
  // gate guarantees a resolved preparation profile here; the fallback simply
  // never matches an assignment, which degrades safe.
  const { profile } = useAuth();
  const actorPreparationId = profile?.id ?? "";

  const history = useStoreDayHistory();
  // The label zone for the header and captions: the SAME resolver the hook
  // used for the window (the settings query is shared through its cache key),
  // so both sides of the screen agree on which zone owns the day.
  const storeSettings = useStoreSettings();
  const timezone = effectiveTimezone(resolveStoreTimezone(storeSettings.data ?? null));

  const data = history.data;
  const dayOrders = data?.orders ?? [];

  const handleOpenOrderDetails = (order: HistoryRow) => {
    // Plan decision 1: the static details route with orderId as a query param.
    router.push({ pathname: "/order-details", params: { orderId: order.id } });
  };

  let body: ReactNode;
  if (history.isPending) {
    body = <SkeletonList />;
  } else if (history.isError && data === undefined) {
    // The error passes through as `unknown` (T04 O-1: transport-level throws
    // are not AppError at the screen) — ErrorState decides whether a retry
    // can help, wired to the hook's COMPOSED refetch (settings first).
    body = <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  } else if (dayOrders.length === 0) {
    // The day-level empty state: no terminal orders yet for THIS store day
    // (the date header above it names the day). Somewhere to go next: the
    // back action — a kiosk dead end means an employee gets asked for help.
    body = (
      <EmptyState
        title="No completed or cancelled orders yet"
        description="Orders will appear here as they're completed or cancelled today."
      />
    );
  } else {
    const groups = groupTerminalOrders(dayOrders);
    body = (
      <View className="gap-4">
        <HistoryGroup
          title="Completed"
          orders={groups.completed}
          actorPreparationId={actorPreparationId}
          timezone={timezone}
          onPress={handleOpenOrderDetails}
        />
        <HistoryGroup
          title="Cancelled"
          orders={groups.cancelled}
          actorPreparationId={actorPreparationId}
          timezone={timezone}
          onPress={handleOpenOrderDetails}
        />
      </View>
    );
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="gap-4 p-6">
        {/* The back action is screen chrome: present in every state, like the details
            screen — a history screen always has a way out. */}
        <View className="flex-row items-center gap-2">
          <Button variant="ghost" size="compact" onPress={() => router.back()}>
            <Text>Back</Text>
          </Button>
          <Text variant="h1">History</Text>
        </View>
        {/* The day header is data-derived: it renders once the window
            resolved, grounding both the groups and the day-level empty state
            in the specific store day they describe. */}
        {data !== undefined ? (
          <Text variant="h3">{formatDayHeader(data.window.startUtc, timezone)}</Text>
        ) : null}
        {/* T11-R04: a failed refetch with retained day data is not silent — a
            transient banner beside the content; the full ErrorState stays
            reserved for a history with NO data. */}
        {history.isError && data !== undefined ? <InlineError error={history.error} /> : null}
        {body}
      </ScrollView>
    </Screen>
  );
}
