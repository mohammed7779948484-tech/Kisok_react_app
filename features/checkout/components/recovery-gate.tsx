import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldAlert, ShieldQuestion } from "lucide-react-native";
import { BackHandler, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, Icon, Screen, Spinner, Text } from "@/design-system";
import { useActiveProfile } from "@/core/auth";
import { useCart } from "@/features/cart";

import {
  useAttemptStore,
  type RecoveryOutcome,
  type UnsafeHoldReason,
} from "../state/attempt-store";
import {
  FailureOutcomePanel,
  StockConflictPanel,
} from "../screens/cart-order/components/outcome-panels";

const UNSAFE_HOLD_DESCRIPTIONS: Record<UnsafeHoldReason, string> = {
  corrupt: "We couldn't read this tablet's saved order information. Please let store staff know.",
  "foreign-unresolved":
    "A previous customer's unfinished order submission is saved on this tablet. Please let store staff know.",
  "foreign-confirmed-unsafe-cleanup":
    "A previous customer's order cleanup couldn't finish on this tablet. Please let store staff know.",
};

export type RecoveryGateProps = { children: ReactNode };

/** Recovery owns the screen and removes browsing chrome/portals while it owns interaction. */
export function RecoveryGate({ children }: RecoveryGateProps) {
  const router = useRouter();
  const profile = useActiveProfile();
  const { lines } = useCart();
  const phase = useAttemptStore((state) => state.phase);
  const conflict = useAttemptStore((state) => state.conflict);
  const failure = useAttemptStore((state) => state.failure);
  const unsafeHold = useAttemptStore((state) => state.unsafeHold);
  const record = useAttemptStore((state) => state.record);
  const cleanupDone = record?.status === "confirmed" && record.cleanup.cartClear === "done";
  const [outcome, setOutcome] = useState<RecoveryOutcome | null>(null);
  const [episodeEnded, setEpisodeEnded] = useState(false);
  const recovery = useRef<Promise<RecoveryOutcome> | null>(null);
  const autoReplayFired = useRef(false);
  const flight = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Reattach to the same recovery promise after StrictMode effect replay.
    recovery.current ??= useAttemptStore.getState().recover(profile.id);
    let active = true;
    void recovery.current.then((result) => {
      if (active) setOutcome(result);
    });
    return () => {
      active = false;
    };
  }, [profile.id]);

  useEffect(() => {
    if (outcome !== "unresolved" || autoReplayFired.current) return;
    autoReplayFired.current = true;
    flight.current = true;
    void useAttemptStore
      .getState()
      .replayAttempt()
      .finally(() => {
        flight.current = false;
      });
  }, [outcome]);

  useEffect(() => {
    if (outcome === null || episodeEnded) return;
    const successReached =
      outcome === "confirmed-cleanup-done" ||
      (outcome === "confirmed-cleanup-pending" && cleanupDone) ||
      (outcome === "unresolved" && phase === "confirmed");
    if (!successReached) return;
    setEpisodeEnded(true);
    router.replace("/checkout-success");
  }, [outcome, phase, cleanupDone, episodeEnded, router]);

  const visible =
    outcome === null ||
    phase === "held" ||
    phase === "unsafe-recovery" ||
    (!episodeEnded &&
      (outcome === "unresolved" || outcome === "terminal"
        ? ["unknown", "submitting", "stock-conflict", "failed"].includes(phase)
        : outcome === "confirmed-cleanup-pending" && !cleanupDone));

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => subscription.remove();
  }, [visible]);

  const returnToCart = () => {
    // Explicit acknowledgement replaces the old review-screen mount reset.
    useAttemptStore.getState().enterReview();
    setEpisodeEnded(true);
    router.replace("/cart");
  };
  const runAction = async (action: "check" | "clear") => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    try {
      if (action === "check") await useAttemptStore.getState().replayAttempt();
      else await useAttemptStore.getState().retryCleanup();
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };

  if (!visible) return <>{children}</>;

  const held = phase === "held" || phase === "unsafe-recovery";
  const cleanup = outcome === "confirmed-cleanup-pending" && !held;
  const checking = outcome === null || phase === "submitting";
  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      <View
        className="w-full max-w-2xl flex-1 self-center px-5 py-8 md:px-8"
        accessibilityViewIsModal
      >
        {phase === "stock-conflict" && conflict ? (
          <StockConflictPanel conflicts={conflict} lines={lines} />
        ) : (
          <ScrollView contentContainerClassName="grow justify-center gap-6 py-6">
            {held ? (
              <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="gap-5">
                <Icon as={ShieldAlert} size={48} className="text-destructive" />
                <Text variant="h1">
                  {phase === "held"
                    ? "This order request needs staff help"
                    : "This tablet needs staff attention"}
                </Text>
                <Text variant="lead">Please ask a member of staff to help.</Text>
                <Text tone="muted">
                  {phase === "held"
                    ? "An order may already exist for this request. Please let store staff know so they can check it before this tablet is used again."
                    : unsafeHold
                      ? UNSAFE_HOLD_DESCRIPTIONS[unsafeHold.reason]
                      : "Please let store staff know."}
                </Text>
              </View>
            ) : cleanup ? (
              <View className="gap-5" accessibilityRole="alert">
                <Text variant="h1">Order Confirmed</Text>
                {record?.status === "confirmed" ? (
                  <Text
                    variant="display"
                    selectable
                    accessibilityLabel={`Order number ${record.success.displayNumber}`}
                  >
                    #{record.success.displayNumber}
                  </Text>
                ) : null}
                <Text variant="h2">
                  {"We couldn't finish clearing this tablet for the next customer"}
                </Text>
                <Text tone="muted">
                  {
                    "Your order is safe. This tablet isn't ready for the next person yet. Please let store staff know."
                  }
                </Text>
              </View>
            ) : phase === "failed" && failure ? (
              <FailureOutcomePanel failure={failure} />
            ) : (
              <View
                className="gap-5"
                accessibilityRole={checking ? "progressbar" : "alert"}
                accessibilityLiveRegion="polite"
              >
                {checking ? (
                  <Spinner size="large" />
                ) : (
                  <Icon as={ShieldQuestion} size={48} className="text-warning-text" />
                )}
                <Text variant="h1">
                  {outcome === null
                    ? "Checking this tablet"
                    : "We're checking your last order submission"}
                </Text>
                <Text variant="lead">
                  {outcome === null
                    ? "One moment while we restore saved order information."
                    : "It may already exist — we won't submit it twice."}
                </Text>
                {phase === "submitting" ? <Text tone="muted">Checking your order…</Text> : null}
              </View>
            )}
          </ScrollView>
        )}
        <View className="gap-3 pt-5">
          {!held && cleanup ? (
            <Button size="large" disabled={busy} onPress={() => void runAction("clear")}>
              <Text>{busy ? "Clearing tablet…" : "Try Clearing Again"}</Text>
            </Button>
          ) : null}
          {!held && !cleanup && phase === "unknown" && outcome !== null ? (
            <Button size="large" disabled={busy} onPress={() => void runAction("check")}>
              <Text>Check Again</Text>
            </Button>
          ) : null}
          {!held && !cleanup && (phase === "failed" || phase === "stock-conflict") ? (
            <Button size="large" onPress={returnToCart}>
              <Text>Return to Cart</Text>
            </Button>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
