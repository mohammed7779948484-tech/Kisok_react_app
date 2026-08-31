import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { CONTENT_MAX_WIDTH } from "@/core/responsive";
import { cn } from "@/core/utils";

export type ScreenProps = ViewProps & {
  /** Safe-area edges to respect. Omit "bottom" when a fixed footer handles it. */
  edges?: readonly Edge[];
  /**
   * Constrain content to a readable measure and centre it. On by default —
   * a full-bleed catalog grid on a 1280px landscape tablet is unreadable.
   */
  constrained?: boolean;
  className?: string;
  contentClassName?: string;
};

/**
 * Standard screen shell: background, safe area, and the content max width.
 * Every screen should use this so padding and safe-area handling stay
 * consistent instead of being re-derived per feature.
 */
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
          style={constrained ? { maxWidth: CONTENT_MAX_WIDTH } : undefined}
        >
          {children}
        </View>
      </SafeAreaView>
    </View>
  );
}
