import * as TabsPrimitive from "@rn-primitives/tabs";
import { Platform } from "react-native";

import { cn } from "@/core/utils";

import { TextClassContext } from "./text";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex-col gap-4", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "min-h-control flex-row items-center rounded-md border border-border bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value } = TabsPrimitive.useRootContext();
  const active = value === props.value;
  return (
    <TextClassContext.Provider
      value={cn(
        "text-sm font-semibold md:text-base",
        active ? "text-primary-foreground" : "text-muted-foreground",
      )}
    >
      <TabsPrimitive.Trigger
        className={cn(
          "h-touch flex-1 flex-row items-center justify-center gap-2 rounded-sm px-4",
          active ? "bg-primary" : "active:bg-secondary",
          props.disabled && "opacity-40",
          Platform.select({
            web: "outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30",
          }),
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("flex-1", Platform.select({ web: "outline-none" }), className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
