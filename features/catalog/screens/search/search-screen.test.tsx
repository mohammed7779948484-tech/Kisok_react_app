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
import { SearchScreen } from "./search-screen";

/**
 * Screen behaviour for Search (AC-06).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies); `useFocusEffect` runs as a plain effect because the
 * screen is focused for as long as it is mounted here.
 *
 * Results only render once their container has been measured (the grid
 * derives its columns from the width it is given), so every test that reaches
 * results delivers that layout pass with `measureLayout()`.
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

/**
 * The distinct search-state copy. Declared once so the tests assert the four
 * states by DIFFERENT text, never by one message doubling for another.
 */
const IDLE_PROMPT = "Search by product name, brand, category, or an option such as a flavor.";
const TOO_SHORT_HINT = "Enter at least 2 characters to search.";
const noMatchTitle = (query: string) => `No matches for “${query}”`;

/** Ids for the products the searchable fixture appends past the base 3. */
const extraProductIds = {
  alpineMug: "41414141-4141-4411-8411-414141414141",
  alpineBlanket: "43434343-4343-4433-8433-434343434343",
  alpineLantern: "45454545-4545-4455-8455-454545454545",
} as const;

/**
 * Every identity the searchable snapshot's "alpine" query returns, in backend
 * display order. The names are plain ASCII so the diacritic test can drive an
 * accented query against plain names, and no base-fixture product or associated
 * field contains "alpine" — the query is a pure product-name path.
 */
const alpineResultLabels = [
  "Alpine Mug, Available",
  "Alpine Blanket, Currently unavailable",
  "Alpine Lantern, Available",
] as const;

/**
 * A snapshot with 3 extra plain-named products (display order 40/50/60, one
 * available and one unavailable variant among them) so a name query with
 * multiple ordered results, an accented query against plain names, and
 * no-match/identifier queries are all drivable without hard-coding the base
 * fixture's three products.
 */
