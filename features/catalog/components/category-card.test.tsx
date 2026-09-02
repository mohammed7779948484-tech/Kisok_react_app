import { View as MockView } from "react-native";

import type { AppImageProps } from "@/components/media/app-image";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView } from "../model/catalog-view";

import { CategoryCard } from "./category-card";

const mockAppImage = jest.fn((_props: AppImageProps) => <MockView testID="app-image-slot" />);

jest.mock("@/components/media/app-image", () => ({
  AppImage: (props: AppImageProps) => mockAppImage(props),
}));

beforeEach(() => {
  mockAppImage.mockClear();
});

describe("CategoryCard", () => {
  it("presents the category and plural derived count as one link and reports the selection", async () => {
    const category = createCatalogView(createCatalogSnapshotFixture()).categories[0]!;
    const onPress = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(<CategoryCard category={category} onPress={onPress} />);

    expect(mockAppImage).toHaveBeenCalledTimes(1);
    expect(mockAppImage.mock.calls[0]![0]).toMatchObject({
      uri: "https://res.cloudinary.com/kisok/image/upload/drinks.png",
      alt: "",
      contentFit: "cover",
    });
    expect(screen.getByTestId("app-image-slot")).toBeOnTheScreen();

    const link = screen.getByRole("link", { name: "Drínks, 2 products" });
    expect(link).toBeOnTheScreen();
    expect(screen.getByText("2 products")).toBeOnTheScreen();

    await user.press(link);

    expect(onPress).toHaveBeenCalledWith(category);
  });

  it("uses singular count copy", async () => {
    const category = {
      ...createCatalogView(createCatalogSnapshotFixture()).categories[1]!,
      productCount: 1,
    };

    await renderWithProviders(<CategoryCard category={category} onPress={jest.fn()} />);

    expect(mockAppImage).toHaveBeenCalledTimes(1);
    expect(mockAppImage.mock.calls[0]![0]).toMatchObject({
      uri: undefined,
      alt: "",
      contentFit: "cover",
    });
    expect(screen.getByTestId("app-image-slot")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Tóp Picks, 1 product" })).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();
  });
});
