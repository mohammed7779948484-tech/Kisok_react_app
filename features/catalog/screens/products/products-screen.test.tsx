import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, fireEvent, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

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
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies); `useFocusEffect` runs as a plain effect because the
 * screen is focused for as long as it is mounted here.
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

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
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
      available_quantity: 8,
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
      available_quantity: 0,
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
      available_quantity: 8,
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
      available_quantity: 0,
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

/** The product cards on screen, in grid order, by their accessible names. */
function productCardNames(): string[] {
  return screen
    .getAllByRole("button")
    .map((element) => element.props.accessibilityLabel as string | undefined)
    .filter((label): label is string =>
      manyProductNames.some((name) => label?.startsWith(`${name},`) === true),
    );
}

/** The first accessible name at or below `node` — a cell's product card. */
function firstLabelWithin(node: HostNode): string | undefined {
  if (typeof node.props.accessibilityLabel === "string") return node.props.accessibilityLabel;
  for (const child of node.children) {
    if (typeof child === "string") continue;
    const label = firstLabelWithin(child);
    if (label !== undefined) return label;
  }
  return undefined;
}

/**
 * The product names in the order the grid presents them. FlashList recycles
 * cells, so host-tree order is not presentation order; each cell's `index` is.
 */
function productCardOrder(): string[] {
  const cells: { index: number; name: string }[] = [];
  const visit = (node: HostNode) => {
    if (typeof node.props.index === "number") {
      cells.push({
        index: node.props.index,
        name: (firstLabelWithin(node) ?? "").split(",")[0] ?? "",
      });
      return;
    }
    node.children.forEach((child) => {
      if (typeof child !== "string") visit(child);
    });
  };
  visit(screen.getByTestId("products-grid") as unknown as HostNode);
  return cells.sort((left, right) => left.index - right.index).map((cell) => cell.name);
}

/** Wait for the snapshot to reach the chrome, then measure the results. */
async function settlePopulated() {
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "KISOK Test Store, explore the store" }),
    ).toBeOnTheScreen(),
  );
  await measureLayout();
  expect(screen.getByRole("header", { name: "Products" })).toBeOnTheScreen();
}

async function renderPopulated(snapshot: CatalogSnapshot = snapshotWithManyProducts()) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<ProductsScreen />);
  await settlePopulated();
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

describe("ProductsScreen", () => {
  it("mounts the populated All Products grid from one successful snapshot", async () => {
    await renderPopulated();

    // The product count is stated in the heading and in the result toolbar.
    expect(
      screen.getByLabelText(`${manyProductNames.length} products in the store`),
    ).toBeOnTheScreen();
    expect(screen.getByText(manyProductCountLabel)).toBeOnTheScreen();
    expect(screen.getByText("All catalog products")).toBeOnTheScreen();

    // The complete products collection is present in the scalable grid.
    expect(screen.getByTestId("products-grid")).toBeOnTheScreen();
    expect(productCardOrder()).toEqual([...manyProductNames]);
    expect(productCardNames()).toHaveLength(manyProductNames.length);

    // The catalog chrome is present with Products selected.
    expect(screen.getByRole("tab", { name: "Products", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Explore", selected: false })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders identity, image/fallback and textual derived availability from the card", async () => {
    await renderPopulated();

    // Available products say so in words.
    expect(
      screen.getByRole("button", { name: "Café Crème, by Maison Élite, Options available" }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Trail Bottle, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Herbal Tea Tin, Available" })).toBeOnTheScreen();

    // Unavailable products remain present with their textual availability.
    expect(
      screen.getByRole("button", { name: "Everyday Tote, Currently unavailable" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Pocket Notebook, by KISOK Basics, Currently unavailable",
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Cotton Scarf, Currently unavailable" }),
    ).toBeOnTheScreen();

    // A product without a cover keeps its image slot with a named fallback:
    // its name shows on the fallback surface and as the card title.
    expect(screen.getAllByText("Trail Bottle")).toHaveLength(2);
  });

  it("keeps every product discoverable when all products are unavailable", async () => {
    await renderPopulated(snapshotWithAllProductsUnavailable());

    // Nothing is filtered out of the grid: every product is still browsable,
    // each carrying its textual Currently unavailable status.
    for (const name of manyProductNames) {
      const expectedLabel =
        name === "Café Crème"
          ? "Café Crème, by Maison Élite, Currently unavailable"
          : name === "Pocket Notebook"
            ? "Pocket Notebook, by KISOK Basics, Currently unavailable"
            : `${name}, Currently unavailable`;
      expect(screen.getByRole("button", { name: expectedLabel })).toBeOnTheScreen();
    }

    expect(screen.queryByRole("button", { name: /, (Available|Options available)$/ })).toBeNull();
  });

  it("pushes the matching product detail, named for the way back, when a card is pressed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated();

    // An available product, an unavailable one, and one past the base fixture.
    await user.press(
      screen.getByRole("button", { name: "Café Crème, by Maison Élite, Options available" }),
    );
    await user.press(screen.getByRole("button", { name: "Everyday Tote, Currently unavailable" }));
    await user.press(screen.getByRole("button", { name: "Trail Bottle, Available" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(3);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.coffee, backLabel: "Back to products" },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/product-detail",
      params: { productId: catalogFixtureIds.products.tote, backLabel: "Back to products" },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: "/product-detail",
      params: { productId: extraProductIds.trailBottle, backLabel: "Back to products" },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("re-orders the grid A–Z and back to store order", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated();

    expect(screen.getByRole("radio", { name: "Store order", checked: true })).toBeOnTheScreen();

    await user.press(screen.getByRole("radio", { name: "A–Z" }));

    expect(screen.getByRole("radio", { name: "A–Z", checked: true })).toBeOnTheScreen();
    expect(productCardOrder()).toEqual([
      "Bamboo Cutlery Set",
      "Café Crème",
      "Cotton Scarf",
      "Everyday Tote",
      "Herbal Tea Tin",
      "Pocket Notebook",
      "Trail Bottle",
    ]);

    await user.press(screen.getByRole("radio", { name: "Store order" }));

    expect(productCardOrder()).toEqual([...manyProductNames]);
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
    await user.press(screen.getByRole("link", { name: "KISOK Test Store, explore the store" }));
    await user.press(screen.getByRole("link", { name: "Explore" }));

    expect(mockRouterReplace.mock.calls).toEqual([
      ["/"],
      ["/products"],
      ["/brands"],
      ["/categories"],
      ["/search"],
      ["/"],
      ["/"],
    ]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<ProductsScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // The chrome stays usable so the customer can leave, but no heading, count
    // or grid pretends to be data while pending.
    expect(screen.getByRole("tab", { name: "Products", selected: true })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Products" })).toBeNull();
    expect(screen.queryByTestId("products-grid")).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );

    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the populated grid visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch, and the shared
    // QueryClient refetches on focus/reconnect for long-lived kiosk sessions —
    // so a network blip mid-session must not blank the still-valid grid. Only
    // a failure with NO snapshot may render the full-screen error state.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithManyProducts())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<ProductsScreen />);
    await settlePopulated();

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("header", { name: "Products" })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Café Crème, by Maison Élite, Options available" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the grid when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<ProductsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );

    expect(screen.queryByTestId("products-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
