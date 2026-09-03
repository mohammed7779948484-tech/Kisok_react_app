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
// The sanctioned route edit is part of THIS task: the route reads the
// `categoryId` param and hands it to the screen. Rendering the real route
// module here (with `useLocalSearchParams` mocked) proves the param seam end
// to end without asserting on any mock's internals.
import CategoryDetailRoute from "../../../../app/(customer)/category-detail";
import { CategoryDetailScreen } from "./category-detail-screen";

/**
 * Screen behaviour for Category Detail (AC-05).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as the Home, Products, Search and Brands screen
 * tests do. Navigation is asserted against a mocked `expo-router`
 * (`useRouter` push/replace/back spies); `useLocalSearchParams` is also mocked
 * because the route-edit test renders the real `app/(customer)/category-detail`
 * route, which reads the param there and passes it to this screen as a prop.
 *
 * The `categoryId` prop is view state, not server state: a stale/invalid id is
 * a LOCAL projection of a successful snapshot and must never render the
 * snapshot `ErrorState`. Category scoping is pinned on the same two-level
 * hierarchy fixture as the Categories screen tests (2 roots, Drínks →
 * Tóp Picks child, multi-brand memberships inside Drínks, every category
 * satisfying the `used_categories` contract — so a resolved category always
 * has ≥1 product and there is NO unfiltered zero-products state to cover,
 * per the T07-R01 lesson).
 *
 * The brand-filter no-match state (AC-05's reset affordance) is driven the
 * only genuinely reachable way: `brandsForCategory` derives its options from
 * the category's own products, so a fresh selection can never yield zero —
 * the state arises when the snapshot CHANGES under a persisted screen-local
 * selection (the shared QueryClient's focus/reconnect background refetch).
 * The test below reproduces exactly that.
 *
 * Fake timers follow the Products, Search and Brands screen tests (and
 * CatalogGrid's own test): this screen renders FlashList for the category's
 * products, whose deferred layout work fires real timers that escape `act`
 * under real timers.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
/** The params the mocked `useLocalSearchParams` hands the route under test. */
const mockLocalSearchParams: { categoryId?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace, back: mockRouterBack }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));

// AppImage's fallback icon renders a lucide icon; stub it so card and header
// fallback paths render without the SVG machinery.
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

/** A well-formed id that resolves to no category in any fixture — the stale case. */
const STALE_CATEGORY_ID = "68686868-6868-4688-8688-686868686868";

/**
 * The distinct copy of the LOCAL not-found state for a stale/invalid category
 * id. Declared so the tests can also assert the snapshot `ErrorState` copy
 * stays absent — a stale id is not a network failure and must not pretend to
 * be one.
 */
const CATEGORY_NOT_FOUND_TITLE = "Category not found";
const CATEGORY_NOT_FOUND_DESCRIPTION =
  "This category isn't in the current catalog. It may have been removed since you started browsing. Go back to see the categories this store has now.";

/**
 * The distinct copy of the brand-filter no-match state: a selected brand with
 * zero products in this category. Distinct from the whole-catalog empty copy
 * and from the not-found copy — and it carries its own reset affordance.
 */
