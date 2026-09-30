import { useEffect, useState } from "react";
import { AlertTriangle, CircleSlash, PackageSearch, Send } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import {
  Button,
  Eyebrow,
  Icon,
  Screen,
  Spinner,
  Text,
  useLayout,
  usePageGutter,
} from "@/design-system";
import { cn } from "@/core/utils";
import type { CartLine } from "@/features/cart";

import type { CheckoutFailure, CheckoutPhase, StockConflictItem } from "../state/checkout-store";
import { OrderLineRow } from "./order-line-row";

/** How long to wait before re-checking an order whose result is unknown. */
export const AUTO_CHECK_SECONDS = 10;

type Tone = "calm" | "warning" | "destructive";

const TONE_CIRCLE: Record<Tone, string> = {
  calm: "bg-secondary",
  warning: "bg-warning/25",
  destructive: "bg-destructive/15",
};
const TONE_ICON: Record<Tone, string> = {
  calm: "text-primary",
  warning: "text-warning-text",
  destructive: "text-destructive",
};

/** The status mark: an icon on a soft tonal disc. Motion stays with the spinner. */
function StatusMark({ icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <View className={cn("h-32 w-32 items-center justify-center rounded-full", TONE_CIRCLE[tone])}>
      <View className="h-20 w-20 items-center justify-center rounded-full bg-card">
        <Icon as={icon} size={34} className={TONE_ICON[tone]} />
      </View>
    </View>
  );
}

export type CheckoutStatusProps = {
  phase: Extract<CheckoutPhase, "submitting" | "unknown" | "conflict" | "failure">;
  /** The lines being ordered (pending) or the cart lines (after a definite outcome). */
  lines: CartLine[];
  conflicts: StockConflictItem[] | null;
  failure: CheckoutFailure | null;
  /** Re-send the same pending order (unknown). */
  onCheckAgain: () => void;
  /** Place the order again as a new request (a retryable failure). */
  onTryAgain: () => void;
  onBackToCart: () => void;
};

/**
 * The whole screen while an order is out of the customer's hands, and when
 * the store answers with anything but a confirmation. Every state names what
 * happened in plain words and what the customer can do next — and, when the
 * result is unknown, that the SAME order is being checked, never a new one.
 */
