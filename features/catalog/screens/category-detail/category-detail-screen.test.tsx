import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, fireEvent, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

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
// Rendering the real route module (with `useLocalSearchParams` mocked) proves
// the param seam end to end without asserting on any mock's internals.
import CategoryDetailRoute from "../../../../app/(customer)/category-detail";
import { CategoryDetailScreen } from "./category-detail-screen";

/**
 * Screen behaviour for Category Detail (AC-05).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies); `useLocalSearchParams` is mocked for the route test;
 * `useFocusEffect` runs as a plain effect because the screen is focused for as
 * long as it is mounted here.
 *
 * A root with sub-categories offers those paths (and every product at once);
 * any other category shows its products directly, refinable by brand.
 *
 * The `categoryId` prop is view state, not server state: a stale id is a
 * LOCAL projection of a successful snapshot and must never render the
 * snapshot error state.
 *
 * The results only render once their container has been measured (the grid
 * derives its columns from the width it is given), so every populated test
 * delivers that layout pass with `measureLayout()`.
 *
 * Fake timers: FlashList's deferred layout work fires timers that would escape
 * `act` under real timers, and TanStack's batched observer notification is a
 * `setTimeout(0)` that only lands once timers advance.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

/** The params the mocked `useLocalSearchParams` hands the route under test. */
const mockLocalSearchParams: { categoryId?: string } = {};

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
    useLocalSearchParams: () => mockLocalSearchParams,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(effect, [effect]);
    },
  };
});

jest.useFakeTimers();

type HostNode = {
  props: Record<string, unknown>;
  children: readonly (HostNode | string)[];
};

/**
 * Deliver a layout pass to every container that renders nothing until it has
 * been measured (the browse results, then the grid inside them).
 */
async function measureLayout(width = 1200) {
  const measured = new Set<HostNode>();
  for (let pass = 0; pass < 5; pass += 1) {
    const pending: HostNode[] = [];
    const visit = (node: HostNode) => {
      if (
        typeof node.props.onLayout === "function" &&
        node.children.length === 0 &&
        !measured.has(node)
      ) {
        pending.push(node);
      }
      node.children.forEach((child) => {
        if (typeof child !== "string") visit(child);
      });
    };
    visit(screen.container as unknown as HostNode);
    if (pending.length === 0) return;
    for (const node of pending) {
      measured.add(node);
      await fireEvent(node as never, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width, height: 900 } },
      });
    }
  }
}

const mockFetchCatalog = fetchCatalog as jest.MockedFunction<typeof fetchCatalog>;

const retryableCatalogError = new AppError({
  kind: "server",
  userMessage: "We couldn't load the catalog. Please try again.",
  technicalMessage: "get_customer_catalog_v2 rpc failed",
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
 * id — a stale id is not a network failure and must not pretend to be one.
 */
const CATEGORY_NOT_FOUND_TITLE = "This category is no longer available";
const CATEGORY_NOT_FOUND_DESCRIPTION = "It may have been removed since you started browsing.";

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
 * The same two-level hierarchy fixture as the Categories screen tests: 2
 * roots (Drínks, Gear), Drínks carrying one direct child (Tóp Picks), and
 * Drínks aggregating 4 de-duplicated products — 3 direct (Café Crème from
 * Maison Élite, Chá Board from KISOK Basics, Sparkling Water unbranded) plus
 * Everyday Tote only via the child. Café Crème links to BOTH the root and the
 * child so root aggregation de-duplication is pinned, and the multi-brand
 * memberships make the brand refinement observable. Every category
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
      available_quantity: 8,
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
      available_quantity: 8,
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
      available_quantity: 0,
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
 * A refreshed snapshot in which Café Crème stops carrying Maison Élite, so the
 * brand disappears from every category (and from `used_brands`) while the
 * memberships stay unchanged.
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

/** The product cards on screen, by their accessible names, in any order. */
function productCardNames(): string[] {
  return screen
    .getAllByRole("button")
    .map((element) => element.props.accessibilityLabel as string | undefined)
    .filter((label): label is string =>
      /, (Available|Options available|Currently unavailable)$/.test(label ?? ""),
    )
    .sort();
}

/** Wait for the snapshot to reach the chrome, then measure any results. */
async function settlePopulated(categoryName: string) {
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "KISOK Test Store, explore the store" }),
    ).toBeOnTheScreen(),
  );
  await measureLayout();
  expect(screen.getByRole("header", { name: categoryName })).toBeOnTheScreen();
}

