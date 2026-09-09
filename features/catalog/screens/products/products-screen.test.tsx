import { AppError } from "@/core/errors";
import { act, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import type {
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
} from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
import { ProductsScreen } from "./products-screen";

/**
 * Screen behaviour for All Products (AC-03).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as `queries/use-catalog.test.tsx` and the Home
 * screen test do. Navigation is asserted against a mocked `expo-router`
 * `useRouter` (push/replace spies) because the detail/root routes this screen
 * targets do not all exist until T07–T09 — the tests pin destinations and
 * semantics, not navigation.
 *
 * Fake timers follow the CatalogGrid test, not the Home screen test: this
 * screen renders FlashList, whose deferred layout work fires real timers that
 * escape `act` and print warnings under real timers. That is also why the
 * background-refetch macrotask flush from the Home test becomes a fake-timer
 * advance here — TanStack's batched observer notification is a `setTimeout(0)`
 * that only lands once timers advance.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// AppImage's fallback icon renders a lucide icon; stub it so card fallback
// paths render without the SVG machinery.
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

jest.useFakeTimers();

const mockFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

const retryableCatalogError = new AppError({
  kind: "server",
  userMessage: "We couldn't load the catalog. Please try again.",
  technicalMessage: "get_customer_catalog rpc failed",
});

const nonRetryableCatalogError = new AppError({
  kind: "forbidden",
  userMessage: "You don't have access to browse this catalog.",
  technicalMessage: "SQLSTATE 42501",
});

/** Ids for the products the multi-product fixture appends past the base 3. */
const extraProductIds = {
  trailBottle: "21212121-2121-4121-8121-212121212121",
  cottonScarf: "23232323-2323-4232-8232-232323232323",
  herbalTeaTin: "25252525-2525-4525-8525-252525252525",
  bambooCutlery: "27272727-2727-4727-8727-272727272727",
} as const;

/**
 * Every identity the multi-product snapshot contains, in backend display
 * order. Derived from the fixture builder so a fixture change cannot silently
 * desynchronize the assertions from the data.
 */
const manyProductNames = [
  "Café Crème",
  "Everyday Tote",
  "Pocket Notebook",
  "Trail Bottle",
  "Cotton Scarf",
  "Herbal Tea Tin",
  "Bamboo Cutlery Set",
] as const;

const manyProductCountLabel = `${manyProductNames.length} products`;

/**
 * A snapshot with 7 products — more than the base fixture's 3 — because the
 * scalable-grid and every-identity-discoverable behaviours must be pinned on a
 * collection the base fixture cannot express. The appended products mix
 * availability and carry no cover media, so the shared image fallback renders
 * alongside the base products' cover image.
 */
function snapshotWithManyProducts(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const extraProducts: CatalogProduct[] = [
    {
      id: extraProductIds.trailBottle,
      name: "Trail Bottle",
      brand_id: null,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 40,
      is_featured: false,
    },
    {
      id: extraProductIds.cottonScarf,
      name: "Cotton Scarf",
      brand_id: null,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 50,
      is_featured: false,
    },
    {
      id: extraProductIds.herbalTeaTin,
      name: "Herbal Tea Tin",
      brand_id: null,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 60,
      is_featured: false,
    },
    {
      id: extraProductIds.bambooCutlery,
      name: "Bamboo Cutlery Set",
      brand_id: null,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 70,
      is_featured: false,
    },
  ];
  const extraVariants: CatalogVariant[] = [
    {
      id: "31313131-3131-4131-8131-313131313131",
      product_id: extraProductIds.trailBottle,
      sku: "EXTRA-SKU-BOTTLE",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: "35353535-3535-4353-8353-353535353535",
      product_id: extraProductIds.cottonScarf,
      sku: "EXTRA-SKU-SCARF",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: false,
    },
    {
      id: "37373737-3737-4373-8737-373737373737",
      product_id: extraProductIds.herbalTeaTin,
      sku: "EXTRA-SKU-TEA",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: "39393939-3939-4393-8393-393939393939",
      product_id: extraProductIds.bambooCutlery,
      sku: "EXTRA-SKU-CUTLERY",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: false,
    },
  ];

  return createCatalogSnapshotFixture({
    products: [...base.products, ...extraProducts],
    variants: [...base.variants, ...extraVariants],
  });
}

/**
 * Every product in the multi-product snapshot has every variant unavailable.
 * All-unavailable products must remain in the grid, discoverable, with their
 * textual availability — never filtered out (plan Design decision 10).
 */
function snapshotWithAllProductsUnavailable(): CatalogSnapshot {
  const snapshot = snapshotWithManyProducts();

  return {
    ...snapshot,
    variants: snapshot.variants.map((variant) => ({ ...variant, is_available: false })),
  };
}

/** No products at all — the whole-catalog empty state, same semantic as Home. */
function emptyCatalogSnapshot(): CatalogSnapshot {
  return createCatalogSnapshotFixture({
    products: [],
    variants: [],
    product_categories: [],
    variant_option_values: [],
    variant_media: [],
  });
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
});

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("ProductsScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated All Products grid from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyProducts());

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "All products" })).toBeOnTheScreen(),
    );

    // The product count is visible.
    expect(screen.getByText(manyProductCountLabel)).toBeOnTheScreen();

    // The complete products collection is present in the scalable grid.
    expect(screen.getByTestId("products-grid")).toBeOnTheScreen();
    for (const name of manyProductNames) {
      expect(screen.getByText(name)).toBeOnTheScreen();
    }

    // Root navigation is present with Products selected.
    expect(screen.getByRole("button", { name: "Products", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Home", selected: false })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders identity, image/fallback and textual derived availability from the card", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyProducts());

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen(),
    );

    // Available products say so in words.
    expect(screen.getByRole("button", { name: "Trail Bottle, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Herbal Tea Tin, Available" })).toBeOnTheScreen();

    // Unavailable products remain present with their textual availability.
    expect(screen.getByRole("button", { name: "Everyday Tote, Out of stock" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pocket Notebook, Out of stock" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cotton Scarf, Out of stock" })).toBeOnTheScreen();

    // Cover imagery renders through AppImage; missing media keeps the shared
    // fallback slot instead of collapsing the card layout.
    expect(screen.getByLabelText("Café Crème")).toBeOnTheScreen();
    expect(screen.getByRole("image", { name: "Everyday Tote" })).toBeOnTheScreen();
  });

  it("keeps every product discoverable when all products are unavailable", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithAllProductsUnavailable());

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() => expect(screen.getByText(manyProductCountLabel)).toBeOnTheScreen());

    // Nothing is filtered out of the grid: every product is still browsable,
    // each carrying its textual Out of stock status.
    for (const name of manyProductNames) {
      expect(screen.getByRole("button", { name: `${name}, Out of stock` })).toBeOnTheScreen();
    }

    expect(screen.queryByRole("button", { name: /, Available$/ })).toBeNull();
  });

  it("pushes the matching product detail when a card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen(),
    );

    // An available product, an unavailable one, and one past the base fixture.
    await user.press(screen.getByRole("button", { name: "Café Crème, Available" }));
    await user.press(screen.getByRole("button", { name: "Everyday Tote, Out of stock" }));
    await user.press(screen.getByRole("button", { name: "Trail Bottle, Available" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(3);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.coffee },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.tote },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: "/product-detail",
      params: { productId: extraProductIds.trailBottle },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("replaces root destinations and never pushes them", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Home", selected: false })).toBeOnTheScreen(),
    );

    // Re-selecting the current destination replaces rather than stacks, too.
    await user.press(screen.getByRole("button", { name: "Home" }));
    await user.press(screen.getByRole("button", { name: "Products" }));
    await user.press(screen.getByRole("button", { name: "Brands" }));
    await user.press(screen.getByRole("button", { name: "Categories" }));
    await user.press(screen.getByRole("button", { name: "Search" }));

    expect(mockRouterReplace).toHaveBeenCalledTimes(5);
    expect(mockRouterReplace).toHaveBeenNthCalledWith(1, "/");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(2, "/products");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(3, "/brands");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(4, "/categories");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(5, "/search");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<ProductsScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No grid, count or navigation chrome pretending to be data while pending.
    expect(screen.queryByRole("header", { name: "All products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Products" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<ProductsScreen />);

    // ErrorState's View is not an `accessible` element, so RNTL role queries
    // cannot match role "alert"; assert the standard error surface by its
    // visible title and the error's safe user message instead.
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the populated grid visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch, and the shared
    // QueryClient refetches on focus/reconnect for long-lived kiosk sessions —
    // so a network blip mid-session must not blank the still-valid grid. Only
    // a failure with NO snapshot may render the full-screen ErrorState.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithManyProducts())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<ProductsScreen />);

    await waitFor(() => expect(screen.getByText(manyProductCountLabel)).toBeOnTheScreen());

    // The same background refetch the shared QueryClient triggers on
    // focus/reconnect — the first (successful) load is already consumed.
    // Fake timers (see the file header) turn the Home test's macrotask flush
    // into a timer advance so TanStack's batched observer notification lands
    // inside act and the screen has re-rendered before the assertions.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    // The populated grid stays on screen…
    expect(screen.getByRole("header", { name: "All products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the grid when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // No grid, no cards — brands and categories exist in the snapshot, but
    // this screen browses products only.
    expect(screen.queryByTestId("products-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
