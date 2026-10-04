import * as DialogPrimitive from "@rn-primitives/dialog";
import { X } from "lucide-react-native";
import * as React from "react";
import {
  Platform,
  StyleSheet,
  Text as RNText,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

import { cn } from "@/core/utils";

import { Icon } from "../primitives/icon";
import { NativeOnlyAnimatedView } from "../primitives/native-only-animated-view";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const FullWindowOverlay = Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

// Android exit animations can mutate the portal hierarchy during native-stack
// drawing on Reanimated 4.1.x (upstream #8422). Dismiss without animated teardown.
function DialogOverlay({
  className,
  children,
  onPress,
  nativeContentStyle,
  nativeOverlayStyle,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, "asChild"> & {
  children?: React.ReactNode;
  nativeContentStyle?: StyleProp<ViewStyle>;
  nativeOverlayStyle?: StyleProp<ViewStyle>;
}) {
  const { onOpenChange } = DialogPrimitive.useRootContext();
  const { width } = useWindowDimensions();

  function onOverlayPress(event: GestureResponderEvent) {
    onPress?.(event);
    if (event.target === event.currentTarget && !event.isDefaultPrevented()) onOpenChange(false);
  }

  return (
    <FullWindowOverlay>
      <DialogPrimitive.Overlay
        className={cn(
          "absolute inset-0 z-50 flex items-center justify-center bg-foreground/55 p-4 md:p-8",
          Platform.select({ web: "fixed animate-in fade-in-0" }),
          className,
        )}
        {...props}
        onPress={Platform.select({ web: onOverlayPress, native: onPress })}
        asChild={Platform.OS !== "web"}
      >
        <NativeOnlyAnimatedView
          entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
          exiting={
            Platform.OS === "android"
              ? undefined
              : FadeOut.duration(140).reduceMotion(ReduceMotion.System)
          }
          as="Pressable"
          style={[
            StyleSheet.absoluteFillObject,
            { padding: width >= 768 ? 32 : 16 },
            nativeOverlayStyle,
          ]}
        >
          {Platform.OS !== "web" ? (
            <View pointerEvents="none" className="absolute inset-0 bg-foreground/55" />
          ) : null}
          <NativeOnlyAnimatedView
            entering={FadeIn.delay(40).duration(180).reduceMotion(ReduceMotion.System)}
            exiting={
              Platform.OS === "android"
                ? undefined
                : FadeOut.duration(140).reduceMotion(ReduceMotion.System)
            }
            style={[
              { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
              nativeContentStyle,
            ]}
          >
            <>{children}</>
          </NativeOnlyAnimatedView>
        </NativeOnlyAnimatedView>
      </DialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function DialogContent({
  className,
  portalHost,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal hostName={portalHost}>
      <DialogOverlay>
        <DialogPrimitive.Content
          className={cn(
            "z-50 mx-auto flex w-full max-w-xl flex-col gap-5 rounded-3xl bg-popover p-6 shadow-xl shadow-foreground/10 md:p-8",
            Platform.select({ web: "duration-200 animate-in fade-in-0 zoom-in-95" }),
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              className={cn(
                "absolute right-2 top-2 h-touch w-touch items-center justify-center rounded-full opacity-70 active:bg-secondary active:opacity-100",
                Platform.select({
                  web: "outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/30",
                }),
              )}
            >
              <Icon as={X} size={20} className="text-muted-foreground" />
              <RNText className="sr-only">Close</RNText>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogOverlay>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ViewProps) {
  return <View className={cn("flex-col gap-2 pr-10", className)} {...props} />;
}

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "font-display-semibold text-title-lg text-popover-foreground md:text-display-sm",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("font-sans text-body text-muted-foreground md:text-body-lg", className)}
      {...props}
    />
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
