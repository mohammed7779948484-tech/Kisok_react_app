import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";

import { cn } from "@/core/utils";

export function Spinner({
  className,
  size = "large",
  ...props
}: ActivityIndicatorProps & { className?: string }) {
  return (
    <ActivityIndicator
      aria-hidden
      className={cn("text-primary", className)}
      size={size}
      {...props}
    />
  );
}
