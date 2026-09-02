import { renderWithProviders, screen } from "@/core/testing";

import { AvailabilityBadge } from "./availability-badge";

describe("AvailabilityBadge", () => {
  it.each([
    [true, "Available"],
    [false, "Out of stock"],
  ])("renders boolean availability %s in words", async (isAvailable, label) => {
    await renderWithProviders(<AvailabilityBadge isAvailable={isAvailable} />);

    expect(screen.getByText(label)).toBeOnTheScreen();
  });

  it("does not invent quantity or low-stock messaging", async () => {
    await renderWithProviders(<AvailabilityBadge isAvailable={false} />);

    expect(screen.queryByText(/low stock|left|quantity/i)).not.toBeOnTheScreen();
  });
});
