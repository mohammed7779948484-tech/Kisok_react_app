import { View as MockView } from "react-native";

import type { AppImageProps } from "@/components/media/app-image";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView } from "../model/catalog-view";

import { BrandCard } from "./brand-card";

const mockAppImage = jest.fn((_props: AppImageProps) => <MockView testID="app-image-slot" />);

jest.mock("@/components/media/app-image", () => ({
  AppImage: (props: AppImageProps) => mockAppImage(props),
}));

beforeEach(() => {
  mockAppImage.mockClear();
});

describe("BrandCard", () => {
  it("presents the brand and singular derived count as one link and reports the selection", async () => {
    const brand = createCatalogView(createCatalogSnapshotFixture()).brands[0]!;
    const onPress = jest.fn();
    const user = userEvent.setup();

    await renderWithProviders(<BrandCard brand={brand} onPress={onPress} />);

    expect(mockAppImage).toHaveBeenCalledTimes(1);
    expect(mockAppImage.mock.calls[0]![0]).toMatchObject({
      uri: "https://res.cloudinary.com/kisok/image/upload/elite.png",
      alt: "",
      contentFit: "contain",
    });
    expect(screen.getByTestId("app-image-slot")).toBeOnTheScreen();

    const link = screen.getByRole("link", { name: "Maison Élite, 1 product" });
    expect(link).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();

    await user.press(link);

    expect(onPress).toHaveBeenCalledWith(brand);
  });

  it("uses plural count copy", async () => {
    const brand = {
      ...createCatalogView(createCatalogSnapshotFixture()).brands[1]!,
      productCount: 2,
    };

    await renderWithProviders(<BrandCard brand={brand} onPress={jest.fn()} />);

    expect(mockAppImage).toHaveBeenCalledTimes(1);
    expect(mockAppImage.mock.calls[0]![0]).toMatchObject({
      uri: undefined,
      alt: "",
      contentFit: "contain",
    });
    expect(screen.getByTestId("app-image-slot")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "KISOK Basics, 2 products" })).toBeOnTheScreen();
    expect(screen.getByText("2 products")).toBeOnTheScreen();
  });
});
