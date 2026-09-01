import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { EmptyState, ErrorState, InlineError, SkeletonList } from "@/components/feedback";
import { Screen } from "@/components/layout/screen";
import { AppImage } from "@/components/media/app-image";
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, Text } from "@/components/ui";
import { useAuth } from "@/core/auth";

import type { ActiveOrderRow } from "../../api/fetch-active-orders";
import { CancelOrderDialog } from "../../components/cancel-order-dialog";
import { OrderStatusBadge } from "../../components/order-status-badge";
import { allowedOrderActions } from "../../model/status-actions";
import { effectiveTimezone, resolveStoreTimezone } from "../../model/store-day";
import { preparationKeys } from "../../queries/keys";
import { useOrderDetail } from "../../queries/use-order-detail";
import { useStoreSettings } from "../../queries/use-store-settings";
import { useUpdateOrderStatusMutation } from "../../queries/use-update-order-status-mutation";

/**
 * The Order Details screen (AC-07/AC-10): one order's immutable item snapshot
 * — product name, variant label, options, brand, quantity, image where one
 * was captured — rendered AS STORED, never rebuilt from the catalog (which is
 * additionally unreadable to this role). Reached from the board and from
 * history; terminal orders (completed/cancelled) render inspection-only, with
 * no action buttons.
 *
 * Plan decision 1: a STATIC route with `orderId` as a query param — the route
 * file reads `useLocalSearchParams` and passes the param down as a prop, and
 * THIS screen branches on a missing/empty id FIRST (T03-R03): the read hook
 * is mounted only with a real id, because it has no `enabled` guard by
 * design — a fabricated id would stringify into a doomed retryable request.
 *
 * The screen owns the one read (`useOrderDetail`), the settings read for the
 * created-time timezone (decision 8: store zone, silent degrade to the device
 * zone when the row is absent or the read fails), the ONE transition mutation
 * with its per-action pending surface (decision 5, the workspace convention),
 * the cancel dialog's open state, and the rejection handling. The mutation
 * hook invalidates the feature's queries on SUCCESS only (T05-R02), so THIS
 * screen owns AC-10's rejected-transition refresh: onError renders the
 * failure near the actions and invalidates, so the refetched order shows the
 * server's unchanged truth — a transition is never fabricated locally or
 * silently swallowed. A rejected cancel closes the dialog first (T10-R01):
 * feedback behind an open modal is invisible.
 *
 * The rejection feedback always renders SOMEWHERE the employee can see
 * (R2-01): normally below the order card the actions live in, but when the
 * loaded order is not on screen — the rejection refetch failed (the error
 * state replaces the content; the brief forbids stale content here), or the
 * refetched row is terminal with no actions row to anchor near — the feedback
 * falls back to the screen body instead of rendering nowhere. The two copies
 * are mutually exclusive by construction: the near-action copy renders only
 * for the loaded order, the fallback only when it is not. Its lifetime
 * matches the workspace (R2-06): it persists until the NEXT action dispatch,
 * never auto-cleared by a successful read.
 *
 * Items render in the deterministic client-side `variant_sku` order (decision
 * 7), and the created time is the fixed store-timezone wall clock (decision
 * 10 — no ticking timer).
 */

/** One item row of the embedded snapshot — the migration-07 shape. */
type ItemRow = ActiveOrderRow["order_items"][number];

/** The in-flight action for the transition the RPC is running. */
type OrderDetailAction = "startPreparing" | "markReady" | "cancel";

/** A rejected action on this order — rendered near the actions, or by the fallback. */
type ActionError = {
  orderId: string;
  error: unknown;
};

const PENDING_ACTION_BY_TARGET: Record<"preparing" | "ready" | "cancelled", OrderDetailAction> = {
  preparing: "startPreparing",
  ready: "markReady",
  cancelled: "cancel",
};

/**
 * The created time as the details screen shows it: wall-clock time in the
 * effective (store, else device) timezone — a fixed 24-hour clock,
 * deterministic and unambiguous on a shared kiosk. The workspace board's own
 * screen-local helper, copied rather than shared (each screen owns its label
 * formatting).
 *
 * Built from `formatToParts` so the hour can be absorbed with `% 24` — the
 * same guard model/store-day.ts documents (:113-114): some ICU builds (Hermes
 * tablets) run an h24 cycle and would otherwise render midnight as "24:00"
 * with a 24-hour clock (T11-R05).
 */
