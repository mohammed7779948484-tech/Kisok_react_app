import type { ReactNode } from "react";
import { View } from "react-native";

import { MediaFrame, Text } from "@/design-system";
import { cn } from "@/core/utils";
import { customerLineIdentity, type CartLine } from "@/features/cart";

export type OrderLineRowProps = {
  line: CartLine;
  /** Replaces the quantity figure on the right, e.g. a requested/available pair. */
  trailing?: ReactNode;
  className?: string;
};

/** One submitted line — read-only, with the same identity the cart shows. */
export function OrderLineRow({ line, trailing, className }: OrderLineRowProps) {
  const { title, caption } = customerLineIdentity(line);
  return (
    <View className={cn("flex-row items-center gap-4 py-3", className)}>
      <MediaFrame
        source={line.imageUri}
        alt=""
        fit="contain"
        preset="row"
        inset={3}
        tint="paper"
        fallbackLabel={line.productDisplayName}
        className="h-16 w-16 rounded-xl border border-border/60"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
        {caption ? (
          <Text variant="meta" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing ?? (
        <View
          accessible
          accessibilityLabel={`Quantity ${line.quantity}`}
          className="min-w-12 items-center rounded-full bg-secondary px-3 py-1.5"
        >
          <Text className="font-sans-bold text-body tabular-nums">{`×${line.quantity}`}</Text>
        </View>
      )}
    </View>
  );
}
