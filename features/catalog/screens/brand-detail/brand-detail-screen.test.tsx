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
// The sanctioned route edit is part of THIS task: the route reads the
// `brandId` param and hands it to the screen. Rendering the real route module
// here (with `useLocalSearchParams` mocked) proves the param seam end to end
// without asserting on any mock's internals.
import BrandDetailRoute from "../../../../app/(customer)/brand-detail";
import { BrandDetailScreen } from "./brand-detail-screen";

/**
 * Screen behaviour for Brand Detail (AC-04).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as `queries/use-catalog.test.tsx` and the Home,
 * Products and Search screen tests do. Navigation is asserted against a mocked
 * `expo-router` (`useRouter` push/replace/back spies); `useLocalSearchParams`
 * is also mocked because the route-edit test renders the real
 * `app/(customer)/brand-detail` route, which reads the param there and passes
 * it to this screen as a prop.
 *
 * The `brandId` prop is view state, not server state: a stale/invalid id is a
 * LOCAL projection of a successful snapshot and must never render the
 * snapshot `ErrorState`. The brand-scoping behaviours are pinned on a
 * multi-brand snapshot (4 brands with distinct product sets — every brand
 * carries ≥1 product, per the `used_brands` contract — plus a stale id)
 * rather than the base fixture's 2.
 *
 * Fake timers follow the Products and Search screen tests (and CatalogGrid's
 * own test): this screen renders FlashList for the brand's products, whose
 * deferred layout work fires real timers that escape `act` under real timers.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
/** The params the mocked `useLocalSearchParams` hands the route under test. */
const mockLocalSearchParams: { brandId?: string } = {};

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

/** A well-formed id that resolves to no brand in any fixture — the stale case. */
const STALE_BRAND_ID = "65656565-6565-4656-8656-656565656565";

/**
 * The distinct copy of the LOCAL not-found state for a stale/invalid brand id.
 * Declared so the tests can also assert the snapshot `ErrorState` copy stays
 * absent — a stale id is not a network failure and must not pretend to be one.
 */
const BRAND_NOT_FOUND_TITLE = "Brand not found";
const BRAND_NOT_FOUND_DESCRIPTION =
  "This brand isn't in the current catalog. It may have been removed since you started browsing. Go back to see the brands this store has now.";

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
 * A snapshot with 4 brands and 8 products, each brand carrying a DISTINCT
 * product set — Élite 2, Basics 1, Atelier 3, Alpine Works 2 — so brand
 * scoping and derived counts are pinned on data the base fixture cannot
 * express. Every fixture brand has ≥1 product, matching the snapshot contract
 * (`used_brands` returns only brands with ≥1 valid product; a brand that loses
 * all products disappears from `brands`, which is the stale-id case below).
 * The base Everyday Tote stays unbranded: it belongs to no brand and must
 * never leak into a brand's product list.
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
  mockLocalSearchParams.brandId = undefined;
});

afterEach(() => {
  mockFetchCatalog.mockReset();
});

