import { ActivityIndicator, View } from "react-native";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  return (
    <Dialog open={visible} onOpenChange={() => undefined}>
      <DialogContent className="max-w-sm items-center border-0 p-8">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityLiveRegion="assertive"
          className="items-center gap-4"
        >
          <ActivityIndicator size="large" />
          <Text variant="lead" className="text-center text-popover-foreground">
            {label}
          </Text>
        </View>
      </DialogContent>
    </Dialog>
  );
}
