import { FlashList } from "@shopify/flash-list";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react-native";
import { BackHandler, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { Alert, Button, Icon, Screen, Text, useLayout } from "@/design-system";
import { cn } from "@/core/utils";
import { useCustomerCatalogSettings, useInvalidateCatalog } from "@/features/catalog";

import { OrderLineRow } from "../../components/order-line-row";
import { useAttemptStore } from "../../state/attempt-store";
import { SuccessCountdown } from "./components/success-countdown";

const DEFAULT_RESET_SECONDS = 25;

/** Confirmed local truth leads. Settings and tablet cleanup never hide the order number. */
export function OrderSuccessScreen() {
  const router = useRouter();
  const record = useAttemptStore((state) => state.record);
  const phase = useAttemptStore((state) => state.phase);
  const persistence = useAttemptStore((state) => state.persistence);
  const settings = useCustomerCatalogSettings();
  // Select the window once. A late settings response must not move an active deadline.
  const [seconds] = useState(
    () => settings.data?.customerSuccessResetSeconds ?? DEFAULT_RESET_SECONDS,
  );
  const { isExpanded, isLandscape } = useLayout();
  const split = isExpanded && isLandscape;
  const countdownReArmRef = useRef<(() => void) | null>(null);
  const resetInFlightRef = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [resetRefused, setResetRefused] = useState(false);
  const [navigatingHome, setNavigatingHome] = useState(false);
  const confirmedRecord = record?.status === "confirmed" ? record : null;
  const isValidSuccess = confirmedRecord !== null && phase === "confirmed";
  const cartClear = confirmedRecord?.cleanup.cartClear ?? null;

  // The order lowered stock on the server; refresh the snapshot so the next
  // customer is not offered units that are gone.
  const invalidateCatalog = useInvalidateCatalog();
  useEffect(() => {
    if (isValidSuccess) invalidateCatalog();
  }, [isValidSuccess, invalidateCatalog]);

  useEffect(() => {
    if (!isValidSuccess) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [isValidSuccess]);
  const clearLandedDone = cartClear === "done" && persistence !== "clearFailed";
  useEffect(() => {
    if (clearLandedDone) setResetRefused(false);
  }, [clearLandedDone]);

  const reset = async (retryCleanup = false) => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;
    setResetting(true);
    try {
      if (retryCleanup) await useAttemptStore.getState().retryCleanup();
      const result = await useAttemptStore.getState().resetForNextCustomer();
      if (result.status === "persisted") {
        setNavigatingHome(true);
        router.replace("/");
      } else setResetRefused(true);
    } finally {
      resetInFlightRef.current = false;
      setResetting(false);
    }
  };

  if (navigatingHome) return <Screen edges={["top", "bottom", "left", "right"]} />;
  if (!isValidSuccess)
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View className="w-full max-w-xl flex-1 justify-center gap-6 self-center px-6">
          <Alert
            variant="warning"
            title="This order can't be shown here."
            description="If you just placed an order, don't submit it again. Let store staff know if you need help checking it."
          />
          <Button size="large" onPress={() => router.replace("/")}>
            <Text>Back to Browse</Text>
          </Button>
        </View>
      </Screen>
    );

  const selectorUnsafe = cartClear === "failed" || persistence === "clearFailed";
  const cleanupUnsafe = selectorUnsafe || resetRefused;
  const cleanupPending = cartClear === "pending" && !cleanupUnsafe;
  const retryLabel = resetRefused && !selectorUnsafe ? "Try Again" : "Try Clearing Again";
  const totalQuantity = confirmedRecord.lineSnapshots.reduce((sum, line) => sum + line.quantity, 0);
  const distinctLines = confirmedRecord.lineSnapshots.length;

  const confirmation = (
    <View className="items-center gap-4 py-6 md:py-8" accessibilityLiveRegion="polite">
      <Icon as={Check} size={48} className="text-success" />
      <Text variant="h1" className="text-center">
        Order Confirmed
      </Text>
      <Text
        variant="display"
        selectable
        className="text-center text-primary"
        accessibilityLabel={`Order number ${confirmedRecord.success.displayNumber}`}
      >
        #{confirmedRecord.success.displayNumber}
      </Text>
      <Text tone="muted" className="text-center">
        Show this number to staff if asked.
      </Text>
    </View>
  );

  const nextCustomer = (
    <View className="gap-4">
      {cleanupUnsafe ? (
        <>
          <Alert
            variant="destructive"
            title="We couldn't finish clearing this tablet for the next customer"
            description="Your order is confirmed. This tablet isn't ready for the next person yet. Please let store staff know."
          />
          <Button size="large" disabled={resetting} onPress={() => void reset(true)}>
            <Text>{resetting ? "Clearing tablet…" : retryLabel}</Text>
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            size="large"
            disabled={cleanupPending || resetting}
            onPress={() => void reset()}
          >
            <Text>{resetting ? "Preparing tablet…" : "Next Customer"}</Text>
          </Button>
          <SuccessCountdown
            seconds={seconds}
            onExpire={() => reset()}
            reArmRef={countdownReArmRef}
          />
          {cleanupPending ? (
            <Text variant="caption" tone="muted">
              {"We're finishing clearing this tablet for the next customer — one moment."}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View className="min-h-0 flex-1" onTouchStart={() => countdownReArmRef.current?.()}>
        <View className={cn("min-h-0 flex-1", split && "flex-row gap-10 px-8 py-6")}>
          {split ? (
            <ScrollView
              className="flex-1"
              contentContainerClassName="grow justify-center px-6 py-6"
            >
              {confirmation}
            </ScrollView>
          ) : null}
          <View
            className={cn(
              "min-h-0 min-w-0 flex-1",
              split ? "border-l border-border/60 pl-8" : "px-5 md:px-8",
            )}
          >
            <FlashList
              data={confirmedRecord.lineSnapshots}
              keyExtractor={(line) => line.lineId}
              renderItem={({ item }) => <OrderLineRow line={item} />}
              ListHeaderComponent={
                <>
                  {!split ? confirmation : null}
                  <View className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 py-4">
                    <Text variant="h2">Submitted items</Text>
                    <Text tone="muted">
                      {totalQuantity} {totalQuantity === 1 ? "item" : "items"} · {distinctLines}{" "}
                      {distinctLines === 1 ? "selection" : "selections"}
                    </Text>
                  </View>
                </>
              }
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          </View>
        </View>
        {/* One stable countdown owner across rotation; moving it between branches resets its deadline. */}
        <ScrollView
          className="max-h-[40%] shrink-0 border-t border-border/60 bg-secondary/30"
          contentContainerClassName="w-full max-w-xl gap-4 self-center px-5 py-4 md:px-8"
        >
          {nextCustomer}
        </ScrollView>
      </View>
    </Screen>
  );
}
