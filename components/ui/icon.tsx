import { cssInterop } from "nativewind";
import type { LucideIcon } from "lucide-react-native";

import { cn } from "@/core/utils";

/**
 * lucide-react-native renders an SVG, which NativeWind does not style by
 * default. `cssInterop` maps `className` onto the SVG's colour/size props so
 * icons follow the theme (`text-primary`, `text-muted-foreground`) instead of
 * needing hardcoded hex values.
 *
 * Wrap an icon once at the module level:
 *   const Cart = withIconClassName(ShoppingCart);
 */
export function withIconClassName<T extends LucideIcon>(icon: T): T {
  // `cssInterop`'s generic infers prop names from the component, and lucide's
  // icon type does not expose `style` in a form it can narrow. The mapping below
  // is the one React Native Reusables uses; the cast keeps it typed at the call
  // site without loosening the exported signature.
  cssInterop(icon as React.ComponentType<{ style?: unknown; color?: string; opacity?: number }>, {
    className: {
      target: "style",
      nativeStyleToProp: { color: true, opacity: true },
    },
  });
  return icon;
}

export type IconProps = {
  as: LucideIcon;
  size?: number;
  className?: string;
  /** Decorative icons should stay unlabelled; label only when the icon IS the content. */
  accessibilityLabel?: string;
};

/**
 * Render a lucide icon with theme-aware classes.
 * Default size is 24 — small enough to sit in a 48dp target with room around it.
 */
export function Icon({ as: IconComponent, size = 24, className, accessibilityLabel }: IconProps) {
  const Themed = withIconClassName(IconComponent);
  return (
    <Themed
      size={size}
      className={cn("text-foreground", className)}
      accessibilityLabel={accessibilityLabel}
      // Unlabelled icons are decorative and must not be announced. `aria-hidden`
      // is the cross-platform prop; the platform-specific pair leaks to the DOM
      // under react-native-web.
      aria-hidden={accessibilityLabel ? undefined : true}
    />
  );
}
