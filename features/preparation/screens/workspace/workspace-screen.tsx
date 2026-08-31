import { useRouter } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { EmptyState, ErrorState, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, Text } from "@/components/ui";
import { useAuth, useSignOutAction } from "@/core/auth";
import { useLayout } from "@/core/responsive";

import type { ActiveOrderRow } from "../../api/fetch-active-orders";
import { CancelOrderDialog } from "../../components/cancel-order-dialog";
import { orderStatusLabel } from "../../components/order-status-badge";
import { effectiveTimezone, resolveStoreTimezone } from "../../model/store-day";
import { preparationKeys } from "../../queries/keys";
import { useActiveOrders } from "../../queries/use-active-orders";
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
 * Time display is store-timezone (decision 8): the settings read degrades
 * silently to the device timezone when the row is absent or the read fails —
 * the operational board never fails on it. Cards show the created time, not a
 * ticking timer (decision 10), and new-order arrivals are announced through a
 * polite live region (decision 9) — no toast, no sound. The workspace also
 * carries the sign-out affordance and a manual refresh (decision 10).
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
 * The created time as the board shows it: wall-clock time in the effective
 * (store, else device) timezone — a fixed 24-hour clock, deterministic and
 * unambiguous on a shared kiosk. Screen-local on purpose: the card stays dumb
 * about timezones and receives the label as a prop.
 */
function formatCreatedAt(isoTimestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoTimestamp));
}

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
