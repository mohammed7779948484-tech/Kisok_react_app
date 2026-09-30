import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Coffee } from "lucide-react-native";

import {
  ErrorState,
  Icon,
  InlineError,
  Screen,
  SkeletonGrid,
  Text,
  useLayout,
  usePageGutter,
} from "@/design-system";
import { useAuth, useSignOutAction } from "@/core/auth";
import { cn } from "@/core/utils";

import type { ActiveOrderRow } from "../../api/fetch-active-orders";
import { OrderFocus } from "../../components/order-focus";
import { OrderTicket } from "../../components/order-ticket";
import { STATUS_META } from "../../components/order-status-badge";
import { useNow } from "../../components/use-now";
import { useOrderActions } from "../../components/use-order-actions";
import { formatCreatedAt } from "../../model/order-display";
import { effectiveTimezone, resolveStoreTimezone } from "../../model/store-day";
import { useActiveOrders } from "../../queries/use-active-orders";
import { useOrdersRealtime } from "../../queries/use-orders-realtime";
import { useStoreSettings } from "../../queries/use-store-settings";
import { LANE_COPY, StatusLane, type LaneStatus } from "./components/status-lane";
import { WorkspaceHeader } from "./components/workspace-header";

const LANES: LaneStatus[] = ["new", "preparing", "ready"];

/** How long an arrival announcement stays on screen. */
export const ANNOUNCEMENT_CLEAR_MILLIS = 6000;

const FOCUS_WIDTH = 420;

/** Oldest first within a lane: the order that has waited longest is the one to act on. */
function laneOrder(status: LaneStatus, orders: ActiveOrderRow[]) {
  const key = (order: ActiveOrderRow) =>
    Date.parse(status === "new" ? order.created_at : order.updated_at);
  return orders.filter((order) => order.status === status).sort((a, b) => key(a) - key(b));
}

/**
 * The Preparation workspace: a live operational board.
 *
 * - Three status lanes — Incoming, In preparation, Ready for pickup — each
 *   oldest-first, with the next step right on every ticket.
 * - On a wide landscape tablet, tapping a ticket opens it in a focus panel
 *   beside the board, so the whole shift stays in view while one order is
 *   handled; narrower screens open the order full screen.
 * - Portrait and narrow screens switch lanes with a segmented control.
 *
 * Several employees work the same board. Every transition is decided by the
 * server (`update_order_status`); Realtime changes to `orders` refresh the
 * board, and a rejected action is explained beside its order while the board
 * refreshes to the truth.
 */
