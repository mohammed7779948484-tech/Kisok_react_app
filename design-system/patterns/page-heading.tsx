import { View } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "../primitives/text";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";
import { Eyebrow } from "./section-heading";

/**
 * The top of a browse page: breadcrumb, overline, serif title, description.
 *
 * `aside` sits to the right on wide layouts — a key figure, or the page's
 * description when `layout="split"` puts the title and the copy side by side.
 */
export function PageHeading({
  breadcrumb,
  eyebrow,
  title,
  description,
  aside,
  layout = "stacked",
  wide = true,
  className,
}: {
  breadcrumb?: BreadcrumbItem[];
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  /** `split` places the description in a right-hand column beside the title. */
  layout?: "stacked" | "split";
  /** Whether there is room to place `aside` / the split column beside the title. */
  wide?: boolean;
  className?: string;
}) {
  const splitDescription = layout === "split" && wide && description;

  return (
    <View className={cn("gap-5", className)}>
      {breadcrumb ? <Breadcrumb items={breadcrumb} /> : null}
      <View
        className={cn(
          wide ? "flex-row items-end justify-between gap-10" : "gap-5",
          splitDescription && "items-center",
        )}
      >
        <View className={cn("min-w-0 gap-3", wide && "shrink")} style={{ maxWidth: 760 }}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          {description && !splitDescription ? <Text variant="lead">{description}</Text> : null}
        </View>
        {splitDescription ? (
          <Text variant="lead" className="shrink" style={{ maxWidth: 480, flexBasis: 480 }}>
            {description}
          </Text>
        ) : null}
        {aside ? <View className={wide ? "shrink-0" : undefined}>{aside}</View> : null}
      </View>
    </View>
  );
}

/** A large serif figure with its caption, set off by a hairline rule. */
export function KeyFigure({
  value,
  label,
  className,
}: {
  value: string | number;
  label: string;
  className?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      className={cn("gap-1 border-l border-border pl-6", className)}
    >
      <Text className="font-display text-display-md text-foreground">{String(value)}</Text>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
    </View>
  );
}
