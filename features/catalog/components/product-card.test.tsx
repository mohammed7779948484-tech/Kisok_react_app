import { View } from "react-native";

import { renderWithProviders, screen, userEvent } from "@/core/testing";

import { catalogFixtureIds, createCatalogSnapshotFixture } from "../model/catalog-snapshot.fixture";
import { createCatalogView, type CatalogProductView } from "../model/catalog-view";

import { ProductCard } from "./product-card";

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

const catalogView = createCatalogView(createCatalogSnapshotFixture());

function requireProduct(productId: string): CatalogProductView {
  const product = catalogView.resolveProduct(productId);
  if (product === undefined) {
    throw new Error(`fixture product ${productId} was not projected into the view`);
  }
  return product;
}

/** Cover media present, at least one available variant. */
const availableProduct = requireProduct(catalogFixtureIds.products.coffee);
/** No cover media, every variant unavailable — must stay discoverable. */
const unavailableProduct = requireProduct(catalogFixtureIds.products.tote);

describe("ProductCard", () => {
  it("shows the product name and truthful product-level availability", async () => {
    await renderWithProviders(<ProductCard product={availableProduct} onPress={jest.fn()} />);

    expect(screen.getByText("Café Crème")).toBeOnTheScreen();
    expect(screen.getByText("Options available")).toBeOnTheScreen();
  });

  it("is a single whole-card press target whose accessible name carries name and availability", async () => {
    await renderWithProviders(<ProductCard product={availableProduct} onPress={jest.fn()} />);

    const brandName = availableProduct.brand?.name;
    const expectedLabel = `${availableProduct.name}${brandName ? `, by ${brandName}` : ""}, Options available`;
    const card = screen.getByRole("button", { name: expectedLabel });
    expect(card).toBeOnTheScreen();
  });

  it("presses report the pressed product upward", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<ProductCard product={availableProduct} onPress={onPress} />);

    const brandName = availableProduct.brand?.name;
    const expectedLabel = `${availableProduct.name}${brandName ? `, by ${brandName}` : ""}, Options available`;
    await user.press(screen.getByRole("button", { name: expectedLabel }));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(availableProduct);
  });

  it("renders the cover image through AppImage when media exists", async () => {
    await renderWithProviders(<ProductCard product={availableProduct} onPress={jest.fn()} />);

    expect(screen.getByLabelText("Café Crème")).toBeOnTheScreen();
  });

  it("keeps the image slot with the shared fallback when cover media is missing", async () => {
    await renderWithProviders(<ProductCard product={unavailableProduct} onPress={jest.fn()} />);

    expect(screen.getByRole("image", { name: "Everyday Tote" })).toBeOnTheScreen();
  });

  it("keeps unavailable products discoverable with a Currently unavailable label", async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(
      <View>
        <ProductCard product={unavailableProduct} onPress={onPress} />
      </View>,
    );

    expect(screen.getByText("Currently unavailable")).toBeOnTheScreen();
    const brandName = unavailableProduct.brand?.name;
    const expectedLabel = `${unavailableProduct.name}${brandName ? `, by ${brandName}` : ""}, Currently unavailable`;
    expect(screen.getByRole("button", { name: expectedLabel })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: expectedLabel }));

    expect(onPress).toHaveBeenCalledWith(unavailableProduct);
  });
});