const NO_BRAND_MATCH_TITLE = "No products from this brand";
const NO_BRAND_MATCH_DESCRIPTION =
  "This brand currently has no products in this category. Browse the full selection instead.";

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
 * The category-scoped products of the Drínks root in the hierarchy snapshot,
 * in backend display order (the projection aggregates direct memberships and
 * the direct child's, de-duplicated in product order).
 */
const DRINKS_PRODUCT_LABELS = [
  "Café Crème, Available",
  "Everyday Tote, Out of stock",
  "Sparkling Water, Available",
  "Chá Board, Available",
] as const;

/**
 * The same two-level hierarchy fixture as the Categories screen tests: 2
 * roots (Drínks, Gear), Drínks carrying one direct child (Tóp Picks), and
 * Drínks aggregating 4 de-duplicated products — 3 direct (Café Crème from
 * Maison Élite, Chá Board from KISOK Basics, Sparkling Water unbranded) plus
 * Everyday Tote only via the child. Café Crème links to BOTH the root and the
 * child so root aggregation de-duplication is pinned, and the multi-brand
 * memberships make the local brand filter observable. Every category
 * satisfies the `used_categories` contract.
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
 * The refreshed snapshot for the no-match scenario: Café Crème stops carrying
 * Maison Élite, so the brand disappears from Drínks (and from `used_brands`)
 * while the screen keeps the customer's screen-local Élite selection. Drínks
 * itself is unchanged (4 products, same memberships).
 */
function snapshotWithBrandGoneFromCategory(): CatalogSnapshot {
  const hierarchy = snapshotWithCategoryHierarchy();

  return createCatalogSnapshotFixture({
    brands: hierarchy.brands.filter((brand) => brand.id !== catalogFixtureIds.brands.elite),
    categories: hierarchy.categories,
    products: hierarchy.products.map((product) =>
      product.id === catalogFixtureIds.products.coffee ? { ...product, brand_id: null } : product,
    ),
    product_categories: hierarchy.product_categories,
    variants: hierarchy.variants,
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
  mockRouterBack.mockClear();
  mockLocalSearchParams.categoryId = undefined;
});

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("CategoryDetailScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated Category Detail for the requested root category from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() => expect(screen.getByRole("header", { name: "Drínks" })).toBeOnTheScreen());

    // Category identity: name, image, and the derived product count.
    expect(screen.getByLabelText("Drínks")).toBeOnTheScreen();
    expect(screen.getByText("4 products")).toBeOnTheScreen();

    // The category-scoped products render in the scalable grid…
    expect(screen.getByTestId("category-products-grid")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();

    // …and the root's direct child is present as navigable discovery.
    expect(screen.getByRole("button", { name: "Tóp Picks, 2 products" })).toBeOnTheScreen();

    // The obvious way back to the discovery surface that opened this detail.
    expect(screen.getByRole("button", { name: "Go back" })).toBeOnTheScreen();

    // Root CatalogNavigation is deliberately absent on a detail screen (AC-08):
    // its replace semantics, used from a pushed detail, would duplicate the
    // root entry below. Pinned so a future root-nav regression on this screen
    // fails here instead of stacking duplicate root history.
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Brands" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Categories" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows only the root's scoped products and never another category's or uncategorized ones", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen(),
    );

    // This category's products — direct memberships plus the direct child's,
    // de-duplicated — in backend display order.
    const productCards = screen.getAllByRole("button", {
      name: /^(Café Crème|Everyday Tote|Sparkling Water|Chá Board),/,
    });
    expect(productCards.map((card) => card.props.accessibilityLabel)).toEqual([
      ...DRINKS_PRODUCT_LABELS,
    ]);

    // Scope: another root's product, and uncategorized products, are absent.
    expect(screen.queryByRole("button", { name: /Field Compass/ })).toBeNull();
    expect(screen.queryByText("Pocket Notebook")).toBeNull();
  });

  it("defaults the brand filter to All Brands and shows the unfiltered projection", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "All Brands" })).toBeOnTheScreen(),
    );

    // All Brands is the default selection; no brand is selected.
    expect(screen.getByRole("button", { name: "All Brands", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite", selected: false })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics", selected: false })).toBeOnTheScreen();

    // The initial products are the UNFILTERED projection: every product of
    // the category, from every brand and none, is visible.
    for (const label of DRINKS_PRODUCT_LABELS) {
      expect(screen.getByRole("button", { name: label })).toBeOnTheScreen();
    }
  });

  it("pushes that child's own detail when a child category card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Tóp Picks, 2 products" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("button", { name: "Tóp Picks, 2 products" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.specials },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("shows only direct-membership products for a child category and no child section", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.specials} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Tóp Picks" })).toBeOnTheScreen(),
    );

    // A child projects only its DIRECT memberships: Café Crème and Everyday
    // Tote (both linked to Tóp Picks), in backend display order.
    const productCards = screen.getAllByRole("button", {
      name: /^(Café Crème|Everyday Tote),/,
    });
    expect(productCards.map((card) => card.props.accessibilityLabel)).toEqual([
      "Café Crème, Available",
      "Everyday Tote, Out of stock",
    ]);
    expect(screen.getByText("2 products")).toBeOnTheScreen();

    // Scope: the parent's OTHER direct products and other categories' are
    // absent — they are not memberships of this child.
    expect(screen.queryByRole("button", { name: /Sparkling Water/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Chá Board/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Field Compass/ })).toBeNull();

    // A child has no children of its own (at most one child level), so no
    // child section renders.
    expect(screen.queryByText("Subcategories")).toBeNull();
  });

  it("pushes the matching product detail when a card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen(),
    );

    // An available product and an unavailable one: every product stays
    // inspectable from its category.
    await user.press(screen.getByRole("button", { name: "Café Crème, Available" }));
    await user.press(screen.getByRole("button", { name: "Everyday Tote, Out of stock" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.coffee },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.tote },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("filters the products to the selected brand and represents the selection clearly", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "All Brands", selected: true })).toBeOnTheScreen(),
    );

    // Selecting Maison Élite narrows the grid to that brand's products only.
    await user.press(screen.getByRole("button", { name: "Maison Élite" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Maison Élite", selected: true }),
      ).toBeOnTheScreen(),
    );

    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    // The identity count stays the view's DERIVED AGGREGATED count (4 — the
    // number the Categories cards show) while the grid is narrowed to the
    // filtered subset: the header describes the category, not the filter.
    expect(screen.getByText("4 products")).toBeOnTheScreen();
    // Other brands' products and unbranded ones are filtered out…
    expect(screen.queryByRole("button", { name: /Chá Board/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sparkling Water/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Everyday Tote/ })).toBeNull();
    // …while the child category remains navigable (the filter is about
    // products, not discovery links).
    expect(screen.getByRole("button", { name: "Tóp Picks, 2 products" })).toBeOnTheScreen();

    // All Brands deselects with the selection, and pressing it resets the
    // filter itself — back to the full unfiltered set.
    expect(screen.getByRole("button", { name: "All Brands", selected: false })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "All Brands" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "All Brands", selected: true })).toBeOnTheScreen(),
    );
    for (const label of DRINKS_PRODUCT_LABELS) {
      expect(screen.getByRole("button", { name: label })).toBeOnTheScreen();
    }
  });

  it("shows the no-match state with a reset when the selected brand no longer has products here", async () => {
    // The REACHABLE zero state (AC-05). Brand options derive from the
    // category's own products, so a fresh selection can never yield zero;
    // the state arises when the snapshot changes under the persisted
    // screen-local selection — exactly the background refetch the shared
    // QueryClient performs on focus/reconnect. First load: Élite is present
    // in Drínks; refresh: it is gone.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithCategoryHierarchy())
      .mockResolvedValueOnce(snapshotWithBrandGoneFromCategory());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const { queryClient } = await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("button", { name: "Maison Élite" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Maison Élite", selected: true }),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();

    // The refreshed snapshot: Café Crème is unbranded, Élite is gone.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    // The distinct no-match copy renders with its reset affordance…
    expect(screen.getByText(NO_BRAND_MATCH_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(NO_BRAND_MATCH_DESCRIPTION)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Show all brands" })).toBeOnTheScreen();
    expect(screen.queryByTestId("category-products-grid")).toBeNull();

    // …the selected brand stays clearly represented even though the refreshed
    // options no longer contain it…
    expect(screen.getByRole("button", { name: "Maison Élite", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics", selected: false })).toBeOnTheScreen();

    // …and it is a LOCAL filter state, not a snapshot failure: the identity,
    // the child discovery and the category content stay on screen. The
    // identity count stays the view's DERIVED AGGREGATED count even while
    // the grid is empty — the no-match is the filter's, not the category's.
    expect(screen.getByRole("header", { name: "Drínks" })).toBeOnTheScreen();
    expect(screen.getByText("4 products")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Tóp Picks, 2 products" })).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();

    // The reset returns the unfiltered set from the refreshed snapshot.
    await user.press(screen.getByRole("button", { name: "Show all brands" }));

    await waitFor(() => expect(screen.getByTestId("category-products-grid")).toBeOnTheScreen());
    expect(screen.queryByText(NO_BRAND_MATCH_TITLE)).toBeNull();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Everyday Tote, Out of stock" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sparkling Water, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Chá Board, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "All Brands", selected: true })).toBeOnTheScreen();
  });

  it("shows a safe local not-found state for a stale category id", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoryDetailScreen categoryId={STALE_CATEGORY_ID} />);

    await waitFor(() => expect(screen.getByText(CATEGORY_NOT_FOUND_TITLE)).toBeOnTheScreen());
    expect(screen.getByText(CATEGORY_NOT_FOUND_DESCRIPTION)).toBeOnTheScreen();

    // A stale id is a LOCAL projection of a successful snapshot, never a
    // network failure: the snapshot ErrorState does not render, and there is
    // no retry affordance pretending one just happened.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByLabelText("Loading the catalog…")).toBeNull();

    // No category identity, no grid, no product cards.
    expect(screen.queryByTestId("category-products-grid")).toBeNull();
    expect(screen.queryByRole("header")).toBeNull();

    // The way back to the discovery surface that opened this detail.
    await user.press(screen.getByRole("button", { name: "Go back" }));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("reads the categoryId route param and passes it to the screen", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    mockLocalSearchParams.categoryId = catalogFixtureIds.categories.drinks;

    // The real generated route: it reads `useLocalSearchParams` and hands the
    // id to the screen as a prop. Proven behaviourally — the screen resolves
    // the exact category the mocked params carry, and no other.
    await renderWithProviders(<CategoryDetailRoute />);

    await waitFor(() => expect(screen.getByRole("header", { name: "Drínks" })).toBeOnTheScreen());
    expect(screen.getByText("4 products")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Field Compass/ })).toBeNull();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No category identity, grid or back affordance pretending to be data
    // while pending.
    expect(screen.queryByRole("header", { name: "Drínks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

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

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state when no products are returned, even for a stale category id", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoryDetailScreen categoryId={STALE_CATEGORY_ID} />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // The snapshot layer wins: an empty catalog is not a category-resolution
    // problem, so the local not-found state stays absent.
    expect(screen.queryByText(CATEGORY_NOT_FOUND_TITLE)).toBeNull();
    expect(screen.queryByTestId("category-products-grid")).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("keeps the populated detail visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch, and the shared
    // QueryClient refetches on focus/reconnect for long-lived kiosk sessions —
    // so a network blip mid-session must not blank the still-valid detail. Only
    // a failure with NO snapshot may render the full-screen ErrorState.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithCategoryHierarchy())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() => expect(screen.getByText("4 products")).toBeOnTheScreen());

    // Fake timers (see the file header) turn the Home test's macrotask flush
    // into a timer advance so TanStack's batched observer notification lands
    // inside act and the screen has re-rendered before the assertions.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    // The populated detail stays on screen…
    expect(screen.getByRole("header", { name: "Drínks" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });
});
