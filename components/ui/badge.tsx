import { cva, type VariantProps } from "class-variance-authority";
import { View, type ViewProps } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

const badgeVariants = cva("flex-row items-center self-start rounded-md px-2.5 py-1", {
  variants: {
    variant: {
      neutral: "bg-secondary",
      primary: "bg-primary",
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
      outline: "border border-border bg-transparent",
    },
  },
  defaultVariants: { variant: "neutral" },
});

const badgeTextVariants = cva("text-xs font-semibold", {
  variants: {
    variant: {
      neutral: "text-secondary-foreground",
      primary: "text-primary-foreground",
      success: "text-success-foreground",
      warning: "text-warning-foreground",
      destructive: "text-destructive-foreground",
      outline: "text-foreground",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export type BadgeProps = ViewProps & VariantProps<typeof badgeVariants>;

/** Status chips (order status, availability). Colour alone never carries meaning — always include text. */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <View className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { badgeVariants };