async function renderCategory(
  categoryId: string,
  categoryName: string,
  snapshot: CatalogSnapshot = snapshotWithCategoryHierarchy(),
) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<CategoryDetailScreen categoryId={categoryId} />);
  await settlePopulated(categoryName);
  return result;
}

const TOP_PICKS_PRODUCTS = [
  "Café Crème, by Maison Élite, Options available",
  "Everyday Tote, Currently unavailable",
];

/**
 * Tóp Picks also carries Chá Board (KISOK Basics), so its products span two
 * brands and the brand refinement is offered.
 */
function withChaInTopPicks(snapshot: CatalogSnapshot): CatalogSnapshot {
  return {
    ...snapshot,
    product_categories: [
      ...snapshot.product_categories,
      { product_id: extraProductIds.cha, category_id: catalogFixtureIds.categories.specials },
    ],
  };
}

const TOP_PICKS_WITH_CHA = [
  "Café Crème, by Maison Élite, Options available",
  "Chá Board, by KISOK Basics, Available",
  "Everyday Tote, Currently unavailable",
];

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  mockLocalSearchParams.categoryId = undefined;
  // Fixture media carry stored public ids that differ from their delivery
  // paths, which the Cloudinary helper reports at debug level.
  setLogSink(() => {});
});

afterEach(() => {
  mockFetchCatalog.mockReset();
  resetLogging();
});

