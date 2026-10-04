import { FlashList } from "@shopify/flash-list";
import { ArrowLeft, Search, ShoppingBag, Undo2 } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import {
  Button,
  ConfirmDialog,
  Eyebrow,
  Icon,
  Screen,
  SkeletonList,
  Text,
  useLayout,
  usePageGutter,
} from "@/design-system";
import { cn } from "@/core/utils";

import { CartLineCard } from "../../components/cart-line-card";
import type { CartLine } from "../../model/cart-line.schema";
import { useCart } from "../../state/use-cart";

export type FullCartScreenProps = {
  /** The confirm action; Checkout composes it here, Cart never imports Checkout. */
  finalAction?: ReactNode;
  /** A notice shown above the final action (Checkout's own guidance). */
  notice?: ReactNode;
  /** Disable every edit, e.g. while Checkout is still restoring. */
  interactionDisabled?: boolean;
  /** A note under a line's name, e.g. a quantity the store no longer has. */
  lineNote?: (line: CartLine) => ReactNode;
};

const RAIL_WIDTH = 384;
const UNDO_MS = 6000;

/**
 * The cart as a calm review workspace: selections on the left, a summary
 * rail with the confirm action on the right (stacked below on narrow and
 * portrait screens). No prices — quantities and options are the whole story.
 */
