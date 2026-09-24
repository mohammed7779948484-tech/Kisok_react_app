import { PackageCheck, ShoppingCart } from "lucide-react-native";
import { ScrollView, View } from "react-native";

import { EmptyState, LoadingState } from "@/components/feedback";
import { AppImage } from "@/components/media/app-image";
import {
  AdaptiveSheet,
  AdaptiveSheetClose,
  AdaptiveSheetContent,
  AdaptiveSheetDescription,
  AdaptiveSheetFooter,
  AdaptiveSheetHeader,
  AdaptiveSheetTitle,
  Alert,
  Button,
  Icon,
  Text,
} from "@/components/ui";
import { cn } from "@/core/utils";

import { customerLineIdentity } from "../model/customer-line-identity";
import { selectTotalQuantity, useCartStore } from "../state/cart-store";

export type QuickCartSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewFullCart?: () => void;
  addedLineId?: string | null;
  className?: string;
};

/** A bounded reassurance/preview surface. All editing belongs in Full Cart. */
export function QuickCartSheet({
  open,
  onOpenChange,
  onViewFullCart,
  addedLineId,
  className,
}: QuickCartSheetProps) {
  const lines = useCartStore((state) => state.lines);
  const hydrated = useCartStore((state) => state.hydrated);
  const persistence = useCartStore((state) => state.persistence);
  const totalQuantity = useCartStore(selectTotalQuantity);
  const added = lines.find((line) => line.lineId === addedLineId);
  const preview = (
    added ? [added, ...lines.filter((line) => line.lineId !== addedLineId)] : lines
  ).slice(0, 3);
  const remaining = lines.length - preview.length;

  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange}>
      <AdaptiveSheetContent className={cn("bg-background", className)}>
        <AdaptiveSheetHeader className="gap-3 px-6 pb-4 pt-6">
          {added ? <Icon as={PackageCheck} size={32} className="text-success" /> : null}
          <AdaptiveSheetTitle>{added ? "Added to cart" : "Your Cart"}</AdaptiveSheetTitle>
          <AdaptiveSheetDescription>
            {added
              ? "Your selection is in. Keep exploring or take a look at your cart."
              : "A quick look at your selections. Edit quantities and confirm in your cart."}
          </AdaptiveSheetDescription>
        </AdaptiveSheetHeader>
        <ScrollView className="min-h-0 shrink" contentContainerClassName="gap-4 px-6 pb-6">
          {persistence === "memoryOnly" ? (
            <Alert
              variant="warning"
              title="Saved in memory only"
              description="We couldn't save your cart to this tablet, so it may be lost if the app closes."
            />
          ) : null}
          {persistence === "clearFailed" ? (
            <Alert
              variant="destructive"
              title="Couldn't clear the saved cart"
              description="A previous cart may still be stored on this tablet. Please let store staff know."
            />
          ) : null}
          {!hydrated ? (
            <LoadingState label="Restoring your cart…" />
          ) : lines.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Your cart is empty"
              description="Items you add while browsing will appear here."
            />
          ) : (
            <>
              {preview.map((line) => {
                const identity = customerLineIdentity(line);
                return (
                  <View
                    key={line.lineId}
                    className="flex-row items-center gap-4 border-b border-border/50 py-3"
                  >
                    <View
                      className="w-16 rounded-lg bg-muted/25 p-2"
                      style={{ aspectRatio: 3 / 4 }}
                    >
                      <AppImage
                        uri={line.imageUri}
                        alt=""
                        contentFit="contain"
                        className="h-full w-full"
                      />
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <Text variant="h3">{identity.title}</Text>
                      {identity.caption ? (
                        <Text variant="caption" tone="muted">
                          {identity.caption}
                        </Text>
                      ) : null}
                      <Text variant="label">Quantity {line.quantity}</Text>
                    </View>
                  </View>
                );
              })}
              {remaining > 0 ? (
                <Text tone="muted">
                  {remaining} more {remaining === 1 ? "selection" : "selections"} in your cart
                </Text>
              ) : null}
              <Text variant="h3">
                Cart · {totalQuantity} {totalQuantity === 1 ? "item" : "items"}
              </Text>
            </>
          )}
        </ScrollView>
        <AdaptiveSheetFooter className="gap-3 bg-background px-6 py-5">
          {hydrated && lines.length > 0 && onViewFullCart ? (
            <Button size="large" block onPress={onViewFullCart}>
              <Text>View Cart</Text>
            </Button>
          ) : null}
          <AdaptiveSheetClose asChild>
            <Button variant="ghost" block>
              <Text>Keep Shopping</Text>
            </Button>
          </AdaptiveSheetClose>
        </AdaptiveSheetFooter>
      </AdaptiveSheetContent>
    </AdaptiveSheet>
  );
}