describe("CategoryDetailScreen", () => {
  it("offers a root's sub-categories as paths, plus every product at once", async () => {
    await renderCategory(catalogFixtureIds.categories.drinks, "Drínks");

    expect(
      screen.getByText("Choose a more specific path, or view every product in this category."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Explore Drínks" })).toBeOnTheScreen();
    expect(screen.getByText("1 subcategory")).toBeOnTheScreen();
    // The root's count aggregates its child, de-duplicated (Café Crème once).
    expect(screen.getByRole("button", { name: "View all 4 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Tóp Picks, 2 products" })).toBeOnTheScreen();

    // No product grid on a path page — the customer chooses first.
    expect(screen.queryByTestId("category-products-grid")).toBeNull();
    expect(productCardNames()).toEqual([]);

    expect(screen.getByRole("tab", { name: "Categories", selected: true })).toBeOnTheScreen();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("pushes the chosen sub-category, or every product of the root scoped to it", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderCategory(catalogFixtureIds.categories.drinks, "Drínks");

    await user.press(screen.getByRole("button", { name: "Tóp Picks, 2 products" }));
    await user.press(screen.getByRole("button", { name: "View all 4 products" }));

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/category-detail",
          params: { categoryId: catalogFixtureIds.categories.specials },
        },
      ],
      [{ pathname: "/products", params: { categoryId: catalogFixtureIds.categories.drinks } }],
    ]);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("shows a sub-category's direct products under its full breadcrumb", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderCategory(catalogFixtureIds.categories.specials, "Tóp Picks");

    expect(screen.getByText("2 products in this category.")).toBeOnTheScreen();
    expect(screen.getByTestId("category-products-grid")).toBeOnTheScreen();
    expect(productCardNames()).toEqual(TOP_PICKS_PRODUCTS);
    // Only direct memberships: the root's other products are not here.
    expect(screen.queryByRole("button", { name: /Sparkling Water/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Chá Board/ })).toBeNull();

    // Categories replaces to the root destination; the parent is pushed.
    await user.press(screen.getByRole("link", { name: "Categories" }));
    await user.press(screen.getByRole("link", { name: "Drínks" }));

    expect(mockRouterReplace.mock.calls).toEqual([["/categories"]]);
    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/category-detail",
          params: { categoryId: catalogFixtureIds.categories.drinks },
        },
      ],
    ]);
  });

  it("shows a root without sub-categories as its products directly", async () => {
    await renderCategory(extraCategoryIds.gear, "Gear");

    expect(screen.getByText("1 product in this category.")).toBeOnTheScreen();
    expect(productCardNames()).toEqual(["Field Compass, Currently unavailable"]);
    expect(screen.queryByText(/subcategor/)).toBeNull();
  });

  it("pushes the matching product detail, named for the way back to this category", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderCategory(catalogFixtureIds.categories.specials, "Tóp Picks");

    await user.press(
      screen.getByRole("button", { name: "Café Crème, by Maison Élite, Options available" }),
    );
    await user.press(screen.getByRole("button", { name: "Everyday Tote, Currently unavailable" }));

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/product-detail",
          params: { productId: catalogFixtureIds.products.coffee, backLabel: "Back to Tóp Picks" },
        },
      ],
      [
        {
          pathname: "/product-detail",
          params: { productId: catalogFixtureIds.products.tote, backLabel: "Back to Tóp Picks" },
        },
      ],
    ]);
  });

  it("narrows the products to a chosen brand and clears it from the applied filter", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderCategory(
      catalogFixtureIds.categories.specials,
      "Tóp Picks",
      withChaInTopPicks(snapshotWithCategoryHierarchy()),
    );
    expect(productCardNames()).toEqual(TOP_PICKS_WITH_CHA);

    await user.press(screen.getByRole("button", { name: "Filters" }));
    await user.press(await screen.findByRole("checkbox", { name: "Maison Élite, 1" }));
    await user.press(screen.getByRole("button", { name: "Show 1 product" }));

    expect(screen.getByRole("button", { name: "Filters, 1 applied" })).toBeOnTheScreen();
    expect(productCardNames()).toEqual(["Café Crème, by Maison Élite, Options available"]);

    await user.press(screen.getByRole("button", { name: "Remove filter Maison Élite" }));

    expect(screen.getByRole("button", { name: "Filters" })).toBeOnTheScreen();
    expect(productCardNames()).toEqual(TOP_PICKS_WITH_CHA);
  });

  it("narrows the products to available options", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderCategory(
      catalogFixtureIds.categories.specials,
      "Tóp Picks",
      withChaInTopPicks(snapshotWithCategoryHierarchy()),
    );

    await user.press(screen.getByRole("button", { name: "Filters" }));
    await user.press(await screen.findByRole("checkbox", { name: "Available options, 2" }));
    await user.press(screen.getByRole("button", { name: "Show 2 products" }));

    expect(productCardNames()).toEqual([
      "Café Crème, by Maison Élite, Options available",
      "Chá Board, by KISOK Basics, Available",
    ]);
  });

  it("drops a brand filter that a refreshed snapshot makes impossible instead of dead-ending", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { queryClient } = await renderCategory(
      catalogFixtureIds.categories.specials,
      "Tóp Picks",
      withChaInTopPicks(snapshotWithCategoryHierarchy()),
    );

    await user.press(screen.getByRole("button", { name: "Filters" }));
    await user.press(await screen.findByRole("checkbox", { name: "Maison Élite, 1" }));
    await user.press(screen.getByRole("button", { name: "Show 1 product" }));
    expect(productCardNames()).toEqual(["Café Crème, by Maison Élite, Options available"]);

    // The refresh removes Maison Élite from the catalog altogether.
    mockFetchCatalog.mockResolvedValue(withChaInTopPicks(snapshotWithBrandGoneFromCategory()));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole("button", { name: "Filters" })).toBeOnTheScreen();
    expect(productCardNames()).toEqual([
      "Café Crème, Options available",
      "Chá Board, by KISOK Basics, Available",
      "Everyday Tote, Currently unavailable",
    ]);
  });

  it("shows a safe local not-found state for a stale category id", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoryDetailScreen categoryId={STALE_CATEGORY_ID} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: CATEGORY_NOT_FOUND_TITLE })).toBeOnTheScreen(),
    );
    expect(screen.getByText(CATEGORY_NOT_FOUND_DESCRIPTION)).toBeOnTheScreen();

    // A stale id is not a network failure: no snapshot error, no retry.
    expect(screen.queryByText("The catalog could not load")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Back to categories" }));
    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace.mock.calls).toEqual([["/categories"], ["/products"]]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("reads the categoryId route param and passes it to the screen", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithCategoryHierarchy());
    mockLocalSearchParams.categoryId = extraCategoryIds.gear;

    await renderWithProviders(<CategoryDetailRoute />);
    await settlePopulated("Gear");

    expect(productCardNames()).toEqual(["Field Compass, Currently unavailable"]);
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Drínks" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.drinks} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state when no products are returned, even for a stale id", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoryDetailScreen categoryId={STALE_CATEGORY_ID} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );
    expect(screen.queryByText(CATEGORY_NOT_FOUND_TITLE)).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("keeps the populated detail visible when a background refetch fails while a snapshot is present", async () => {
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithCategoryHierarchy())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(
      <CategoryDetailScreen categoryId={catalogFixtureIds.categories.specials} />,
    );
    await settlePopulated("Tóp Picks");

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("header", { name: "Tóp Picks" })).toBeOnTheScreen();
    expect(productCardNames()).toEqual(TOP_PICKS_PRODUCTS);
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
  });
});
