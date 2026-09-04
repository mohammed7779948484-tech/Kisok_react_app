import { View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Text } from "@/components/ui";
import { cn } from "@/core/utils";

import type { CartLine } from "@/features/cart";

/**
 * Presentational only: it receives a line snapshot and renders it — no state,
 * no callbacks, no navigation. Read-only by design: this is the line
 * presentation for surfaces that DISPLAY a cart being submitted or already
 * sent (the Order Review screen now; the Order Success items and the stock
 * conflict join consume it later), never for editing one — CartItemRow owns
 * the stepper and remove affordances, and duplicating them here would give the
 * review a second mutation surface it must not have. It must not fetch, must
 * not read a store, and must not import the Supabase client: the snapshot is
 * all a line needs to render itself. The `CartLine` import is TYPE-ONLY
 * (through the cart feature's public types), so the row stays decoupled from
 * the cart's runtime graph; `CartLine` deliberately carries no prices, and
 * neither does this row — an in-store order submission has no monetary
 * values anywhere.
 *
 * Scope: shared across the checkout feature. Ownership follows the nearest
 * stable consumer — move it up only when a second consumer actually appears,
 * not in anticipation of one.
 *
 * Accessibility (AC-16): the image's alt is the product display name, and the
 * quantity uses the QuantityStepper's label convention (`Quantity: N`) so a
 * screen reader says what the number is, not a bare digit — the review's rows
 * stay as legible to assistive technology as the cart's, without carrying the
 * stepper's live region (a read-only value never changes).
 */
export type OrderLineRowProps = {
  /** The line snapshot to render. Must already be a validated CartLine. */
  line: CartLine;
  className?: string;
};

export function OrderLineRow({ line, className }: OrderLineRowProps) {
  // Derived from the snapshot only, in display order — the same composition
  // CartItemRow uses, so the review and the cart can never disagree about what
  // a line is called: the variant label plus each selected option value label,
  // dot-separated. With no options the caption is the bare variantLabel.
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
      {/* Read-only quantity: no stepper here — the label convention carries
          the meaning to assistive technology, the snapshot carries the
          number. */}
      <Text variant="body" accessibilityLabel={`Quantity: ${line.quantity}`}>
        {line.quantity}
      </Text>
    </View>
  );
}