function formatCreatedAt(isoTimestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoTimestamp));
  const component = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = Number(component("hour")) % 24;
  return `${String(hour).padStart(2, "0")}:${component("minute")}`;
}

/**
 * The deterministic client-side item order (plan decision 7): codepoint
 * comparison on `variant_sku` — stable across platforms, unlike
 * `localeCompare`. The sort is stable, so equal SKUs keep the read's order.
 */
function compareByVariantSku(left: ItemRow, right: ItemRow): number {
  if (left.variant_sku === right.variant_sku) return 0;
  return left.variant_sku < right.variant_sku ? -1 : 1;
}

/**
 * The stored options as labels: the snapshot's `variant_options` is the
 * migration-07 array of `{type, value}` pairs, rendered AS STORED. The
 * generated type is the wide `Json` union, so each entry is checked before it
 * renders — a non-conforming entry has no honest label and is skipped rather
 * than stringified.
 */
function optionTexts(variantOptions: ItemRow["variant_options"]): string[] {
  if (!Array.isArray(variantOptions)) return [];
  const labels: string[] = [];
  for (const entry of variantOptions) {
    if (typeof entry !== "object" || entry === null) continue;
    const type = (entry as Record<string, unknown>).type;
    const value = (entry as Record<string, unknown>).value;
    if (typeof type !== "string" || typeof value !== "string") continue;
    labels.push(`${type}: ${value}`);
  }
  return labels;
}

/** The image alt: the product and its variant label, as stored. */
function itemImageAlt(item: ItemRow): string {
  return item.variant_name !== null
    ? `${item.product_name}, ${item.variant_name}`
    : item.product_name;
}

/** The unavailable state: no order to show, and a way out via the back action. */
function OrderUnavailable() {
  return (
    <EmptyState
      title="Order unavailable"
      description="We couldn't find this order. Go back and reopen it from the board or history."
    />
  );
}

type OrderDetailsScreenProps = {
  /**
   * The order to show, from the route's `orderId` query param (plan decision
   * 1). Absent or empty renders the unavailable state WITHOUT mounting the
   * read (T03-R03) — a fabricated id would stringify into a doomed retryable
   * request.
   */
  orderId?: string;
};