export function FullCartScreen({
  finalAction,
  notice,
  interactionDisabled = false,
  lineNote,
}: FullCartScreenProps) {
  const router = useRouter();
  const cart = useCart();
  const { lines, hydrated, locked, saveFailed, totalQuantity, distinctLineCount } = cart;
  const { setLineQuantity, removeLine } = cart;
  const { width, isLandscape } = useLayout();
  const gutter = usePageGutter();
  const split = isLandscape && width >= 1000;
  const compactLines = width < 720;
  const disabled = locked || interactionDisabled || !hydrated;
  const [confirmClear, setConfirmClear] = useState(false);
  const [removed, setRemoved] = useState<CartLine | null>(null);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const setQuantity = useCallback(
    (lineId: string, next: number) => setLineQuantity(lineId, next),
    [setLineQuantity],
  );
  const remove = useCallback(
    (line: CartLine) => {
      removeLine(line.lineId);
      setRemoved(line);
    },
    [removeLine],
  );
  const undo = () => {
    if (!removed) return;
    const { lineId: _lineId, ...input } = removed;
    cart.addItem(input);
    setRemoved(null);
  };

  const browse = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const header = (
    <View
      className="flex-row flex-wrap items-end justify-between gap-4 pb-5 pt-6"
      style={{ paddingHorizontal: gutter }}
    >
      <View className="gap-2">
        <Eyebrow rule>Your selection</Eyebrow>
        <Text testID="full-cart-title" variant="display">
          Cart
        </Text>
      </View>
      <Button testID="full-cart-keep-browsing" variant="tonal" disabled={locked} onPress={browse}>
        <Icon as={ArrowLeft} size={18} />
        <Text>Keep browsing</Text>
      </Button>
    </View>
  );

  const undoBar = removed ? (
    <View
      accessibilityLiveRegion="polite"
      className="flex-row items-center justify-between gap-3 rounded-xl bg-foreground px-4 py-2"
    >
      <Text numberOfLines={1} className="flex-1 text-body text-background">
        {`Removed ${removed.productDisplayName}`}
      </Text>
      <Button variant="text" onPress={undo} className="px-2">
        <Icon as={Undo2} size={18} className="text-accent-soft" />
        <Text className="text-accent-soft">Undo</Text>
      </Button>
    </View>
  ) : null;

  if (!hydrated) {
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        {header}
        <View style={{ paddingHorizontal: gutter }}>
          <SkeletonList />
        </View>
      </Screen>
    );
  }

  if (lines.length === 0) {
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        {header}
        <View className="flex-1 items-center justify-center gap-7 px-6 pb-16">
          <View className="h-36 w-36 items-center justify-center rounded-full bg-secondary">
            <View className="h-24 w-24 items-center justify-center rounded-full bg-card">
              <Icon as={ShoppingBag} size={40} className="text-primary" />
            </View>
          </View>
          <View className="max-w-md items-center gap-3">
            <Text variant="h1" className="text-center">
              Your cart is empty
            </Text>
            <Text variant="lead" className="text-center">
              Browse the store and add what you’d like. Your selections will wait here until you’re
              ready to order.
            </Text>
          </View>
          <View className="flex-row flex-wrap justify-center gap-3">
            <Button size="large" onPress={() => router.replace("/products")}>
              <Text>Browse products</Text>
            </Button>
            <Button size="large" variant="tonal" onPress={() => router.replace("/search")}>
              <Icon as={Search} size={20} />
              <Text>Search</Text>
            </Button>
          </View>
          {undoBar ? <View className="w-full max-w-md">{undoBar}</View> : null}
        </View>
      </Screen>
    );
  }

  const summary = (
    <View className="gap-5">
      <View className="gap-1">
        <Text variant="eyebrow">Ready to order</Text>
        <View className="flex-row items-baseline gap-3">
          <Text
            testID="full-cart-total-quantity"
            className="font-display text-display-lg text-foreground"
            accessibilityLabel={`${totalQuantity} items`}
          >
            {totalQuantity}
          </Text>
          <Text variant="title">{totalQuantity === 1 ? "item" : "items"}</Text>
        </View>
        <Text testID="full-cart-selection-count" variant="meta" tone="muted">
          {distinctLineCount} {distinctLineCount === 1 ? "selection" : "selections"}
        </Text>
      </View>
      <View className="gap-2 border-t border-border pt-4">
        <Text variant="meta" tone="muted">
          Confirming sends your order to the store team. You’ll get an order number to collect it.
        </Text>
      </View>
      {saveFailed ? (
        <Text variant="caption" tone="warning">
          This tablet couldn’t save your latest change. Your cart still works — just finish your
          order before leaving.
        </Text>
      ) : null}
      {notice}
      {finalAction}
      <Button
        variant="text"
        disabled={disabled}
        onPress={() => setConfirmClear(true)}
        className="self-center"
      >
        <Text className="text-muted-foreground">Clear cart</Text>
      </Button>
    </View>
  );

  const list = (
    <FlashList
      data={lines}
      keyExtractor={(line) => line.lineId}
      extraData={`${disabled}|${compactLines}|${lineNote ? "notes" : ""}`}
      renderItem={({ item }) => (
        <View className="pb-3">
          <CartLineCard
            line={item}
            disabled={disabled}
            compact={compactLines}
            note={lineNote?.(item)}
            onSetQuantity={setQuantity}
            onRemove={remove}
          />
        </View>
      )}
      ListHeaderComponent={
        <View className="flex-row items-center justify-between pb-3">
          <Text variant="label" tone="muted">
            {`${distinctLineCount} ${distinctLineCount === 1 ? "selection" : "selections"}`}
          </Text>
          {locked ? (
            <Text variant="label" tone="muted">
              Editing paused while your order is sent
            </Text>
          ) : null}
        </View>
      }
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      {header}
      {split ? (
        <View className="min-h-0 flex-1 flex-row gap-6" style={{ paddingHorizontal: gutter }}>
          <View className="min-h-0 min-w-0 flex-1 gap-3">
            {undoBar}
            {list}
          </View>
          <View style={{ width: RAIL_WIDTH }} className="pb-6">
            <ScrollView
              className="rounded-3xl border border-border bg-secondary/50"
              contentContainerClassName="p-6"
              bounces={false}
            >
              {summary}
            </ScrollView>
          </View>
        </View>
      ) : (
        <View className="min-h-0 flex-1">
          <View className="min-h-0 flex-1 gap-3" style={{ paddingHorizontal: gutter }}>
            {undoBar}
            {list}
          </View>
          <View
            className={cn("border-t border-border bg-secondary/60 py-5")}
            style={{ paddingHorizontal: gutter }}
          >
            <View className="flex-row flex-wrap items-center gap-x-6 gap-y-3">
              <View className="min-w-[160px] flex-1 gap-0.5">
                <Text testID="full-cart-summary" variant="title">
                  {`${totalQuantity} ${totalQuantity === 1 ? "item" : "items"} · ${distinctLineCount} ${distinctLineCount === 1 ? "selection" : "selections"}`}
                </Text>
                <Text variant="meta" tone="muted">
                  You’ll get an order number to collect it.
                </Text>
              </View>
              <View className="min-w-[260px] flex-1">{finalAction}</View>
            </View>
            {notice || saveFailed ? (
              <View className="gap-2 pt-3">
                {saveFailed ? (
                  <Text variant="caption" tone="warning">
                    This tablet couldn’t save your latest change. Finish your order before leaving.
                  </Text>
                ) : null}
                {notice}
              </View>
            ) : null}
            <Button
              variant="text"
              disabled={disabled}
              onPress={() => setConfirmClear(true)}
              className="mt-1 self-start"
            >
              <Text className="text-muted-foreground">Clear cart</Text>
            </Button>
          </View>
        </View>
      )}
      <ConfirmDialog
        open={confirmClear && !disabled}
        onOpenChange={setConfirmClear}
        title="Clear your cart?"
        description="Every selection will be removed."
        confirmLabel="Clear cart"
        destructive
        onConfirm={() => {
          setConfirmClear(false);
          cart.clearCart();
        }}
      />
    </Screen>
  );
}
