import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with correct conflict resolution.
 * Always use this when a component accepts a `className` prop, so callers can
 * override defaults instead of fighting them with `!important`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
