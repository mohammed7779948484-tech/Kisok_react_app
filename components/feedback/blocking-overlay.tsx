import { View } from "react-native";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";

export function BlockingOverlay({ visible, label }: { visible: boolean; label: string }) {
  return (
    <Dialog open={visible} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-w-sm items-center p-8 md:p-10">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={label}
          accessibilityLiveRegion="assertive"
          className="items-center gap-5"
        >
          <Spinner />
          <Text variant="lead" className="text-center text-popover-foreground">
            {label}
          </Text>
        </View>
      </DialogContent>
    </Dialog>
  );
}
