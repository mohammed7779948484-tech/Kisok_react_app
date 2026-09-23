import { View } from "react-native";

import { AppImage } from "@/components/media/app-image";
import { Text } from "@/components/ui";
import { cn } from "@/core/utils";
import { customerLineIdentity, type CartLine } from "@/features/cart";

export type OrderLineRowProps = { line: CartLine; className?: string };

/** Immutable submitted snapshot, using the same merchandising identity as Cart. */
export function OrderLineRow({ line, className }: OrderLineRowProps) {
  const { title, caption } = customerLineIdentity(line);
  return (
    <View className={cn("flex-row items-center gap-4 border-b border-border/70 py-5", className)}>
      <View className="w-16 rounded-lg bg-muted/25 p-2 md:w-20" style={{ aspectRatio: 3 / 4 }}>
        <AppImage
          uri={line.imageUri}
          alt={line.productDisplayName}
          contentFit="contain"
          className="h-full w-full"
        />
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text variant="h3">{title}</Text>
        {caption ? (
          <Text variant="caption" tone="muted">
            {caption}
          </Text>
        ) : null}
      </View>
      <View className="min-w-16 items-center px-3 py-2">
        <Text variant="caption" tone="muted">
          Qty
        </Text>
        <Text
          variant="h3"
          className="tabular-nums"
          accessibilityLabel={`Quantity: ${line.quantity}`}
        >
          {line.quantity}
        </Text>
      </View>
    </View>
  );
}
