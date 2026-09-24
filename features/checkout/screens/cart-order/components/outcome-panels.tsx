import { FlashList } from "@shopify/flash-list";
import { AlertTriangle, CircleX, ShieldQuestion } from "lucide-react-native";
import { View } from "react-native";

import { Icon, Text } from "@/components/ui";
import type { CartLine } from "@/features/cart";
import type { AttemptFailure, StockConflictItem } from "../../../state/attempt-store";
import { ConflictRow } from "../../../components/conflict-row";

export function StockConflictPanel({
  conflicts,
  lines,
}: {
  conflicts: StockConflictItem[];
  lines: CartLine[];
}) {
  return (
    <FlashList
      data={conflicts}
      keyExtractor={(entry) => entry.variant_id}
      ListHeaderComponent={
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="gap-4 pb-6 pt-4"
        >
          <Icon as={AlertTriangle} size={40} className="text-warning-text" />
          <Text variant="h1">Some quantities are no longer available</Text>
          <Text tone="muted">
            No order was submitted and your cart was not changed. Edit your cart to adjust the
            selections below.
          </Text>
        </View>
      }
      renderItem={({ item }) => <ConflictRow entry={item} lines={lines} />}
    />
  );
}

export function UnknownOutcomePanel() {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" className="gap-5">
      <Icon as={ShieldQuestion} size={48} className="text-warning-text" />
      <Text variant="h1">Order status not confirmed</Text>
      <Text variant="lead">Your order may already be with the store.</Text>
      <Text tone="muted">
        {
          "Check again to find out safely. We'll use the same request, so this won't create a second order."
        }
      </Text>
    </View>
  );
}

export function FailureOutcomePanel({ failure }: { failure: AttemptFailure }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" className="gap-5">
      <Icon as={CircleX} size={48} className="text-destructive" />
      <Text variant="h1">Order not sent</Text>
      <Text variant="lead">Your selections are still in your cart.</Text>
      <Text tone="muted">{failure.userMessage}</Text>
    </View>
  );
}
