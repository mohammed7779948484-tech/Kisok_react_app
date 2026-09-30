import { AccessibilityInfo, Platform, type Role } from "react-native";

/**
 * Props that make a text node a heading at a given level, on every platform.
 * React Native's `accessibilityRole="header"` has no level; the web renderer
 * needs `role` + `aria-level` to produce a real `<hN>` outline.
 */
export function headingProps(level: 1 | 2 | 3 | 4): { role: Role; "aria-level": string } {
  return { role: "heading", "aria-level": String(level) };
}

/**
 * Speak a short status out of band — for feedback whose visible text is not
 * itself focused, such as "Added 2 to cart". Visible feedback stays primary.
 */
export function announce(message: string): void {
  if (Platform.OS === "web") return;
  AccessibilityInfo.announceForAccessibility(message);
}

/** "1 product" / "3 products". The count is always one the caller derived. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
