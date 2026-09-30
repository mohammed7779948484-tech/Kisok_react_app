import type { LucideIcon, LucideProps } from "lucide-react-native";
import { cssInterop } from "nativewind";
import { useContext } from "react";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

type IconProps = LucideProps & { as: LucideIcon };

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

cssInterop(IconImpl, {
  className: {
    target: "style",
    nativeStyleToProp: { color: true, height: "size", opacity: true, width: "size" },
  },
});

export function Icon({ as, className, size = 24, accessibilityLabel, ...props }: IconProps) {
  const contextClass = useContext(TextClassContext);
  return (
    <IconImpl
      as={as}
      size={size}
      className={cn("text-foreground", contextClass, className)}
      accessibilityLabel={accessibilityLabel}
      aria-hidden={accessibilityLabel ? undefined : true}
      {...props}
    />
  );
}

export type { IconProps };
