import * as Slot from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import { View } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

const badgeVariants = cva(
  "shrink-0 flex-row items-center justify-center gap-1.5 self-start rounded-sm border px-2.5 py-1",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-secondary",
        primary: "border-transparent bg-primary",
        success: "border-transparent bg-success",
        warning: "border-transparent bg-warning",
        destructive: "border-transparent bg-destructive",
        outline: "border-border bg-transparent",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

const badgeTextVariants = cva("text-xs font-semibold leading-4", {
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

export type BadgeProps = React.ComponentProps<typeof View> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Component = asChild ? Slot.View : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { badgeTextVariants, badgeVariants };
