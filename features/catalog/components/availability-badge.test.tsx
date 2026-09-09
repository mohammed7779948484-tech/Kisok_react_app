import { Text, View } from "react-native";

import { renderWithProviders, screen } from "@/core/testing";

import { AvailabilityBadge } from "./availability-badge";

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

    expect(screen.getByText("Out of stock")).toBeOnTheScreen();
    expect(screen.getByRole("text", { name: "Out of stock" })).toBeOnTheScreen();
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
