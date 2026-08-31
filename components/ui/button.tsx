import { cva, type VariantProps } from "class-variance-authority";
import { Pressable, type PressableProps } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

/**
 * Every interactive surface in KISOK is at least 48dp tall. That is the
 * documented minimum touch target for the kiosk — do not add a smaller size.
 */
const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-lg active:opacity-90 disabled:opacity-50 web:transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-primary active:bg-primary/90",
        secondary: "bg-secondary active:bg-secondary/80",
        outline: "border border-border bg-transparent active:bg-secondary",
        ghost: "bg-transparent active:bg-secondary",
        destructive: "bg-destructive active:bg-destructive/90",
      },
      size: {
        // 48dp — the floor.
        default: "h-touch px-5",
        // Primary calls to action on a tablet: bigger, easier to hit while standing.
        large: "h-14 px-7",
        // Only for dense internal tools (Preparation board), never customer-facing.
        compact: "h-touch px-3",
        icon: "h-touch w-touch px-0",
      },
      block: { true: "w-full", false: "self-start" },
    },
    defaultVariants: { variant: "primary", size: "default", block: false },
  },
);

const buttonTextVariants = cva("text-base font-semibold", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive-foreground",
    },
    size: { default: "", large: "text-lg", compact: "text-sm", icon: "" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export type ButtonProps = PressableProps &
  VariantProps<typeof buttonVariants> & {
    className?: string;
  };

/**
 * Accessibility: pass `accessibilityLabel` whenever the button's content is an
 * icon only. `disabled` is forwarded to `accessibilityState` so screen readers
 * and `toBeDisabled()` assertions both see it.
 */
export function Button({ className, variant, size, block, disabled, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { buttonVariants, buttonTextVariants };
