import { View } from "react-native";
import { CircleCheck, CircleAlert, Info, type LucideIcon } from "lucide-react-native";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

type Tone = "success" | "info" | "warning";

const ICONS: Record<Tone, LucideIcon> = { success: CircleCheck, info: Info, warning: CircleAlert };

/**
 * A one-line, in-context confirmation ("Added 2 to cart"). A polite live
 * region announces it once when the message changes — the only announcement
 * mechanism, so screen readers do not speak it twice. The visible line is the
 * primary feedback. `inverse` is for use on an evergreen panel.
 */
export function StatusMessage({
  message,
  tone = "success",
  inverse = false,
  className,
}: {
  message: string | null;
  tone?: Tone;
  inverse?: boolean;
  className?: string;
}) {
  if (!message) return null;

  return (
    <View accessibilityLiveRegion="polite" className={cn("flex-row items-center gap-2", className)}>
      <Icon
        as={ICONS[tone]}
        size={14}
        className={
          inverse
            ? "text-primary-foreground/80"
            : tone === "warning"
              ? "text-warning-text"
              : "text-success"
        }
      />
      <Text
        variant="caption"
        className={cn(
          "font-sans-medium",
          inverse ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {message}
      </Text>
    </View>
  );
}
