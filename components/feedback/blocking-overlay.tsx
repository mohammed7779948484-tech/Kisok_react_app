import { ActivityIndicator, View } from "react-native";

import { Text } from "@/components/ui/text";

/**
 * Covers the screen while an operation that must not be interrupted runs
 * (checkout submission, kiosk reset).
 *
 * The point is to make double submission impossible at the UI layer. It is a
 * usability guard only — the server's idempotency contract is what actually
 * prevents a duplicate order.
 */
export function BlockingOverlay({ visible, label }: { visible: boolean; label: string }) {
  if (!visible) return null;

  return (
    <View
      aria-modal
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="assertive"
      className="absolute inset-0 z-50 items-center justify-center gap-4 bg-background/85"
      // Claims the touch on native so presses cannot reach the screen beneath.
      // On web the prop is inert, but the overlay covers the viewport and
      // intercepts pointer events by stacking, so the behaviour matches.
      onStartShouldSetResponder={() => true}
    >
      <ActivityIndicator size="large" />
      <Text variant="lead">{label}</Text>
    </View>
  );
}
