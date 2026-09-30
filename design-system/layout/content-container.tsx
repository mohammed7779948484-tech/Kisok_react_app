import { View, type ViewProps } from "react-native";

import { cn } from "@/core/utils";

import { usePageGutter } from "../foundations/responsive";
import { pageMaxWidth } from "../tokens/layout";

/**
 * The page measure: a centred column with the responsive gutter. Full-bleed
 * bands (chrome, the search header) paint edge to edge and put one of these
 * inside, so their content lines up with the page below.
 */
export function ContentContainer({
  className,
  style,
  maxWidth = pageMaxWidth,
  ...props
}: ViewProps & { className?: string; maxWidth?: number }) {
  const gutter = usePageGutter();
  return (
    <View
      className={cn("w-full self-center", className)}
      style={[{ maxWidth: maxWidth + gutter * 2, paddingHorizontal: gutter }, style]}
      {...props}
    />
  );
}
