import { AppError } from "@/core/errors";
import { act, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import { createCatalogSnapshotFixture } from "../../model/catalog-snapshot.fixture";
import type {
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
} from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
import { SearchScreen } from "./search-screen";

/**
 * Screen behaviour for local Catalog Search (AC-06).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as `queries/use-catalog.test.tsx` and the Home and
 * Products screen tests do. Navigation is asserted against a mocked
 * `expo-router` `useRouter` (push/replace spies) — the tests pin destinations
 * and semantics, not navigation.
 *
 * The search layer is a pure local projection of a successful snapshot: idle,
 * too-short, no-match and results are asserted with distinct copy, and every
 * snapshot-layer state (cold loading, error without data, whole-catalog empty)
 * is asserted to replace the search surface entirely — search chrome never
 * pretends to have its own network states.
 *
 * Fake timers follow the Products screen test (and CatalogGrid's own test):
 * this screen renders FlashList for its results, whose deferred layout work
 * fires real timers that escape `act` under real timers.
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

/**
 * The distinct search-state copy. Declared once so the tests assert the four
 * states by DIFFERENT text, never by one message doubling for another.
 */
const IDLE_PROMPT =
  "Type to search the products in this store. Matching products appear as you type.";
const TOO_SHORT_HINT = "Keep typing — search starts with at least 2 characters.";
const noMatchMessage = (query: string) =>
  `No products match "${query}". Try a different word — search covers only the products currently in this catalog.`;

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
  "Alpine Blanket, Out of stock",
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

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
});

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("SearchScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts from one successful snapshot and shows the idle prompt", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByRole("header", { name: "Search" })).toBeOnTheScreen());

    // The accessibly labelled search input is present and still empty.
    const input = screen.getByLabelText("Search products");
    expect(input).toHaveDisplayValue("");

    // Idle is a distinct inviting prompt — not the too-short hint, not the
    // no-match message, and no result cards.
    expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen();
    expect(screen.queryByText(TOO_SHORT_HINT)).toBeNull();
    expect(screen.queryByText(/No products match/)).toBeNull();
    expect(screen.queryByTestId("search-results-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Alpine/ })).toBeNull();

    // Root navigation is present with Search selected.
    expect(screen.getByRole("button", { name: "Search", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Home", selected: false })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("treats a whitespace-only query as idle, not too-short", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");

    await user.type(input, "   ");

    // The input holds the typed whitespace, but the trimmed query is empty:
    // the state stays idle.
    expect(input).toHaveDisplayValue("   ");
    expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen();
    expect(screen.queryByText(TOO_SHORT_HINT)).toBeNull();
    expect(screen.queryByText(/No products match/)).toBeNull();
    expect(screen.queryByTestId("search-results-grid")).toBeNull();
  });

  it("shows the too-short hint below two non-whitespace characters", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");

    await user.type(input, "a");

    // One character is a distinct hint, not the idle prompt and not no-match.
    expect(screen.getByText(TOO_SHORT_HINT)).toBeOnTheScreen();
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.queryByText(/No products match/)).toBeNull();
    expect(screen.queryByTestId("search-results-grid")).toBeNull();

    // A single accented character normalizes to one character — still too short.
    await user.clear(input);
    await user.type(input, "é");

    expect(screen.getByText(TOO_SHORT_HINT)).toBeOnTheScreen();
    expect(input).toHaveDisplayValue("é");
  });

  it("renders every matching product in backend order for a product-name query", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");
    await user.type(input, "alpine");

    await waitFor(() => expect(screen.getByText("3 matching products")).toBeOnTheScreen());

    // Every match exactly once, in backend display order (the query's tree
    // order follows the data order FlashList renders).
    const resultCards = screen.getAllByRole("button", { name: /^Alpine/ });
    expect(resultCards.map((card) => card.props.accessibilityLabel)).toEqual([
      ...alpineResultLabels,
    ]);

    // Results state messaging replaces the other three states' copy.
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.queryByText(TOO_SHORT_HINT)).toBeNull();
    expect(screen.queryByText(/No products match/)).toBeNull();

    // Non-matching products are not rendered at all.
    expect(screen.queryByText("Café Crème")).toBeNull();
    expect(screen.queryByText("Everyday Tote")).toBeNull();
    expect(screen.queryByText("Pocket Notebook")).toBeNull();
    expect(screen.getByTestId("search-results-grid")).toBeOnTheScreen();
  });

  it("matches case- and diacritic-insensitively through the screen", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");

    // An uppercase, accented query against plain product names.
    await user.type(input, "ALPINÉ");

    await waitFor(() => expect(screen.getByText("3 matching products")).toBeOnTheScreen());
    expect(screen.getByRole("button", { name: "Alpine Mug, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Alpine Blanket, Out of stock" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Alpine Lantern, Available" })).toBeOnTheScreen();
  });

  it("matches through associated category names, not only product names", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");

    // "Tóp Picks" is a category name — no product name contains "top".
    await user.type(input, "top");

    await waitFor(() => expect(screen.getByText("2 matching products")).toBeOnTheScreen());
    const resultCards = screen.getAllByRole("button", {
      name: /, (Available|Out of stock)$/,
    });
    expect(resultCards.map((card) => card.props.accessibilityLabel)).toEqual([
      "Café Crème, Available",
      "Everyday Tote, Out of stock",
    ]);
    expect(screen.queryByRole("button", { name: /Pocket Notebook/ })).toBeNull();
  });

  it("shows a distinct no-match message that keeps the query editable", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");

    await user.type(input, "zzz");

    // No-match is a distinct message naming the query and honest that search
    // never left the loaded catalog.
    expect(screen.getByText(noMatchMessage("zzz"))).toBeOnTheScreen();
    expect(screen.queryByText(IDLE_PROMPT)).toBeNull();
    expect(screen.queryByText(TOO_SHORT_HINT)).toBeNull();
    expect(screen.queryByTestId("search-results-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Alpine/ })).toBeNull();

    // The input stays rendered with the query so the customer can edit it
    // (the screen never unmounts or blurs it between search states).
    expect(input).toHaveDisplayValue("zzz");
    expect(screen.getByLabelText("Search products")).toBeOnTheScreen();

    // Editing the query recovers to results without leaving the screen.
    await user.clear(input);
    await user.type(input, "alpine");

    await waitFor(() => expect(screen.getByText("3 matching products")).toBeOnTheScreen());

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("never searches SKU or barcode fields", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");

    // A base-fixture SKU: identifiers are not customer search fields (AC-06).
    await user.type(input, "SECRET-SKU");
    expect(screen.getByText(noMatchMessage("SECRET-SKU"))).toBeOnTheScreen();

    // A base-fixture barcode: same rule.
    await user.clear(input);
    await user.type(input, "990000000001");
    expect(screen.getByText(noMatchMessage("990000000001"))).toBeOnTheScreen();

    expect(screen.queryByTestId("search-results-grid")).toBeNull();
  });

  it("pushes the matching product detail when a result card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    const input = screen.getByLabelText("Search products");
    await user.type(input, "alpine");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Alpine Mug, Available" })).toBeOnTheScreen(),
    );

    // An available and an unavailable result both open their Product Detail —
    // unavailable products stay discoverable and pressable.
    await user.press(screen.getByRole("button", { name: "Alpine Mug, Available" }));
    await user.press(screen.getByRole("button", { name: "Alpine Blanket, Out of stock" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/product-detail",
      params: { productId: extraProductIds.alpineMug },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/product-detail",
      params: { productId: extraProductIds.alpineBlanket },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("replaces root destinations and never pushes them", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithSearchableProducts());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

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

    await renderWithProviders(<SearchScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No search chrome pretending to be data while pending.
    expect(screen.queryByRole("header", { name: "Search" })).toBeNull();
    expect(screen.queryByLabelText("Search products")).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    // ErrorState's View is not queryable by role "alert"; assert the standard
    // error surface by its visible title and the error's safe user message.
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
    expect(screen.queryByLabelText("Search products")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the search surface", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // An empty catalog is a snapshot-layer state: the search surface never
    // renders — search chrome must not pretend to have its own states.
    expect(screen.queryByLabelText("Search products")).toBeNull();
    expect(screen.queryByRole("header", { name: "Search" })).toBeNull();
    expect(screen.queryByTestId("search-results-grid")).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("keeps the search results on screen when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch, and the shared
    // QueryClient refetches on focus/reconnect for long-lived kiosk sessions —
    // so a network blip mid-search must not blank the still-valid results.
    // Only a failure with NO snapshot may render the full-screen ErrorState
    // (the T04-R03 stated rule).
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithSearchableProducts())
      .mockRejectedValueOnce(retryableCatalogError);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { queryClient } = await renderWithProviders(<SearchScreen />);

    await waitFor(() => expect(screen.getByText(IDLE_PROMPT)).toBeOnTheScreen());
    await user.type(screen.getByLabelText("Search products"), "alpine");
    await waitFor(() => expect(screen.getByText("3 matching products")).toBeOnTheScreen());

    // The same background refetch the shared QueryClient triggers on
    // focus/reconnect; fake timers (see the file header) let TanStack's
    // batched observer notification land inside act.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    // The results, count and input stay on screen…
    expect(screen.getByText("3 matching products")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Alpine Mug, Available" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Search products")).toBeOnTheScreen();
    // …and the full-screen error state does not replace them.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });
});
