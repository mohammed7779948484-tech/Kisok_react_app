import { Text, View } from "react-native";

import { renderWithProviders, screen } from "@/core/testing";

import { AvailabilityBadge } from "./availability-badge";

jest.mock("lucide-react-native", () => ({}));

describe("AvailabilityBadge", () => {
  it("announces available products in words, not colour alone", async () => {
    await renderWithProviders(
      <View>
        <AvailabilityBadge isAvailable={true} />
      </View>,
    );

    expect(screen.getByText("Available")).toBeOnTheScreen();
    expect(screen.getByRole("text", { name: "Available" })).toBeOnTheScreen();
  });

  it("announces out-of-stock products in words", async () => {
    await renderWithProviders(
      <View>
        <AvailabilityBadge isAvailable={false} />
      </View>,
    );

    expect(screen.getByText("Currently unavailable")).toBeOnTheScreen();
    expect(screen.getByRole("text", { name: "Currently unavailable" })).toBeOnTheScreen();
  });

  it("renders exactly one text node so the full state is one announcement", async () => {
    await renderWithProviders(
      <View>
        <AvailabilityBadge isAvailable={true} />
        <Text>sentinel</Text>
      </View>,
    );

    expect(screen.getAllByRole("text", { name: "Available" })).toHaveLength(1);
  });
});
