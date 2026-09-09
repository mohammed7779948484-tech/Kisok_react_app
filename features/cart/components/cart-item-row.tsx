import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { ConfirmDialog } from "@/components/feedback";
import { AppImage } from "@/components/media/app-image";
import { Button, Icon, Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CartLine } from "../model/cart-line.schema";
import { QuantityStepper } from "./quantity-stepper";

/**
 * Presentational only: it receives a line snapshot and reports interactions
 * upward — `onSetQuantity` for stepper changes, `onRemove` only after the user
 * confirms removal. It owns no state except the confirm dialog's open flag,
 * reads no store, never navigates, and never touches Supabase or the catalog:
 * the snapshot is all a line needs to render itself (AC-03). Keeping the row
 * dumb is what lets the quick sheet and the Full Cart screen (T08/T09) wire
 * their own callbacks around the same presentation.
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const controlsDisabled = locked || pending;
  // Derived from the snapshot only, in display order: the variant label plus
  // each selected option value label, dot-separated. With no options the
  // caption is the bare variantLabel.
  const caption = [
    line.variantLabel,
    ...line.optionSelections.map((selection) => selection.optionValueLabel),
  ].join(" · ");

  return (
    <View className={cn("flex-row items-center gap-3", className)}>
      <AppImage
        uri={line.imageUri}
        alt={line.productDisplayName}
        className="h-20 w-20 rounded-lg"
      />
      <View className="flex-1 gap-1">
        <Text variant="h3">{line.productDisplayName}</Text>
        <Text variant="caption">{caption}</Text>
      </View>
      <View className="items-end gap-2">
        <QuantityStepper
          value={line.quantity}
          onValueChange={onSetQuantity}
          disabled={controlsDisabled}
        />
        <Button
          variant="outline"
          size="icon"
          accessibilityLabel={`Remove ${line.productDisplayName}`}
          disabled={controlsDisabled}
          onPress={() => setConfirmOpen(true)}
        >
          <Icon as={Trash2} />
        </Button>
      </View>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${line.productDisplayName}?`}
        description={`${line.productDisplayName} will be taken out of the cart.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove();
        }}
      />
    </View>
  );
}
