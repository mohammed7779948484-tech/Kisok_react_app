import { View } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogBrandView } from "../model/catalog-view";

import { BrandCard } from "./brand-card";

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

const catalogView = createCatalogView(createCatalogSnapshotFixture());

function requireBrand(brandId: string): CatalogBrandView {
  const brand = catalogView.resolveBrand(brandId);
  if (brand === undefined) {
    throw new Error(`fixture brand ${brandId} was not projected into the view`);
  }
  return brand;
}

function brandWithCount(name: string, productCount: number): CatalogBrandView {
  return {
    id: `test-brand-${name}`,
    name,
    image_media_asset_id: null,
    image_public_id: null,
    image_secure_url: null,
    display_order: 0,
    image: null,
    productCount,
  };
}

describe("BrandCard", () => {
  it("shows the brand name and its derived product count", async () => {
    await renderWithProviders(
      <View>
        <BrandCard brand={brandWithCount("Single Offering", 1)} onPress={jest.fn()} />
        <BrandCard brand={brandWithCount("Wide Assortment", 12)} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByText("Single Offering")).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();
    expect(screen.getByText("Wide Assortment")).toBeOnTheScreen();
    expect(screen.getByText("12 products")).toBeOnTheScreen();
  });

  it("labels a brand without products honestly", async () => {
    await renderWithProviders(
      <BrandCard brand={brandWithCount("Empty Shelf", 0)} onPress={jest.fn()} />,
    );

    expect(screen.getByText("Empty Shelf")).toBeOnTheScreen();
    expect(screen.getByText("0 products")).toBeOnTheScreen();
  });

  it("presses report the pressed brand upward through one whole-card target", async () => {
    const elite = requireBrand(catalogFixtureIds.brands.elite);
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<BrandCard brand={elite} onPress={onPress} />);

    await user.press(screen.getByRole("button", { name: /Maison Élite/ }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(elite);
  });

  it("renders the brand image through AppImage and keeps the slot when it is missing", async () => {
    const elite = requireBrand(catalogFixtureIds.brands.elite);
    const basics = requireBrand(catalogFixtureIds.brands.basics);
    await renderWithProviders(
      <View>
        <BrandCard brand={elite} onPress={jest.fn()} />
        <BrandCard brand={basics} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByLabelText("Maison Élite")).toBeOnTheScreen();
    expect(screen.getByRole("image", { name: "KISOK Basics" })).toBeOnTheScreen();
  });
});
