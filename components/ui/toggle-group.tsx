import * as ToggleGroupPrimitive from "@rn-primitives/toggle-group";
import type { VariantProps } from "class-variance-authority";
import { createContext, useContext } from "react";

import { cn } from "@/core/utils";

import { Icon } from "./icon";
import { TextClassContext } from "./text";
import { toggleVariants } from "./toggle";

export type ToggleGroupLayout = "content" | "segmented";

type ToggleGroupContextValue = {
  variant?: VariantProps<typeof toggleVariants>["variant"];
  size?: VariantProps<typeof toggleVariants>["size"];
  layout?: ToggleGroupLayout;
};

const ToggleGroupContext = createContext<ToggleGroupContextValue | null>(null);

export type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    layout?: ToggleGroupLayout;
  };

function ToggleGroup({
  className,
  variant,
  size,
  layout = "content",
  children,
  ...props
}: ToggleGroupProps) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        layout === "segmented"
          ? "flex-row items-center rounded-md border border-border bg-muted p-1"
          : "flex-row flex-wrap items-center gap-2",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, layout }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

export type ToggleGroupItemProps = React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>;

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  role = "button",
  accessibilityRole = "button",
  accessibilityState,
  ...props
}: ToggleGroupItemProps) {
  const context = useContext(ToggleGroupContext);
  const { value } = ToggleGroupPrimitive.useRootContext();
  const selected = ToggleGroupPrimitive.utils.getIsSelected(value, props.value);
  if (context === null) throw new Error("ToggleGroupItem must be rendered inside ToggleGroup");

  const layout = context.layout ?? "content";
  const resolvedVariant =
    variant ?? context.variant ?? (layout === "content" ? "outline" : "default");
  const resolvedSize = size ?? context.size;

  return (
    <TextClassContext.Provider
      value={cn(
        "text-sm font-semibold md:text-base",
        selected
          ? "text-primary-foreground"
          : layout === "segmented"
            ? "text-muted-foreground"
            : "text-foreground",
      )}
    >
      <ToggleGroupPrimitive.Item
        role={role}
        accessibilityRole={accessibilityRole}
        accessibilityState={{
          selected,
          checked: selected,
          ...accessibilityState,
        }}
        className={cn(
          toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
          layout === "segmented"
            ? cn("min-w-0 flex-1 border-0 shadow-none", selected && "bg-primary")
            : cn(selected && "border-primary bg-primary"),
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
