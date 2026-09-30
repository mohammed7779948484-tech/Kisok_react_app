import { View } from "react-native";
import { ArrowRight, type LucideIcon } from "lucide-react-native";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";

/**
 * The round arrow a pressable card ends with. It is decoration inside a card
 * whose whole surface is the target, so it is hidden from assistive tech.
 */
export function ArrowDisc({
  tone = "outline",
  size = 40,
  icon = ArrowRight,
  className,
}: {
  /** `outline` on paper, `tonal` sage-filled, `inverse` on dark media. */
  tone?: "outline" | "tonal" | "inverse";
  size?: number;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <View
      aria-hidden
      className={cn(
        "items-center justify-center rounded-full",
        tone === "outline" && "border border-input bg-card",
        tone === "tonal" && "bg-secondary",
        tone === "inverse" && "border border-primary-foreground/50",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon
        as={icon}
        size={Math.round(size * 0.42)}
        className={tone === "inverse" ? "text-primary-foreground" : "text-primary"}
      />
    </View>
  );
}
