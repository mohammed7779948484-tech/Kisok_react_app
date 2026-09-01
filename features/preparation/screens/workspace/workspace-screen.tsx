import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { EmptyState, ErrorState, InlineError, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Text } from "@/components/ui";
import { useAuth, useSignOutAction } from "@/core/auth";
import { useLayout } from "@/core/responsive";

import type { ActiveOrderRow } from "../../api/fetch-active-orders";
import { CancelOrderDialog } from "../../components/cancel-order-dialog";
import { orderStatusLabel } from "../../components/order-status-badge";
import { formatCreatedAt } from "../../model/order-display";
import { effectiveTimezone, resolveStoreTimezone } from "../../model/store-day";
import { preparationKeys } from "../../queries/keys";
import { useActiveOrders } from "../../queries/use-active-orders";
import { useOrdersRealtime } from "../../queries/use-orders-realtime";
import { useStoreSettings } from "../../queries/use-store-settings";
import { useUpdateOrderStatusMutation } from "../../queries/use-update-order-status-mutation";

import {
  BoardSection,
  type BoardSectionActionError,
  type BoardSectionEntry,
} from "./components/board-section";

/**
 * The Preparation Workspace (AC-01/02/04/05/10): the operational board of
 * active orders grouped New / Preparing / Ready, each group with its count —
 * three columns on an expanded (landscape tablet) layout, three tabs on
 * compact/medium (plan decision 11, the ui-lab precedent). It owns the two
 * reads (`useActiveOrders`, `useStoreSettings`), the ONE transition mutation
 * (start preparing / mark ready / cancel — all through
 * `useUpdateOrderStatusMutation`), the cancel dialog's open state, and the
 * per-card in-flight + rejection feedback (decision 5: per-card, never a
 * screen-wide BlockingOverlay).
 *
 * The mutation hook invalidates the feature's queries on SUCCESS only
 * (T05-R02), so THIS screen owns the rejected-transition refresh: onError
 * renders the failure beside the card that fired it and invalidates, so the
 * refetched board shows the server's unchanged truth — a transition is never
 * fabricated locally or silently swallowed (AC-10). A rejected cancel closes
 * the dialog first (T10-R01): feedback behind an open modal is invisible.
 *
 * The rejection feedback always renders SOMEWHERE the employee can see
 * (R2-01): normally beside the card that fired it, but two reachable states
 * hide that card — the rejected order can DEPART the active board under the
 * rejection refetch (a colleague's cancel landed first), or on the tab layout
 * it can move into a group whose TabsContent is not mounted (a claim race
 * pushing it to a hidden Preparing tab). When the errored order is not among
 * the VISIBLE cards, the feedback falls back to the screen body beside the
 * board instead of rendering nowhere — a failure that looks like success is
 * the one outcome AC-10 forbids.
 *
 * Time display is store-timezone (decision 8): the settings read degrades
 * silently to the device timezone when the row is absent or the read fails —
 * the operational board never fails on it. Cards show the created time, not a
 * ticking timer (decision 10), and new-order arrivals are announced through a
 * polite live region (decision 9) — no toast, no sound. The workspace also
 * carries the sign-out affordance, a manual refresh (the behaviour
 * research's refresh affordance; the same created-time policy as decision
 * 10), and the History affordance (AC-08: the store-day history screen is
 * reached from here).
 *
 * While this screen is mounted it holds the orders Realtime subscription
 * (AC-09, `useOrdersRealtime`): an `orders` change is an INVALIDATION signal
 * only — the hook invalidates the feature's queries and the refetched query
 * result is what re-renders the board. Nothing here reads a Realtime payload.
 */
const BOARD_STATUSES = ["new", "preparing", "ready"] as const;

type BoardStatus = (typeof BOARD_STATUSES)[number];

type BoardAction = NonNullable<BoardSectionEntry["pendingAction"]>;

/** The in-flight card action for the transition the RPC is running. */
const PENDING_ACTION_BY_TARGET: Record<"preparing" | "ready" | "cancelled", BoardAction> = {
  preparing: "startPreparing",
  ready: "markReady",
  cancelled: "cancel",
};

/**
 * How long an arrival announcement stays on screen (T11-R02): long enough to
 * read, short enough that an all-shift board never accumulates stale captions.
 */
export const ANNOUNCEMENT_CLEAR_MILLIS = 6000;

