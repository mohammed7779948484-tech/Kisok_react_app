import { memo, type ReactNode } from "react";
import { X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon, MediaFrame, Text } from "@/design-system";
import { cn } from "@/core/utils";

import type { CartLine } from "../model/cart-line.schema";
import { customerLineIdentity } from "../model/customer-line-identity";
import { QuantityStepper } from "./quantity-stepper";

export type CartLineCardProps = {
  line: CartLine;
  onSetQuantity: (lineId: string, next: number) => void;
  onRemove: (line: CartLine) => void;
  /** The cart-wide lock (an order is being sent): every control renders disabled. */
  disabled?: boolean;
  /** Stack the quantity control under the name on narrow widths. */
  compact?: boolean;
  /** A short note under the name — e.g. a quantity the store no longer has. */
  note?: ReactNode;
};

/**
 * One selection in the cart: the product large and uncropped, its options,
 * and the two things a customer does here — change the quantity or take it
 * out. Presentational: it reads no store.
 */
export const CartLineCard = memo(function CartLineCard({
  line,
  onSetQuantity,
  onRemove,
  disabled = false,
  compact = false,
  note,
}: CartLineCardProps) {
  const { title, caption } = customerLineIdentity(line);

  const stepper = (
    <QuantityStepper
      value={line.quantity}
      onValueChange={(next) => onSetQuantity(line.lineId, next)}
      disabled={disabled}
      className="w-[152px]"
    />
  );

  return (
    <View
      className={cn(
        "flex-row gap-4 rounded-2xl border bg-card p-3 pr-2",
        note ? "border-warning/60" : "border-border",
      )}
    >
      <MediaFrame
        source={line.imageUri}
        alt=""
        fit="contain"
        preset="row"
        inset={4}
        tint="paper"
        fallbackLabel={line.productDisplayName}
        recyclingKey={line.lineId}
        className={cn("rounded-xl border border-border/60", compact ? "h-24 w-24" : "h-28 w-28")}
      />

      <View className={cn("min-w-0 flex-1 gap-3 py-1", !compact && "flex-row items-center")}>
        <View className="min-w-0 flex-1 gap-1">
          <Text testID="full-cart-line-title" variant="title" numberOfLines={2}>
            {title}
          </Text>
          {caption ? (
            <Text testID="full-cart-line-caption" variant="meta" tone="muted" numberOfLines={2}>
              {caption}
            </Text>
          ) : null}
          {note ? <View className="pt-1">{note}</View> : null}
        </View>
        {stepper}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${line.productDisplayName}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onRemove(line)}
        hitSlop={4}
        className={cn(
          "h-touch w-touch items-center justify-center self-start rounded-full",
          disabled ? "opacity-40" : "active:bg-muted",
        )}
      >
        <Icon as={X} size={20} className="text-muted-foreground" />
      </Pressable>
    </View>
  );
});
