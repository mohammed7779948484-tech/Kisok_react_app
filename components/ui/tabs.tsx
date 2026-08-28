import * as TabsPrimitive from "@rn-primitives/tabs";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }: TabsPrimitive.ListProps) {
  return (
    <TabsPrimitive.List
      className={cn("h-touch flex-row items-center rounded-lg bg-secondary p-1", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.TriggerProps) {
  const { value } = TabsPrimitive.useRootContext();
  const active = value === props.value;

  return (
    <TextClassContext.Provider
      value={cn("text-sm font-semibold", active ? "text-foreground" : "text-muted-foreground")}
    >
      <TabsPrimitive.Trigger
        // The selected state must be announced, not just coloured.
        accessibilityState={{ selected: active }}
        className={cn(
          "flex-1 flex-row items-center justify-center rounded-md px-3 py-2",
          active && "bg-background",
          props.disabled && "opacity-50",
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.ContentProps) {
  return <TabsPrimitive.Content className={cn("flex-1", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
