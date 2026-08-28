import * as DialogPrimitive from "@rn-primitives/dialog";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLayout } from "@/core/responsive";
import { cn } from "@/core/utils";

import { Text } from "./text";

/**
 * One surface that adapts to the tablet's orientation:
 *
 *   expanded (landscape) → a side panel anchored to the right edge
 *   compact / medium     → a bottom sheet
 *
 * This is the shape the KISOK cart needs: quick access without leaving the
 * catalog. Built on the dialog primitive so focus handling and the accessibility
 * role are correct in both presentations.
 *
 * Requires <PortalHost /> at the app root.
 */
export const AdaptiveSheet = DialogPrimitive.Root;
export const AdaptiveSheetTrigger = DialogPrimitive.Trigger;
export const AdaptiveSheetClose = DialogPrimitive.Close;

export function AdaptiveSheetContent({
  className,
  children,
  ...props
}: DialogPrimitive.ContentProps & { children: React.ReactNode }) {
  const { isExpanded } = useLayout();
  const insets = useSafeAreaInsets();

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "absolute inset-0 z-50 bg-black/50",
          isExpanded ? "flex-row justify-end" : "justify-end",
        )}
      >
        <DialogPrimitive.Content
          className={cn(
            "z-50 border-border bg-popover",
            isExpanded
              ? "h-full w-[420px] border-l"
              : "max-h-[85%] w-full rounded-t-xl border-t px-1",
            className,
          )}
          style={{
            paddingTop: isExpanded ? insets.top : 0,
            paddingBottom: insets.bottom,
          }}
          {...props}
        >
          {!isExpanded ? (
            // Grab handle — a visual affordance only, so it stays out of the
            // accessibility tree.
            <View
              aria-hidden
              className="my-3 h-1 w-10 self-center rounded-full bg-muted-foreground/40"
            />
          ) : null}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

export function AdaptiveSheetHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("gap-1.5 px-5 pb-3 pt-2", className)} {...props} />;
}

export function AdaptiveSheetTitle({ className, children, ...props }: DialogPrimitive.TitleProps) {
  return (
    <DialogPrimitive.Title asChild {...props}>
      <Text variant="h3" className={cn("text-popover-foreground", className)}>
        {children}
      </Text>
    </DialogPrimitive.Title>
  );
}

export function AdaptiveSheetFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("gap-3 border-t border-border p-5", className)} {...props} />;
}