export function OrderDetailsScreen({ orderId }: OrderDetailsScreenProps) {
  const router = useRouter();

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerClassName="gap-4 p-6">
        {/* The back action is screen chrome: present in every state, including
            the unavailable one — a details screen always has a way out. */}
        <View className="flex-row items-center gap-2">
          <Button variant="ghost" size="compact" onPress={() => router.back()}>
            <Text>Back</Text>
          </Button>
          <Text variant="h1">Order Details</Text>
        </View>
        {/* T03-R03: branch FIRST — the read-bearing subtree below mounts only
            with a real id. */}
        {typeof orderId === "string" && orderId.length > 0 ? (
          <OrderDetailContent orderId={orderId} />
        ) : (
          <OrderUnavailable />
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * The screen body for a real order id: the read, the settings read, the
 * mutation, the dialog state, and the state branches. Split from
 * {@link OrderDetailsScreen} so the query hook mounts only on the real-id
 * branch — the param branch above stays hook-free.
 */
function OrderDetailContent({ orderId }: { orderId: string }) {
  const { profile } = useAuth();
  // Decision 3: the assignment comparison is by id, never names. The route
  // gate guarantees a resolved preparation profile here; the fallback simply
  // never matches an assignment, which degrades safe (no Mark Ready offered).
  const actorPreparationId = profile?.id ?? "";
  const queryClient = useQueryClient();

  const orderQuery = useOrderDetail(orderId);
  const storeSettings = useStoreSettings();
  const mutation = useUpdateOrderStatusMutation();

  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Decision 8: prefer the store timezone, degrade to the device zone when
  // the settings row is absent OR its read failed — never a details failure.
  const timezone = effectiveTimezone(resolveStoreTimezone(storeSettings.data ?? null));

  const runTransition = (targetStatus: "preparing" | "ready" | "cancelled") => {
    // One in-flight transition at a time: the shared mutation's state tracks
    // its LATEST call (the workspace convention). This is also the repeat
    // guard AC-04 layers on top of the disabled button.
    if (mutation.isPending) return;
    // R2-06: the rejection feedback persists until the NEXT action dispatch —
    // the workspace lifetime agreement; a successful read never clears it.
    setActionError(null);
    mutation.mutate(
      { orderId, targetStatus },
      {
        onSuccess: () => {
          // The hook's own onSuccess invalidates the feature's queries — the
          // refetched order is the rendered truth. The screen only closes the
          // dialog it owns.
          if (targetStatus === "cancelled") setCancelOpen(false);
        },
        onError: (error: unknown) => {
          // T05-R02: the hook invalidates on success ONLY — the screen owns
          // AC-10's rejected-transition refresh, so the order refetches and
          // shows the server's unchanged truth.
          setActionError({ orderId, error });
          // T10-R01: a rejected cancel must not leave its modal open over the
          // feedback that replaces it. Only cancel opens the dialog, so this
          // is a no-op for the other transitions.
          setCancelOpen(false);
          void queryClient.invalidateQueries({ queryKey: preparationKeys.all });
        },
      },
    );
  };

  const handleCancelRequested = () => {
    if (mutation.isPending) return;
    setCancelOpen(true);
  };

  // The in-flight action (decision 5), derived from the mutation's own ground
  // truth — the workspace convention mirrored here: while a write is pending,
  // THAT action alone renders disabled with its label swapped.
  const pendingInput = mutation.isPending ? mutation.variables : undefined;
  const pendingAction =
    pendingInput !== undefined && pendingInput.orderId === orderId
      ? PENDING_ACTION_BY_TARGET[pendingInput.targetStatus]
      : undefined;

  const order = orderQuery.data ?? null;
  const isOrderLoaded = !orderQuery.isPending && !orderQuery.isError && order !== null;
  // The rejection for THIS order — a param change leaves an older order's
  // error behind in state, and it must not surface on the new one.
  const ownActionError =
    actionError !== null && actionError.orderId === orderId ? actionError : null;

  let body: ReactNode;
  if (orderQuery.isPending) {
    body = <SkeletonList />;
  } else if (orderQuery.isError) {
    // A failed fetch shows the unavailable state instead of stale content —
    // the error passes through as unknown (T04 O-1: transport-level throws
    // are not AppError at the screen) and ErrorState decides whether a retry
    // can help.
    body = (
      <ErrorState
        title="Order unavailable"
        error={orderQuery.error}
        onRetry={() => void orderQuery.refetch()}
      />
    );
  } else if (order === null) {
    // A successful read that found no row: a value, not a failure. There is
    // nothing to retry — the back action is the way out.
    body = <OrderUnavailable />;
  } else {
    body = (
      <View className="gap-4">
        <OrderSummaryCard
          order={order}
          timezone={timezone}
          actorPreparationId={actorPreparationId}
          pendingAction={pendingAction}
          actionError={ownActionError}
          onStartPreparing={() => runTransition("preparing")}
          onMarkReady={() => runTransition("ready")}
          onCancel={handleCancelRequested}
        />
        <View className="gap-3">
          {[...order.order_items].sort(compareByVariantSku).map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </View>
      </View>
    );
  }

  // R2-01: the rejection feedback's fallback home. The summary card renders
  // it below the order the actions fired on, but when that order is not on
  // screen — the rejection refetch failed (the error state replaces the
  // content), or the row is gone — this is the only place it can still reach
  // the employee. Same InlineError surface, so the T04 O-1 unknown-error
  // contract holds here too. The two copies are mutually exclusive by
  // construction: this renders only when the order is NOT loaded.
  const fallbackError = ownActionError !== null && !isOrderLoaded ? ownActionError : null;

  return (
    <View className="gap-4">
      {fallbackError !== null ? <InlineError error={fallbackError.error} /> : null}
      {body}
      {order !== null ? (
        <CancelOrderDialog
          open={cancelOpen}
          onOpenChange={(open: boolean) => {
            if (!open) setCancelOpen(false);
          }}
          order={order}
          onCancelOrder={() => runTransition("cancelled")}
          busy={mutation.isPending && mutation.variables?.targetStatus === "cancelled"}
        />
      ) : null}
    </View>
  );
}

type OrderSummaryCardProps = {
  order: ActiveOrderRow;
  /** The effective (store, else device) timezone for the created-time label. */
  timezone: string;
  /** The signed-in employee's profile id — the assignment comparison. */
  actorPreparationId: string;
  /** The action whose mutation is currently in flight on this order. */
  pendingAction?: OrderDetailAction;
  /** The rejection feedback to render below the card, near the actions. */
  actionError?: ActionError | null;
  onStartPreparing: () => void;
  onMarkReady: () => void;
  onCancel: () => void;
};

/**
 * The order's metadata card: the display number prominent, the status badge,
 * the created time in the store timezone, the assignment indicator, and the
 * allowed actions for the order's current state in the footer. Presentational
 * — the parent owns the reads, the mutation, and the dialog; the actions here
 * mirror the board card's per-action pending surface (decision 5). A terminal
 * order renders no footer at all: status-actions grants nothing, which is
 * the eligibility matrix's own answer, never re-derived here.
 */
function OrderSummaryCard({
  order,
  timezone,
  actorPreparationId,
  pendingAction,
  actionError,
  onStartPreparing,
  onMarkReady,
  onCancel,
}: OrderSummaryCardProps) {
  // T07 owns the eligibility matrix; this card consumes it, never re-derives.
  const actions = allowedOrderActions(order, actorPreparationId);

  // Words, never colour alone — and real names are unobtainable under current
  // RLS (decision 3).
  const assignmentLabel =
    order.assigned_preparation_id === null
      ? null
      : order.assigned_preparation_id === actorPreparationId
        ? "You"
        : "Assigned to another employee";

  // A footer button needs the affordance; a pending action disables its OWN
  // button only, swapping its label (the board card's convention).
  const footerButtons: ReactNode[] = [];
  if (actions.startPreparing) {
    const starting = pendingAction === "startPreparing";
    footerButtons.push(
      <Button
        key="start-preparing"
        variant="primary"
        disabled={starting}
        onPress={onStartPreparing}
      >
        <Text>{starting ? "Starting…" : "Start Preparing"}</Text>
      </Button>,
    );
  }
  if (actions.markReady) {
    const markingReady = pendingAction === "markReady";
    footerButtons.push(
      <Button key="mark-ready" variant="primary" disabled={markingReady} onPress={onMarkReady}>
        <Text>{markingReady ? "Marking ready…" : "Mark Ready"}</Text>
      </Button>,
    );
  }
  if (actions.cancel) {
    const cancelling = pendingAction === "cancel";
    footerButtons.push(
      <Button key="cancel" variant="destructive" disabled={cancelling} onPress={onCancel}>
        <Text>{cancelling ? "Cancelling…" : "Cancel"}</Text>
      </Button>,
    );
  }

  return (
    <View className="gap-2">
      <Card>
        <CardHeader>
          {/* flex-wrap: the mono number and the badge must wrap, not overflow,
              at 200% text scaling. */}
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text variant="h2" className="font-mono tracking-widest">
              {order.display_number}
            </Text>
            <OrderStatusBadge status={order.status} />
          </View>
          <Text variant="caption">{`Created ${formatCreatedAt(order.created_at, timezone)}`}</Text>
        </CardHeader>
        {assignmentLabel !== null ? (
          <CardContent className="gap-2">
            <Badge variant="outline">
              <Text>{assignmentLabel}</Text>
            </Badge>
          </CardContent>
        ) : null}
        {footerButtons.length > 0 ? (
          <CardFooter className="flex-wrap">{footerButtons}</CardFooter>
        ) : null}
      </Card>
      {/* AC-10: the rejection feedback for THIS order renders here — directly
          below the card the actions fired on, never swallowed, never
          fabricated as a local transition. The error passes through as
          unknown (T04 O-1). */}
      {actionError != null ? <InlineError error={actionError.error} /> : null}
    </View>
  );
}

/**
 * One line of the immutable item snapshot (AC-07): the captured image (or its
 * placeholder) beside the stored product name, variant label, options, brand,
 * and SKU, with the quantity as its own prominent label. The snapshot renders
 * AS STORED — nothing here re-derives a label from the catalog.
 */
function OrderItemRow({ item }: { item: ItemRow }) {
  return (
    <Card>
      <CardContent className="flex-row gap-4 p-4">
        <AppImage
          uri={item.image_secure_url}
          alt={itemImageAlt(item)}
          className="h-24 w-24 shrink-0 rounded-lg"
        />
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-baseline justify-between gap-2">
            <Text variant="h3" className="min-w-0 flex-1">
              {item.product_name}
            </Text>
            <Text variant="h3">{`×${item.quantity}`}</Text>
          </View>
          {item.variant_name !== null ? <Text variant="body">{item.variant_name}</Text> : null}
          {optionTexts(item.variant_options).map((label) => (
            <Text key={label} variant="caption">
              {label}
            </Text>
          ))}
          {item.brand_name !== null ? <Text variant="caption">{item.brand_name}</Text> : null}
          <Text variant="mono" className="text-xs">
            {item.variant_sku}
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}
