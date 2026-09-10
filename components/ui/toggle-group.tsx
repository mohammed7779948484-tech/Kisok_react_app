import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group";
import type { VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

import { cn } from "@/core/utils";

import { Icon } from "./icon";
import { TextClassContext } from "./text";
import { toggleVariants } from "./toggle";

const ToggleGroupContext = createContext<VariantProps<typeof toggleVariants> | null>(null);

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        "flex-row items-center rounded-md border border-border bg-muted p-1",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = useContext(ToggleGroupContext);
  const { value } = ToggleGroupPrimitive.useRootContext();
  const selected = ToggleGroupPrimitive.utils.getIsSelected(value, props.value);
  if (context === null) throw new Error("ToggleGroupItem must be rendered inside ToggleGroup");
  return (
    <TextClassContext.Provider
      value={cn(
        "text-sm font-semibold md:text-base",
        selected ? "text-primary-foreground" : "text-muted-foreground",
      )}
    >
      <ToggleGroupPrimitive.Item
        className={cn(
          toggleVariants({ variant: context.variant ?? variant, size: context.size ?? size }),
          "min-w-0 flex-1 border-0 shadow-none",
          selected && "bg-primary",
          props.disabled && "opacity-40",
          className,
        )}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    </TextClassContext.Provider>
  );
}

function ToggleGroupIcon({ className, ...props }: React.ComponentProps<typeof Icon>) {
  return <Icon className={cn("size-5 shrink-0", className)} {...props} />;
}

export { ToggleGroup, ToggleGroupIcon, ToggleGroupItem };
