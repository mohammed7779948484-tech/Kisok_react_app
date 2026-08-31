import * as DialogPrimitive from "@rn-primitives/dialog";
import { View } from "react-native";

import { cn } from "@/core/utils";

import { Text } from "./text";

/**
 * Modal dialog built on @rn-primitives/dialog, which supplies focus trapping,
 * escape/back handling, and the accessibility roles. Do not hand-roll a modal
 * with an absolutely positioned View — you will lose all of that.
 *
 * Requires <PortalHost /> to be mounted once at the app root (see app/_layout.tsx).
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({ className, ...props }: DialogPrimitive.OverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={cn("absolute inset-0 z-50 justify-center bg-black/50 p-4", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.ContentProps & { children: React.ReactNode }) {
  return (
    <DialogPortal>
      <DialogOverlay>
        <DialogPrimitive.Content
          className={cn(
            "z-50 w-full max-w-lg gap-4 self-center rounded-xl border border-border bg-popover p-6",
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return <View className={cn("gap-1.5", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View
      className={cn(
        // Stack on narrow screens so two long labels never squeeze each other.
        "gap-3 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, children, ...props }: DialogPrimitive.TitleProps) {
  return (
    <DialogPrimitive.Title asChild {...props}>
      <Text variant="h3" className={cn("text-popover-foreground", className)}>
        {children}
      </Text>
    </DialogPrimitive.Title>
  );
}

function DialogDescription({ className, children, ...props }: DialogPrimitive.DescriptionProps) {
  return (
    <DialogPrimitive.Description asChild {...props}>
      <Text variant="body" tone="muted" className={className}>
        {children}
      </Text>
    </DialogPrimitive.Description>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