describe("BrandDetailScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated Brand Detail for the requested brand from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Maison Élite" })).toBeOnTheScreen(),
    );

    // Brand identity: name, image, and the derived product count.
    expect(screen.getByLabelText("Maison Élite")).toBeOnTheScreen();
    expect(screen.getByText("2 products")).toBeOnTheScreen();

    // Only this brand's products render, in the scalable grid.
    expect(screen.getByTestId("brand-products-grid")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Café Crème, Available" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Élite Serving Tray, Available" })).toBeOnTheScreen();

    // The obvious way back to the discovery surface that opened this detail.
    expect(screen.getByRole("button", { name: "Go back" })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows only the requested brand's products and never another brand's or unbranded ones", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());

    await renderWithProviders(<BrandDetailScreen brandId={extraBrandIds.atelier} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Atelier Céramique" })).toBeOnTheScreen(),
    );

    // This brand's products, in backend display order.
    const productCards = screen.getAllByRole("button", { name: /^Atelier/ });
    expect(productCards.map((card) => card.props.accessibilityLabel)).toEqual([
      "Atelier Mug, Available",
      "Atelier Bowl, Out of stock",
      "Atelier Vase, Available",
    ]);
    expect(screen.getByText("3 products")).toBeOnTheScreen();

    // Scope: another brand's products, and unbranded ones, are absent.
    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Élite Serving Tray/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pocket Notebook/ })).toBeNull();
    expect(screen.queryByText("Everyday Tote")).toBeNull();
  });

  it("pushes the matching product detail when a card is pressed", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={extraBrandIds.atelier} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Atelier Mug, Available" })).toBeOnTheScreen(),
    );

    // An available product and an unavailable one: every product stays
    // inspectable from its brand.
    await user.press(screen.getByRole("button", { name: "Atelier Mug, Available" }));
    await user.press(screen.getByRole("button", { name: "Atelier Bowl, Out of stock" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/product-detail",
      params: { productId: extraProductIds.atelierMug },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/product-detail",
      params: { productId: extraProductIds.atelierBowl },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("renders a no-image brand through the shared image fallback with its single product", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.basics} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "KISOK Basics" })).toBeOnTheScreen(),
    );

    // The identity image falls back to the shared slot instead of collapsing.
    expect(screen.getByRole("image", { name: "KISOK Basics" })).toBeOnTheScreen();
    expect(screen.getByText("1 product")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Pocket Notebook, Out of stock" })).toBeOnTheScreen();
  });

  it("shows a safe local not-found state for a stale brand id", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={STALE_BRAND_ID} />);

    await waitFor(() => expect(screen.getByText(BRAND_NOT_FOUND_TITLE)).toBeOnTheScreen());
    expect(screen.getByText(BRAND_NOT_FOUND_DESCRIPTION)).toBeOnTheScreen();

    // A stale id is a LOCAL projection of a successful snapshot, never a
    // network failure: the snapshot ErrorState does not render, and there is
    // no retry affordance pretending one just happened.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByLabelText("Loading the catalog…")).toBeNull();

    // No brand identity, no grid, no product cards.
    expect(screen.queryByTestId("brand-products-grid")).toBeNull();
    expect(screen.queryByRole("header")).toBeNull();

    // The way back to the discovery surface that opened this detail.
    await user.press(screen.getByRole("button", { name: "Go back" }));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("reads the brandId route param and passes it to the screen", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    mockLocalSearchParams.brandId = extraBrandIds.atelier;

    // The real generated route: it reads `useLocalSearchParams` and hands the
    // id to the screen as a prop. Proven behaviourally — the screen resolves
    // the exact brand the mocked params carry, and no other.
    await renderWithProviders(<BrandDetailRoute />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Atelier Céramique" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("3 products")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Atelier Mug, Available" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No brand identity, grid or back affordance pretending to be data while
    // pending.
    expect(screen.queryByRole("header", { name: "Maison Élite" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

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

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state when no products are returned, even for a stale brand id", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={STALE_BRAND_ID} />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // The snapshot layer wins: an empty catalog is not a brand-resolution
    // problem, so the local not-found state stays absent.
    expect(screen.queryByText(BRAND_NOT_FOUND_TITLE)).toBeNull();
    expect(screen.queryByTestId("brand-products-grid")).toBeNull();

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
      .mockResolvedValueOnce(snapshotWithManyBrands())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(
      <BrandDetailScreen brandId={extraBrandIds.atelier} />,
    );

    await waitFor(() => expect(screen.getByText("3 products")).toBeOnTheScreen());

    // Fake timers (see the file header) turn the Home test's macrotask flush
    // into a timer advance so TanStack's batched observer notification lands
    // inside act and the screen has re-rendered before the assertions.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    // The populated detail stays on screen…
    expect(screen.getByRole("header", { name: "Atelier Céramique" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Atelier Mug, Available" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });
});
