import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cn } from "@/core/utils";

import { ContentContainer } from "./content-container";

/**
 * An action row pinned below scrolling content. Native has no
 * `position: sticky`; the screen is a column — scroll region with `flex-1`,
 * then this — so the action stays reachable without covering content.
 */
export function StickyActionArea({
  children,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      className={cn("border-t border-border bg-background", className)}
    >
      <ContentContainer className={cn("py-3", contentClassName)}>{children}</ContentContainer>
    </SafeAreaView>
  );
}

/** Right-aligned row of actions for a `StickyActionArea`. */
export function ActionRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn("flex-row flex-wrap items-center justify-end gap-3", className)}>
      {children}
    </View>
  );
}
