import { Check, ShoppingBag } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import {
  AdaptiveSheet,
  AdaptiveSheetClose,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  Button,
  Icon,
  LoadingState,
  MediaFrame,
  Text,
} from "@/design-system";
import { cn } from "@/core/utils";

import type { CartLine } from "../model/cart-line.schema";
import { customerLineIdentity } from "../model/customer-line-identity";
import { selectTotalQuantity, useCartStore } from "../state/cart-store";

export type QuickCartSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewFullCart?: () => void;
  /** The line that was just added or changed, shown first and large. */
  addedLineId?: string | null;
  className?: string;
};

const PREVIEW_LIMIT = 4;

function PreviewLine({ line, featured = false }: { line: CartLine; featured?: boolean }) {
  const { title, caption } = customerLineIdentity(line);
  return (
    <View
      className={cn(
        "flex-row items-center gap-4",
        featured ? "rounded-2xl border border-border bg-card p-3" : "py-2",
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
        className={cn("rounded-xl border border-border/60", featured ? "h-24 w-24" : "h-16 w-16")}
      />
      <View className="min-w-0 flex-1 gap-1">
        <Text testID="quick-cart-line-title" variant="title" numberOfLines={2}>
          {title}
        </Text>
        {caption ? (
          <Text testID="quick-cart-line-caption" variant="meta" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      <View
        accessible
        testID="quick-cart-line-quantity"
        accessibilityLabel={`Quantity ${line.quantity}`}
        className="min-w-12 items-center rounded-full bg-secondary px-3 py-1.5"
      >
        <Text className="font-sans-bold text-body tabular-nums">{`×${line.quantity}`}</Text>
      </View>
    </View>
  );
}

/**
 * A quick, reassuring look at the cart after "Add to cart" (or from the
 * header): what was just added, what else is in, and the way to review.
 * Editing happens in the full cart.
 */
export function QuickCartSheet({
  open,
  onOpenChange,
  onViewFullCart,
  addedLineId,
  className,
}: QuickCartSheetProps) {
  const lines = useCartStore((state) => state.lines);
  const hydrated = useCartStore((state) => state.hydrated);
  const totalQuantity = useCartStore(selectTotalQuantity);
  const added = lines.find((line) => line.lineId === addedLineId);
  const others = lines.filter((line) => line.lineId !== addedLineId);
  const preview = others.slice(0, added ? PREVIEW_LIMIT - 1 : PREVIEW_LIMIT);
  const hidden = others.length - preview.length;

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent testID="quick-cart-sheet" className={cn("bg-background", className)}>
        <AdaptiveSheetHeader className="flex-row items-center gap-4 px-6 pb-4 pt-6">
          <View
            className={cn(
              "h-12 w-12 items-center justify-center rounded-full",
              added ? "bg-success" : "bg-secondary",
            )}
          >
            <Icon
              as={added ? Check : ShoppingBag}
              size={24}
              className={added ? "text-success-foreground" : "text-primary"}
            />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <AdaptiveSheetTitle>{added ? "Added to your cart" : "Your cart"}</AdaptiveSheetTitle>
            <AdaptiveSheetDescription testID="quick-cart-summary">
              {lines.length === 0
                ? "Nothing here yet."
                : `${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} · ${lines.length} ${lines.length === 1 ? "selection" : "selections"}`}
            </AdaptiveSheetDescription>
          </View>
        </AdaptiveSheetHeader>

        <ScrollView
          className="shrink grow-0"
          style={{ minHeight: 120 }}
          contentContainerClassName="gap-3 px-6 pb-4"
        >
          {!hydrated ? (
            <LoadingState label="Restoring your cart…" />
          ) : lines.length === 0 ? (
            <Text tone="muted" className="py-6 text-center">
              Items you add while browsing will appear here.
            </Text>
          ) : (
            <>
              {added ? <PreviewLine line={added} featured /> : null}
              {preview.length > 0 ? (
                <View className="gap-1">
                  {added ? (
                    <Text variant="label" tone="muted" className="pt-2">
                      Also in your cart
                    </Text>
                  ) : null}
                  {preview.map((line) => (
                    <PreviewLine key={line.lineId} line={line} />
                  ))}
                </View>
              ) : null}
              {hidden > 0 ? (
                <Text variant="meta" tone="muted">
                  {`+ ${hidden} more ${hidden === 1 ? "selection" : "selections"}`}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>

        <AdaptiveSheetFooter className="flex-row gap-3 border-t border-border bg-background px-6 py-5">
          <AdaptiveSheetClose asChild>
            <Button variant="tonal" size="large" className="flex-1">
              <Text>Keep browsing</Text>
            </Button>
          </AdaptiveSheetClose>
          {hydrated && lines.length > 0 && onViewFullCart ? (
            <Button
              testID="quick-cart-review"
              size="large"
              className="flex-1"
              onPress={onViewFullCart}
            >
              <Text>Review cart</Text>
            </Button>
          ) : null}
        </AdaptiveSheetFooter>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
