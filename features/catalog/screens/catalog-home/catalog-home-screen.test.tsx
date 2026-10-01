import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, fireEvent, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import type { CatalogSnapshot } from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
import { CatalogHomeScreen } from "./catalog-home-screen";

/**
 * Screen behaviour for Catalog Home (AC-02, AC-08).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies). The featured showcase advances only while Home is
 * focused, so `useIsFocused` is driven per test.
 *
 * The Brand District and the range preview lay out in responsive grids that
 * render once measured, so populated tests deliver that layout pass with
 * `measureLayout()`.
 *
 * Fake timers: the showcase advances on a timer, and TanStack's batched
 * observer notification is a `setTimeout(0)` that only lands once timers
 * advance.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

let mockIsFocused = true;

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual<object>("@react-navigation/native"),
  useIsFocused: () => mockIsFocused,
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

/** How long each featured product holds the stage (featured-showcase.tsx). */
const SHOWCASE_HOLD_MS = 6000;

/** Products present, optional collections all empty, neutral settings. */
function snapshotWithoutOptionalCollections(): CatalogSnapshot {
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

/**
 * Café Crème gains a second Color ("Noir"), so Color is a choice customers
 * actually make in this catalog and Home offers it as a discovery path.
 */
function snapshotWithVaryingColor(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const noirValueId = "c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5";
  const noirVariantId = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";

  return createCatalogSnapshotFixture({
    option_values: [
      ...base.option_values,
      {
        id: noirValueId,
        option_type_id: catalogFixtureIds.optionTypes.color,
        value: "Noir",
        display_order: 20,
      },
    ],
    variants: [
      ...base.variants,
      {
        id: noirVariantId,
        product_id: catalogFixtureIds.products.coffee,
        sku: "SECRET-SKU-COFFEE-3",
        barcode: null,
        title_override: null,
        search_keywords: null,
        display_order: 30,
        is_available: true,
        available_quantity: 4,
      },
    ],
    variant_option_values: [
      ...base.variant_option_values,
      {
        variant_id: noirVariantId,
        option_type_id: catalogFixtureIds.optionTypes.color,
        option_value_id: noirValueId,
      },
    ],
  });
}

/** No products at all — the whole-catalog empty state. */
function emptyCatalogSnapshot(): CatalogSnapshot {
  return createCatalogSnapshotFixture({
    products: [],
    variants: [],
    product_categories: [],
    variant_option_values: [],
    variant_media: [],
  });
}

type HostNode = {
  props: Record<string, unknown>;
  children: readonly (HostNode | string)[];
};

/** Deliver a layout pass to every container that renders nothing until measured. */
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

async function renderHome(snapshot: CatalogSnapshot = createCatalogSnapshotFixture()) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<CatalogHomeScreen />);
  await waitFor(() =>
    expect(screen.getByRole("header", { name: "Find Your Option" })).toBeOnTheScreen(),
  );
  await measureLayout();
  return result;
}

/** The featured product currently on the showcase stage. */
function showcasedProductName(): string | undefined {
  const explore = screen.queryAllByRole("button", { name: /^Explore / });
  return explore[0]?.props.accessibilityLabel?.replace(/^Explore /, "");
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  mockIsFocused = true;
  // Fixture media carry stored public ids that differ from their delivery
  // paths, which the Cloudinary helper reports at debug level.
  setLogSink(() => {});
});

afterEach(() => {
  mockFetchCatalog.mockReset();
  resetLogging();
});

