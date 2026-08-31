import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/core/utils";

/**
 * "Nothing here" — a legitimate result, not a failure.
 * Always give the customer somewhere to go next via `action`; a dead end on a
 * kiosk means an employee gets asked for help.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: { label: string; onPress: () => void };
  className?: string;
}) {
  return (
    <View className={cn("flex-1 items-center justify-center gap-3 p-8", className)}>
      {icon ? <Icon as={icon} size={40} className="text-muted-foreground" /> : null}
      <Text variant="h3" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" className="max-w-md text-center">
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button variant="secondary" onPress={action.onPress} className="mt-2">
          <Text>{action.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}