export function WorkspaceScreen() {
  const { profile } = useAuth();
  const actorPreparationId = profile?.id ?? "";
  const router = useRouter();
  const { width, isLandscape } = useLayout();
  const gutter = usePageGutter();
  const signOut = useSignOutAction();
  const now = useNow();

  const activeOrders = useActiveOrders();
  const storeSettings = useStoreSettings();
  const actions = useOrderActions();
  useOrdersRealtime();

  const canvas = isLandscape && width >= 1100;
  const lanesSideBySide = isLandscape && width >= 900;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<LaneStatus>("new");
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const seenOrderIds = useRef<Set<string> | null>(null);

  const timezone = effectiveTimezone(resolveStoreTimezone(storeSettings.data ?? null));
  const orders = activeOrders.data;
  const lanes = useMemo(
    () =>
      Object.fromEntries(
        LANES.map((status) => [status, laneOrder(status, orders ?? [])]),
      ) as Record<LaneStatus, ActiveOrderRow[]>,
    [orders],
  );
  const counts = {
    new: lanes.new.length,
    preparing: lanes.preparing.length,
    ready: lanes.ready.length,
  };
  const total = counts.new + counts.preparing + counts.ready;
  const mine = (orders ?? []).filter(
    (order) => order.status === "preparing" && order.assigned_preparation_id === actorPreparationId,
  ).length;

  // Announce arrivals politely (no sound, no toast).
  useEffect(() => {
    if (orders === undefined) return;
    const currentIds = new Set(orders.map((order) => order.id));
    const previousIds = seenOrderIds.current;
    seenOrderIds.current = currentIds;
    if (previousIds === null) return;
    const arrivals = orders.filter((order) => !previousIds.has(order.id));
    if (arrivals.length === 0) return;
    const [first] = arrivals;
    setAnnouncement(
      first !== undefined && arrivals.length === 1
        ? `New order ${first.display_number}`
        : `${arrivals.length} new orders`,
    );
  }, [orders]);

  useEffect(() => {
    if (announcement === null) return;
    const timeout = setTimeout(() => setAnnouncement(null), ANNOUNCEMENT_CLEAR_MILLIS);
    return () => clearTimeout(timeout);
  }, [announcement]);

  // The focus panel only exists on the canvas layout.
  useEffect(() => {
    if (!canvas) setSelectedId(null);
  }, [canvas]);

  const open = useCallback(
    (order: ActiveOrderRow) => {
      if (canvas) {
        setSelectedId((current) => (current === order.id ? null : order.id));
        return;
      }
      router.push({ pathname: "/order-details", params: { orderId: order.id } });
    },
    [canvas, router],
  );
  const advance = useCallback(
    (order: ActiveOrderRow, target: "preparing" | "ready") => actions.run(order.id, target),
    [actions],
  );

  const pendingOrderId = actions.pending?.orderId;
  const renderTicket = (order: ActiveOrderRow) => (
    <OrderTicket
      order={order}
      actorPreparationId={actorPreparationId}
      now={now}
      selected={order.id === selectedId}
      pendingTarget={order.id === pendingOrderId ? actions.pending?.target : undefined}
      locked={actions.busy && order.id !== pendingOrderId}
      error={actions.error?.orderId === order.id ? actions.error.error : undefined}
      onOpen={open}
      onAdvance={advance}
    />
  );
  const ticketsKey = `${now}|${selectedId}|${pendingOrderId}|${actions.error?.orderId}`;

  // A rejection for an order that has left the visible lanes still has to be seen.
  const visibleIds = new Set(
    (lanesSideBySide ? LANES : [tab]).flatMap((status) => lanes[status].map((order) => order.id)),
  );
  const orphanError =
    actions.error && !visibleIds.has(actions.error.orderId) && actions.error.orderId !== selectedId
      ? actions.error.error
      : null;

  let board: ReactNode;
  if (activeOrders.isPending) {
    board = <SkeletonGrid count={6} columns={lanesSideBySide ? 3 : 1} itemClassName="h-44" />;
  } else if (activeOrders.isError && orders === undefined) {
    board = <ErrorState error={activeOrders.error} onRetry={() => void activeOrders.refetch()} />;
  } else if (total === 0) {
    board = (
      <View className="flex-1 items-center justify-center gap-5 rounded-3xl bg-muted/45 p-10">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-card">
          <Icon as={Coffee} size={36} className="text-primary" />
        </View>
        <View className="max-w-md items-center gap-2">
          <Text variant="h1" className="text-center">
            All caught up
          </Text>
          <Text variant="lead" className="text-center">
            New orders appear here the moment a customer confirms one.
          </Text>
        </View>
      </View>
    );
  } else if (lanesSideBySide) {
    board = (
      <View className="min-h-0 flex-1 flex-row gap-3">
        {LANES.map((status) => (
          <StatusLane
            key={status}
            status={status}
            orders={lanes[status]}
            renderTicket={renderTicket}
            extraData={ticketsKey}
            className="flex-1"
          />
        ))}
      </View>
    );
  } else {
    board = (
      <View className="min-h-0 flex-1 gap-3">
        <View
          accessibilityRole="tablist"
          className="flex-row gap-1.5 rounded-2xl bg-muted/60 p-1.5"
        >
          {LANES.map((status) => {
            const selected = tab === status;
            const meta = STATUS_META[status];
            return (
              <Pressable
                key={status}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${LANE_COPY[status].title}, ${counts[status]}`}
                onPress={() => setTab(status)}
                className={cn(
                  "min-h-touch flex-1 flex-row items-center justify-center gap-2 rounded-xl px-2",
                  selected ? "bg-card" : "active:bg-card/50",
                )}
              >
                <View className={cn("h-2.5 w-2.5 rounded-full", meta.accent)} />
                <Text
                  numberOfLines={1}
                  className={cn("text-body", selected ? "font-sans-bold" : "text-muted-foreground")}
                >
                  {LANE_COPY[status].title}
                </Text>
                <Text className="font-display-semibold text-body tabular-nums">
                  {counts[status]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <StatusLane
          key={tab}
          status={tab}
          orders={lanes[tab]}
          renderTicket={renderTicket}
          showHeader={false}
          columns={width >= 700 ? 2 : 1}
          extraData={ticketsKey}
          className="flex-1 pt-3"
        />
      </View>
    );
  }

  const selectedFallback = selectedId
    ? (orders ?? []).find((order) => order.id === selectedId)
    : undefined;

  return (
    <Screen edges={["top", "bottom", "left", "right"]} constrained={false}>
      <View className="min-h-0 flex-1 gap-4 py-5" style={{ paddingHorizontal: gutter }}>
        <WorkspaceHeader
          clock={formatCreatedAt(new Date(now).toISOString(), timezone)}
          counts={counts}
          mine={mine}
          refreshing={activeOrders.isFetching}
          compact={width < 700}
          signingOut={signOut.pending}
          onRefresh={() => void activeOrders.refetch()}
          onHistory={() => router.push("/history")}
          onSignOut={signOut.run}
        />
        {signOut.message ? (
          <Text variant="caption" tone="destructive" accessibilityRole="alert">
            {signOut.message}
          </Text>
        ) : null}
        {announcement ? (
          <Text variant="meta" tone="primary" accessibilityLiveRegion="polite">
            {announcement}
          </Text>
        ) : null}
        {activeOrders.isError && orders !== undefined ? (
          <InlineError error={activeOrders.error} />
        ) : null}
        {orphanError ? <InlineError error={orphanError} /> : null}
        <View className="min-h-0 flex-1 flex-row gap-4">
          <View className="min-h-0 min-w-0 flex-1">{board}</View>
          {canvas && selectedId ? (
            <View
              style={{ width: FOCUS_WIDTH }}
              className="rounded-3xl border border-border bg-card p-5"
            >
              <OrderFocus
                key={selectedId}
                orderId={selectedId}
                fallback={selectedFallback}
                actorPreparationId={actorPreparationId}
                timezone={timezone}
                now={now}
                actions={actions}
                onClose={() => setSelectedId(null)}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
