import { Fragment } from "react";
import { Pressable, View } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "../primitives/text";

export type BreadcrumbItem = { label: string; onPress?: () => void };

/**
 * Where this page sits. Ancestors are links with a full 48dp target; the last
 * item is the current page and is not pressable.
 */
export function Breadcrumb({
  items,
  inverse = false,
  className,
}: {
  items: BreadcrumbItem[];
  inverse?: boolean;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Breadcrumb"
      className={cn("flex-row flex-wrap items-center gap-2.5", className)}
    >
      {items.map((item, index) => {
        const current = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <Text
                aria-hidden
                className={cn(
                  "text-meta",
                  inverse ? "text-primary-foreground/60" : "text-muted-foreground",
                )}
              >
                /
              </Text>
            ) : null}
            {current || !item.onPress ? (
              <Text
                accessibilityState={current ? { selected: true } : undefined}
                className={cn(
                  "font-sans-semibold text-meta",
                  inverse ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {item.label}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="link"
                onPress={item.onPress}
                className="min-h-touch justify-center active:opacity-70"
              >
                <Text
                  className={cn(
                    "font-sans-medium text-meta",
                    inverse ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Text>
              </Pressable>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}
