import * as LabelPrimitive from "@rn-primitives/label";
import { Platform } from "react-native";

import { cn } from "@/core/utils";

export function Label({
  className,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Text>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "flex-row items-center gap-2",
        Platform.select({ web: "cursor-default select-none" }),
        disabled && "opacity-45",
      )}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
    >
      <LabelPrimitive.Text
        className={cn("text-base font-semibold leading-6 text-foreground", className)}
        {...props}
      />
    </LabelPrimitive.Root>
  );
}
