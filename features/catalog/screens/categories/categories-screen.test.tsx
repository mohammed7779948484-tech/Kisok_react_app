import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, renderWithProviders, screen, userEvent, waitFor, within } from "@/core/testing";

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
 * Screen behaviour for All Categories (AC-05).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies).
 *
 * The directory shows ROOT categories as editorial cards; each root names its
 * sub-categories, which are chosen on the root's own Category Detail.
 *
 * Fake timers: TanStack's batched observer notification is a `setTimeout(0)`
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

jest.useFakeTimers();

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

const DRINKS_CARD = "Drínks, 4 products";
const GEAR_CARD = "Gear, 1 product";

async function renderPopulated(snapshot: CatalogSnapshot = snapshotWithCategoryHierarchy()) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<CategoriesScreen />);
  await waitFor(() => expect(screen.getByRole("header", { name: "Categories" })).toBeOnTheScreen());
  return result;
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  // Fixture media carry stored public ids that differ from their delivery
  // paths, which the Cloudinary helper reports at debug level.
  setLogSink(() => {});
});

afterEach(() => {
  mockFetchCatalog.mockReset();
  resetLogging();
});

describe("CategoriesScreen", () => {
  it("mounts the populated category directory from one successful snapshot", async () => {
    await renderPopulated();

    // Every ROOT category is a whole-card button, in display order; the
    // sub-category is not a card of its own.
    expect(screen.getByTestId("categories-list")).toBeOnTheScreen();
    expect(
      screen
        .getAllByRole("button")
        .map((element) => element.props.accessibilityLabel)
        .filter((label) => label === DRINKS_CARD || label === GEAR_CARD),
    ).toEqual([DRINKS_CARD, GEAR_CARD]);
    expect(screen.queryByRole("button", { name: /^Tóp Picks/ })).toBeNull();

    // The catalog chrome is present with Categories selected.
    expect(screen.getByRole("tab", { name: "Categories", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Explore", selected: false })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("derives each root's product count across its sub-categories and names those sub-categories", async () => {
    await renderPopulated();

    // Drínks aggregates itself + its direct child, de-duplicated: 4 — Café
    // Crème counts once even though it links to both Drínks and Tóp Picks.
    const drinks = screen.getByRole("button", { name: DRINKS_CARD });
    expect(within(drinks).getByText("4 products")).toBeOnTheScreen();
    expect(within(drinks).getByText("Tóp Picks")).toBeOnTheScreen();

    // A root without sub-categories invites browsing instead.
    const gear = screen.getByRole("button", { name: GEAR_CARD });
    expect(within(gear).getByText("1 product")).toBeOnTheScreen();
    expect(within(gear).getByText("View products")).toBeOnTheScreen();

    // Imagery: Drínks has an image and names itself once; Gear has none and
    // keeps its slot with a named fallback (fallback caption + title).
    expect(within(drinks).getAllByText("Drínks")).toHaveLength(1);
    expect(within(gear).getAllByText("Gear")).toHaveLength(2);
  });

  it("pushes the matching category detail when a whole card is pressed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated();

    await user.press(screen.getByRole("button", { name: DRINKS_CARD }));
    await user.press(screen.getByRole("button", { name: GEAR_CARD }));

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/category-detail",
          params: { categoryId: catalogFixtureIds.categories.drinks },
        },
      ],
      [{ pathname: "/category-detail", params: { categoryId: extraCategoryIds.gear } }],
    ]);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("replaces root destinations and never pushes them", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated();

    // Re-selecting the current destination replaces rather than stacks, too.
    await user.press(screen.getByRole("tab", { name: "Explore" }));
    await user.press(screen.getByRole("tab", { name: "Products" }));
    await user.press(screen.getByRole("tab", { name: "Brands" }));
    await user.press(screen.getByRole("tab", { name: "Categories" }));
    await user.press(screen.getByRole("search", { name: "Search the store" }));
    await user.press(screen.getByRole("link", { name: "Explore" }));

    expect(mockRouterReplace.mock.calls).toEqual([
      ["/"],
      ["/products"],
      ["/brands"],
      ["/categories"],
      ["/search"],
      ["/"],
    ]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("directs the customer to Products when there are no categories", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated(snapshotWithNoCategories());

    expect(screen.getByRole("header", { name: NO_CATEGORIES_TITLE })).toBeOnTheScreen();
    expect(screen.getByText(NO_CATEGORIES_DESCRIPTION)).toBeOnTheScreen();

    // Products exist, so this is a LOCAL empty collection — not the
    // whole-catalog empty state and not an error.
    expect(screen.queryByText("The catalog is empty")).toBeNull();
    expect(screen.queryByText("The catalog could not load")).toBeNull();
    expect(screen.queryByTestId("categories-list")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace.mock.calls).toEqual([["/products"]]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<CategoriesScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // The chrome stays usable so the customer can leave, but no heading or
    // cards pretend to be data while pending.
    expect(screen.getByRole("tab", { name: "Categories", selected: true })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Categories" })).toBeNull();
    expect(screen.queryByTestId("categories-list")).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the populated directory visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch; a network blip
    // mid-session must not blank the still-valid directory.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithCategoryHierarchy())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<CategoriesScreen />);
    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Categories" })).toBeOnTheScreen(),
    );

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("header", { name: "Categories" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: DRINKS_CARD })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the directory when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CategoriesScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId("categories-list")).toBeNull();
    expect(screen.queryByText(NO_CATEGORIES_TITLE)).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
