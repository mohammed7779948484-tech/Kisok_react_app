import * as React from "react";
import { Platform, Text } from "react-native";

import { cleanup, renderWithProviders, screen, userEvent } from "@/core/testing";

import {
  AdaptiveSheet,
  AdaptiveSheetClose,
  AdaptiveSheetContent,
  AdaptiveSheetTitle,
  AdaptiveSheetTrigger,
} from "./adaptive-sheet";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "./dialog";

// RNTL 14 exposes host elements only. Keep the app components and portal real,
// and inspect props passed to the Reanimated boundary using test-only host IDs.
jest.mock("react-native-reanimated", () => {
  const React = require("react") as typeof import("react");
  const { Pressable, View } = require("react-native") as typeof import("react-native");
  const reanimated = require("react-native-reanimated/mock");

  return {
    ...reanimated,
    default: {
      ...reanimated.default,
      View: function AnimatedViewBoundary(props: Record<string, unknown>) {
        return React.createElement(View, {
          ...props,
          testID: "hf01-animated-content",
        });
      },
      createAnimatedComponent(Component: import("react").ElementType) {
        return function AnimatedComponentBoundary(props: Record<string, unknown>) {
          return React.createElement(Component, {
            ...props,
            testID: Component === Pressable ? "hf01-animated-overlay" : props.testID,
          });
        };
      },
    },
  };
});

// Dialog chooses this adapter at import time. Pass through while testing both
// platforms; the Android test must not invoke the iOS-only native adapter.
jest.mock("react-native-screens", () => {
  const screens = jest.requireActual("react-native-screens");
  const { View } = require("react-native");
  return { ...screens, FullWindowOverlay: View };
});

type Variant = "Dialog" | "AdaptiveSheet";

function OverlayFixture({ variant }: { variant: Variant }) {
  const [open, setOpen] = React.useState(false);
  const Root = variant === "Dialog" ? Dialog : AdaptiveSheet;
  const Trigger = variant === "Dialog" ? DialogTrigger : AdaptiveSheetTrigger;
  const Close = variant === "Dialog" ? DialogClose : AdaptiveSheetClose;

  const body = (
    <>
      <Text>Portal content</Text>
      <Close accessibilityRole="button" accessibilityLabel="Close overlay">
        <Text>Close overlay</Text>
      </Close>
    </>
  );

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger accessibilityRole="button" accessibilityLabel="Open overlay">
        <Text>Open overlay</Text>
      </Trigger>
      {variant === "Dialog" ? (
        <DialogContent showCloseButton={false}>
          <DialogTitle>Overlay title</DialogTitle>
          {body}
        </DialogContent>
      ) : (
        <AdaptiveSheetContent>
          <AdaptiveSheetTitle>Overlay title</AdaptiveSheetTitle>
          {body}
        </AdaptiveSheetContent>
      )}
    </Root>
  );
}

const originalPlatform = Object.getOwnPropertyDescriptor(Platform, "OS")!;

afterEach(async () => {
  await cleanup();
  Object.defineProperty(Platform, "OS", originalPlatform);
});

describe.each(["android", "ios"] as const)("Dialog portal lifecycle on %s", (platform) => {
  it.each(["Dialog", "AdaptiveSheet"] as const)(
    "%s preserves entering animations and applies the exit policy across reopen",
    async (variant) => {
      Object.defineProperty(Platform, "OS", {
        configurable: true,
        value: platform,
      });
      const user = userEvent.setup();
      await renderWithProviders(<OverlayFixture variant={variant} />);

      expect(screen.queryByText("Portal content")).toBeNull();
      expect(screen.queryAllByTestId(/^hf01-animated-/)).toHaveLength(0);

      for (let cycle = 0; cycle < 2; cycle += 1) {
        await user.press(screen.getByRole("button", { name: "Open overlay" }));

        expect(screen.getByText("Portal content")).toBeOnTheScreen();
        const wrappers = [
          screen.getByTestId("hf01-animated-overlay"),
          screen.getByTestId("hf01-animated-content"),
        ];
        expect(screen.getAllByTestId(/^hf01-animated-/)).toHaveLength(2);

        for (const wrapper of wrappers) {
          expect(wrapper.props.entering).toBeDefined();
          if (platform === "android") {
            expect(wrapper.props.exiting).toBeUndefined();
          } else {
            expect(wrapper.props.exiting).toBeDefined();
          }
        }

        await user.press(screen.getByRole("button", { name: "Close overlay" }));

        expect(screen.queryByText("Portal content")).toBeNull();
        expect(screen.queryAllByTestId(/^hf01-animated-/)).toHaveLength(0);
      }
    },
  );
});
