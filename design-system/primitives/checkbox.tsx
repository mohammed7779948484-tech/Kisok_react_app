import * as CheckboxPrimitive from "@rn-primitives/checkbox";
import { Check } from "lucide-react-native";
import { Platform } from "react-native";

import { cn } from "@/core/utils";

import { Icon } from "./icon";

/**
 * A square check. Pair it with a pressable row (see `CheckboxRow` in the lab)
 * so the whole row is the 48dp target, not the 20dp box.
 */
export function Checkbox({
  className,
  checkedClassName,
  ...props
}: CheckboxPrimitive.RootProps & { checkedClassName?: string }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-2 border-input bg-card",
        Platform.select({
          web: "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        }),
        props.checked && cn("border-primary bg-primary", checkedClassName),
        props.disabled && "opacity-45",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="h-full w-full items-center justify-center">
        <Icon as={Check} size={14} strokeWidth={3} className="text-primary-foreground" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
