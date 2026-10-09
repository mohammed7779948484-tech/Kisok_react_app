import { renderHook } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { HelpMeChoosePill, useHelpMeChoosePillLayout } from "./help-me-choose-pill";

/**
 * The floating Help Me Choose entry (GD-09): an extended pill — icon plus
 * words, never icon-only — that names itself and reports the press upward.
 */
describe("HelpMeChoosePill", () => {
  it("is a named button with visible words and a hint, and reports a press", async () => {
    const onPress = jest.fn();
    await renderWithProviders(<HelpMeChoosePill onPress={onPress} />);
    const user = userEvent.setup();

    const pill = screen.getByRole("button", { name: "Help me choose" });
    expect(pill).toBeOnTheScreen();
    expect(pill.props.accessibilityHint).toBe(
      "Answer a few quick questions to narrow the products",
    );
    expect(screen.getByTestId("help-me-choose-pill")).toBe(pill);
    // Extended, not icon-only: the words are on screen.
    expect(screen.getByText("Help me choose")).toBeOnTheScreen();

    await user.press(pill);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  function layoutWithBottomInset(bottom: number) {
    const metrics = {
      frame: { x: 0, y: 0, width: 1280, height: 800 },
      insets: { top: 0, left: 0, right: 0, bottom },
    };
    return renderHook(() => useHelpMeChoosePillLayout(), {
      wrapper: ({ children }) => (
        <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
      ),
    }).then(({ result }) => result.current);
  }

  it("floats 24 above the content's foot and has pages reserve room for it", async () => {
    expect(await layoutWithBottomInset(0)).toEqual({ bottom: 24, clearance: 96 });
  });

  it("clears the Android navigation bar, and the reserved room grows with it", async () => {
    // 3-button navigation: the pill sits above the bar, and the last row must
    // still scroll clear of it.
    expect(await layoutWithBottomInset(48)).toEqual({ bottom: 64, clearance: 136 });
  });
});
