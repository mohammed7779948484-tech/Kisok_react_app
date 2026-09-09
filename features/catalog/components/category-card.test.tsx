import { View } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import {
  createCatalogView,
  type CatalogCategoryView,
  type CatalogMedia,
} from "../model/catalog-view";

import { CategoryCard } from "./category-card";

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

const catalogView = createCatalogView(createCatalogSnapshotFixture());

function requireCategory(categoryId: string): CatalogCategoryView {
  const category = catalogView.resolveCategory(categoryId);
  if (category === undefined) {
    throw new Error(`fixture category ${categoryId} was not projected into the view`);
  }
  return category;
}

const categoryImage: CatalogMedia = {
  mediaAssetId: catalogFixtureIds.media.category,
  publicId: "categories/drinks",
  secureUrl: "https://res.cloudinary.com/kisok/image/upload/drinks.png",
};

function categoryWithCount(name: string, productCount: number): CatalogCategoryView {
  return {
    id: `test-category-${name}`,
    name,
    parent_id: null,
    image_media_asset_id: null,
    image_public_id: null,
    image_secure_url: null,
    display_order: 0,
    image: null,
    parent: null,
    children: [],
    productCount,
  };
}

describe("CategoryCard", () => {
  it("shows the category name and its derived product count", async () => {
    await renderWithProviders(
      <View>
        <CategoryCard category={categoryWithCount("Drinks", 1)} onPress={jest.fn()} />
        <CategoryCard category={categoryWithCount("Everything Else", 7)} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByText("Drinks")).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();
    expect(screen.getByText("Everything Else")).toBeOnTheScreen();
    expect(screen.getByText("7 products")).toBeOnTheScreen();
  });

  it("labels a category without products honestly", async () => {
    await renderWithProviders(
      <CategoryCard category={categoryWithCount("Quiet Corner", 0)} onPress={jest.fn()} />,
    );

    expect(screen.getByText("Quiet Corner")).toBeOnTheScreen();
    expect(screen.getByText("0 products")).toBeOnTheScreen();
  });

  it("presses report the pressed category upward through one whole-card target", async () => {
    const drinks = requireCategory(catalogFixtureIds.categories.drinks);
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<CategoryCard category={drinks} onPress={onPress} />);

    await user.press(screen.getByRole("button", { name: /Drínks/ }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(drinks);
  });

  it("renders the category image through AppImage and keeps the slot when it is missing", async () => {
    const drinks = requireCategory(catalogFixtureIds.categories.drinks);
    const withImage: CatalogCategoryView = { ...drinks, image: categoryImage };
    const withoutImage = requireCategory(catalogFixtureIds.categories.specials);
    await renderWithProviders(
      <View>
        <CategoryCard category={withImage} onPress={jest.fn()} />
        <CategoryCard category={withoutImage} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByLabelText("Drínks")).toBeOnTheScreen();
    expect(screen.getByRole("image", { name: "Tóp Picks" })).toBeOnTheScreen();
  });
});
