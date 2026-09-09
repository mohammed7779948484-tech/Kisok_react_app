import { AppError } from "@/core/errors";
import { act, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import { catalogKeys } from "../../queries/keys";
import { CatalogHomeScreen } from "./catalog-home-screen";

/**
 * Screen behaviour for Catalog Home (AC-02, AC-08).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as `queries/use-catalog.test.tsx` does. Navigation
 * is asserted against a mocked `expo-router` `useRouter` (minimal: `push` and
 * `replace` spies) because the detail routes this screen targets do not exist
 * until T07–T09 — the tests pin destinations and semantics, not navigation.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// AppImage's fallback icon renders a lucide icon; the shared suite stubs it so
// card fallback paths render without the SVG machinery.
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
}));

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

/** Products present, optional collections all empty, neutral settings. */
function snapshotWithoutOptionalCollections() {
  const { products } = createCatalogSnapshotFixture();

  return createCatalogSnapshotFixture({
    settings: {},
    brands: [],
    categories: [],
    product_categories: [],
    products: products.map((product) => ({
      ...product,
      brand_id: null,
      is_featured: false,
    })),
  });
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
});

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("CatalogHomeScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated Home from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "KISOK Test Store" })).toBeOnTheScreen(),
    );

    // Root navigation is present with Home selected.
    expect(screen.getByRole("button", { name: "Home", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Products", selected: false })).toBeOnTheScreen();

    // All three bounded sections are present.
    expect(screen.getByRole("header", { name: "Brands" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Categories" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Featured products" })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders the bounded Home sections from the view, not the whole catalog", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Maison Élite, 1 product" })).toBeOnTheScreen(),
    );

    // Brands section: every bounded brand card.
    expect(screen.getByRole("button", { name: "KISOK Basics, 1 product" })).toBeOnTheScreen();

    // Categories section: root categories only (the child stays on detail).
    expect(screen.getByRole("button", { name: "Drínks, 2 products" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Tóp Picks/ })).toBeNull();

    // Featured products section: featured products only.
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pocket Notebook, Out of stock" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Everyday Tote/ })).toBeNull();
  });

  it("replaces root destinations and never pushes them", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Products", selected: false })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("button", { name: "Products" }));
    await user.press(screen.getByRole("button", { name: "Brands" }));
    await user.press(screen.getByRole("button", { name: "Categories" }));
    await user.press(screen.getByRole("button", { name: "Search" }));
    await user.press(screen.getByRole("button", { name: "Home" }));

    expect(mockRouterReplace).toHaveBeenCalledTimes(5);
    expect(mockRouterReplace).toHaveBeenNthCalledWith(1, "/products");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(2, "/brands");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(3, "/categories");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(4, "/search");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(5, "/");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("pushes brand, category and product detail routes with the pressed entity's id", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Maison Élite, 1 product" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("button", { name: "Maison Élite, 1 product" }));
    await user.press(screen.getByRole("button", { name: "Drínks, 2 products" }));
    await user.press(screen.getByRole("button", { name: "Café Crème, Available" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(3);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/brand-detail",
      params: { brandId: catalogFixtureIds.brands.elite },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.drinks },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.coffee },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("Browse-all actions replace to their root destinations", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Browse all brands" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("button", { name: "Browse all brands" }));
    await user.press(screen.getByRole("button", { name: "Browse all categories" }));
    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace).toHaveBeenCalledTimes(3);
    expect(mockRouterReplace).toHaveBeenNthCalledWith(1, "/brands");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(2, "/categories");
    expect(mockRouterReplace).toHaveBeenNthCalledWith(3, "/products");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("falls back to a neutral Catalog heading when settings are empty", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture({ settings: {} }));

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() => expect(screen.getByRole("header", { name: "Catalog" })).toBeOnTheScreen());

    expect(screen.queryByText("KISOK Test Store")).toBeNull();
    // The rest of Home still works without optional settings.
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
  });

  it("omits sections whose optional collections are absent while products exist", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithoutOptionalCollections());

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Products", selected: false })).toBeOnTheScreen(),
    );

    // Products exist, so this is NOT the whole-catalog empty state.
    expect(screen.queryByText("The catalog is empty")).toBeNull();

    // No section headers, no Browse-all actions, no cards.
    expect(screen.queryByRole("header", { name: "Brands" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Categories" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Featured products" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Browse all/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<CatalogHomeScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No section or navigation chrome pretending to be data while pending.
    expect(screen.queryByRole("button", { name: "Products" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup();

    await renderWithProviders(<CatalogHomeScreen />);

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

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the populated Home visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch, and the shared
    // QueryClient refetches on focus/reconnect for long-lived kiosk sessions —
    // so a network blip mid-session must not blank the still-valid Home. Only
    // a failure with NO snapshot may render the full-screen ErrorState.
    mockFetchCatalog
      .mockResolvedValueOnce(createCatalogSnapshotFixture())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "KISOK Test Store" })).toBeOnTheScreen(),
    );

    // The same background refetch the shared QueryClient triggers on
    // focus/reconnect — the first (successful) load is already consumed.
    // The macrotask flush lets TanStack's batched observer notification land
    // inside act, so the screen has re-rendered before the assertions.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The populated Home stays on screen…
    expect(screen.getByRole("header", { name: "KISOK Test Store" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });

  it("shows a whole-catalog empty state instead of sections when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(
      createCatalogSnapshotFixture({
        products: [],
        variants: [],
        product_categories: [],
        variant_option_values: [],
        variant_media: [],
      }),
    );
    const user = userEvent.setup();

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // Brands and categories exist in the snapshot, but sections stay hidden.
    expect(screen.queryByRole("header", { name: "Brands" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Categories" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Featured products" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Maison Élite/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Browse all/ })).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