function snapshotWithSearchableProducts(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const extraProducts: CatalogProduct[] = [
    {
      id: extraProductIds.alpineMug,
      name: "Alpine Mug",
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
      id: extraProductIds.alpineBlanket,
      name: "Alpine Blanket",
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
      id: extraProductIds.alpineLantern,
      name: "Alpine Lantern",
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
      id: "47474747-4747-4477-8477-474747474747",
      product_id: extraProductIds.alpineMug,
      sku: "EXTRA-SKU-MUG",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
      available_quantity: 8,
    },
    {
      id: "49494949-4949-4499-8499-494949494949",
      product_id: extraProductIds.alpineBlanket,
      sku: "EXTRA-SKU-BLANKET",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: false,
      available_quantity: 0,
    },
    {
      id: "51515151-5151-4551-8551-515151515151",
      product_id: extraProductIds.alpineLantern,
      sku: "EXTRA-SKU-LANTERN",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
      available_quantity: 8,
    },
  ];

  return createCatalogSnapshotFixture({
    products: [...base.products, ...extraProducts],
    variants: [...base.variants, ...extraVariants],
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
 * The result cards' accessible names in the order the grid presents them.
 * FlashList recycles cells, so host-tree order is not presentation order;
 * each cell's `index` is. Empty when no results grid is on screen.
 */
function resultCardLabels(): string[] {
  const grid = screen.queryByTestId("search-results-grid");
  if (grid === null) return [];
  const cells: { index: number; label: string }[] = [];
  const visit = (node: HostNode) => {
    if (typeof node.props.index === "number") {
      cells.push({ index: node.props.index, label: firstLabelWithin(node) ?? "" });
      return;
    }
    node.children.forEach((child) => {
      if (typeof child !== "string") visit(child);
    });
  };
  visit(grid as unknown as HostNode);
  return cells.sort((left, right) => left.index - right.index).map((cell) => cell.label);
}

async function renderSearch(
  snapshot: CatalogSnapshot = snapshotWithSearchableProducts(),
  initialQuery?: string,
) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<SearchScreen initialQuery={initialQuery} />);
  await waitFor(() => expect(screen.getByRole("header", { name: "Search" })).toBeOnTheScreen());
  await measureLayout();
  return result;
}

/** Replace the query, then measure any results container that appeared. */
async function search(user: ReturnType<typeof userEvent.setup>, query: string) {
  const input = screen.getByLabelText("Search catalog");
  await user.clear(input);
  if (query.length > 0) await user.type(input, query);
  await measureLayout();
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

describe("SearchScreen", () => {
  it("mounts from one successful snapshot and offers somewhere to start", async () => {
    await renderSearch();

    expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen();
    expect(screen.getByLabelText("Search catalog")).toBeOnTheScreen();

    // Starting points instead of an empty page: root categories and brands.
    expect(screen.getByRole("header", { name: "Start with a category" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Drínks" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Or a brand you know" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics" })).toBeOnTheScreen();

    // No results before a query.
    expect(resultCardLabels()).toEqual([]);
    expect(screen.queryByText(TOO_SHORT_HINT)).toBeNull();

    // Search is not a browse tab: none is selected here.
    for (const tab of ["Explore", "Products", "Categories", "Brands"]) {
      expect(screen.getByRole("tab", { name: tab, selected: false })).toBeOnTheScreen();
    }
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("treats a whitespace-only query as idle, not too-short", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "   ");

    expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen();
    expect(screen.queryByText(TOO_SHORT_HINT)).toBeNull();
  });

  it("shows the too-short hint below two non-whitespace characters", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "a");

    expect(screen.getByText(TOO_SHORT_HINT)).toBeOnTheScreen();
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(resultCardLabels()).toEqual([]);

    // One accented character is still one character.
    await search(user, "é");

    expect(screen.getByText(TOO_SHORT_HINT)).toBeOnTheScreen();
  });

  it("renders every matching product in backend order for a product-name query", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "alpine");

    expect(screen.getByRole("header", { name: "“alpine”" })).toBeOnTheScreen();
    expect(
      screen.getByText("3 matching products. Each card shows why it matched."),
    ).toBeOnTheScreen();
    expect(resultCardLabels()).toEqual([...alpineResultLabels]);
    // A name match needs no explanation.
    expect(screen.queryByText("Matched")).toBeNull();
  });

  it("matches case- and diacritic-insensitively through the screen", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "ALPINÉ");

    expect(resultCardLabels()).toEqual([...alpineResultLabels]);
  });

  it("matches through associated category names and says why each card matched", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "top");

    // Both products in Tóp Picks, and nothing else.
    expect(resultCardLabels()).toEqual([
      "Café Crème, by Maison Élite, Options available",
      "Everyday Tote, Currently unavailable",
    ]);
    expect(screen.getAllByText("Category · Tóp Picks")).toHaveLength(2);
  });

  it("shows a distinct no-match state that clears back to idle and keeps the query editable", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "zzz");

    expect(screen.getByRole("header", { name: noMatchTitle("zzz") })).toBeOnTheScreen();
    expect(resultCardLabels()).toEqual([]);
    expect(screen.getByLabelText("Search catalog")).toHaveDisplayValue("zzz");

    // Two ways to clear: the field's own control, and the no-match state's
    // action (after the field in reading order).
    const clearControls = screen.getAllByRole("button", { name: "Clear search" });
    expect(clearControls).toHaveLength(2);
    await user.press(clearControls[1] as (typeof clearControls)[number]);

    expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen();
    expect(screen.getByLabelText("Search catalog")).toHaveDisplayValue("");

    await search(user, "alpine");

    expect(resultCardLabels()).toEqual([...alpineResultLabels]);
  });

  it("never searches SKU or barcode fields", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await search(user, "SECRET-SKU");
    expect(screen.getByRole("header", { name: noMatchTitle("SECRET-SKU") })).toBeOnTheScreen();

    await search(user, "990000000001");
    expect(screen.getByRole("header", { name: noMatchTitle("990000000001") })).toBeOnTheScreen();
    expect(resultCardLabels()).toEqual([]);
  });

  it("pushes the matching product detail, named for the way back, when a result card is pressed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();
    await search(user, "alpine");

    await user.press(screen.getByRole("button", { name: "Alpine Mug, Available" }));
    await user.press(screen.getByRole("button", { name: "Alpine Blanket, Currently unavailable" }));

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/product-detail",
          params: { productId: extraProductIds.alpineMug, backLabel: "Back to search results" },
        },
      ],
      [
        {
          pathname: "/product-detail",
          params: { productId: extraProductIds.alpineBlanket, backLabel: "Back to search results" },
        },
      ],
    ]);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("pushes a suggested category or brand, and replaces to the browse destinations", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

    await user.press(screen.getByRole("button", { name: "Drínks" }));
    await user.press(screen.getByRole("button", { name: "KISOK Basics" }));
    await user.press(screen.getByRole("link", { name: "All brands" }));

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/category-detail",
          params: { categoryId: catalogFixtureIds.categories.drinks },
        },
      ],
      [{ pathname: "/brand-detail", params: { brandId: catalogFixtureIds.brands.basics } }],
    ]);
    expect(mockRouterReplace.mock.calls).toEqual([["/brands"]]);

    // From results and from no-match, too.
    await search(user, "alpine");
    await user.press(screen.getByRole("link", { name: "Categories" }));
    await user.press(screen.getByRole("link", { name: "Brands" }));
    await search(user, "zzz");
    await user.press(screen.getByRole("button", { name: "Browse categories" }));

    expect(mockRouterReplace.mock.calls).toEqual([
      ["/brands"],
      ["/categories"],
      ["/brands"],
      ["/categories"],
    ]);
  });

  it("starts from an initial query handed to it", async () => {
    await renderSearch(snapshotWithSearchableProducts(), "alpine");

    expect(screen.getByLabelText("Search catalog")).toHaveDisplayValue("alpine");
    expect(resultCardLabels()).toEqual([...alpineResultLabels]);
  });

  it("replaces root destinations and never pushes them", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderSearch();

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

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<SearchScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Search" })).toBeNull();
    expect(screen.queryByLabelText("Search catalog")).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<SearchScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the search surface", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );
    expect(screen.queryByRole("header", { name: "Search" })).toBeNull();
    expect(screen.queryByLabelText("Search catalog")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("keeps the search results on screen when a background refetch fails while a snapshot is present", async () => {
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithSearchableProducts())
      .mockRejectedValueOnce(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const { queryClient } = await renderWithProviders(<SearchScreen />);
    await waitFor(() => expect(screen.getByRole("header", { name: "Search" })).toBeOnTheScreen());
    await search(user, "alpine");

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Search catalog")).toHaveDisplayValue("alpine");
    expect(resultCardLabels()).toEqual([...alpineResultLabels]);
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
  });
});
