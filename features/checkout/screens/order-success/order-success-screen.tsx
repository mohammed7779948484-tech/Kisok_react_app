import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react-native";
import { BackHandler, ScrollView, View } from "react-native";
import { Redirect, useRouter } from "expo-router";

import { Button, Icon, Screen, Text, useLayout, usePageGutter } from "@/design-system";
import { cn } from "@/core/utils";
import { useCustomerCatalogSettings, useInvalidateCatalog } from "@/features/catalog";

import { OrderLineRow } from "../../components/order-line-row";
import { useCheckoutStore } from "../../state/checkout-store";
import { SuccessCountdown } from "./components/success-countdown";

const DEFAULT_RESET_SECONDS = 25;

/**
 * The order number, large and unmistakable, with what was ordered beside
 * it. The screen returns the tablet to browsing on its own after a quiet
 * interval; any touch restarts that interval.
 */
export function OrderSuccessScreen() {
  const router = useRouter();
  const phase = useCheckoutStore((state) => state.phase);
  const confirmed = useCheckoutStore((state) => state.confirmed);
  const settings = useCustomerCatalogSettings();
  // Chosen once: a late settings response must not move an active deadline.
  const [seconds] = useState(
    () => settings.data?.customerSuccessResetSeconds ?? DEFAULT_RESET_SECONDS,
  );
  const { width, isLandscape } = useLayout();
  const gutter = usePageGutter();
  const split = isLandscape && width >= 1000;
  const reArmRef = useRef<(() => void) | null>(null);
  const finishing = useRef(false);
  const showing = phase === "confirmed" && confirmed !== null;

  // The order lowered stock on the server; refresh the snapshot so the next
  // customer is not offered units that are gone.
  const invalidateCatalog = useInvalidateCatalog();
  useEffect(() => {
    if (showing) invalidateCatalog();
  }, [showing, invalidateCatalog]);

  useEffect(() => {
    if (!showing) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [showing]);

  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    await useCheckoutStore.getState().finish();
    router.replace("/");
  };

  if (!showing) return <Redirect href="/" />;

  const lines = confirmed.lineSnapshots;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const ticket = (
    <View
      className={cn("items-center gap-5 rounded-[32px] bg-primary px-8 py-10", split && "flex-1")}
      accessibilityLiveRegion="polite"
    >
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-foreground/15">
        <Icon as={Check} size={32} className="text-primary-foreground" />
      </View>
      <Text variant="eyebrow" className="text-primary-foreground/80">
        Order confirmed
      </Text>
      <Text className="text-center text-body-lg text-primary-foreground/85">Your order number</Text>
      <Text
        selectable
        accessibilityLabel={`Order number ${confirmed.success.displayNumber.split("").join(" ")}`}
        className="font-display-semibold text-primary-foreground"
        style={{ fontSize: split ? 88 : 64, lineHeight: split ? 96 : 72, letterSpacing: 6 }}
      >
        {confirmed.success.displayNumber}
      </Text>
      <Text className="max-w-sm text-center text-body text-primary-foreground/80">
        The store team is preparing it now. Show this number when you collect your order.
      </Text>
    </View>
  );

  const summary = (
    <View className={cn("gap-4", split && "min-h-0 w-[420px]")}>
      <View
        className={cn("rounded-3xl border border-border bg-card p-5", split && "min-h-0 flex-1")}
      >
        <View className="flex-row items-baseline justify-between pb-2">
          <Text variant="title">What you ordered</Text>
          <Text variant="meta" tone="muted">
            {`${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`}
          </Text>
        </View>
        <ScrollView className={split ? "min-h-0 flex-1" : undefined} scrollEnabled={split}>
          {lines.map((line) => (
            <OrderLineRow key={line.lineId} line={line} className="border-t border-border/70" />
          ))}
        </ScrollView>
      </View>
      <View className="gap-3">
        <Button size="large" block onPress={() => void finish()}>
          <Text>Start a new order</Text>
        </Button>
        <SuccessCountdown seconds={seconds} onExpire={() => void finish()} reArmRef={reArmRef} />
      </View>
    </View>
  );

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="min-h-0 flex-1" onTouchStart={() => reArmRef.current?.()}>
        {split ? (
          <View
            className="min-h-0 flex-1 flex-row gap-8 py-8"
            style={{ paddingHorizontal: gutter }}
          >
            {ticket}
            {summary}
          </View>
        ) : (
          <ScrollView contentContainerClassName="gap-6 py-8" style={{ paddingHorizontal: gutter }}>
            {ticket}
            {summary}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}
