import * as Slot from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";
import { Platform, Text as RNText, type Role, type TextProps as RNTextProps } from "react-native";

import { cn } from "@/core/utils";

export const TextClassContext = createContext<string | undefined>(undefined);

const textVariants = cva("text-foreground", {
  variants: {
    variant: {
      display: "text-5xl font-extrabold leading-[1.05] tracking-[-0.035em] md:text-6xl",
      h1: "text-3xl font-bold leading-tight tracking-[-0.025em] md:text-4xl",
      h2: "text-2xl font-bold leading-tight tracking-[-0.015em] md:text-3xl",
      h3: "text-xl font-semibold leading-7 tracking-[-0.01em]",
      body: "text-base leading-6 md:text-lg md:leading-7",
      lead: "text-xl leading-7 md:text-2xl md:leading-8",
      label: "text-sm font-semibold leading-5 md:text-base md:leading-6",
      caption: "text-sm leading-5",
      mono: "font-mono text-base font-semibold leading-6 tracking-[0.08em] md:text-lg",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      success: "text-success",
      warning: "text-warning-text",
      destructive: "text-destructive",
    },
  },
  defaultVariants: { variant: "body", tone: "default" },
});

type TextVariantProps = VariantProps<typeof textVariants>;
type TextVariant = NonNullable<TextVariantProps["variant"]>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  display: "heading",
  h1: "heading",
  h2: "heading",
  h3: "heading",
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  display: "1",
  h1: "1",
  h2: "2",
  h3: "3",
};

export type TextProps = RNTextProps &
  TextVariantProps & {
    asChild?: boolean;
  };

export function Text({ className, asChild = false, variant = "body", tone, ...props }: TextProps) {
  const contextClass = useContext(TextClassContext);
  const Component = asChild ? Slot.Text : RNText;
  const resolvedVariant = variant ?? "body";

  return (
    <Component
      className={cn(
        textVariants({ variant: resolvedVariant, tone }),
        Platform.select({ web: "select-text" }),
        contextClass,
        className,
      )}
      role={props.accessibilityRole ? undefined : ROLE[resolvedVariant]}
      aria-level={ARIA_LEVEL[resolvedVariant]}
      {...props}
    />
  );
}

export { textVariants };