export function CheckoutStatus({
  phase,
  lines,
  conflicts,
  failure,
  onCheckAgain,
  onTryAgain,
  onBackToCart,
}: CheckoutStatusProps) {
  const { width, isLandscape } = useLayout();
  const gutter = usePageGutter();
  const split = isLandscape && width >= 1000;
  const [countdown, setCountdown] = useState(AUTO_CHECK_SECONDS);

  // While the result is unknown, re-check on a steady rhythm; the customer
  // can also check straight away.
  useEffect(() => {
    if (phase !== "unknown") return;
    let remaining = AUTO_CHECK_SECONDS;
    setCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = AUTO_CHECK_SECONDS;
        onCheckAgain();
      }
      setCountdown(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, onCheckAgain]);

  const conflictByVariant = new Map(
    (conflicts ?? []).map((entry) => [entry.variant_id.toLowerCase(), entry]),
  );

  const content = {
    submitting: {
      icon: Send,
      tone: "calm" as Tone,
      eyebrow: "Placing your order",
      title: "Sending your order to the store",
      lead: "This usually takes a moment. Please stay on this screen for your order number.",
    },
    unknown: {
      icon: PackageSearch,
      tone: "calm" as Tone,
      eyebrow: "Still confirming",
      title: "We’re checking on your order",
      lead: "The store hasn’t answered yet. We’re checking the same order again, so it can’t be placed twice.",
    },
    conflict: {
      icon: AlertTriangle,
      tone: "warning" as Tone,
      eyebrow: "No order was placed",
      title: "A few items just ran low",
      lead: "Someone got there first. Adjust the items below in your cart, then confirm again.",
    },
    failure: {
      icon: CircleSlash,
      tone: "destructive" as Tone,
      eyebrow: "No order was placed",
      title: failure?.title ?? "Your order wasn’t sent",
      lead: failure?.message ?? "Please try again.",
    },
  }[phase];

  const busy = phase === "submitting";

  const actions = (
    <View className="w-full max-w-md gap-3">
      {phase === "unknown" ? (
        <>
          <Button size="large" block onPress={onCheckAgain}>
            <Text>Check now</Text>
          </Button>
          <Text
            variant="meta"
            tone="muted"
            className="text-center"
            accessibilityLiveRegion="polite"
          >
            {`Checking again automatically in ${countdown}s`}
          </Text>
        </>
      ) : null}
      {phase === "conflict" ? (
        <Button size="large" block onPress={onBackToCart}>
          <Text>Review my cart</Text>
        </Button>
      ) : null}
      {phase === "failure" ? (
        <>
          {failure?.retryable ? (
            <Button size="large" block onPress={onTryAgain}>
              <Text>Try again</Text>
            </Button>
          ) : null}
          <Button
            size="large"
            block
            variant={failure?.retryable ? "tonal" : "primary"}
            onPress={onBackToCart}
          >
            <Text>Back to my cart</Text>
          </Button>
        </>
      ) : null}
      {busy ? (
        <View className="flex-row items-center justify-center gap-3 py-2">
          <Spinner />
          <Text tone="muted">Waiting for the store…</Text>
        </View>
      ) : null}
    </View>
  );

  const hero = (
    <View
      className={cn("items-center gap-6", split ? "flex-1 justify-center" : "pt-10")}
      accessibilityRole={busy ? "progressbar" : "alert"}
      accessibilityLiveRegion="polite"
    >
      <StatusMark icon={content.icon} tone={content.tone} />
      <View className="max-w-lg items-center gap-3">
        <Eyebrow>{content.eyebrow}</Eyebrow>
        <Text variant="h1" className="text-center">
          {content.title}
        </Text>
        <Text variant="lead" className="text-center">
          {content.lead}
        </Text>
      </View>
      {actions}
    </View>
  );

  const rows = lines.map((line) => {
    const conflict = conflictByVariant.get(line.variantId.toLowerCase());
    return (
      <OrderLineRow
        key={line.lineId}
        line={line}
        className={cn("border-b border-border/70", conflict && "bg-warning/10")}
        trailing={
          conflict ? (
            <View className="items-end gap-0.5">
              <Text className="font-sans-bold text-body text-warning-text">
                {conflict.available_quantity === 0
                  ? "Sold out"
                  : `${conflict.available_quantity} available`}
              </Text>
              <Text variant="caption" tone="muted">
                {`You asked for ${conflict.requested_quantity}`}
              </Text>
            </View>
          ) : undefined
        }
      />
    );
  });

  const itemsPanel = (
    <View className={cn("gap-2", split && "min-h-0 flex-1")}>
      <Text variant="label" tone="muted">
        {phase === "conflict" ? "Items to adjust" : "Your order"}
      </Text>
      {split ? (
        <ScrollView className="min-h-0 flex-1" contentContainerClassName="pb-4">
          {rows}
        </ScrollView>
      ) : (
        <View>{rows}</View>
      )}
    </View>
  );

  return (
    <Screen edges={["top", "bottom", "left", "right"]}>
      {split ? (
        <View
          className="min-h-0 flex-1 flex-row gap-10 py-10"
          style={{ paddingHorizontal: gutter }}
        >
          {hero}
          <View className="w-[420px] rounded-3xl border border-border bg-card p-6">
            {itemsPanel}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-10 pb-10" style={{ paddingHorizontal: gutter }}>
          {hero}
          <View className="rounded-3xl border border-border bg-card p-5">{itemsPanel}</View>
        </ScrollView>
      )}
    </Screen>
  );
}
