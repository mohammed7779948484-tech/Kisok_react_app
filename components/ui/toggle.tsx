import * as TogglePrimitive from "@rn-primitives/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { Platform } from "react-native";

import { cn } from "@/core/utils";

import { Icon } from "./icon";
import { TextClassContext } from "./text";

const toggleVariants = cva(
  cn(
    "group flex-row items-center justify-center gap-2 rounded-md",
    Platform.select({
      web: "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
    }),
  ),
  {
    variants: {
      variant: {
        default: "bg-transparent active:bg-secondary",
        outline: "border border-input bg-card active:bg-secondary",
      },
      size: {
        default: "h-control min-w-control px-4",
        compact: "h-touch min-w-touch px-3",
        large: "h-control-lg min-w-control-lg px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TextClassContext.Provider
      value={cn(
        "text-base font-semibold",
        props.pressed ? "text-primary-foreground" : "text-foreground",
      )}
    >
      <TogglePrimitive.Root
        className={cn(
          toggleVariants({ variant, size }),
          props.pressed && "border-primary bg-primary",
          props.disabled && "opacity-40",
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function ToggleIcon({ className, ...props }: React.ComponentProps<typeof Icon>) {
  return <Icon className={cn("size-5 shrink-0", className)} {...props} />;
}

export { Toggle, ToggleIcon, toggleVariants };
