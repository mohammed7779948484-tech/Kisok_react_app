import * as DialogPrimitive from "@rn-primitives/dialog";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLayout } from "../foundations/responsive";
import { cn } from "@/core/utils";

import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTrigger } from "./dialog";
import { Text } from "../primitives/text";
import { size } from "../tokens/sizing";

export const AdaptiveSheet = Dialog;
export const AdaptiveSheetTrigger = DialogTrigger;
export const AdaptiveSheetClose = DialogClose;

export function AdaptiveSheetContent({
  className,
  children,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const { isExpanded, width, height } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <DialogPortal>
      <DialogOverlay
        className={cn("items-stretch justify-end p-0", isExpanded && "flex-row justify-end")}
        nativeOverlayStyle={{ padding: 0 }}
        nativeContentStyle={{ alignItems: "flex-end", justifyContent: "flex-end" }}
      >
        <DialogPrimitive.Content
          className={cn(
            "z-50 bg-popover",
            isExpanded
              ? "h-full w-sheet max-w-full border-l border-border"
              : "max-h-[88%] w-full rounded-t-3xl border-t border-border",
            className,
          )}
          style={[
            Platform.OS === "web"
              ? null
              : isExpanded
                ? { height: "100%", width: Math.min(size.sheet, width) }
                : {
                    width: "100%",
                    maxHeight: Math.max(
                      0,
                      Math.min(height * 0.88, height - insets.top - insets.bottom),
                    ),
                  },
            { paddingTop: isExpanded ? insets.top : 0, paddingBottom: insets.bottom },
            style,
          ]}
          {...props}
        >
          {!isExpanded ? (
            <View
              aria-hidden
              className="my-3 h-1 w-12 self-center rounded-full bg-muted-foreground/35"
            />
          ) : null}
          {children}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

export function AdaptiveSheetHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("gap-2 px-6 pb-4 pt-3 md:px-8", className)} {...props} />;
}

export function AdaptiveSheetTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title asChild {...props}>
      <Text variant="h3" className={cn("text-popover-foreground", className)}>
        {children}
      </Text>
    </DialogPrimitive.Title>
  );
}

export function AdaptiveSheetDescription({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description asChild {...props}>
      <Text variant="body" tone="muted" className={className}>
        {children}
      </Text>
    </DialogPrimitive.Description>
  );
}

export function AdaptiveSheetFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn("gap-3 border-t border-border bg-muted/50 p-6 md:p-8", className)}
      {...props}
    />
  );
}