describe("CatalogHomeScreen", () => {
  it("mounts the populated Home from one successful snapshot", async () => {
    await renderHome();

    // The page names the store for assistive tech.
    expect(screen.getByRole("header", { name: "KISOK Test Store catalog" })).toBeOnTheScreen();

    // The catalog chrome is present with Explore selected.
    expect(screen.getByRole("tab", { name: "Explore", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Products", selected: false })).toBeOnTheScreen();

    // Every bounded section the catalog supports is present.
    expect(screen.getByRole("header", { name: "Store Map" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Find Your Option" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Brand District" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Explore the Range" })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders the bounded Home sections from the view, not the whole catalog", async () => {
    await renderHome();

    // Store Map: root categories only, with their aggregated counts (the
    // child stays on Category Detail).
    expect(screen.getByRole("button", { name: "Drínks, 2 products" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Tóp Picks, / })).toBeNull();

    // Featured showcase: featured products only, one on stage at a time.
    expect(screen.getByRole("tab", { name: "Show Café Crème", selected: true })).toBeOnTheScreen();
    expect(
      screen.getByRole("tab", { name: "Show Pocket Notebook", selected: false }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("tab", { name: "Show Everyday Tote" })).toBeNull();
    expect(screen.getByText("1 / 2")).toBeOnTheScreen();
    expect(showcasedProductName()).toBe("Café Crème");

    // Brand District: every stocked brand.
    expect(screen.getByRole("button", { name: "Maison Élite, 1 product" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics, 1 product" })).toBeOnTheScreen();

    // Explore the Range: the products not already featured.
    expect(screen.getByRole("button", { name: "Everyday Tote" })).toBeOnTheScreen();
  });

  it("advances the featured showcase only while Home is focused, and on a dot press", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderHome();

    expect(showcasedProductName()).toBe("Café Crème");

    await act(async () => {
      await jest.advanceTimersByTimeAsync(SHOWCASE_HOLD_MS);
    });

    expect(showcasedProductName()).toBe("Pocket Notebook");
    expect(screen.getByText("2 / 2")).toBeOnTheScreen();

    // A customer can jump straight to any featured product.
    await user.press(screen.getByRole("tab", { name: "Show Café Crème" }));

    expect(showcasedProductName()).toBe("Café Crème");
    expect(screen.getByRole("tab", { name: "Show Café Crème", selected: true })).toBeOnTheScreen();
  });

  it("holds the featured showcase still while Home is not focused", async () => {
    mockIsFocused = false;
    await renderHome();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(SHOWCASE_HOLD_MS * 3);
    });

    expect(showcasedProductName()).toBe("Café Crème");
  });

  it("replaces root destinations and never pushes them", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderHome();

    // Re-selecting the current destination replaces rather than stacks, too.
    await user.press(screen.getByRole("tab", { name: "Explore" }));
    await user.press(screen.getByRole("tab", { name: "Products" }));
    await user.press(screen.getByRole("tab", { name: "Brands" }));
    await user.press(screen.getByRole("tab", { name: "Categories" }));
    // The chrome's search field and the Option Finder's both open Search.
    for (const field of screen.getAllByRole("search", { name: "Search the store" })) {
      await user.press(field);
    }

    expect(mockRouterReplace.mock.calls).toEqual([
      ["/"],
      ["/products"],
      ["/brands"],
      ["/categories"],
      ["/search"],
      ["/search"],
    ]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("pushes brand, category and product detail routes with the pressed entity's id", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderHome();

    await user.press(screen.getByRole("button", { name: "Drínks, 2 products" }));
    await user.press(screen.getByRole("button", { name: "Maison Élite, 1 product" }));
    await user.press(screen.getByRole("button", { name: "Explore Café Crème" }));
    await user.press(screen.getByRole("button", { name: "Everyday Tote" }));

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/category-detail",
          params: { categoryId: catalogFixtureIds.categories.drinks },
        },
      ],
      [{ pathname: "/brand-detail", params: { brandId: catalogFixtureIds.brands.elite } }],
      [
        {
          pathname: "/product-detail",
          params: { productId: catalogFixtureIds.products.coffee, backLabel: "Back to Explore" },
        },
      ],
      [
        {
          pathname: "/product-detail",
          params: { productId: catalogFixtureIds.products.tote, backLabel: "Back to Explore" },
        },
      ],
    ]);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("Browse-all actions and discovery tiles replace to their root destinations", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderHome();

    await user.press(screen.getByRole("link", { name: "View all categories" }));
    await user.press(screen.getByRole("link", { name: "View all brands" }));
    await user.press(screen.getByRole("link", { name: "View all products" }));
    await user.press(screen.getByRole("button", { name: "Brand, Explore brand families" }));
    await user.press(screen.getByRole("button", { name: "Category, Start from the store map" }));

    expect(mockRouterReplace.mock.calls).toEqual([
      ["/categories"],
      ["/brands"],
      ["/products"],
      ["/brands"],
      ["/categories"],
    ]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("offers the option types customers actually choose between as searches", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderHome(snapshotWithVaryingColor());

    expect(screen.getByText("Explore by color, brand, or category.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Color, Products with color choices" }));

    expect(mockRouterPush.mock.calls).toEqual([[{ pathname: "/search", params: { q: "Color" } }]]);
  });

  it("offers no option-type search when no option actually varies", async () => {
    await renderHome();

    expect(screen.getByText("Explore by brand, or category.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Color, / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Size, / })).toBeNull();
  });

  it("falls back to a neutral store name when settings are empty", async () => {
    await renderHome(snapshotWithoutOptionalCollections());

    expect(screen.getByRole("header", { name: "Store catalog" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "KISOK, explore the store" })).toBeOnTheScreen();
  });

  it("omits sections whose optional collections are absent while products exist", async () => {
    await renderHome(snapshotWithoutOptionalCollections());

    // Products exist, so this is NOT the whole-catalog empty state.
    expect(screen.queryByText("The catalog is empty")).toBeNull();

    // No categories, no featured products and no brands: those sections are
    // absent rather than empty.
    expect(screen.queryByRole("header", { name: "Store Map" })).toBeNull();
    expect(screen.queryByRole("tab", { name: /^Show / })).toBeNull();
    expect(screen.queryByRole("header", { name: "Brand District" })).toBeNull();

    // The range preview still leads into the products that exist.
    expect(screen.getByRole("header", { name: "Explore the Range" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème" })).toBeOnTheScreen();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<CatalogHomeScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // The chrome stays usable, but no section pretends to be data.
    expect(screen.getByRole("tab", { name: "Explore", selected: true })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Find Your Option" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the populated Home visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch; a network blip
    // mid-session must not blank the still-valid Home.
    mockFetchCatalog
      .mockResolvedValueOnce(createCatalogSnapshotFixture())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<CatalogHomeScreen />);
    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Find Your Option" })).toBeOnTheScreen(),
    );
    await measureLayout();

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("header", { name: "Store Map" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite, 1 product" })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
  });

  it("shows a whole-catalog empty state instead of sections when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<CatalogHomeScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );
    // Brands and categories exist in the snapshot, but sections stay hidden.
    expect(screen.queryByRole("header", { name: "Brand District" })).toBeNull();
    expect(screen.queryByRole("header", { name: "Store Map" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
