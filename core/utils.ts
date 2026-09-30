import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { fontFamily, typeScale } from "@/design-system/tokens";

/**
 * tailwind-merge only knows Tailwind's default scale. The KISOK type roles
 * (`text-caption`, `font-sans-semibold`) are registered here so they resolve as
 * font-size and font-family — otherwise `text-caption` reads as a colour and a
 * later `text-muted-foreground` would silently remove it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: Object.keys(typeScale) }],
      "font-family": [{ font: Object.keys(fontFamily) }],
    },
  },
});

/**
 * Merge Tailwind classes with correct conflict resolution.
 * Always use this when a component accepts a `className` prop, so callers can
 * override defaults instead of fighting them with `!important`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
