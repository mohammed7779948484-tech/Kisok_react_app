import { AppError } from "@/core/errors";
import { act, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
} from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
import { CategoriesScreen } from "./categories-screen";

/**
 * Screen behaviour for All Categories (AC-02 completion, AC-05).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as the Home, Products, Search and Brands screen
 * tests do. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies) — the tests pin destinations and semantics, not
 * navigation.
 *
 * The hierarchy behaviours are pinned on a two-level snapshot the base fixture
 * cannot express: 2 roots (Drínks with an image, Gear without), 1 root with
 * children (Drínks → Tóp Picks), and multi-brand memberships inside Drínks
 * (Maison Élite, KISOK Basics and unbranded products all meet there). Every
 * fixture category satisfies the `used_categories` contract
 * (20260826050006_lean_customer_catalog.sql:65-81): each one carries ≥1 valid
 * product directly (Gear, Tóp Picks) or through a direct child (Drínks) — no
 * impossible fixtures.
 *
 * Fake timers follow the Products, Search and Brands screen tests (and
 * CatalogGrid's own test): this screen renders FlashList, whose deferred
 * layout work fires real timers that escape `act` and print warnings under
 * real timers. That is also why the background-refetch macrotask flush
 * becomes a fake-timer advance — TanStack's batched observer notification is
 * a `setTimeout(0)` that only lands once timers advance.
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

/** Ids for the root category the hierarchy fixture appends past the base 2. */
const extraCategoryIds = {
  gear: "45454545-4545-4455-8455-454545454545",
} as const;

/** Ids for the products the hierarchy fixture appends past the base 3. */
const extraProductIds = {
  sparkling: "51515151-5151-4515-8515-515151515151",
  cha: "52525252-5252-4525-8525-525252525252",
  compass: "53535353-5353-4535-8535-535353535353",
} as const;

/** Ids for the variants the hierarchy fixture appends. */
const extraVariantIds = {
  sparkling: "62626262-6262-4626-8626-626262626262",
  cha: "64646464-6464-4646-8464-646464646464",
  compass: "67676767-6767-4677-8677-676767676767",
} as const;

/**
 * Every category identity the hierarchy snapshot exposes as a card, in the
 * screen's flat projection order: each root immediately followed by its
 * direct children (Drínks → Tóp Picks), then the next root (Gear).
 */
const categoryCardNames = ["Drínks", "Tóp Picks", "Gear"] as const;

const categoryCountLabel = `${categoryCardNames.length} categories`;

/**
 * The distinct copy of the local empty-root-categories state. Products exist
 * (they may all be uncategorized), so this is a LOCAL projection of a
 * successful snapshot — asserted by its own title/description plus the way
 * onward, never by reusing the whole-catalog empty copy.
 */
const NO_CATEGORIES_TITLE = "No categories yet";
const NO_CATEGORIES_DESCRIPTION =
  "This store has no categories listed right now. You can still browse all of its products.";

/**
 * A snapshot with the two-level hierarchy the base fixture cannot express:
 * 2 roots (Drínks, Gear), Drínks carrying one direct child (Tóp Picks), and
 * Drínks aggregating 4 de-duplicated products — 3 linked directly (Café
 * Crème from Maison Élite, Chá Board from KISOK Basics, Sparkling Water
 * unbranded) plus Everyday Tote only via the child. Café Crème links to BOTH
 * the root and the child so root aggregation de-duplication is pinned. Gear
 * holds one direct product. Every category satisfies the `used_categories`
 * contract (≥1 valid product direct or via children).
 */
function snapshotWithCategoryHierarchy(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const extraCategories: CatalogCategory[] = [
    {
      id: extraCategoryIds.gear,
      name: "Gear",
      parent_id: null,
      image_media_asset_id: null,
      image_public_id: null,
      image_secure_url: null,
      display_order: 30,
    },
  ];
  const extraProducts: CatalogProduct[] = [
    {
      id: extraProductIds.sparkling,
      name: "Sparkling Water",
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
      id: extraProductIds.cha,
      name: "Chá Board",
      brand_id: catalogFixtureIds.brands.basics,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 50,
      is_featured: false,
    },
    {
      id: extraProductIds.compass,
      name: "Field Compass",
      brand_id: null,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 60,
      is_featured: false,
    },
  ];
  const extraVariants: CatalogVariant[] = [
    {
      id: extraVariantIds.sparkling,
      product_id: extraProductIds.sparkling,
      sku: "EXTRA-SKU-SPARKLING",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: extraVariantIds.cha,
      product_id: extraProductIds.cha,
      sku: "EXTRA-SKU-CHA",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: extraVariantIds.compass,
      product_id: extraProductIds.compass,
      sku: "EXTRA-SKU-COMPASS",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: false,
    },
  ];

  return createCatalogSnapshotFixture({
    categories: [...base.categories, ...extraCategories],
    products: [...base.products, ...extraProducts],
    product_categories: [
      ...base.product_categories,
      {
        product_id: extraProductIds.sparkling,
        category_id: catalogFixtureIds.categories.drinks,
      },
      {
        product_id: extraProductIds.cha,
        category_id: catalogFixtureIds.categories.drinks,
      },
      {
        product_id: extraProductIds.compass,
        category_id: extraCategoryIds.gear,
      },
    ],
    variants: [...base.variants, ...extraVariants],
  });
}

