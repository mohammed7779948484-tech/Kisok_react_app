import { Pressable, View } from "react-native";
import { ArrowRight } from "lucide-react-native";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";
import { Text } from "../primitives/text";

/**
 * The quiet overline above a heading. `rule` draws the short leading line the
 * editorial sections use; `inverse` is for evergreen panels.
 */
export function Eyebrow({
  children,
  rule = false,
  inverse = false,
  className,
}: {
  children: string;
  rule?: boolean;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <View className={cn("flex-row items-center gap-2.5", className)}>
      {rule ? (
        <View
          aria-hidden
          className={cn("h-px w-[22px]", inverse ? "bg-primary-foreground/70" : "bg-primary")}
        />
      ) : null}
      <Text variant="eyebrow" className={inverse ? "text-primary-foreground/80" : undefined}>
        {children}
      </Text>
    </View>
  );
}

/** An inline "View all …" action with a trailing arrow and a 48dp target. */
export function SectionLink({
  label,
  onPress,
  inverse = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  inverse?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="min-h-touch flex-row items-center gap-2.5 active:opacity-70"
    >
      <Text
        className={cn(
          "font-sans-bold text-body-lg",
          inverse ? "text-primary-foreground" : "text-primary",
        )}
      >
        {label}
      </Text>
      <Icon
        as={ArrowRight}
        size={17}
        className={inverse ? "text-primary-foreground" : "text-primary"}
      />
    </Pressable>
  );
}

/**
 * A section's eyebrow, serif title and one-line description, with an
 * optional trailing action aligned to the title's baseline row.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={cn("flex-row flex-wrap items-end justify-between gap-x-8 gap-y-3", className)}>
      <View className="min-w-0 shrink gap-2.5">
        {eyebrow ? <Eyebrow rule>{eyebrow}</Eyebrow> : null}
        <Text variant="h1" accessibilityRole="header" aria-level={2}>
          {title}
        </Text>
        {description ? (
          <Text variant="body" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {action ? <View className="shrink-0">{action}</View> : null}
    </View>
  );
}