export function WorkspaceScreen() {
  const { profile } = useAuth();
  // Decision 3: the assignment comparison is by id, never names. The route
  // gate guarantees a resolved preparation profile here; the fallback simply
  // never matches an assignment, which degrades safe (no Mark Ready offered).
  const actorPreparationId = profile?.id ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isExpanded } = useLayout();
  const signOut = useSignOutAction();

  const activeOrders = useActiveOrders();
  const storeSettings = useStoreSettings();
  const mutation = useUpdateOrderStatusMutation();

  // AC-09: while this screen is mounted, `orders` changes arrive as Realtime
  // events whose ONLY job is to invalidate the feature's queries — the
  // refetched query result is the rendered truth, never the payload. The hook
  // owns the channel's lifecycle (one channel, removed on unmount).
  useOrdersRealtime();

  const [selectedTab, setSelectedTab] = useState<BoardStatus>("new");
  const [cancelTarget, setCancelTarget] = useState<ActiveOrderRow | null>(null);
  const [actionError, setActionError] = useState<BoardSectionActionError | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const seenOrderIds = useRef<Set<string> | null>(null);

  // Decision 9: announce new-order arrivals politely. The board's first
  // population is not an arrival — only orders that APPEAR after the first
  // read are (a colleague's action moving an order does not re-announce it:
  // the id was already seen).
  useEffect(() => {
    const orders = activeOrders.data;
    if (orders === undefined) return;
    const currentIds = new Set(orders.map((order) => order.id));
    const previousIds = seenOrderIds.current;
    seenOrderIds.current = currentIds;
    if (previousIds === null) return;
    const arrivals = orders.filter((order) => !previousIds.has(order.id));
    if (arrivals.length === 0) return;
    const [firstArrival] = arrivals;
    setAnnouncement(
      firstArrival !== undefined && arrivals.length === 1
        ? `New order ${firstArrival.display_number}`
        : `${arrivals.length} new orders`,
    );
  }, [activeOrders.data]);

  // T11-R02: the caption is transient — cleared after a short delay, so an
  // all-shift board never keeps a stale arrival announcement on screen until
  // the NEXT arrival. A newer arrival with a DIFFERENT caption replaces it
  // and restarts the timer (the effect re-runs on the new value); React's
  // same-value setState bailout means an identical caption string keeps the
  // existing window (T12-R01 — accepted, benign). Unmount always clears it.
  useEffect(() => {
    if (announcement === null) return;
    const timeout = setTimeout(() => setAnnouncement(null), ANNOUNCEMENT_CLEAR_MILLIS);
    return () => clearTimeout(timeout);
  }, [announcement]);

  // Decision 8: prefer the store timezone, degrade to the device zone when
  // the settings row is absent OR its read failed — never a board failure.
  const timezone = effectiveTimezone(resolveStoreTimezone(storeSettings.data ?? null));

  const runTransition = (
    order: ActiveOrderRow,
    targetStatus: "preparing" | "ready" | "cancelled",
  ) => {
    // One in-flight transition at a time: the shared mutation's state tracks
    // its LATEST call, so a second concurrent write would un-track the first
    // (re-enabling its card's guard). This is the repeat-press guard AC-04
    // layers on top of the disabled button.
    if (mutation.isPending) return;
    setActionError(null);
    mutation.mutate(
      { orderId: order.id, targetStatus },
      {
        onSuccess: () => {
          // The hook's own onSuccess invalidates the feature's queries; the
          // screen only closes the dialog it owns.
          if (targetStatus === "cancelled") setCancelTarget(null);
        },
        onError: (error: unknown) => {
          // T05-R02: the hook invalidates on success ONLY — the screen owns
          // AC-10's rejected-transition refresh, so the board refetches and
          // shows the server's unchanged truth.
          setActionError({ orderId: order.id, error });
          // T10-R01: a rejected cancel must not leave its modal open over the
          // feedback that replaces it.
          setCancelTarget(null);
          void queryClient.invalidateQueries({ queryKey: preparationKeys.all });
        },
      },
    );
  };

  const handleStartPreparing = (order: ActiveOrderRow) => runTransition(order, "preparing");
  const handleMarkReady = (order: ActiveOrderRow) => runTransition(order, "ready");
  const handleCancelRequested = (order: ActiveOrderRow) => {
    if (mutation.isPending) return;
    setCancelTarget(order);
  };
  const handleCancelConfirmed = () => {
    // The dialog reports the display echo; the screen closes over the selected
    // row, which carries the order_id the mutation needs (T10's contract).
    if (cancelTarget === null) return;
    runTransition(cancelTarget, "cancelled");
  };
  const handleOpenOrderDetails = (order: ActiveOrderRow) => {
    // Plan decision 1: the static details route with orderId as a query param.
    router.push({ pathname: "/order-details", params: { orderId: order.id } });
  };

  // The per-card in-flight state (decision 5), derived from the mutation's
  // own ground truth: while a write is pending, the target card's action
  // renders disabled with its label swapped.
  const pendingInput = mutation.isPending ? mutation.variables : undefined;
  const pendingOrderId = pendingInput?.orderId ?? null;
  const pendingAction =
    pendingInput === undefined ? undefined : PENDING_ACTION_BY_TARGET[pendingInput.targetStatus];

  const boardOrders = activeOrders.data ?? [];
  const entries = (status: BoardStatus): BoardSectionEntry[] =>
    boardOrders
      .filter((order) => order.status === status)
      .map((order) => ({
        order,
        createdAtLabel: formatCreatedAt(order.created_at, timezone),
        pendingAction: order.id === pendingOrderId ? pendingAction : undefined,
      }));

  // R2-01: the orders whose cards are currently MOUNTED — every group on the
  // column layout, the selected tab's group alone on the tab layout (an
  // inactive TabsContent renders null, so its cards are not "visible" in any
  // sense that matters to feedback placement). When a rejected action's order
  // is not among them, BoardSection has no card to attach the InlineError to,
  // and the screen body carries it instead — see the fallback render below.
  const visibleOrderIds = new Set(
    (isExpanded ? BOARD_STATUSES : [selectedTab]).flatMap((status) =>
      entries(status).map((entry) => entry.order.id),
    ),
  );
  const orphanedActionError =
    actionError !== null && !visibleOrderIds.has(actionError.orderId) ? actionError : null;

  // The card callbacks every group shares; the eligibility matrix (T07) keeps
  // each card honest about which of them actually render a button.
  const cardCallbacks = {
    actorPreparationId,
    actionError,
    onStartPreparing: handleStartPreparing,
    onMarkReady: handleMarkReady,
    onCancel: handleCancelRequested,
    onPress: handleOpenOrderDetails,
  };

  let board: ReactNode;
  if (activeOrders.isPending) {
    board = <SkeletonList />;
  } else if (activeOrders.isError && activeOrders.data === undefined) {
    board = <ErrorState error={activeOrders.error} onRetry={() => void activeOrders.refetch()} />;
  } else if (boardOrders.length === 0) {
    board = (
      <EmptyState
        title="No active orders"
        description="New orders will appear here as customers place them."
      />
    );
  } else if (isExpanded) {
    board = (
      <View className="flex-row items-start gap-4">
        {BOARD_STATUSES.map((status) => (
          <BoardSection
            key={status}
            title={orderStatusLabel(status)}
            entries={entries(status)}
            className="flex-1"
            {...cardCallbacks}
          />
        ))}
      </View>
    );
  } else {
    board = (
      <Tabs
        value={selectedTab}
        onValueChange={(value: string) => setSelectedTab(value as BoardStatus)}
      >
        <TabsList>
          {BOARD_STATUSES.map((status) => (
            <TabsTrigger key={status} value={status}>
              <Text>{`${orderStatusLabel(status)} (${entries(status).length})`}</Text>
            </TabsTrigger>
          ))}
        </TabsList>
        {BOARD_STATUSES.map((status) => (
          <TabsContent key={status} value={status} className="mt-3">
            {/* No title: the trigger already carries the label and count. */}
            <BoardSection entries={entries(status)} {...cardCallbacks} />
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="gap-4 p-6">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text variant="h1">Preparation Workspace</Text>
          <View className="flex-row gap-2">
            <Button variant="outline" size="compact" onPress={() => void activeOrders.refetch()}>
              <Text>Refresh</Text>
            </Button>
            {/* AC-08: history is reached from the workspace — the same compact
                outline affordance style as Refresh, pushing the history route. */}
            <Button variant="outline" size="compact" onPress={() => router.push("/history")}>
              <Text>History</Text>
            </Button>
            <Button variant="ghost" size="compact" onPress={signOut.run} disabled={signOut.pending}>
              <Text>{signOut.pending ? "Signing out…" : "Sign out"}</Text>
            </Button>
          </View>
        </View>
        {signOut.message !== null ? (
          <Text variant="caption" tone="destructive" accessibilityRole="alert">
            {signOut.message}
          </Text>
        ) : null}
        {announcement !== null ? (
          <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {announcement}
          </Text>
        ) : null}
        {/* T11-R04: a failed background/manual refetch while the board still
            shows (stale) data is not silent — a transient inline notice beside
            the board. It clears itself on the next successful read (`isError`
            flips back); the full ErrorState stays reserved for a board with NO
            data. Realtime multiplies background refetches, so this window is
            no longer rare. */}
        {activeOrders.isError && activeOrders.data !== undefined ? (
          <InlineError error={activeOrders.error} />
        ) : null}
        {/* R2-01: the rejection feedback's fallback home. BoardSection renders
            it beside the card that fired the action, but when that order is no
            longer a VISIBLE card — it left the board under the rejection
            refetch, or moved into an unmounted tab group — this is the only
            place it can still reach the employee. Same InlineError surface, so
            the T04 O-1 unknown-error contract holds here too. */}
        {orphanedActionError !== null ? <InlineError error={orphanedActionError.error} /> : null}
        {board}
      </ScrollView>
      <CancelOrderDialog
        open={cancelTarget !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setCancelTarget(null);
        }}
        order={cancelTarget}
        onCancelOrder={handleCancelConfirmed}
        busy={mutation.isPending && mutation.variables?.targetStatus === "cancelled"}
      />
    </Screen>
  );
}
