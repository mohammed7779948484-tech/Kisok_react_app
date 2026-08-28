import { View } from "react-native";

import { cn } from "@/core/utils";

export function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <View
      // Decorative: `aria-hidden` is the cross-platform prop. The older
      // `importantForAccessibility` / `accessibilityElementsHidden` pair is
      // platform-specific and leaks to the DOM under react-native-web.
      aria-hidden
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className,
      )}
    />
  );
}
