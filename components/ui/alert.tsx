import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "./text";

const alertVariants = cva("w-full gap-1 rounded-lg border p-4", {
  variants: {
    variant: {
      info: "border-border bg-secondary",
      success: "border-success/40 bg-success/10",
      warning: "border-warning/40 bg-warning/10",
      destructive: "border-destructive/40 bg-destructive/10",
    },
  },
  defaultVariants: { variant: "info" },
});

export type AlertProps = ViewProps &
  VariantProps<typeof alertVariants> & {
    title: string;
    description?: string;
  };

/**
 * Inline, non-blocking message. `accessibilityLiveRegion` makes a screen reader
 * announce it when it appears — important for errors that replace no content.
 */
export function Alert({ className, variant, title, description, ...props }: AlertProps) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Text variant="label">{title}</Text>
      {description ? <Text variant="caption">{description}</Text> : null}
    </View>
  );
}

export { alertVariants };
