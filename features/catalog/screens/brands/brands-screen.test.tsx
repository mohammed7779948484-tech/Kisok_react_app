import { AppError } from "@/core/errors";
import { act, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import type {
  CatalogBrand,
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
} from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
import { BrandsScreen } from "./brands-screen";

/**
 * Screen behaviour for All Brands (AC-04).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as `queries/use-catalog.test.tsx` and the Home,
 * Products and Search screen tests do. Navigation is asserted against a mocked
 * `expo-router` `useRouter` (push/replace spies) — the tests pin destinations
 * and semantics, not navigation.
 *
 * The whole-brand-collection behaviours are pinned on a multi-brand snapshot
 * (4 brands with distinct product sets — every brand carries ≥1 product, per
 * the snapshot contract) rather than the base fixture's 2, because derived
 * counts and whole-card navigation must be proven on data the base fixture
 * cannot express.
 *
 * Fake timers follow the Products and Search screen tests (and CatalogGrid's
 * own test): this screen renders FlashList, whose deferred layout work fires
 * real timers that escape `act` and print warnings under real timers. That is
 * also why the background-refetch macrotask flush becomes a fake-timer advance
 * — TanStack's batched observer notification is a `setTimeout(0)` that only
 * lands once timers advance.
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

/** Ids for the brands the multi-brand fixture appends past the base 2. */
const extraBrandIds = {
  atelier: "61616161-6161-4616-8161-616161616161",
  alpine: "63636363-6363-4636-8363-636363636363",
} as const;

/** Ids for the media and products the multi-brand fixture appends. */
const extraMediaIds = {
  atelierImage: "89898989-8989-4898-8898-898989898989",
} as const;

const extraProductIds = {
  eliteTray: "71717171-7171-4717-8717-717171717171",
  atelierMug: "73737373-7373-4737-8737-737373737373",
  atelierBowl: "75757575-7575-4757-8757-757575757575",
  atelierVase: "79797979-7979-4797-8797-797979797979",
  alpineFlask: "95959595-9595-4595-8595-959595959595",
  alpineTorch: "97979797-9797-4797-8797-979797979797",
} as const;

/**
 * Every brand identity the multi-brand snapshot contains, in backend display
 * order. Derived from the fixture builder so a fixture change cannot silently
 * desynchronize the assertions from the data.
 */
const brandNames = ["Maison Élite", "KISOK Basics", "Atelier Céramique", "Alpine Works"] as const;

const brandCountLabel = `${brandNames.length} brands`;

/**
 * The distinct copy of the local empty-brand-collection state. The brief pins
 * "an empty brand collection directs the customer to Products" — so the state
 * is asserted by its own title/description plus the action, never by reusing
 * the whole-catalog empty copy.
 */
const NO_BRANDS_TITLE = "No brands yet";
const NO_BRANDS_DESCRIPTION =
  "This store has no brands listed right now. You can still browse all of its products.";

/**
 * A snapshot with 4 brands and 8 products, each brand carrying a DISTINCT
 * product set — Élite 2, Basics 1, Atelier 3, Alpine Works 2 — so derived
 * product counts and whole-card navigation are pinned on data the base fixture
 * cannot express. Every fixture brand has ≥1 product, matching the snapshot
 * contract (`used_brands` returns only brands with ≥1 valid product). The base
 * Everyday Tote stays unbranded: it belongs to no brand and must never leak
 * into a brand's collection.
 */
function snapshotWithManyBrands(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const extraBrands: CatalogBrand[] = [
    {
      id: extraBrandIds.atelier,
      name: "Atelier Céramique",
      image_media_asset_id: extraMediaIds.atelierImage,
      image_public_id: "brands/atelier",
      image_secure_url: "https://res.cloudinary.com/kisok/image/upload/atelier.png",
      display_order: 30,
    },
    {
      id: extraBrandIds.alpine,
      name: "Alpine Works",
      image_media_asset_id: null,
      image_public_id: null,
      image_secure_url: null,
      display_order: 40,
    },
  ];
  const extraProducts: CatalogProduct[] = [
    {
      id: extraProductIds.eliteTray,
      name: "Élite Serving Tray",
      brand_id: catalogFixtureIds.brands.elite,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 35,
      is_featured: false,
    },
    {
      id: extraProductIds.atelierMug,
      name: "Atelier Mug",
      brand_id: extraBrandIds.atelier,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 40,
      is_featured: false,
    },
    {
      id: extraProductIds.atelierBowl,
      name: "Atelier Bowl",
      brand_id: extraBrandIds.atelier,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 50,
      is_featured: false,
    },
    {
      id: extraProductIds.atelierVase,
      name: "Atelier Vase",
      brand_id: extraBrandIds.atelier,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 60,
      is_featured: false,
    },
    {
      id: extraProductIds.alpineFlask,
      name: "Alpine Flask",
      brand_id: extraBrandIds.alpine,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 70,
      is_featured: false,
    },
    {
      id: extraProductIds.alpineTorch,
      name: "Alpine Torch",
      brand_id: extraBrandIds.alpine,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 80,
      is_featured: false,
    },
  ];
  const extraVariants: CatalogVariant[] = [
    {
      id: "81818181-8181-4818-8818-818181818181",
      product_id: extraProductIds.eliteTray,
      sku: "EXTRA-SKU-TRAY",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: "83838383-8383-4838-8838-838383838383",
      product_id: extraProductIds.atelierMug,
      sku: "EXTRA-SKU-MUG",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: "85858585-8585-4858-8858-858585858585",
      product_id: extraProductIds.atelierBowl,
      sku: "EXTRA-SKU-BOWL",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: false,
    },
    {
      id: "87878787-8787-4878-8878-878787878787",
      product_id: extraProductIds.atelierVase,
      sku: "EXTRA-SKU-VASE",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: "91919191-9191-4919-8919-919191919191",
      product_id: extraProductIds.alpineFlask,
      sku: "EXTRA-SKU-FLASK",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: "93939393-9393-4939-8939-939393939393",
      product_id: extraProductIds.alpineTorch,
      sku: "EXTRA-SKU-TORCH",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: false,
    },
  ];

  return createCatalogSnapshotFixture({
    brands: [...base.brands, ...extraBrands],
    products: [...base.products, ...extraProducts],
    variants: [...base.variants, ...extraVariants],
  });
}

/**
 * No brands at all, but products exist (all unbranded — the schema requires
 * every product's brand_id to resolve, so with an empty brand collection every
 * brand_id must be null). This is a LOCAL empty collection, not a whole-catalog
 * empty state: the brief pins that it directs the customer to Products.
 */
function snapshotWithNoBrands(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();

  return createCatalogSnapshotFixture({
    brands: [],
    products: base.products.map((product) => ({ ...product, brand_id: null })),
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

describe("BrandsScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated All Brands grid from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "All brands" })).toBeOnTheScreen(),
    );

    // The brand count is visible.
    expect(screen.getByText(brandCountLabel)).toBeOnTheScreen();

    // The complete brands collection is present in the scalable grid.
    expect(screen.getByTestId("brands-grid")).toBeOnTheScreen();
    for (const name of brandNames) {
      expect(screen.getByText(name)).toBeOnTheScreen();
    }

    // Root navigation is present with Brands selected.
    expect(screen.getByRole("button", { name: "Brands", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Home", selected: false })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders every brand card with its derived product count and imagery", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Maison Élite, 2 products" })).toBeOnTheScreen(),
    );

    // Each card's accessible name carries the view's DERIVED product count,
    // including the singular "1 product" form.
    expect(screen.getByRole("button", { name: "KISOK Basics, 1 product" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Atelier Céramique, 3 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Alpine Works, 2 products" })).toBeOnTheScreen();

    // Brand imagery renders through AppImage; missing media keeps the shared
    // fallback slot instead of collapsing the card layout.
    expect(screen.getByLabelText("Maison Élite")).toBeOnTheScreen();
    expect(screen.getByRole("image", { name: "KISOK Basics" })).toBeOnTheScreen();
  });

  it("pushes the matching brand detail when a whole card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Maison Élite, 2 products" })).toBeOnTheScreen(),
    );

    // A multi-product brand, a single-product brand, and a fourth appended
    // brand: every whole-card press opens that brand's detail with its exact id.
    await user.press(screen.getByRole("button", { name: "Maison Élite, 2 products" }));
    await user.press(screen.getByRole("button", { name: "KISOK Basics, 1 product" }));
    await user.press(screen.getByRole("button", { name: "Alpine Works, 2 products" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(3);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/brand-detail",
      params: { brandId: catalogFixtureIds.brands.elite },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/brand-detail",
      params: { brandId: catalogFixtureIds.brands.basics },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: "/brand-detail",
      params: { brandId: extraBrandIds.alpine },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("replaces root destinations and never pushes them", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

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

  it("directs the customer to Products when the brand collection is empty", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithNoBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() => expect(screen.getByText(NO_BRANDS_TITLE)).toBeOnTheScreen());
    expect(screen.getByText(NO_BRANDS_DESCRIPTION)).toBeOnTheScreen();

    // Products exist in the snapshot, so this is a LOCAL empty collection —
    // not the whole-catalog empty state and not an error.
    expect(screen.queryByText("The catalog is empty")).toBeNull();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByTestId("brands-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Maison Élite/ })).toBeNull();

    // The way forward: an action that takes the customer to Products.
    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/products");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<BrandsScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No grid, count or navigation chrome pretending to be data while pending.
    expect(screen.queryByRole("header", { name: "All brands" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Brands" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

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

    await renderWithProviders(<BrandsScreen />);

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
      .mockResolvedValueOnce(snapshotWithManyBrands())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<BrandsScreen />);

    await waitFor(() => expect(screen.getByText(brandCountLabel)).toBeOnTheScreen());

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
    expect(screen.getByRole("header", { name: "All brands" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite, 2 products" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the brands grid when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // No grid, no cards — brands exist in the snapshot, but this screen browses
    // a catalog whose products are the reason to browse.
    expect(screen.queryByTestId("brands-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Maison Élite/ })).toBeNull();

    // A whole-catalog empty is not the local no-brands copy: there is nothing
    // at all, so retry (not Products) is the way forward.
    expect(screen.queryByText(NO_BRANDS_TITLE)).toBeNull();

    // The empty state offers a way forward: refetch the snapshot.
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
