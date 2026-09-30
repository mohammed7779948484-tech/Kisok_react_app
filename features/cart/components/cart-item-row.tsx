import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { AppImage, Button, cloudinaryImageUrl, ConfirmDialog, Icon, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { CartLine } from "../model/cart-line.schema";
import { customerLineIdentity } from "../model/customer-line-identity";
import { QuantityStepper } from "./quantity-stepper";

/**
 * Presentational only: it receives a line snapshot and reports interactions
 * upward — `onSetQuantity` for stepper changes, `onRemove` only after the user
 * confirms removal. It owns no state except the confirm dialog's open flag,
 * reads no store, never navigates, and never touches Supabase or the catalog:
 * the snapshot is all a line needs to render itself (AC-03). Keeping the row
 * dumb keeps editing owned by the Full Cart workspace.
 *
 * Confirmed-remove contract (AC-04, plan decision 6): the remove control never
 * removes directly. Pressing it opens the shared `ConfirmDialog` configured
 * destructive with copy naming the product; only its confirm button calls
 * `onRemove`. Cancel and dismiss (overlay/escape) do nothing.
 *
 * locked/pending: both disable the stepper and the remove control — `locked`
 * is the cart-wide interaction lock (AC-09: controls render disabled instead of
 * silently ignoring taps), `pending` is an optional per-line flag the caller
 * sets while that line's own mutation is in flight. `pending` is
 * presentation-only: the row does not observe or derive it, the caller owns
 * when it is true. A disabled remove control simply cannot open the dialog.
 *
 * Accessibility (AC-12): the image's alt is the product name, the remove
 * button's accessible name includes the product name ("Remove <product>") so
 * it is distinguishable per line, and bounds/lock are exposed as disabled
 * accessibility state, never as ignored taps.
 */
export type CartItemRowProps = {
  /** The line snapshot to render. Must already be a validated CartLine. */
  line: CartLine;
  /** Reports the next quantity chosen through the stepper. */
  onSetQuantity: (next: number) => void;
  /** Called only after the user confirms the destructive remove dialog. */
  onRemove: () => void;
  /** Disables all controls — the cart-wide interaction lock. */
  locked?: boolean;
  /** Disables all controls — presentation-only per-line pending state. */
  pending?: boolean;
  className?: string;
};

export function CartItemRow({
  line,
  onSetQuantity,
  onRemove,
  locked = false,
  pending = false,
  className,
}: CartItemRowProps) {
  // Recycling must never transfer a destructive dialog to another selection.
  const [confirmLineId, setConfirmLineId] = useState<string | null>(null);
  const controlsDisabled = locked || pending;
  // Snapshot-only identity shared with previews and confirmed orders.
  const { title, caption } = customerLineIdentity(line);

  return (
    <View className={cn("flex-row items-start gap-4 border-b border-border/70 py-5", className)}>
      <View
        className="w-20 overflow-hidden rounded-lg bg-muted/25 p-2 md:w-24"
        style={{ aspectRatio: 3 / 4 }}
      >
        <AppImage
          uri={cloudinaryImageUrl(line.imageUri, "packshot")}
          alt={line.productDisplayName}
          contentFit="contain"
          className="h-full w-full"
        />
      </View>
      <View className="min-w-0 flex-1 gap-2 pt-1">
        <Text variant="h3">{title}</Text>
        {caption ? (
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
        ) : null}
        <View className="mt-2 self-start">
          <Text variant="label" tone="muted" className="mb-2">
            Quantity
          </Text>
          <QuantityStepper
            value={line.quantity}
            onValueChange={onSetQuantity}
            disabled={controlsDisabled}
          />
        </View>
      </View>
      <View className="items-end">
        <Button
          variant="ghost"
          size="icon"
          className="border border-transparent"
          accessibilityLabel={`Remove ${line.productDisplayName}`}
          disabled={controlsDisabled}
          onPress={() => setConfirmLineId(line.lineId)}
        >
          <Icon as={Trash2} className="text-destructive" />
        </Button>
      </View>
      <ConfirmDialog
        open={confirmLineId === line.lineId && !controlsDisabled}
        onOpenChange={(open) => setConfirmLineId(open ? line.lineId : null)}
        title={`Remove ${line.productDisplayName}?`}
        description={`${line.productDisplayName} will be taken out of the cart.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmLineId(null);
          if (!controlsDisabled) onRemove();
        }}
      />
    </View>
  );
}
