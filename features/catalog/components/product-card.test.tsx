import { View } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogProductView } from "../model/catalog-view";

import { ProductCard } from "./product-card";

const catalogView = createCatalogView(createCatalogSnapshotFixture());

function requireProduct(productId: string): CatalogProductView {
  const product = catalogView.resolveProduct(productId);
  if (product === undefined) {
    throw new Error(`fixture product ${productId} was not projected into the view`);
  }
  return product;
}

/** Cover media present, two variants, at least one available. */
const availableProduct = requireProduct(catalogFixtureIds.products.coffee);
/** No cover media, no brand, one unavailable variant — must stay discoverable. */
const unavailableProduct = requireProduct(catalogFixtureIds.products.tote);

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

describe("ProductCard", () => {
  it("is a single whole-card press target whose accessible name carries name, brand and availability", async () => {
    await renderWithProviders(<ProductCard product={availableProduct} onPress={jest.fn()} />);

    expect(
      screen.getByRole("button", { name: "Café Crème, by Maison Élite, Options available" }),
    ).toBeOnTheScreen();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows the name, brand, option count and a visible availability word", async () => {
    await renderWithProviders(<ProductCard product={availableProduct} onPress={jest.fn()} />);

    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
    expect(screen.getByText("Maison Élite")).toBeOnTheScreen();
    expect(screen.getByText("2 options")).toBeOnTheScreen();
    // The badge is visible text, hidden from assistive tech because the card's
    // accessible name already announces it.
    expect(
      screen.getByText("Options available", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it("reports the pressed product upward", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<ProductCard product={availableProduct} onPress={onPress} />);

    await user.press(screen.getByRole("button", { name: /^Café Crème/ }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(availableProduct);
  });

  it("requests the contained card rendition of the cover — packaging is never cropped", async () => {
    await renderWithProviders(<ProductCard product={availableProduct} onPress={jest.fn()} />);

    const card = screen.getByRole("button", { name: /^Café Crème/ }) as unknown as RenderedNode;

    expect(imagesWithin(card)).toEqual([
      {
        uri: "https://res.cloudinary.com/kisok/image/upload/c_limit,h_720,w_720/q_auto/f_auto/coffee-cover",
        contentFit: "contain",
      },
    ]);
  });

  it("keeps the image slot with a named fallback surface when cover media is missing", async () => {
    await renderWithProviders(<ProductCard product={unavailableProduct} onPress={jest.fn()} />);

    const card = screen.getByRole("button", {
      name: "Everyday Tote, Currently unavailable",
    }) as unknown as RenderedNode;

    expect(imagesWithin(card)).toEqual([]);
    // The fallback caption plus the card title: the slot never collapses.
    expect(screen.getAllByText("Everyday Tote")).toHaveLength(2);
  });

  it("keeps unavailable products discoverable and pressable with a Currently unavailable label", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <View>
        <ProductCard product={unavailableProduct} onPress={onPress} />
      </View>,
    );

    expect(
      screen.getByText("Currently unavailable", { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText("Single option")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Everyday Tote, Currently unavailable" }));

    expect(onPress).toHaveBeenCalledWith(unavailableProduct);
  });

  it("says why a search result matched when it was not by name", async () => {
    await renderWithProviders(
      <ProductCard
        product={availableProduct}
        onPress={jest.fn()}
        matchReason={{ field: "Keyword", value: "coffee" }}
      />,
    );

    expect(screen.getByText("Matched")).toBeOnTheScreen();
    expect(screen.getByText("Keyword · coffee")).toBeOnTheScreen();
  });
});
