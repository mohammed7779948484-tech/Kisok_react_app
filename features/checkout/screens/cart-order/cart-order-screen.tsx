import { useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { BackHandler, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { Alert, Button, Screen, Spinner, Text } from "@/design-system";
import { FullCartScreen, getCartSnapshot, useCart } from "@/features/cart";

import { MAX_NORMALIZED_ITEMS, normalizeCartLines } from "../../model/normalized-request";
import { useSubmitOrderMutation } from "../../queries/use-submit-order-mutation";
import {
  classifySubmitOutcome,
  useAttemptStore,
  type AttemptPhase,
} from "../../state/attempt-store";
import {
  FailureOutcomePanel,
  StockConflictPanel,
  UnknownOutcomePanel,
} from "./components/outcome-panels";

/** Checkout-owned composition: the editable Cart is the final confirmation surface. */
export function CartOrderScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const cart = useCart();
  const phase = useAttemptStore((state) => state.phase);
  const conflict = useAttemptStore((state) => state.conflict);
  const failure = useAttemptStore((state) => state.failure);
  const recordLoaded = useAttemptStore((state) => state.recordLoaded);
  const mutation = useSubmitOrderMutation();
  const flight = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ title: string; description: string } | null>(null);
  const lastPhase = useRef<AttemptPhase>("idle");
  useEffect(() => {
    // A covered cart route can stay mounted in the stack. Only the visible owner hands off.
    if (!isFocused) return;
    if (phase === "confirmed" && lastPhase.current !== "confirmed")
      router.replace("/checkout-success");
    lastPhase.current = phase;
  }, [phase, router, isFocused]);

  const guarded =
    preparing ||
    phase === "submitting" ||
    phase === "unknown" ||
    phase === "held" ||
    phase === "unsafe-recovery";
  useEffect(() => {
    if (!guarded || !isFocused) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [guarded, isFocused]);

  const variantCount = new Set(cart.lines.map((line) => line.variantId.toLowerCase())).size;
  const overLimit = variantCount > MAX_NORMALIZED_ITEMS;

  const confirm = async () => {
    const state = useAttemptStore.getState();
    if (
      flight.current ||
      !state.recordLoaded ||
      (state.phase !== "idle" && state.phase !== "failed")
    )
      return;
    const snapshot = getCartSnapshot();
    if (!snapshot.hydrated || !snapshot.lines.length || snapshot.locked || !snapshot.ownerId)
      return;
    // Synchronous guard closes the queued durable-write window, before the store locks Cart.
    flight.current = true;
    setPreparing(true);
    setNotice(null);
    try {
      let normalized;
      try {
        normalized = normalizeCartLines(snapshot.lines);
      } catch {
        setNotice({
          title: "Adjust your selections",
          description: `An order can include up to ${MAX_NORMALIZED_ITEMS} different options. Remove some selections or reduce quantities before confirming.`,
        });
        return;
      }
      const prepared = await useAttemptStore
        .getState()
        .prepareAttempt({ ownerId: snapshot.ownerId, lines: snapshot.lines, normalized });
      if (!prepared.ok) {
        setNotice(
          prepared.reason === "persist-failed"
            ? {
                title: "We couldn't save your order details to this tablet",
                description: "Your order wasn't submitted — please try again.",
              }
            : {
                title: "We couldn't start your submission",
                description: "Please wait while this tablet checks its saved order information.",
              },
        );
        return;
      }
      try {
        const response = await mutation.mutateAsync(prepared.request);
        const outcome = classifySubmitOutcome({ response });
        if (outcome.kind === "success") {
          await useAttemptStore.getState().resolveSuccess({
            orderId: outcome.response.order_id,
            displayNumber: outcome.response.display_number,
            createdAt: outcome.response.created_at,
          });
        } else if (outcome.kind === "stock-conflict") {
          await useAttemptStore.getState().resolveStockConflict(outcome.conflicts);
        } else useAttemptStore.getState().resolveUnknown();
      } catch (error) {
        const outcome = classifySubmitOutcome({ error });
        if (outcome.kind === "definite-failure")
          await useAttemptStore.getState().resolveDefiniteFailure(outcome.error);
        else useAttemptStore.getState().resolveUnknown();
      }
    } finally {
      flight.current = false;
      setPreparing(false);
    }
  };
  const checkAgain = async () => {
    if (flight.current || useAttemptStore.getState().phase !== "unknown") return;
    flight.current = true;
    setChecking(true);
    try {
      await useAttemptStore.getState().replayAttempt();
    } finally {
      flight.current = false;
      setChecking(false);
    }
  };
  const editCart = () => {
    setNotice(null);
    useAttemptStore.getState().enterReview();
  };

  if (preparing || phase === "submitting" || phase === "confirmed") {
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View
          className="flex-1 items-center justify-center gap-6 px-6"
          accessibilityRole="progressbar"
          accessibilityLabel={checking ? "Checking your order…" : "Submitting your order…"}
          accessibilityLiveRegion="polite"
        >
          <Spinner size="large" />
          <Text variant="h1" className="text-center">
            {phase === "confirmed"
              ? "Order confirmed"
              : checking
                ? "Checking your order"
                : "Sending your order"}
          </Text>
          <Text tone="muted" className="max-w-lg text-center">
            {checking
              ? "We're checking the same request. This won't create a second order."
              : "Stay here for your order number. Your selections are safely held while we confirm."}
          </Text>
        </View>
      </Screen>
    );
  }

  if (phase !== "idle") {
    return (
      <Screen edges={["top", "bottom", "left", "right"]}>
        <View className="w-full max-w-2xl flex-1 self-center px-5 py-8 md:px-8">
          {phase === "stock-conflict" && conflict ? (
            <StockConflictPanel conflicts={conflict} lines={cart.lines} />
          ) : (
            <ScrollView contentContainerClassName="grow justify-center gap-6 py-8">
              {phase === "unknown" ? (
                <UnknownOutcomePanel />
              ) : phase === "failed" && failure ? (
                <FailureOutcomePanel failure={failure} />
              ) : (
                <Alert
                  variant="destructive"
                  title="This tablet needs staff attention"
                  description="Please ask store staff to check the saved order before using this tablet again."
                />
              )}
            </ScrollView>
          )}
          <View className="gap-3 pt-5">
            {phase === "unknown" ? (
              <Button size="large" onPress={() => void checkAgain()}>
                <Text>Check Again</Text>
              </Button>
            ) : null}
            {phase === "failed" && failure?.retryable ? (
              <Button size="large" onPress={() => void confirm()}>
                <Text>Try Again</Text>
              </Button>
            ) : null}
            {phase === "failed" || phase === "stock-conflict" ? (
              <Button
                variant={phase === "stock-conflict" ? "primary" : "outline"}
                size="large"
                onPress={editCart}
              >
                <Text>Edit Cart</Text>
              </Button>
            ) : null}
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <FullCartScreen
      interactionDisabled={!recordLoaded || guarded}
      notice={
        <>
          {overLimit ? (
            <Alert
              variant="warning"
              title="A few selections need to come out"
              description={`One order can contain up to ${MAX_NORMALIZED_ITEMS} different options. Remove at least ${variantCount - MAX_NORMALIZED_ITEMS} different ${variantCount - MAX_NORMALIZED_ITEMS === 1 ? "option" : "options"} before confirming. Changing quantities won't reduce this count.`}
            />
          ) : null}
          {notice ? <Alert variant="warning" {...notice} /> : null}
        </>
      }
      finalAction={
        <Button
          size="large"
          block
          disabled={
            !recordLoaded || !cart.hydrated || cart.locked || !cart.lines.length || overLimit
          }
          onPress={() => void confirm()}
        >
          <Text>Confirm Order</Text>
        </Button>
      }
    />
  );
}
