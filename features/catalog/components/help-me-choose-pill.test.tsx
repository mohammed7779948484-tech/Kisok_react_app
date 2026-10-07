import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { HELP_ME_CHOOSE_PILL_CLEARANCE, HelpMeChoosePill } from "./help-me-choose-pill";

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

  it("asks a screen to reserve room for the pill, its offset and breathing room", () => {
    // 56 (pill) + 24 (bottom offset) + 16 (breathing room).
    expect(HELP_ME_CHOOSE_PILL_CLEARANCE).toBe(96);
  });
});
