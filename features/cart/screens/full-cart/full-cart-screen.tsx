import { FlashList } from "@shopify/flash-list";
import { ArrowLeft, ShoppingCart, Trash2 } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Screen,
  SkeletonList,
  Text,
  useLayout,
} from "@/design-system";
import { cn } from "@/core/utils";

import { CartItemRow } from "../../components/cart-item-row";
import { getCartSnapshot, useCart } from "../../state/use-cart";

export type FullCartScreenProps = {
  /** Checkout composes its final action here; Cart never imports Checkout. */
  finalAction?: ReactNode;
  notice?: ReactNode;
  interactionDisabled?: boolean;
};

/** Editable final review. Persistence and mutation remain owned by the cart store. */
export function FullCartScreen({
  finalAction,
  notice,
  interactionDisabled = false,
}: FullCartScreenProps) {
  const router = useRouter();
  const view = useCart();
  const { lines, persistence, locked, hydrated, totalQuantity, distinctLineCount } = view;
  const { isExpanded, isLandscape } = useLayout();
  const split = isExpanded && isLandscape;
  const disabled = locked || interactionDisabled;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const canEdit = () => !disabledRef.current && !getCartSnapshot().locked;
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const warnings = (
    <>
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
      {notice}
    </>
  );

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="flex-row flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-6 md:px-8">
        <View className="gap-1">
          <Text variant="h1">Your Cart</Text>
          <Text tone="muted">Your selections, ready to confirm.</Text>
        </View>
        <Button variant="ghost" disabled={disabled} onPress={() => router.push("/")}>
          <Icon as={ArrowLeft} />
          <Text>Continue Shopping</Text>
        </Button>
      </View>
      {!hydrated ? (
        <View className="p-6">
          <SkeletonList />
        </View>
      ) : lines.length === 0 ? (
        <View className="flex-1">
          <View className="gap-3 px-5 md:px-8">{warnings}</View>
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Items you add while browsing will appear here."
            action={{ label: "Browse Products", onPress: () => router.push("/") }}
          />
        </View>
      ) : (
        <View className={cn("min-h-0 flex-1", split && "flex-row gap-8 px-8 pb-6")}>
          <View className={cn("min-h-0 min-w-0 flex-1", !split && "px-5 md:px-8")}>
            <View className="flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2">
              <Text variant="label" tone="muted">
                {distinctLineCount} {distinctLineCount === 1 ? "selection" : "selections"}
              </Text>
              <Button
                variant="ghost"
                size="compact"
                disabled={disabled}
                onPress={() => setConfirmClearOpen(true)}
              >
                <Icon as={Trash2} size={18} />
                <Text>Clear Cart</Text>
              </Button>
            </View>
            <FlashList
              data={lines}
              keyExtractor={(line) => line.lineId}
              extraData={disabled}
              renderItem={({ item }) => (
                <CartItemRow
                  line={item}
                  locked={disabled}
                  onSetQuantity={(next) => {
                    if (canEdit()) view.setLineQuantity(item.lineId, next);
                  }}
                  onRemove={() => {
                    if (canEdit()) view.removeLine(item.lineId);
                  }}
                />
              )}
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          </View>
          <View
            className={cn(
              "bg-secondary/40",
              split ? "w-80 rounded-xl" : "max-h-[45%] border-t border-border/60",
            )}
          >
            <ScrollView contentContainerClassName="gap-4 p-5 md:p-6" bounces={false}>
              <View className="gap-2">
                <Text variant="h2">Ready when you are</Text>
                <Text variant="lead">
                  {totalQuantity} {totalQuantity === 1 ? "item" : "items"}
                </Text>
                <Text tone="muted">
                  Check your options and quantities. Confirming sends this order to the store.
                </Text>
              </View>
              {warnings}
              {finalAction}
            </ScrollView>
          </View>
        </View>
      )}
      <ConfirmDialog
        open={confirmClearOpen && !disabled}
        onOpenChange={setConfirmClearOpen}
        title="Clear the cart?"
        description="All items will be removed from your cart. This can't be undone."
        confirmLabel="Remove All"
        destructive
        onConfirm={() => {
          setConfirmClearOpen(false);
          if (canEdit()) view.clearCart();
        }}
      />
    </Screen>
  );
}
