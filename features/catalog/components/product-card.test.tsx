import { View as MockView } from "react-native";

import type { AppImageProps } from "@/components/media/app-image";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView } from "../model/catalog-view";

import { ProductCard } from "./product-card";

const mockAppImage = jest.fn((_props: AppImageProps) => <MockView testID="app-image-slot" />);

jest.mock("@/components/media/app-image", () => ({
  AppImage: (props: AppImageProps) => mockAppImage(props),
}));

beforeEach(() => {
  mockAppImage.mockClear();
});

describe("ProductCard", () => {
  it("presents product identity, optional detail and textual availability as one link", async () => {
    const product = createCatalogView(createCatalogSnapshotFixture()).products[0]!;
    const onPress = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(<ProductCard product={product} onPress={onPress} />);

    expect(mockAppImage).toHaveBeenCalledTimes(1);
    expect(mockAppImage.mock.calls[0]![0]).toMatchObject({
      uri: "https://res.cloudinary.com/kisok/image/upload/coffee-cover.png",
      alt: "",
      contentFit: "cover",
    });
    expect(screen.getByTestId("app-image-slot")).toBeOnTheScreen();

    const link = screen.getByRole("link", {
      name: "Café Crème, Maison Élite, Available",
    });
    expect(link).toBeOnTheScreen();
    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
    expect(screen.getByText("Maison Élite")).toBeOnTheScreen();
    expect(screen.getByText("A smooth customer favourite.")).toBeOnTheScreen();
    expect(screen.getByText("Available")).toBeOnTheScreen();
    expect(screen.queryByText(/price|add to cart/i)).not.toBeOnTheScreen();

    await user.press(link);

    expect(onPress).toHaveBeenCalledWith(product);
  });

  it("keeps an unavailable product discoverable without absent optional copy", async () => {
    const product = createCatalogView(createCatalogSnapshotFixture()).products[1]!;

    await renderWithProviders(<ProductCard product={product} onPress={jest.fn()} />);

    expect(mockAppImage).toHaveBeenCalledTimes(1);
    expect(mockAppImage.mock.calls[0]![0]).toMatchObject({
      uri: undefined,
      alt: "",
      contentFit: "cover",
    });
    expect(screen.getByTestId("app-image-slot")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Everyday Tote, Out of stock" })).toBeOnTheScreen();
    expect(screen.getByText("Out of stock")).toBeOnTheScreen();
    expect(screen.queryByText("Maison Élite")).not.toBeOnTheScreen();
    expect(screen.queryByText("A smooth customer favourite.")).not.toBeOnTheScreen();
  });
});
