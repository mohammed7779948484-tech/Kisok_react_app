import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Check, Clock3, Package, Play, UserRound, X } from "lucide-react-native";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Icon,
  Text,
} from "@/components/ui";
import { cn } from "@/core/utils";

import type { ActiveOrderRow } from "../api/fetch-active-orders";
import { allowedOrderActions } from "../model/status-actions";
import { OrderStatusBadge, orderStatusLabel } from "./order-status-badge";

/**
 * Presentational only: it receives data and reports interactions upward.
 *
 * Scope: shared across the preparation feature.
 * Ownership follows the nearest stable consumer — move it up only when a
 * second consumer actually appears, not in anticipation of one.
 *
 * It must not fetch, must not read a store, and must not import the Supabase
 * client. Keeping components dumb is what makes them testable without a
 * provider tree and reusable across screens.
 *
 * Use design-system components and semantic token classes — never a raw hex
 * colour or an inline dimension that should be a token.
 *
 * The board/history order card (AC-03): the display number prominent (mono is
 * for order numbers), the created time and item summary as captions the SCREEN
 * formats (the card stays dumb about timezones and snapshot labels), the status
 * via {@link OrderStatusBadge}, and the assignment as words compared by id —
 * real names are unobtainable under current RLS (plan decision 3).
 *
 * Actions come from T07's {@link allowedOrderActions} — never re-derived here —
 * and a button renders only when the affordance is granted AND the screen wired
 * the callback. The card never calls a mutation: screens own them. History
 * reuses the card in `readOnly` mode, which renders the same content with no
 * action buttons. With an `onPress` the card BODY is the button that opens
 * Order Details, and the action footer renders as its SIBLING, never its
 * descendant — react-native-web maps role=button to a native `<button>`, and
 * HTML forbids nested buttons, so the actions must sit outside the interactive
 * body (the ARIA card pattern). Without an `onPress` the card is a plain
 * display row.
 *
 * In-flight state (plan decision 5) is per-card and per-ACTION: while
 * `pendingAction` names an action, THAT button alone renders disabled with its
 * label swapped ("Starting…", the sign-in-form convention) — the other
 * affordances stay enabled, because the screen drives one mutation at a time
 * per card. The disabled + swapped label is the card's whole in-flight
 * surface: a disabled Button already ignores presses, so the repeat-tap guard
 * a screen layers on top is the screen's convention, not the card's. A pending
 * action whose button is not rendered (ungranted, unwired, or read-only) is
 * ignored — the screen owns passing a coherent value.
 */
export type OrderCardProps = {
  /** The row to render, items embedded (T02's board read shape). */
  order: ActiveOrderRow;
  /** The signed-in employee's profile id — `useAuth().profile.id` at the screen. */
  actorPreparationId: string;
  /** History mode: same content, no action buttons. */
  readOnly?: boolean;
  className?: string;
  /** Screen-formatted (store-timezone) created-time label. */
  createdAtLabel?: string;
  /** Screen-computed item summary; the card falls back to a plain item count. */
  itemSummaryLabel?: string;
  /**
   * The action whose mutation is currently in flight on this card — the
   * screen passes its mutation's pending flag (mapped to the action) here.
   * That button renders disabled with its label swapped; see the module
   * docblock for the per-action and repeat-tap-guard conventions.
   */
  pendingAction?: "startPreparing" | "markReady" | "cancel";
  /** Start preparing was pressed — the screen owns the mutation. */
  onStartPreparing?: (order: ActiveOrderRow) => void;
  /** Mark ready was pressed — the screen owns the mutation. */
  onMarkReady?: (order: ActiveOrderRow) => void;
  /** Cancel was pressed — the screen owns the confirmation and mutation. */
  onCancel?: (order: ActiveOrderRow) => void;
  /** Open Order Details for this card. */
  onPress?: (order: ActiveOrderRow) => void;
};

