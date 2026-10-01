import { View } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogBrandView } from "../model/catalog-view";

import { BrandCard } from "./brand-card";

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

describe("BrandCard", () => {
  it("names each card by its brand and derived product count", async () => {
    await renderWithProviders(
      <View>
        <BrandCard brand={brandWithCount("Single Offering", 1)} onPress={jest.fn()} />
        <BrandCard brand={brandWithCount("Wide Assortment", 12)} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByRole("button", { name: "Single Offering, 1 product" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Wide Assortment, 12 products" })).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();
    expect(screen.getByText("12 products")).toBeOnTheScreen();
  });

  it("labels a brand without products honestly", async () => {
    await renderWithProviders(
      <BrandCard brand={brandWithCount("Empty Shelf", 0)} onPress={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Empty Shelf, 0 products" })).toBeOnTheScreen();
    expect(screen.getByText("0 products")).toBeOnTheScreen();
  });

  it("shows the total option count only when the caller supplies it", async () => {
    await renderWithProviders(
      <View>
        <BrandCard brand={brandWithCount("One Choice", 1)} optionCount={1} onPress={jest.fn()} />
        <BrandCard brand={brandWithCount("Many Choices", 3)} optionCount={9} onPress={jest.fn()} />
        <BrandCard brand={brandWithCount("Unknown", 2)} onPress={jest.fn()} />
      </View>,
    );

    expect(screen.getByText("1 option")).toBeOnTheScreen();
    expect(screen.getByText("9 options")).toBeOnTheScreen();
    expect(screen.getAllByText(/options?$/)).toHaveLength(2);
  });

  it("reports the pressed brand upward through one whole-card target", async () => {
    const elite = requireBrand(catalogFixtureIds.brands.elite);
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<BrandCard brand={elite} onPress={onPress} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    await user.press(screen.getByRole("button", { name: "Maison Élite, 1 product" }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(elite);
  });

  it("shows the logo whole (contain) over a blurred backdrop copy of itself", async () => {
    const elite = requireBrand(catalogFixtureIds.brands.elite);
    await renderWithProviders(<BrandCard brand={elite} onPress={jest.fn()} />);

    const card = screen.getByRole("button", { name: /^Maison Élite/ }) as unknown as RenderedNode;
    const images = imagesWithin(card);

    expect(images).toHaveLength(2);
    expect(images).toContainEqual({
      uri: "https://res.cloudinary.com/kisok/image/upload/c_limit,h_720,w_720/q_auto/f_auto/elite",
      contentFit: "contain",
    });
    expect(images).toContainEqual({
      uri: expect.stringMatching(/\/c_limit,h_96,w_96\/e_blur:\d+\/.*\/elite$/),
      contentFit: "cover",
    });
    // With a logo the name is set once, on the caption.
    expect(screen.getAllByText("Maison Élite")).toHaveLength(1);
  });

  it("sets the brand name as a wordmark instead of an empty frame when there is no logo", async () => {
    const basics = requireBrand(catalogFixtureIds.brands.basics);
    await renderWithProviders(<BrandCard brand={basics} onPress={jest.fn()} />);

    const card = screen.getByRole("button", { name: /^KISOK Basics/ }) as unknown as RenderedNode;

    expect(imagesWithin(card)).toEqual([]);
    // The wordmark plus the caption.
    expect(screen.getAllByText("KISOK Basics")).toHaveLength(2);
  });
});
