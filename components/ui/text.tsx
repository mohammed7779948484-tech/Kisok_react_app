import * as Slot from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";

import { cn } from "@/core/utils";

/**
 * Lets a parent (Button, Card, Badge) set the text colour/size for its children
 * without every caller having to repeat the classes. This is the React Native
 * Reusables pattern — keep it, RNR components added later rely on it.
 */
export const TextClassContext = createContext<string | undefined>(undefined);

/**
 * KISOK type scale. Sizes are generous because the app is read at arm's length
 * on a tablet, not held in the hand.
 */
const textVariants = cva("text-foreground", {
  variants: {
    variant: {
      display: "text-5xl font-bold tracking-tight",
      h1: "text-3xl font-bold tracking-tight",
      h2: "text-2xl font-semibold tracking-tight",
      h3: "text-xl font-semibold",
      body: "text-base",
      lead: "text-lg",
      label: "text-sm font-medium",
      caption: "text-xs text-muted-foreground",
      /** Order numbers, SKUs — anything read aloud or typed back in. */
      mono: "font-mono text-base tracking-widest",
    },
    tone: {
      default: "",
      muted: "text-muted-foreground",
      primary: "text-primary",
      success: "text-success",
      warning: "text-warning",
      destructive: "text-destructive",
    },
  },
  defaultVariants: { variant: "body", tone: "default" },
});

export type TextProps = RNTextProps &
  VariantProps<typeof textVariants> & {
    /** Render into a parent that provides its own text node. */
    asChild?: boolean;
  };

export function Text({ className, variant, tone, asChild = false, ...props }: TextProps) {
  const contextClass = useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;

  return (
    <Component
      className={cn(textVariants({ variant, tone }), contextClass, className)}
      {...props}
    />
  );
}

export { textVariants };