/**
 * No categories at all, but products exist (all uncategorized — every
 * membership is dropped). This is a LOCAL empty collection, not a
 * whole-catalog empty state: the way onward is Products.
 */
function snapshotWithNoCategories(): CatalogSnapshot {
  return createCatalogSnapshotFixture({
    categories: [],
    product_categories: [],
  });
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

describe("CategoriesScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated All Categories grid from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "All categories" })).toBeOnTheScreen(),
    );

    // The category count is visible.
    expect(screen.getByText(categoryCountLabel)).toBeOnTheScreen();

    // The complete hierarchy is present in the scalable grid: every root and
    // every direct child identity, as whole-card navigation.
    expect(screen.getByTestId("categories-grid")).toBeOnTheScreen();
    for (const name of categoryCardNames) {
      expect(screen.getByText(name)).toBeOnTheScreen();
    }

    // Root navigation is present with Categories selected.
    expect(screen.getByRole("button", { name: "Categories", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Home", selected: false })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders every hierarchy card with its derived product count and imagery", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Drínks, 4 products" })).toBeOnTheScreen(),
    );

    // Each card's accessible name carries the view's DERIVED product count:
    // the root aggregates itself + its direct child, de-duplicated (4 — Café
    // Crème counts once even though it links to both Drínks and Tóp Picks);
    // the child counts only direct memberships (2); the second root counts
    // its own product (1).
    expect(screen.getByRole("button", { name: "Tóp Picks, 2 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Gear, 1 product" })).toBeOnTheScreen();

    // The flat adjacency projection is ORDERED: each root immediately
    // followed by its direct children, roots in the snapshot's order. Pinned
    // via the category cards' accessible names so a reordering of the
    // projection (e.g. children grouped at the end) fails here.
    const categoryCards = screen.getAllByRole("button", {
      name: /^(Drínks|Tóp Picks|Gear), \d+ products?$/,
    });
    expect(categoryCards.map((card) => card.props.accessibilityLabel)).toEqual([
      "Drínks, 4 products",
      "Tóp Picks, 2 products",
      "Gear, 1 product",
    ]);

    // Category imagery renders through AppImage; missing media keeps the
    // shared fallback slot instead of collapsing the card layout.
    expect(screen.getByLabelText("Drínks")).toBeOnTheScreen();
    expect(screen.getByRole("image", { name: "Gear" })).toBeOnTheScreen();
  });

  it("pushes the matching category detail when a whole card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Drínks, 4 products" })).toBeOnTheScreen(),
    );

    // A root with children, its direct child, and a second root without
    // children: every whole-card press opens that category's detail with its
    // exact id.
    await user.press(screen.getByRole("button", { name: "Drínks, 4 products" }));
    await user.press(screen.getByRole("button", { name: "Tóp Picks, 2 products" }));
    await user.press(screen.getByRole("button", { name: "Gear, 1 product" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(3);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.drinks },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.specials },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: "/category-detail",
      params: { categoryId: extraCategoryIds.gear },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("replaces root destinations and never pushes them", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

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

  it("directs the customer to Products when the root category collection is empty", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithNoCategories());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() => expect(screen.getByText(NO_CATEGORIES_TITLE)).toBeOnTheScreen());
    expect(screen.getByText(NO_CATEGORIES_DESCRIPTION)).toBeOnTheScreen();

    // Products exist in the snapshot, so this is a LOCAL empty collection —
    // not the whole-catalog empty state and not an error.
    expect(screen.queryByText("The catalog is empty")).toBeNull();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByTestId("categories-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Drínks/ })).toBeNull();

    // The way forward: an action that takes the customer to Products.
    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/products");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<CategoriesScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No grid, count or navigation chrome pretending to be data while pending.
    expect(screen.queryByRole("header", { name: "All categories" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Categories" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

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

    await renderWithProviders(<CategoriesScreen />);

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
      .mockResolvedValueOnce(snapshotWithCategoryHierarchy())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<CategoriesScreen />);

    await waitFor(() => expect(screen.getByText(categoryCountLabel)).toBeOnTheScreen());

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
    expect(screen.getByRole("header", { name: "All categories" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Drínks, 4 products" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the categories grid when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // No grid, no cards — categories exist in the snapshot, but this screen
    // browses a catalog whose products are the reason to browse.
    expect(screen.queryByTestId("categories-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Drínks/ })).toBeNull();

    // A whole-catalog empty is not the local no-categories copy: there is
    // nothing at all, so retry (not Products) is the way forward.
    expect(screen.queryByText(NO_CATEGORIES_TITLE)).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
