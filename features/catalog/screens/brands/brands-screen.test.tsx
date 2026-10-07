import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/core/testing";

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
 * the seam. Navigation is asserted against a mocked `expo-router` `useRouter`
 * (push/replace spies); `useFocusEffect` runs as a plain effect because the
 * screen is focused for as long as it is mounted here.
 *
 * The whole-brand-collection behaviours are pinned on a multi-brand snapshot
 * (4 brands with distinct product sets) because derived counts and whole-card
 * navigation must be proven on data the base fixture cannot express.
 *
 * The grid only renders once it has been measured (it derives its columns
 * from the width it is given), so every populated test delivers that layout
 * pass with `measureLayout()`.
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
 * been measured (the brands grid).
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

/**
 * A directory long enough (more than six stocked brands) to offer the brand
 * finder: the multi-brand snapshot plus three single-product brands.
 */
function snapshotWithLongBrandDirectory(): CatalogSnapshot {
  const base = snapshotWithManyBrands();
  const extras = [
    {
      name: "Nordic Linen",
      brandId: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
      productId: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
      variantId: "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3",
    },
    {
      name: "Olivier & Fils",
      brandId: "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4",
      productId: "a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5",
      variantId: "a6a6a6a6-a6a6-4a6a-8a6a-a6a6a6a6a6a6",
    },
    {
      name: "Ébène Studio",
      brandId: "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7",
      productId: "a8a8a8a8-a8a8-4a8a-8a8a-a8a8a8a8a8a8",
      variantId: "a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9",
    },
  ].map(({ name, brandId, productId, variantId }, index) => {
    const brand: CatalogBrand = {
      id: brandId,
      name,
      image_media_asset_id: null,
      image_public_id: null,
      image_secure_url: null,
      display_order: 50 + index,
    };
    const product: CatalogProduct = {
      id: productId,
      name: `${name} Piece`,
      brand_id: brandId,
      cover_media_asset_id: null,
      cover_public_id: null,
      cover_secure_url: null,
      short_description: null,
      search_keywords: null,
      display_order: 90 + index,
      is_featured: false,
    };
    const variant: CatalogVariant = {
      id: variantId,
      product_id: productId,
      sku: `EXTRA-SKU-BRAND-${index}`,
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 10,
      is_available: true,
      available_quantity: 3,
    };
    return { brand, product, variant };
  });

  return {
    ...base,
    brands: [...base.brands, ...extras.map((extra) => extra.brand)],
    products: [...base.products, ...extras.map((extra) => extra.product)],
    variants: [...base.variants, ...extras.map((extra) => extra.variant)],
  };
}

/** The brand names the grid presents, in presentation order (cells carry their index). */
function brandCardOrder(): string[] {
  const cells: { index: number; name: string }[] = [];
  const labelWithin = (node: HostNode): string | undefined => {
    if (typeof node.props.accessibilityLabel === "string") return node.props.accessibilityLabel;
    for (const child of node.children) {
      if (typeof child === "string") continue;
      const label = labelWithin(child);
      if (label !== undefined) return label;
    }
    return undefined;
  };
  const visit = (node: HostNode) => {
    if (typeof node.props.index === "number") {
      const label = labelWithin(node) ?? "";
      cells.push({ index: node.props.index, name: label.slice(0, label.lastIndexOf(",")) });
      return;
    }
    node.children.forEach((child) => {
      if (typeof child !== "string") visit(child);
    });
  };
  visit(screen.getByTestId("brands-grid") as unknown as HostNode);
  return cells.sort((left, right) => left.index - right.index).map((cell) => cell.name);
}

/** Wait for the snapshot to reach the chrome, then measure the grid. */
async function settlePopulated() {
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "KISOK Test Store, explore the store" }),
    ).toBeOnTheScreen(),
  );
  await measureLayout();
  expect(screen.getByRole("header", { name: "Brands" })).toBeOnTheScreen();
}

