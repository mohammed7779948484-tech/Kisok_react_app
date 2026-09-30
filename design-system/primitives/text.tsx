import * as Slot from "@rn-primitives/slot";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";
import { Platform, Text as RNText, type Role, type TextProps as RNTextProps } from "react-native";

import { cn } from "@/core/utils";

/** Lets a container (a button, a badge) set the text style of its children. */
export const TextClassContext = createContext<string | undefined>(undefined);

/**
 * The type roles. Display roles use the editorial serif; everything that
 * labels, explains or acts uses Inter. Weight is part of the family name —
 * see `tokens/typography`.
 */
const textVariants = cva("font-sans text-foreground", {
  variants: {
    variant: {
      /** Page and product titles. */
      display: "font-display-semibold text-display-md md:text-display-lg",
      /** Section headings ("Store Map", "Brand District"). */
      h1: "font-display text-display-sm md:text-display-md",
      /** Panel headings ("Choose a flavor"). */
      h2: "font-display-semibold text-title-lg md:text-display-sm",
      /** Sub-section headings in UI copy. */
      h3: "font-sans-bold text-title",
      /** Card and row names. */
      title: "font-sans-bold text-title",
      body: "text-body",
      lead: "text-body-lg text-muted-foreground",
      label: "font-sans-semibold text-meta",
      /** Secondary UI copy: scope lines, counts, captions under names. */
      meta: "text-meta",
      caption: "text-caption",
      /** Uppercase overline — a quiet label above a heading. */
      eyebrow: "font-sans-extrabold text-eyebrow uppercase text-primary",
      /** A large serif number: counts and facts. */
      numeral: "font-display-semibold text-display-xs text-primary",
      mono: "font-mono text-body-lg tracking-[1.2px]",
    },
    tone: {
      default: "",
      muted: "text-muted-foreground",
      primary: "text-primary",
      inverse: "text-primary-foreground",
      success: "text-success",
      warning: "text-warning-text",
      destructive: "text-destructive",
      unavailable: "text-unavailable",
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
