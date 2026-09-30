import { cva, type VariantProps } from "class-variance-authority";
import { Platform, Pressable } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

/**
 * Buttons are pills. `primary` is the evergreen action; `inverse` is the same
 * action sitting on an evergreen panel; `tonal` is a quiet secondary on paper;
 * `text` is an inline link-weight action that still keeps a 48dp target.
 */
const buttonVariants = cva(
  cn(
    "group shrink-0 flex-row items-center justify-center gap-2.5 rounded-full",
    "active:opacity-90 disabled:opacity-40",
    Platform.select({
      web: "whitespace-nowrap outline-none transition-[color,background-color,border-color,transform,opacity] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none",
    }),
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary active:bg-primary/90",
        inverse: "bg-primary-foreground active:bg-primary-foreground/90",
        tonal: "border border-border bg-card/60 active:bg-card",
        secondary: "bg-secondary active:bg-secondary/70",
        outline: "border border-input bg-card active:bg-muted",
        ghost: "bg-transparent active:bg-muted",
        text: "bg-transparent px-1 active:opacity-70",
        destructive: "bg-destructive active:bg-destructive/90",
      },
      size: {
        default: "h-control px-5",
        large: "h-control-lg px-7",
        compact: "h-touch px-4",
        icon: "h-touch w-touch px-0",
      },
      block: { true: "w-full", false: "self-start" },
    },
    compoundVariants: [{ variant: "text", className: "h-touch px-1" }],
    defaultVariants: { variant: "primary", size: "default", block: false },
  },
);

const buttonTextVariants = cva("font-sans-bold text-body-lg", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      inverse: "text-primary",
      tonal: "text-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      text: "text-primary",
      destructive: "text-destructive-foreground",
    },
    size: { default: "", large: "text-title", compact: "text-body", icon: "" },
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