async function renderPopulated(snapshot: CatalogSnapshot = snapshotWithManyBrands()) {
  mockFetchCatalog.mockResolvedValue(snapshot);
  const result = await renderWithProviders(<BrandsScreen />);
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

describe("BrandsScreen", () => {
  it("mounts the populated All Brands grid from one successful snapshot", async () => {
    await renderPopulated();

    // The complete brands collection is present in the scalable grid, in
    // backend display order.
    expect(screen.getByTestId("brands-grid")).toBeOnTheScreen();
    expect(brandCardOrder()).toEqual([...brandNames]);

    // The catalog chrome is present with Brands selected.
    expect(screen.getByRole("tab", { name: "Brands", selected: true })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Explore", selected: false })).toBeOnTheScreen();

    // A short directory needs no brand finder.
    expect(screen.queryByLabelText("Find a brand")).toBeNull();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders every brand card with its derived product and option counts", async () => {
    await renderPopulated();

    // Each card's accessible name carries the view's DERIVED product count,
    // including the singular "1 product" form.
    expect(screen.getByRole("button", { name: "Maison Élite, 2 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "KISOK Basics, 1 product" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Atelier Céramique, 3 products" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Alpine Works, 2 products" })).toBeOnTheScreen();

    // Option totals are the sum of the brand's products' variants.
    for (const [card, options] of [
      ["Maison Élite, 2 products", "3 options"],
      ["KISOK Basics, 1 product", "2 options"],
      ["Atelier Céramique, 3 products", "3 options"],
      ["Alpine Works, 2 products", "2 options"],
    ] as const) {
      expect(
        within(screen.getByRole("button", { name: card })).getByText(options),
      ).toBeOnTheScreen();
    }

    // A brand without a logo is set as a wordmark (plus its caption), never
    // an empty frame; a brand with a logo names itself once.
    expect(screen.getAllByText("KISOK Basics")).toHaveLength(2);
    expect(screen.getAllByText("Maison Élite")).toHaveLength(1);
  });

  it("pushes the matching brand detail when a whole card is pressed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated();

    // A multi-product brand, a single-product brand, and a fourth appended
    // brand: every whole-card press opens that brand's detail with its exact id.
    await user.press(screen.getByRole("button", { name: "Maison Élite, 2 products" }));
    await user.press(screen.getByRole("button", { name: "KISOK Basics, 1 product" }));
    await user.press(screen.getByRole("button", { name: "Alpine Works, 2 products" }));

    expect(mockRouterPush.mock.calls).toEqual([
      [{ pathname: "/brand-detail", params: { brandId: catalogFixtureIds.brands.elite } }],
      [{ pathname: "/brand-detail", params: { brandId: catalogFixtureIds.brands.basics } }],
      [{ pathname: "/brand-detail", params: { brandId: extraBrandIds.alpine } }],
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

  it("offers a brand finder for a long directory that matches names diacritic-insensitively", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated(snapshotWithLongBrandDirectory());

    expect(brandCardOrder()).toHaveLength(7);

    await user.type(screen.getByLabelText("Find a brand"), "ebene");

    expect(brandCardOrder()).toEqual(["Ébène Studio"]);

    // A query that matches nothing says so and offers the way back.
    await user.clear(screen.getByLabelText("Find a brand"));
    await user.type(screen.getByLabelText("Find a brand"), "zzz");

    expect(screen.getByRole("header", { name: "No brands match “zzz”" })).toBeOnTheScreen();
    expect(brandCardOrder()).toEqual([]);

    await user.press(screen.getByRole("button", { name: "Show all brands" }));

    expect(brandCardOrder()).toHaveLength(7);
  });

  it("directs the customer to Products when the brand collection is empty", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithNoBrands());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: NO_BRANDS_TITLE })).toBeOnTheScreen(),
    );
    expect(screen.getByText(NO_BRANDS_DESCRIPTION)).toBeOnTheScreen();

    // Products exist in the snapshot, so this is a LOCAL empty collection —
    // not the whole-catalog empty state and not an error.
    expect(screen.queryByText("The catalog is empty")).toBeNull();
    expect(screen.queryByText("The catalog could not load")).toBeNull();
    expect(screen.queryByTestId("brands-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Maison Élite/ })).toBeNull();
    expect(screen.queryByTestId("help-me-choose-pill")).toBeNull();

    // The way forward: an action that takes the customer to Products.
    await user.press(screen.getByRole("button", { name: "Browse all products" }));

    expect(mockRouterReplace.mock.calls).toEqual([["/products"]]);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("offers Help Me Choose, unscoped, over the populated grid", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderPopulated();

    await user.press(screen.getByRole("button", { name: "Help me choose" }));

    expect(mockRouterPush.mock.calls).toEqual([[{ pathname: "/help-me-choose", params: {} }]]);
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(<BrandsScreen />);

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // The chrome stays usable so the customer can leave, but no heading or
    // grid pretends to be data while pending.
    expect(screen.getByRole("tab", { name: "Brands", selected: true })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Brands" })).toBeNull();
    expect(screen.queryByTestId("brands-grid")).toBeNull();
    expect(screen.queryByTestId("help-me-choose-pill")).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("We couldn't load the catalog. Please try again.")).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });

  it("renders a non-retryable failure without a retry affordance", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog could not load" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps the populated grid visible when a background refetch fails while a snapshot is present", async () => {
    // TanStack keeps `data` across a failed background refetch, and the shared
    // QueryClient refetches on focus/reconnect for long-lived kiosk sessions —
    // so a network blip mid-session must not blank the still-valid grid.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithManyBrands())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderWithProviders(<BrandsScreen />);
    await settlePopulated();

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("header", { name: "Brands" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maison Élite, 2 products" })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "The catalog could not load" })).toBeNull();
  });

  it("shows a whole-catalog empty state instead of the brands grid when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await renderWithProviders(<BrandsScreen />);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "The catalog is empty" })).toBeOnTheScreen(),
    );

    expect(screen.queryByTestId("brands-grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Maison Élite/ })).toBeNull();
    // A whole-catalog empty is not the local no-brands copy.
    expect(screen.queryByText(NO_BRANDS_TITLE)).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockFetchCatalog).toHaveBeenCalledTimes(2));
  });
});
