import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

const buttonVariants = cva(
  cn(
    "group shrink-0 flex-row items-center justify-center gap-2 rounded-md",
    "active:scale-[0.985] disabled:opacity-40",
    Platform.select({
      web: "whitespace-nowrap outline-none transition-[color,background-color,border-color,transform] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none",
    }),
  ),
  {
    variants: {
      variant: {
        primary: "active:bg-primary/88 bg-primary",
        secondary: "bg-secondary active:bg-secondary/70",
        outline: "border border-input bg-card active:bg-secondary",
        ghost: "bg-transparent active:bg-secondary",
        destructive: "active:bg-destructive/88 bg-destructive",
      },
      size: {
        default: "h-control px-5",
        large: "h-control-lg px-8",
        compact: "h-touch px-4",
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

export type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

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

export { buttonTextVariants, buttonVariants };
