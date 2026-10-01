import { View } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogCategoryView } from "../model/catalog-view";

import { CategoryCard } from "./category-card";

const catalogView = createCatalogView(createCatalogSnapshotFixture());

function requireCategory(categoryId: string): CatalogCategoryView {
  const category = catalogView.resolveCategory(categoryId);
  if (category === undefined) {
    throw new Error(`fixture category ${categoryId} was not projected into the view`);
  }
  return category;
}

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

type RenderedNode = {
  props: { source?: unknown; contentFit?: unknown };
  children: readonly (RenderedNode | string)[];
};

/** Every rendered image (a host with a `source`) inside `element`. */
function imagesWithin(element: RenderedNode): { uri?: string; contentFit?: unknown }[] {
  const own = Array.isArray(element.props.source)
    ? (element.props.source as readonly { uri?: string }[]).map((entry) => ({
        uri: entry.uri,
        contentFit: element.props.contentFit,
      }))
    : [];
  return [
    ...own,
    ...element.children.flatMap((child) => (typeof child === "string" ? [] : imagesWithin(child))),
  ];
}

beforeEach(() => {
  // The fixture's stored public ids differ from their delivery paths, which
  // the Cloudinary helper reports at debug level.
  setLogSink(() => {});
});

afterEach(() => {
  resetLogging();
});

describe("CategoryCard", () => {
  it("names each card by its category and derived product count", async () => {
    await renderWithProviders(
      <View>
        <CategoryCard category={categoryWithCount("Drinks", 1)} onPress={jest.fn()} />
        <CategoryCard category={categoryWithCount("Everything Else", 7)} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByRole("button", { name: "Drinks, 1 product" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Everything Else, 7 products" })).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();
    expect(screen.getByText("7 products")).toBeOnTheScreen();
  });

  it("labels a category without products honestly", async () => {
    await renderWithProviders(
      <CategoryCard category={categoryWithCount("Quiet Corner", 0)} onPress={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Quiet Corner, 0 products" })).toBeOnTheScreen();
    expect(screen.getByText("0 products")).toBeOnTheScreen();
  });

  it("lists a root category's sub-categories, or invites browsing when it has none", async () => {
    const drinks = requireCategory(catalogFixtureIds.categories.drinks);
    await renderWithProviders(
      <View>
        <CategoryCard category={drinks} onPress={jest.fn()} />
        <CategoryCard category={categoryWithCount("Leaf", 2)} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByText("Tóp Picks")).toBeOnTheScreen();
    expect(screen.getByText("View products")).toBeOnTheScreen();
  });

  it("reports the pressed category upward through one whole-card target", async () => {
    const drinks = requireCategory(catalogFixtureIds.categories.drinks);
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<CategoryCard category={drinks} onPress={onPress} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    await user.press(screen.getByRole("button", { name: /^Drínks, / }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(drinks);
  });

  it("reports presses from the compact path variant too", async () => {
    const specials = requireCategory(catalogFixtureIds.categories.specials);
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <CategoryCard category={specials} variant="path" onPress={onPress} />,
    );

    await user.press(screen.getByRole("button", { name: /^Tóp Picks, / }));

    expect(onPress).toHaveBeenCalledWith(specials);
  });

  it("fills its imagery with the editorial cover rendition when an image exists", async () => {
    const drinks = requireCategory(catalogFixtureIds.categories.drinks);
    await renderWithProviders(<CategoryCard category={drinks} onPress={jest.fn()} />);

    const card = screen.getByRole("button", { name: /^Drínks, / }) as unknown as RenderedNode;

    expect(imagesWithin(card)).toEqual([
      {
        uri: expect.stringMatching(
          /^https:\/\/res\.cloudinary\.com\/kisok\/image\/upload\/c_fill,g_auto,h_900,w_1280\/q_auto\/f_auto\/drinks$/,
        ),
        contentFit: "cover",
      },
    ]);
    expect(screen.getAllByText("Drínks")).toHaveLength(1);
  });

  it("keeps the image slot with a named fallback surface when the image is missing", async () => {
    const specials = requireCategory(catalogFixtureIds.categories.specials);
    await renderWithProviders(<CategoryCard category={specials} onPress={jest.fn()} />);

    const card = screen.getByRole("button", { name: /^Tóp Picks, / }) as unknown as RenderedNode;

    expect(imagesWithin(card)).toEqual([]);
    // The fallback caption plus the card title.
    expect(screen.getAllByText("Tóp Picks")).toHaveLength(2);
  });
});
