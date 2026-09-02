import { View as MockView } from "react-native";

import type { AppImageProps } from "@/components/media/app-image";
import { AppError } from "@/core/errors";
import { renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import { catalogSnapshotSchema } from "../../model/catalog-snapshot.schema";

import { CatalogHomeScreen } from "./catalog-home-screen";

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockAppImage = jest.fn((props: AppImageProps) => (
  <MockView testID={props.alt === "" ? "catalog-image" : "store-logo"} />
));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

jest.mock("@/components/media/app-image", () => ({
  AppImage: (props: AppImageProps) => mockAppImage(props),
}));

const mockFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

type CatalogFixtureOverrides = Parameters<typeof createCatalogSnapshotFixture>[0];

function createValidCatalogSnapshot(overrides: CatalogFixtureOverrides = {}) {
  return catalogSnapshotSchema.parse(createCatalogSnapshotFixture(overrides));
}

function catalogUuid(sequence: number) {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function createOverLimitCatalogSnapshot() {
  const brands = Array.from({ length: 7 }, (_, index) => ({
    id: catalogUuid(100 + index),
    name: `Brand ${index + 1}`,
    image_media_asset_id: null,
    image_public_id: null,
    image_secure_url: null,
    display_order: index + 1,
  }));
  const categories = Array.from({ length: 7 }, (_, index) => ({
    id: catalogUuid(200 + index),
    name: `Category ${index + 1}`,
    parent_id: null,
    image_media_asset_id: null,
    image_public_id: null,
    image_secure_url: null,
    display_order: index + 1,
  }));
  const products = Array.from({ length: 9 }, (_, index) => ({
    id: catalogUuid(300 + index),
    name: `Featured ${index + 1}`,
    brand_id: brands[index % brands.length]!.id,
    cover_media_asset_id: null,
    cover_public_id: null,
    cover_secure_url: null,
    short_description: null,
    search_keywords: null,
    display_order: index + 1,
    is_featured: true,
  }));

  return createValidCatalogSnapshot({
    brands,
    categories,
    products,
    product_categories: products.map((product, index) => ({
      product_id: product.id,
      category_id: categories[index % categories.length]!.id,
    })),
    option_types: [],
    option_values: [],
    variants: products.map((product, index) => ({
      id: catalogUuid(400 + index),
      product_id: product.id,
      sku: `HOME-${index + 1}`,
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 1,
      is_available: true,
    })),
    variant_option_values: [],
    variant_media: [],
  });
}

beforeEach(() => {
  mockFetchCatalog.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
  mockAppImage.mockClear();
});

describe("CatalogHomeScreen", () => {
  it("shows known-shape skeletons while the catalog is loading", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<CatalogHomeScreen />);

    expect(screen.getAllByLabelText("Loading content")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeOnTheScreen();
  });

  it("shows a safe retryable error and refetches successfully", async () => {
    const user = userEvent.setup();
    mockFetchCatalog
      .mockRejectedValueOnce(
        new AppError({
          kind: "network",
          userMessage: "Check the connection and try again.",
          technicalMessage: "fetch failed with internal catalog detail",
        }),
      )
      .mockResolvedValueOnce(createValidCatalogSnapshot());

    await renderWithProviders(<CatalogHomeScreen />);

    expect(await screen.findByText("Check the connection and try again.")).toBeOnTheScreen();
    expect(screen.getByText("Something went wrong")).toBeOnTheScreen();
    expect(screen.queryByText(/internal catalog detail/i)).not.toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("header", { name: "KISOK Test Store" })).toBeOnTheScreen();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
  });

  it("keeps root navigation available for an empty catalog and offers refresh", async () => {
    const user = userEvent.setup();
    mockFetchCatalog.mockResolvedValue(
      createValidCatalogSnapshot({
        brands: [],
        categories: [],
        products: [],
        product_categories: [],
        option_types: [],
        option_values: [],
        variants: [],
        variant_option_values: [],
        variant_media: [],
      }),
    );

    await renderWithProviders(<CatalogHomeScreen />);

    expect(await screen.findByRole("button", { name: "Home" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByText("No products available")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("uses neutral identity for valid empty settings", async () => {
    mockFetchCatalog.mockResolvedValue(createValidCatalogSnapshot({ settings: {} }));

    await renderWithProviders(<CatalogHomeScreen />);

    expect(await screen.findByRole("header", { name: "Catalog" })).toBeOnTheScreen();
    expect(screen.getByText("KISOK")).toBeOnTheScreen();
    expect(screen.queryByTestId("store-logo")).not.toBeOnTheScreen();
  });

  it("shows populated bounded discovery sections and omits absent optional sections", async () => {
    const unbrandedProducts = createCatalogSnapshotFixture().products.map((product) => ({
      ...product,
      brand_id: null,
    }));
    mockFetchCatalog.mockResolvedValue(
      createValidCatalogSnapshot({ brands: [], products: unbrandedProducts }),
    );

    await renderWithProviders(<CatalogHomeScreen />);

    expect(await screen.findByRole("header", { name: "Categories" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Featured products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Browse all categories" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Browse all products" })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Brands" })).not.toBeOnTheScreen();
    expect(screen.queryByText(/no brands/i)).not.toBeOnTheScreen();
  });

  it("renders only the first backend-ordered Home limits", async () => {
    mockFetchCatalog.mockResolvedValue(createOverLimitCatalogSnapshot());

    await renderWithProviders(<CatalogHomeScreen />);
    await screen.findByRole("header", { name: "KISOK Test Store" });

    for (let index = 1; index <= 6; index += 1) {
      const productCount = index <= 2 ? 2 : 1;
      const countLabel = `${productCount} ${productCount === 1 ? "product" : "products"}`;
      expect(screen.getByRole("link", { name: `Brand ${index}, ${countLabel}` })).toBeOnTheScreen();
      expect(
        screen.getByRole("link", { name: `Category ${index}, ${countLabel}` }),
      ).toBeOnTheScreen();
    }

    for (let index = 1; index <= 8; index += 1) {
      const brandNumber = ((index - 1) % 7) + 1;
      expect(
        screen.getByRole("link", {
          name: `Featured ${index}, Brand ${brandNumber}, Available`,
        }),
      ).toBeOnTheScreen();
    }

    expect(screen.queryByRole("link", { name: "Brand 7, 1 product" })).not.toBeOnTheScreen();
    expect(screen.queryByRole("link", { name: "Category 7, 1 product" })).not.toBeOnTheScreen();
    expect(
      screen.queryByRole("link", { name: "Featured 9, Brand 2, Available" }),
    ).not.toBeOnTheScreen();
  });

  it("renders full store identity including its optional logo", async () => {
    mockFetchCatalog.mockResolvedValue(createValidCatalogSnapshot());

    await renderWithProviders(<CatalogHomeScreen />);

    expect(await screen.findByRole("header", { name: "KISOK Test Store" })).toBeOnTheScreen();
    expect(mockAppImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "https://res.cloudinary.com/kisok/image/upload/catalog-logo.png",
        alt: "KISOK Test Store logo",
      }),
    );
  });

  it("replaces every root destination including Home re-selection", async () => {
    const user = userEvent.setup();
    mockFetchCatalog.mockResolvedValue(createValidCatalogSnapshot());

    await renderWithProviders(<CatalogHomeScreen />);
    await screen.findByRole("header", { name: "KISOK Test Store" });

    for (const label of ["Home", "Products", "Brands", "Categories", "Search"]) {
      await user.press(screen.getByRole("button", { name: label }));
    }

    expect(mockReplace.mock.calls).toEqual([
      ["/"],
      ["/products"],
      ["/brands"],
      ["/categories"],
      ["/search"],
    ]);
  });

  it("pushes browse actions and cards to the planned flat destinations with IDs", async () => {
    const user = userEvent.setup();
    mockFetchCatalog.mockResolvedValue(createValidCatalogSnapshot());

    await renderWithProviders(<CatalogHomeScreen />);
    await screen.findByRole("header", { name: "KISOK Test Store" });

    await user.press(screen.getByRole("button", { name: "Browse all brands" }));
    await user.press(screen.getByRole("button", { name: "Browse all categories" }));
    await user.press(screen.getByRole("button", { name: "Browse all products" }));
    await user.press(screen.getByRole("link", { name: "Maison Élite, 1 product" }));
    await user.press(screen.getByRole("link", { name: "Drínks, 2 products" }));
    await user.press(screen.getByRole("link", { name: "Café Crème, Maison Élite, Available" }));

    expect(mockReplace.mock.calls).toEqual([["/brands"], ["/categories"], ["/products"]]);
    expect(mockPush.mock.calls).toEqual([
      [
        {
          pathname: "/brand-detail",
          params: { brandId: catalogFixtureIds.brands.elite },
        },
      ],
      [
        {
          pathname: "/category-detail",
          params: { categoryId: catalogFixtureIds.categories.drinks },
        },
      ],
      [
        {
          pathname: "/product-detail",
          params: { productId: catalogFixtureIds.products.coffee },
        },
      ],
    ]);
  });
});