export function OrderCard({
  order,
  actorPreparationId,
  readOnly = false,
  className,
  createdAtLabel,
  itemSummaryLabel,
  pendingAction,
  onStartPreparing,
  onMarkReady,
  onCancel,
  onPress,
}: OrderCardProps) {
  // T07 owns the eligibility matrix; the card consumes it, never re-derives.
  const actions = allowedOrderActions(order, actorPreparationId);

  // A footer button needs BOTH the affordance and the wired callback, and
  // read-only (history) mode offers nothing. Compact size is the Button
  // primitive's own sanctioned size for the dense Preparation board. A pending
  // action disables its OWN button only, swapping its label — per-card pending
  // is per-action.
  const footerButtons: ReactNode[] = [];
  if (onStartPreparing && actions.startPreparing && !readOnly) {
    const starting = pendingAction === "startPreparing";
    footerButtons.push(
      <Button
        key="start-preparing"
        variant="primary"
        size="compact"
        disabled={starting}
        onPress={() => onStartPreparing(order)}
      >
        <Icon as={Play} size={16} className="text-primary-foreground" />
        <Text>{starting ? "Starting…" : "Start Preparing"}</Text>
      </Button>,
    );
  }
  if (onMarkReady && actions.markReady && !readOnly) {
    const markingReady = pendingAction === "markReady";
    footerButtons.push(
      <Button
        key="mark-ready"
        variant="primary"
        size="compact"
        disabled={markingReady}
        onPress={() => onMarkReady(order)}
      >
        <Icon as={Check} size={16} className="text-primary-foreground" />
        <Text>{markingReady ? "Marking ready…" : "Mark Ready"}</Text>
      </Button>,
    );
  }
  if (onCancel && actions.cancel && !readOnly) {
    const cancelling = pendingAction === "cancel";
    footerButtons.push(
      <Button
        key="cancel"
        variant="destructive"
        size="compact"
        disabled={cancelling}
        onPress={() => onCancel(order)}
      >
        <Icon as={X} size={16} className="text-destructive-foreground" />
        <Text>{cancelling ? "Cancelling…" : "Cancel"}</Text>
      </Button>,
    );
  }

  // The one summary the card computes itself is the trivial item count;
  // anything involving snapshot labels or options stays screen-side.
  const itemCount = order.order_items.length;
  const itemSummary = itemSummaryLabel ?? (itemCount === 1 ? "1 item" : `${itemCount} items`);

  // Visible when the order is assigned; words, never colour alone.
  const assignmentLabel =
    order.assigned_preparation_id === null
      ? null
      : order.assigned_preparation_id === actorPreparationId
        ? "You"
        : "Assigned to another employee";

  const isPending = pendingAction !== undefined;

  const cardBody = (
    <>
      <CardHeader className="gap-3 p-4">
        {/* flex-wrap: the mono number and the badge must wrap, not overflow,
            at 200% text scaling or in a narrow board column. */}
        <View className="flex-row flex-wrap items-start justify-between gap-2">
          <View className="gap-1">
            <Text variant="caption" className="text-xs font-bold">
              Order
            </Text>
            <Text variant="mono" className="text-xl">
              {order.display_number}
            </Text>
          </View>
          <OrderStatusBadge status={order.status} />
        </View>
      </CardHeader>
      <CardContent className="gap-3 px-4 pb-4 pt-0">
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2">
          {createdAtLabel ? (
            <View className="flex-row items-center gap-1.5">
              <Icon as={Clock3} size={16} className="text-muted-foreground" />
              <Text variant="caption">{createdAtLabel}</Text>
            </View>
          ) : null}
          <View className="flex-row items-center gap-1.5">
            <Icon as={Package} size={16} className="text-muted-foreground" />
            <Text variant="caption" className="font-bold text-foreground">
              {itemSummary}
            </Text>
          </View>
        </View>
        {assignmentLabel ? (
          <Badge variant={assignmentLabel === "You" ? "primary" : "outline"} className="gap-1.5">
            <Icon
              as={UserRound}
              size={14}
              className={assignmentLabel === "You" ? "text-primary-foreground" : "text-foreground"}
            />
            <Text>{assignmentLabel}</Text>
          </Badge>
        ) : null}
      </CardContent>
    </>
  );

  const cardFooter =
    footerButtons.length > 0 ? (
      <CardFooter className="border-t border-border bg-muted/60 p-3">{footerButtons}</CardFooter>
    ) : null;

  // No press handler: a plain display row (history unless the screen wires
  // one).
  if (!onPress) {
    return (
      <Card
        className={cn("overflow-hidden", isPending && "border-primary bg-primary/5", className)}
      >
        {cardBody}
        {cardFooter}
      </Card>
    );
  }

  const assignmentSuffix =
    assignmentLabel === null
      ? ""
      : assignmentLabel === "You"
        ? ", assigned to you"
        : ", assigned to another employee";

  // The pressable BODY opens details, carrying the essentials — display
  // number, status, assignment — in its accessible name, composed from T08's
  // label so the name says exactly what the badge shows. The action footer is
  // its SIBLING, never a descendant: react-native-web maps role=button to a
  // native <button>, and nested buttons are invalid HTML — actions sit outside
  // the interactive body.
  return (
    <Card className={cn("overflow-hidden", isPending && "border-primary bg-primary/5", className)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Order ${order.display_number}, ${orderStatusLabel(order.status)}${assignmentSuffix}`}
        // The Button primitive's own press-feedback idiom — a calm opacity dip,
        // nothing more (the restrained-motion policy).
        className="active:bg-secondary/70 active:opacity-90"
        onPress={() => onPress(order)}
      >
        {cardBody}
      </Pressable>
      {cardFooter}
    </Card>
  );
}
