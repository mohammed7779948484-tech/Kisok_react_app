import { View } from "react-native";

import { Spinner } from "../primitives/spinner";
import { Text } from "../primitives/text";
import { cn } from "@/core/utils";

export function LoadingState({
  label = "Loading...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={cn("flex-1 items-center justify-center gap-4 p-8", className)}
    >
      <Spinner />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
