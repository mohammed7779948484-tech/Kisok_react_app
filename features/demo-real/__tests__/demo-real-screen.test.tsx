import { renderWithProviders, screen, waitFor } from "@/core/testing";
import { AppError } from "@/core/errors";

import { DemoRealScreen } from "../screens/demo-real-screen";

/**
 * Mock the feature's own api module — that is the seam the architecture is
 * built around. Do not mock `@/core/supabase` here: a screen test should not
 * know that Supabase exists.
 */
jest.mock("../api/demo-real-api", () => ({
  fetchDemoRealList: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fetchDemoRealList } = require("../api/demo-real-api") as {
  fetchDemoRealList: jest.Mock;
};

describe("DemoRealScreen", () => {
  beforeEach(() => {
    fetchDemoRealList.mockReset();
  });

  it("shows the empty state when there is no data", async () => {
    fetchDemoRealList.mockResolvedValue([]);

    await renderWithProviders(<DemoRealScreen />);

    await waitFor(() => {
      expect(screen.getByText("Nothing here yet")).toBeOnTheScreen();
    });
  });

  it("shows the customer-safe message and a retry when loading fails", async () => {
    fetchDemoRealList.mockRejectedValue(
      new AppError({
        kind: "network",
        userMessage: "We couldn't reach the network. Check the connection and try again.",
      }),
    );

    await renderWithProviders(<DemoRealScreen />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't reach the network/i)).toBeOnTheScreen();
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  });

  it("renders the items it is given", async () => {
    fetchDemoRealList.mockResolvedValue([
      { id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b", label: "First item" },
    ]);

    await renderWithProviders(<DemoRealScreen />);

    await waitFor(() => {
      expect(screen.getByText("First item")).toBeOnTheScreen();
    });
  });
});
