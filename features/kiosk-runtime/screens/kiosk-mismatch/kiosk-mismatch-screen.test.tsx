import { renderWithProviders, screen } from "@/core/testing";

import { KioskMismatchScreen } from "./kiosk-mismatch-screen";

/**
 * Baseline for a screen with no data source yet.
 *
 * It asserts only what is structurally true today: the screen mounts inside the
 * real providers without throwing, and renders. That is worth having — a screen
 * that crashes on mount is the most common way a route breaks, and nothing else
 * in the suite would catch it.
 *
 * It deliberately does NOT assert business behaviour that does not exist yet.
 * A test written against imagined behaviour passes for the wrong reason and has
 * to be rewritten the moment the screen is real. Behaviour-specific tests are
 * owned by the task that adds the behaviour, written RED first.
 */
describe("KioskMismatchScreen", () => {
  it("mounts without throwing", async () => {
    // `render` is async in @testing-library/react-native v14 — always await it.
    await renderWithProviders(<KioskMismatchScreen />);

    expect(screen.getByText("KioskMismatch")).toBeOnTheScreen();
  });
});
