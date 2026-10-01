import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, fireEvent, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

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
// Rendering the real route module (with `useLocalSearchParams` mocked) proves
// the param seam end to end without asserting on any mock's internals.
import BrandDetailRoute from "../../../../app/(customer)/brand-detail";
import { BrandDetailScreen } from "./brand-detail-screen";

/**
 * Screen behaviour for Brand Detail (AC-04).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies); `useLocalSearchParams` is mocked for the route test;
 * `useFocusEffect` runs as a plain effect because the screen is focused for as
 * long as it is mounted here.
 *
 * The `brandId` prop is view state, not server state: a stale id is a LOCAL
 * projection of a successful snapshot and must never render the snapshot
 * error state.
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
const mockLocalSearchParams: { brandId?: string } = {};

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

/** A well-formed id that resolves to no brand in any fixture — the stale case. */
const STALE_BRAND_ID = "65656565-6565-4656-8656-656565656565";

/**
 * The distinct copy of the LOCAL not-found state for a stale/invalid brand id.
 * Declared so the tests can also assert the snapshot error copy stays absent —
 * a stale id is not a network failure and must not pretend to be one.
 */
const BRAND_NOT_FOUND_TITLE = "This brand is no longer available";
const BRAND_NOT_FOUND_DESCRIPTION = "It may have been removed since you started browsing.";

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
      available_quantity: 8,
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
      available_quantity: 8,
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
      available_quantity: 0,
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
      available_quantity: 8,
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
      available_quantity: 8,
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
      available_quantity: 0,
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

/** Wait for the snapshot to reach the chrome, then measure the results. */
async function settlePopulated(brandName: string) {
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "KISOK Test Store, explore the store" }),
    ).toBeOnTheScreen(),
  );
  await measureLayout();
  expect(screen.getByRole("header", { name: brandName })).toBeOnTheScreen();
}

async function renderBrand(brandId: string, brandName: string) {
  mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
  const result = await renderWithProviders(<BrandDetailScreen brandId={brandId} />);
  await settlePopulated(brandName);
  return result;
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  mockLocalSearchParams.brandId = undefined;
  // Fixture media carry stored public ids that differ from their delivery
  // paths, which the Cloudinary helper reports at debug level.
  setLogSink(() => {});
});

afterEach(() => {
  mockFetchCatalog.mockReset();
  resetLogging();
});

describe("BrandDetailScreen", () => {
  it("mounts the populated Brand Detail for the requested brand from one successful snapshot", async () => {
    await renderBrand(catalogFixtureIds.brands.elite, "Maison Élite");

    // The hero states the brand's derived facts.
    expect(screen.getByLabelText("2 products")).toBeOnTheScreen();
    expect(screen.getByLabelText("3 catalog options")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Browse Maison Élite" })).toBeOnTheScreen();
    expect(screen.getByText("Maison Élite products")).toBeOnTheScreen();

    // Its products, each a whole-card button.
    expect(screen.getByTestId("brand-products-grid")).toBeOnTheScreen();
    expect(productCardNames()).toEqual([
      "Café Crème, by Maison Élite, Options available",
      "Élite Serving Tray, by Maison Élite, Available",
    ]);

    // The page sits under the Brands tab of the catalog chrome.
    expect(screen.getByRole("tab", { name: "Brands", selected: true })).toBeOnTheScreen();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows only the requested brand's products and never another brand's or unbranded ones", async () => {
    await renderBrand(extraBrandIds.atelier, "Atelier Céramique");

    expect(productCardNames()).toEqual([
      "Atelier Bowl, by Atelier Céramique, Currently unavailable",
      "Atelier Mug, by Atelier Céramique, Available",
      "Atelier Vase, by Atelier Céramique, Available",
    ]);
    expect(screen.getByLabelText("3 products")).toBeOnTheScreen();

    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Élite Serving Tray/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pocket Notebook/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Everyday Tote/ })).toBeNull();
  });

  it("pushes the matching product detail, named for the way back to this brand", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderBrand(extraBrandIds.atelier, "Atelier Céramique");

    await user.press(
      screen.getByRole("button", { name: "Atelier Mug, by Atelier Céramique, Available" }),
    );
    await user.press(
      screen.getByRole("button", {
        name: "Atelier Bowl, by Atelier Céramique, Currently unavailable",
      }),
    );

    expect(mockRouterPush.mock.calls).toEqual([
      [
        {
          pathname: "/product-detail",
          params: { productId: extraProductIds.atelierMug, backLabel: "Back to Atelier Céramique" },
        },
      ],
      [
        {
          pathname: "/product-detail",
          params: {
            productId: extraProductIds.atelierBowl,
            backLabel: "Back to Atelier Céramique",
          },
        },
      ],
    ]);
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("returns to the brand directory from the breadcrumb and the section link", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderBrand(catalogFixtureIds.brands.elite, "Maison Élite");

    await user.press(screen.getByRole("link", { name: "Brands" }));
    await user.press(screen.getByRole("link", { name: "All brands" }));

    expect(mockRouterReplace.mock.calls).toEqual([["/brands"], ["/brands"]]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("sets a no-image brand's name on its media panel and lists its single product", async () => {
    await renderBrand(catalogFixtureIds.brands.basics, "KISOK Basics");

    // Breadcrumb, title, the serif caption on the image-less media panel, and
    // the product card's brand line.
    expect(screen.getAllByText("KISOK Basics")).toHaveLength(4);
    expect(screen.getByLabelText("1 product")).toBeOnTheScreen();
    expect(productCardNames()).toEqual(["Pocket Notebook, by KISOK Basics, Currently unavailable"]);
  });

  it("shows a safe local not-found state for a stale brand id", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={STALE_BRAND_ID} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: BRAND_NOT_FOUND_TITLE })).toBeOnTheScreen(),
    );
    expect(screen.getByText(BRAND_NOT_FOUND_DESCRIPTION)).toBeOnTheScreen();

    // A stale id is not a network failure: no snapshot error, no retry.
    expect(screen.queryByText("The catalog could not load")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByTestId("brand-products-grid")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Back to brands" }));
    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace.mock.calls).toEqual([["/brands"], ["/products"]]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("reads the brandId route param and passes it to the screen", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithManyBrands());
    mockLocalSearchParams.brandId = extraBrandIds.atelier;

    await renderWithProviders(<BrandDetailRoute />);
    await settlePopulated("Atelier Céramique");

    expect(screen.getByLabelText("3 products")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Café Crème/ })).toBeNull();
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Maison Élite" })).toBeNull();
    expect(screen.queryByTestId("brand-products-grid")).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<BrandDetailScreen brandId={catalogFixtureIds.brands.elite} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state when no products are returned, even for a stale brand id", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandDetailScreen brandId={STALE_BRAND_ID} />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );
    expect(screen.queryByText(BRAND_NOT_FOUND_TITLE)).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("keeps the populated detail visible when a background refetch fails while a snapshot is present", async () => {
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithManyBrands())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(
      <BrandDetailScreen brandId={extraBrandIds.atelier} />,
    );
    await settlePopulated("Atelier Céramique");

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("header", { name: "Atelier Céramique" })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Atelier Mug, by Atelier Céramique, Available" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
  });
});
