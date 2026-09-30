import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { cn } from "@/core/utils";

import { Button } from "../primitives/button";
import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

export type StateAction = { label: string; onPress: () => void };

/**
 * Nothing to show — and what to do next. Framed as a quiet paper panel with a
 * serif headline; the primary action is the recovery path, the secondary one
 * a way back out.
 */
export function EmptyState({
  title,
  description,
  eyebrow,
  icon,
  action,
  secondaryAction,
  framed = false,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  action?: StateAction;
  secondaryAction?: StateAction;
  /** Draw the paper panel. Off for states that already sit inside a surface. */
  framed?: boolean;
  className?: string;
}) {
  return (
    <View className={cn("flex-1 items-center justify-center p-8", className)}>
      <View
        className={cn(
          "w-full max-w-xl items-center gap-4",
          framed && "rounded-3xl border border-border bg-card px-8 py-10",
        )}
      >
        {icon ? (
          <View className="h-14 w-14 items-center justify-center rounded-full bg-secondary">
            <Icon as={icon} size={26} className="text-primary" />
          </View>
        ) : null}
        {eyebrow ? (
          <Text variant="eyebrow" className="text-center">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="h2" className="text-center" accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="body" tone="muted" className="max-w-md text-center">
            {description}
          </Text>
        ) : null}
        {action || secondaryAction ? (
          <View className="mt-2 flex-row flex-wrap items-center justify-center gap-3">
            {action ? (
              <Button variant="primary" onPress={action.onPress}>
                <Text>{action.label}</Text>
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button variant="tonal" onPress={secondaryAction.onPress}>
                <Text>{secondaryAction.label}</Text>
              </Button>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
