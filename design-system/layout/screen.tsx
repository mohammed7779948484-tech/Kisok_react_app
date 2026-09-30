import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/core/utils";

import { pageMaxWidth } from "../tokens/layout";

export type ScreenProps = ViewProps & {
  /** Safe-area edges to respect. Omit "bottom" when a fixed footer handles it. */
  edges?: readonly Edge[];
  /**
   * Constrain content to the page measure and centre it. On by default. Turn
   * it off for screens whose chrome runs edge to edge and which place their
   * own `ContentContainer`s.
   */
  constrained?: boolean;
  className?: string;
  contentClassName?: string;
};

/** The canvas every route sits on: safe area, background, page measure. */
export function Screen({
  children,
  edges = ["top", "left", "right"],
  constrained = true,
  className,
  contentClassName,
  ...props
}: ScreenProps) {
  return (
    <View className={cn("flex-1 bg-background", className)} {...props}>
      <SafeAreaView edges={edges} className="flex-1">
        <View
          className={cn("flex-1", constrained && "w-full self-center", contentClassName)}
          style={constrained ? { maxWidth: pageMaxWidth } : undefined}
        >
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}
