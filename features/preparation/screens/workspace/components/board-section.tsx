import { ScrollView, View } from "react-native";
import { Check, Circle, CircleDot } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { InlineError } from "@/components/feedback";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { ActiveOrderRow } from "../../../api/fetch-active-orders";
import { OrderCard } from "../../../components/order-card";

/**
 * One board group: the status heading with its count, and the group's order
 * cards. Presentational only — the workspace screen owns the reads, the
 * mutation, and the tab/column decision; this component receives fully-built
 * entries (the screen formats the created-time labels) and reports every
 * interaction upward through the card callbacks.
 *
 * Scope: private to the workspace screen. Ownership follows the nearest
 * stable consumer — move it up only when a second consumer actually appears,
 * not in anticipation of one. It must not fetch, must not read a store, and
 * must not import the Supabase client.
 *
 * A rejected transition's feedback renders HERE, immediately below the card
 * that fired it (AC-10's "near the action" convention): the error is passed
 * through as `unknown` straight into `InlineError` — screens receive
 * transport-level throws that are not `AppError`, so nothing here may assume
 * `error.kind` (the T04 O-1 constraint). When the errored order is not among
 * the rendered cards — it departed the board, or sits in a group whose
 * `TabsContent` is not mounted — the SCREEN renders the same feedback beside
 * the board instead (R2-01); a card-adjacent copy and the fallback can never
 * appear together, because the screen only renders the fallback for orders
 * this component is not showing.
 */

/** One card's worth of screen-prepared, per-order data. */
export type BoardSectionEntry = {
  /** The row to render, items embedded (T02's board read shape). */
  order: ActiveOrderRow;
  /** The screen-formatted (store-timezone) created-time caption. */
  createdAtLabel: string;
  /** The action whose mutation is currently in flight on this card. */
  pendingAction?: "startPreparing" | "markReady" | "cancel";
};

/** A rejected action on a specific order — rendered beside that order's card. */
export type BoardSectionActionError = {
  orderId: string;
  error: unknown;
};

type BoardSectionStatus = "new" | "preparing" | "ready";

const SECTION_STYLE: Record<
  BoardSectionStatus,
  { icon: LucideIcon; headerClassName: string; iconClassName: string; textClassName: string }
> = {
  new: {
    icon: Circle,
    headerClassName: "bg-secondary",
    iconClassName: "text-secondary-foreground",
    textClassName: "text-secondary-foreground",
  },
  preparing: {
    icon: CircleDot,
    headerClassName: "bg-primary",
    iconClassName: "text-primary-foreground",
    textClassName: "text-primary-foreground",
  },
  ready: {
    icon: Check,
    headerClassName: "bg-success",
    iconClassName: "text-success-foreground",
    textClassName: "text-success-foreground",
  },
};

export type BoardSectionProps = {
  /**
   * The group heading, with the count rendered beside it. Omitted on the tab
   * layout, where the tab trigger already carries both the label and the
   * count — repeating them would hand assistive tech the same words twice.
   */
  title?: string;
  status?: BoardSectionStatus;
  entries: BoardSectionEntry[];
  /** The signed-in employee's profile id — the assignment comparison. */
  actorPreparationId: string;
  /** The rejection feedback to render beside the card that fired it, if any. */
  actionError?: BoardSectionActionError | null;
  onStartPreparing: (order: ActiveOrderRow) => void;
  onMarkReady: (order: ActiveOrderRow) => void;
  onCancel: (order: ActiveOrderRow) => void;
  onPress: (order: ActiveOrderRow) => void;
  /** Lets expanded tablet lanes scroll independently while their headers stay visible. */
  scrollable?: boolean;
  className?: string;
};

export function BoardSection({
  title,
  status,
  entries,
  actorPreparationId,
  actionError,
  onStartPreparing,
  onMarkReady,
  onCancel,
  onPress,
  scrollable = false,
  className,
}: BoardSectionProps) {
  const sectionStyle = status === undefined ? undefined : SECTION_STYLE[status];

  const orderList =
    entries.length === 0 ? (
      <View className="min-h-32 items-center justify-center border border-dashed border-border bg-card p-6">
        <Text variant="body" tone="muted">
          No orders
        </Text>
      </View>
    ) : (
      <View className="gap-2">
        {entries.map(({ order, createdAtLabel, pendingAction }) => (
          <View key={order.id} className="gap-2">
            <OrderCard
              order={order}
              actorPreparationId={actorPreparationId}
              createdAtLabel={createdAtLabel}
              pendingAction={pendingAction}
              onStartPreparing={onStartPreparing}
              onMarkReady={onMarkReady}
              onCancel={onCancel}
              onPress={onPress}
            />
            {actionError !== null &&
            actionError !== undefined &&
            actionError.orderId === order.id ? (
              <InlineError error={actionError.error} />
            ) : null}
          </View>
        ))}
      </View>
    );

  return (
    <View className={cn("gap-3 border-t-4 border-border pt-3", scrollable && "flex-1", className)}>
      {title !== undefined ? (
        <View
          className={cn(
            "min-h-touch flex-row items-center justify-between gap-3 px-4 py-3",
            sectionStyle?.headerClassName ?? "bg-secondary",
          )}
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            {sectionStyle !== undefined ? (
              <Icon as={sectionStyle.icon} size={20} className={sectionStyle.iconClassName} />
            ) : null}
            <Text
              variant="h3"
              className={sectionStyle?.textClassName ?? "text-secondary-foreground"}
            >
              {title}
            </Text>
          </View>
          <View className="min-w-touch items-center px-3 py-1.5">
            <Text variant="mono" className="text-base text-foreground">
              {entries.length}
            </Text>
          </View>
        </View>
      ) : null}
      {scrollable && entries.length > 0 ? (
        <ScrollView className="flex-1" contentContainerClassName="pb-4" nestedScrollEnabled>
          {orderList}
        </ScrollView>
      ) : (
        orderList
      )}
    </View>
  );
}
