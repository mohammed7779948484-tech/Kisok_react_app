import { useAuth } from "@/core/auth";
import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import {
  act,
  installMockAuth,
  renderWithProviders,
  screen,
  TEST_PROFILE,
  userEvent,
  waitFor,
} from "@/core/testing";
import { getCartSnapshot } from "@/features/cart";
import { CatalogCartProvider } from "@/features/catalog-cart-integration";

import { fetchCatalog } from "../../api/fetch-catalog";
import {
  catalogFixtureIds,
  createCatalogSnapshotFixture,
} from "../../model/catalog-snapshot.fixture";
import type {
  CatalogProduct,
  CatalogSnapshot,
  CatalogVariant,
  CatalogVariantMedia,
} from "../../model/catalog-snapshot.schema";
import { catalogKeys } from "../../queries/keys";
// The sanctioned route edit is part of THIS task: the route reads the
// `productId` param and hands it to the screen. Rendering the real route module
// here (with `useLocalSearchParams` mocked) proves the param seam end to end
// without asserting on any mock's internals.
import ProductDetailRoute from "../../../../app/(customer)/product-detail";
import { ProductDetailScreen } from "./product-detail-screen";

/**
 * Screen behaviour for Product Detail (AC-07; AC-03/AC-06 result targets and
 * the AC-08 journey closure).
 *
 * The screen must not know Supabase exists: the feature's own `api/` module is
 * the seam, mocked exactly as the Home, Products, Search, Brands, Brand Detail
 * and Category Detail screen tests do. Navigation is asserted against a mocked
 * `expo-router` (`useRouter` push/replace/back spies); `useLocalSearchParams`
 * is also mocked because the route-edit test renders the real
 * `app/(customer)/product-detail` route, which reads the param there and passes
 * it to this screen as a prop.
 *
 * The `productId` prop is view state, not server state: a stale/invalid id is a
 * LOCAL projection of a successful snapshot and must never render the snapshot
 * `ErrorState`. Variant and gallery selection are screen-local React state
 * (Design decision 3) — never server state, never a Cart action.
 *
 * The generic-variant behaviour is pinned on an appended `Studio Kettle`
 * product whose three variants cover ALL THREE label forms in ONE product
 * (title_override / ordered "Type: value" option pairs / the neutral
 * "Option N" fallback), with variant media on two of them and the product-cover
 * fallback on the third. The base Café Crème covers the title_override +
 * options pair with brand and category context, and the base Everyday Tote
 * covers the "Standard option" neutral fallback of a single-variant,
 * unavailable-only, media-less product. Every fixture product carries ≥1
 * variant — a resolved product with zero variants is unreachable under the
 * `valid_products` contract (20260826050006_lean_customer_catalog.sql:45-49),
 * so it is neither built nor tested (the T07-R01 lesson).
 *
 * Fake timers are NOT used: this screen renders no FlashList — its sections
 * (identity, gallery, variant list) are bounded and ScrollView-composed — so
 * the Home screen test's real-timer macrotask flush is the established pattern
 * here.
 *
 * The catalog-cart-integration seam (that feature's T03): the screen now
 * renders the integration's public AddToCartButton on the resolved-product
 * path, so every resolved-path render goes through the authed +
 * integration-provider harness below — the way the customer layout mounts
 * this screen once the provider is wired at layout level (T04). The screen
 * itself still imports nothing from `@/features/cart`: the integration's
 * button owns every cart call. The two "no add-to-cart affordance" pins in
 * the inspection-only test were superseded by the integration brief's AC-02
 * (exactly one sanctioned Add action; every other ordering affordance stays
 * pinned out).
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
/** The params the mocked `useLocalSearchParams` hands the route under test. */
const mockLocalSearchParams: { productId?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace, back: mockRouterBack }),
  useLocalSearchParams: () => mockLocalSearchParams,
}));

// AppImage's fallback icon renders a lucide icon; the catalog-cart
// integration's Add action renders the ShoppingCart icon and the Quick Cart
// sheet its rows/steppers — stub the standardized set so gallery fallbacks,
// the Add action and an open sheet render without the SVG machinery.
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ImageOff: () => null,
  ShoppingCart: () => null,
  Minus: () => null,
  Plus: () => null,
  Trash2: () => null,
}));

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

/** A well-formed id that resolves to no product in any fixture — the stale case. */
const STALE_PRODUCT_ID = "6e6e6e6e-6e6e-46e6-8e6e-6e6e6e6e6e6e";

/**
 * The distinct copy of the LOCAL not-found state for a stale/invalid product
 * id. Declared so the tests can also assert the snapshot `ErrorState` copy
 * stays absent — a stale id is not a network failure and must not pretend to
 * be one.
 */
const PRODUCT_NOT_FOUND_TITLE = "Product not found";
const PRODUCT_NOT_FOUND_DESCRIPTION =
  "This product isn't in the current catalog. It may have been removed since you started browsing. Go back to see the products this store has now.";

/** Ids for the appended Studio Kettle product and its variants. */
const extraProductIds = {
  kettle: "6a6a6a6a-6a6a-46a6-8a6a-6a6a6a6a6a6a",
} as const;

const extraVariantIds = {
  matte: "7a7a7a7a-7a7a-47a7-87a7-7a7a7a7a7a7a",
  rouge: "7c7c7c7c-7c7c-47c7-87c7-7c7c7c7c7c7c",
  plain: "7e7e7e7e-7e7e-47e7-87e7-7e7e7e7e7e7e",
} as const;

const extraMediaIds = {
  kettleCover: "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4",
  kettleMatte1: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
  kettleMatte2: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
  kettleRouge: "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3",
} as const;

const kettleImageUrls = {
  cover: "https://res.cloudinary.com/kisok/image/upload/kettle-cover.png",
  matte1: "https://res.cloudinary.com/kisok/image/upload/kettle-matte-1.png",
  matte2: "https://res.cloudinary.com/kisok/image/upload/kettle-matte-2.png",
  rouge: "https://res.cloudinary.com/kisok/image/upload/kettle-rouge.png",
} as const;

/**
 * The Studio Kettle: unbranded and uncategorized (so the optional context
 * sections' absence is observable), with a cover image and three variants that
 * cover ALL THREE model label forms in ONE product —
 * - "Matte Black Edition": `title_override` (trimmed by the view), available,
 *   TWO variant images (primary first by display order, so the thumbnail strip
 *   and the primary-default gallery mechanics are observable);
 * - "Color: Rouge, Size: Lárge": ordered option pairs, unavailable, ONE variant
 *   image;
 * - "Option 3": the neutral ordered fallback (neither override nor options),
 *   unavailable, NO variant media — so its media falls back to the product
 *   cover exactly as the honest chain prescribes.
 * The product is available (the matte variant is), the two unavailable variants
 * stay selectable for inspection, and every fixture product carries ≥1 variant.
 */
function snapshotWithKettle(): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const kettle: CatalogProduct = {
    id: extraProductIds.kettle,
    name: "Studio Kettle",
    brand_id: null,
    cover_media_asset_id: extraMediaIds.kettleCover,
    cover_public_id: "products/kettle-cover",
    cover_secure_url: kettleImageUrls.cover,
    short_description: "Brushed steel with a stay-cool handle.",
    search_keywords: null,
    display_order: 40,
    is_featured: false,
  };
  const kettleVariants: CatalogVariant[] = [
    {
      id: extraVariantIds.matte,
      product_id: extraProductIds.kettle,
      sku: "SECRET-SKU-KETTLE-1",
      barcode: "990000000011",
      title_override: "  Matte Black Edition  ",
      search_keywords: null,
      display_order: 10,
      is_available: true,
    },
    {
      id: extraVariantIds.rouge,
      product_id: extraProductIds.kettle,
      sku: "SECRET-SKU-KETTLE-2",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 20,
      is_available: false,
    },
    {
      id: extraVariantIds.plain,
      product_id: extraProductIds.kettle,
      sku: "SECRET-SKU-KETTLE-3",
      barcode: null,
      title_override: null,
      search_keywords: null,
      display_order: 30,
      is_available: false,
    },
  ];
  const kettleMedia: CatalogVariantMedia[] = [
    {
      variant_id: extraVariantIds.matte,
      media_asset_id: extraMediaIds.kettleMatte1,
      public_id: "products/kettle-matte-1",
      secure_url: kettleImageUrls.matte1,
      display_order: 10,
      is_primary: true,
    },
    {
      variant_id: extraVariantIds.matte,
      media_asset_id: extraMediaIds.kettleMatte2,
      public_id: "products/kettle-matte-2",
      secure_url: kettleImageUrls.matte2,
      display_order: 20,
      is_primary: false,
    },
    {
      variant_id: extraVariantIds.rouge,
      media_asset_id: extraMediaIds.kettleRouge,
      public_id: "products/kettle-rouge",
      secure_url: kettleImageUrls.rouge,
      display_order: 10,
      is_primary: true,
    },
  ];

  return createCatalogSnapshotFixture({
    products: [...base.products, kettle],
    variants: [...base.variants, ...kettleVariants],
    variant_option_values: [
      ...base.variant_option_values,
      {
        variant_id: extraVariantIds.rouge,
        option_type_id: catalogFixtureIds.optionTypes.color,
        option_value_id: catalogFixtureIds.optionValues.rouge,
      },
      {
        variant_id: extraVariantIds.rouge,
        option_type_id: catalogFixtureIds.optionTypes.size,
        option_value_id: catalogFixtureIds.optionValues.large,
      },
    ],
    variant_media: [...base.variant_media, ...kettleMedia],
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
 * The REPLACEMENT snapshot for the stale-selection scenario: the same catalog
 * with the kettle's "Option 3" variant REMOVED (the product keeps its matte
 * and rouge variants — ≥1 remains, contract-honest under `valid_products`).
 * "Option 3" carries no option links and no variant media, so filtering the
 * variants array alone is sufficient. Every key is spread explicitly so the
 * builder's defaults cannot bleed in.
 */
function snapshotWithOption3Removed(): CatalogSnapshot {
  const kettle = snapshotWithKettle();

  return createCatalogSnapshotFixture({
    ...kettle,
    variants: kettle.variants.filter((variant) => variant.id !== extraVariantIds.plain),
  });
}

/** The rendered element shape the secure-URL assertion reads. */
type RenderedImageElement = { props: { source?: readonly { uri?: string }[] } };

/** The minimal traversal surface the image-count pin needs from the tree root. */
type QueryableRoot = {
  queryAll: (
    predicate: (node: { props: Record<string, unknown> }) => boolean,
  ) => readonly unknown[];
};

/**
 * The secure URL the rendered gallery image actually displays. Read from the
 * real rendered expo-image output (its `source` prop) — the picture on screen
 * IS the behaviour, not a mock's internals.
 */
function displayedImageUri(element: RenderedImageElement): string | undefined {
  const source = element.props.source;
  return Array.isArray(source) ? source[0]?.uri : undefined;
}

/**
 * How many rendered image hosts display the given secure URL — counted over
 * the WHOLE rendered tree, so a second image surface carrying the same URL
 * anywhere on the screen (e.g. a hypothetical header cover thumbnail) would
 * double the count. Reads the real expo-image `source` props, not mocks.
 */
function countImagesDisplayingUri(root: QueryableRoot | null, uri: string): number {
  if (root === null) {
    return 0;
  }

  return root.queryAll((node) => {
    const source = node.props.source as readonly { uri?: string }[] | undefined;
    return Array.isArray(source) && source[0]?.uri === uri;
  }).length;
}

/** The single durable key the cart's hydrate() reads — disk hygiene between tests. */
const CART_KEY = storageKey("cart", "lines");

/**
 * One owner id per test whose cart state is asserted: the store's
 * owner-switch reset inside hydrate() re-baselines memory between tests
 * through the public surface only (the store singleton is not importable
 * from this feature — the integration suite's pattern). The resolved-path
 * tests that never press Add share one owner; their same-owner re-hydrate is
 * the store's own idempotent no-op.
 */
const SCREEN_OWNER = "7f8e9d0c-1b2a-4c3d-8e4f-5a6b7c8d9e0f";
const ADD_ACTION_OWNER = "8e9f0a1d-2c3b-4d4e-8f5a-6b7c8d9e0f1a";
const UNAVAILABLE_OWNER = "9f0a1b2e-3d4c-4e5f-8a6b-7c8d9e0f1a2b";
const PRESS_ADD_OWNER = "a1b2c3d4-5e6f-4a70-8b7c-8d9e0f1a2b3c";

/**
 * Gates the screen on auth readiness and the integration provider, exactly
 * as the app will mount it once T04 wires the customer layout: the (customer)
 * group renders behind `ready && profile?.role === "customer"`, and the
 * provider supplies the Quick Cart context the screen's Add action consumes
 * (`useActiveProfile()`/`useQuickCart()` throwing outside their providers is
 * the contract, not a defect for the screen to code around — the
 * full-cart and integration suites' AuthedHarness pattern).
 */
function AuthedProductDetail({ productId }: { productId: string }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <CatalogCartProvider>
      <ProductDetailScreen productId={productId} />
    </CatalogCartProvider>
  );
}

/** The same gate for the route-module test: the route renders inside the (customer) group. */
function AuthedProductDetailRoute() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <CatalogCartProvider>
      <ProductDetailRoute />
    </CatalogCartProvider>
  );
}

/** installMockAuth restored after every test — the integration suite's holder pattern. */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

/**
 * Renders the resolved-path screen behind the real auth gate and the real
 * integration provider — the mounting the customer layout will provide.
 */
async function renderProductDetail(productId: string, ownerId: string = SCREEN_OWNER) {
  mockAuthHolder.current = installMockAuth({
    profile: { ...TEST_PROFILE, id: ownerId },
  });
  return renderWithProviders(<AuthedProductDetail productId={productId} />, {
    withAuth: true,
  });
}

/**
 * The Add press persists fire-and-forget; one macrotask turn lets the cart's
 * serialized write chain settle inside act (the integration suite's pattern —
 * the store is not importable here to call `persistNow`).
 */
async function settleDurableWrites() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

beforeEach(async () => {
  mockRouterPush.mockClear();
  mockRouterReplace.mockClear();
  mockRouterBack.mockClear();
  mockLocalSearchParams.productId = undefined;
  // The provider's useCart() hydrate/mutation paths log by design; keep the
  // suite silent per the repo convention.
  setLogSink(() => {});
  // Disk hygiene: the provider-mounted useCart() hydrate() reads the cart key,
  // so a previous test's envelope must not leak into the next one's restore.
  // Through the app's own API.
  await storage.remove(CART_KEY);
});

afterEach(() => {
  mockFetchCatalog.mockReset();
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("ProductDetailScreen", () => {
  // The generated baseline's mount-without-throwing intent survives here: this
  // is the first render of the real screen in the real providers.
  it("mounts the populated Product Detail for the requested product from one successful snapshot", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    // Resolved-path renders go through the authed + integration-provider
    // harness: the screen's Add action consumes useCart()/useQuickCart(), so it
    // mounts the way the customer layout mounts it (see the harness above).
    await renderProductDetail(catalogFixtureIds.products.coffee);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );

    // Identity: name, textual derived availability, the optional description.
    expect(screen.getByLabelText("Available")).toBeOnTheScreen();
    expect(screen.getByText("A smooth customer favourite.")).toBeOnTheScreen();

    // Brand and category context render as navigable discovery.
    expect(screen.getByRole("button", { name: "Maison Élite" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Drínks" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Tóp Picks" })).toBeOnTheScreen();

    // The variant list renders the model's labels with textual availability.
    expect(screen.getByRole("button", { name: "Signature roast, Out of stock" })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Color: Rouge, Size: Lárge, Available" }),
    ).toBeOnTheScreen();

    // The gallery shows the selected (default: first) variant's media.
    const galleryImage = screen.getByLabelText("Café Crème — Signature roast");
    expect(displayedImageUri(galleryImage)).toBe(
      "https://res.cloudinary.com/kisok/image/upload/signature-roast.png",
    );

    // The obvious way back to the discovery surface that opened this detail.
    expect(screen.getByRole("button", { name: "Go back" })).toBeOnTheScreen();

    // Root CatalogNavigation is deliberately absent on a detail screen (AC-08):
    // its replace semantics, used from a pushed detail, would duplicate the
    // root entry below. Pinned so a future root-nav regression on this screen
    // fails here instead of stacking duplicate root history.
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Brands" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Categories" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();

    // No navigation and no second fetch happen from the mount itself.
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders no quantity, price, stock or identifier affordance anywhere", async () => {
    // The fixture carries SKUs, barcodes and the global low-stock threshold;
    // none of it may surface. Catalog stays inspection-only beyond the ONE
    // sanctioned Add action (supersession: the catalog-cart-integration
    // brief's AC-02 renders exactly one Add action below the variant list —
    // that action's own behaviour is pinned in the integration suite and the
    // Add describe block below; here the remaining pins keep every OTHER
    // ordering affordance out).
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    await renderProductDetail(catalogFixtureIds.products.coffee);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );

    // No Cart/Checkout ordering actions beyond the sanctioned Add to cart —
    // no checkout, buy, or order copy, by role or text.
    expect(screen.queryByRole("button", { name: /checkout|buy|order/i })).toBeNull();
    expect(screen.queryByText(/checkout/i)).toBeNull();

    // No quantity control of any kind.
    expect(screen.queryByText(/quantity|qty/i)).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();

    // No price or total of any kind.
    expect(screen.queryByText(/price|total|subtotal/i)).toBeNull();

    // No exact or low stock — availability is boolean words only.
    expect(screen.queryByText(/low stock/i)).toBeNull();
    expect(screen.queryByText(/only \d+ (left|remaining)/i)).toBeNull();
    expect(screen.queryByText(/in stock: \d+/i)).toBeNull();

    // No internal identifiers leak to the customer.
    expect(screen.queryByText(/sku|barcode/i)).toBeNull();
    expect(screen.queryByText("SECRET-SKU-COFFEE-1")).toBeNull();
    expect(screen.queryByText("SECRET-SKU-COFFEE-2")).toBeNull();
    expect(screen.queryByText("990000000001")).toBeNull();
  });

  it("labels the product's variants with all three model label forms and the derived product availability", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());

    await renderProductDetail(extraProductIds.kettle);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen(),
    );

    // The three label forms of Design decision 9, in backend variant order:
    // title_override, ordered "Type: value" pairs, and the neutral "Option N"
    // fallback — all consumed from the model's derived label, never re-derived.
    const variantEntries = screen.getAllByRole("button", {
      name: /^(Matte Black Edition|Color: Rouge, Size: Lárge|Option 3),/,
    });
    expect(variantEntries.map((entry) => entry.props.accessibilityLabel)).toEqual([
      "Matte Black Edition, Available",
      "Color: Rouge, Size: Lárge, Out of stock",
      "Option 3, Out of stock",
    ]);

    // The first variant is the default selection, and the product's derived
    // any-variant availability is the badge (Design decision 10).
    expect(screen.getByLabelText("Available")).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Matte Black Edition, Available", selected: true }),
    ).toBeOnTheScreen();

    // The optional context this product lacks is simply absent.
    expect(screen.getByText("Brushed steel with a stay-cool handle.")).toBeOnTheScreen();
    expect(screen.queryByText("Brand")).toBeNull();
    expect(screen.queryByText("Categories")).toBeNull();

    // The default gallery: the matte variant's own media, primary first, with
    // a thumbnail strip because there are two images.
    expect(
      screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2"),
    ).toBeOnTheScreen();
    expect(
      displayedImageUri(screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2")),
    ).toBe(kettleImageUrls.matte1);
    expect(
      screen.getByRole("button", {
        name: "Studio Kettle — Matte Black Edition image 1",
        selected: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Studio Kettle — Matte Black Edition image 2",
        selected: false,
      }),
    ).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("selects an unavailable variant for inspection and moves the gallery to that variant's media, including the product-cover fallback", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());
    const user = userEvent.setup();

    const { root } = await renderProductDetail(extraProductIds.kettle);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Matte Black Edition, Available", selected: true }),
      ).toBeOnTheScreen(),
    );

    // An unavailable variant remains selectable for INSPECTION (Design
    // decision 9): selecting it is a screen-local state change, never a Cart
    // action, and its selection is announced.
    await user.press(
      screen.getByRole("button", { name: "Color: Rouge, Size: Lárge, Out of stock" }),
    );

    expect(
      screen.getByRole("button", {
        name: "Color: Rouge, Size: Lárge, Out of stock",
        selected: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Matte Black Edition, Available", selected: false }),
    ).toBeOnTheScreen();

    // The gallery now shows THAT variant's own media.
    const rougeImage = screen.getByLabelText("Studio Kettle — Color: Rouge, Size: Lárge");
    expect(displayedImageUri(rougeImage)).toBe(kettleImageUrls.rouge);

    // The neutral-fallback variant has no variant media: the gallery falls
    // back to the product cover (the model's derived `media`/`primaryMedia`).
    await user.press(screen.getByRole("button", { name: "Option 3, Out of stock" }));

    expect(
      screen.getByRole("button", { name: "Option 3, Out of stock", selected: true }),
    ).toBeOnTheScreen();
    const coverImage = screen.getByLabelText("Studio Kettle — Option 3");
    expect(displayedImageUri(coverImage)).toBe(kettleImageUrls.cover);

    // The cover is composed ONLY through the gallery — the documented identity
    // decision (the model's variant media already falls back to `coverMedia`,
    // so a second header cover image would duplicate the same secure URL on
    // one screen). Pinned: exactly ONE rendered image carries the cover URL.
    expect(countImagesDisplayingUri(root, kettleImageUrls.cover)).toBe(1);

    // Inspection never navigated anywhere and never fetched again.
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("switches the gallery image with the thumbnail strip and resets to the primary image when the variant changes", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());
    const user = userEvent.setup();

    await renderProductDetail(extraProductIds.kettle);

    await waitFor(() =>
      expect(
        screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2"),
      ).toBeOnTheScreen(),
    );

    // Picking the second thumbnail moves the large image and the announced
    // selection — screen-local state, reported through the gallery callback.
    await user.press(
      screen.getByRole("button", { name: "Studio Kettle — Matte Black Edition image 2" }),
    );

    expect(
      screen.getByLabelText("Studio Kettle — Matte Black Edition, image 2 of 2"),
    ).toBeOnTheScreen();
    expect(
      displayedImageUri(screen.getByLabelText("Studio Kettle — Matte Black Edition, image 2 of 2")),
    ).toBe(kettleImageUrls.matte2);
    expect(
      screen.getByRole("button", {
        name: "Studio Kettle — Matte Black Edition image 1",
        selected: false,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: "Studio Kettle — Matte Black Edition image 2",
        selected: true,
      }),
    ).toBeOnTheScreen();

    // Changing the variant resets the gallery to the new variant's primary
    // image — the customer's old thumbnail pick must not leak across variants.
    await user.press(screen.getByRole("button", { name: "Option 3, Out of stock" }));
    await user.press(screen.getByRole("button", { name: "Matte Black Edition, Available" }));

    expect(
      screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2"),
    ).toBeOnTheScreen();
    expect(
      displayedImageUri(screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2")),
    ).toBe(kettleImageUrls.matte1);
  });

  it("renders an unavailable-only product with its Standard option and the shared image fallback", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    await renderProductDetail(catalogFixtureIds.products.tote);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Everyday Tote" })).toBeOnTheScreen(),
    );

    // All-unavailable products stay discoverable and inspectable with honest
    // words (Design decision 10): the derived product availability.
    expect(screen.getByLabelText("Out of stock")).toBeOnTheScreen();

    // The single-variant neutral label, selected by default.
    expect(
      screen.getByRole("button", { name: "Standard option, Out of stock", selected: true }),
    ).toBeOnTheScreen();

    // Neither the variant nor the product carries media: the gallery's final
    // honest fallback is AppImage's shared slot — the image surface keeps its
    // layout instead of collapsing.
    expect(
      screen.getByRole("image", { name: "Everyday Tote — Standard option" }),
    ).toBeOnTheScreen();

    // The optional description this product lacks is absent; the category
    // context it DOES have renders.
    expect(screen.queryByText("A smooth customer favourite.")).toBeNull();
    expect(screen.getByRole("button", { name: "Tóp Picks" })).toBeOnTheScreen();
  });

  it("pushes the brand and category detail routes from the product context", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderProductDetail(catalogFixtureIds.products.coffee);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Maison Élite" })).toBeOnTheScreen(),
    );

    // Context is navigable discovery: object-form PUSH with the exact ids, so
    // this detail stays mounted behind the pushed one (no replace, no back).
    await user.press(screen.getByRole("button", { name: "Maison Élite" }));
    await user.press(screen.getByRole("button", { name: "Drínks" }));
    await user.press(screen.getByRole("button", { name: "Tóp Picks" }));

    expect(mockRouterPush).toHaveBeenCalledTimes(3);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, {
      pathname: "/brand-detail",
      params: { brandId: catalogFixtureIds.brands.elite },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, {
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.drinks },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.specials },
    });
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("shows a safe local not-found state for a stale product id", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderWithProviders(<ProductDetailScreen productId={STALE_PRODUCT_ID} />);

    await waitFor(() => expect(screen.getByText(PRODUCT_NOT_FOUND_TITLE)).toBeOnTheScreen());
    expect(screen.getByText(PRODUCT_NOT_FOUND_DESCRIPTION)).toBeOnTheScreen();

    // A stale id is a LOCAL projection of a successful snapshot, never a
    // network failure: the snapshot ErrorState does not render, and there is
    // no retry affordance pretending one just happened.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByLabelText("Loading the catalog…")).toBeNull();

    // No product identity, no gallery, no variant list.
    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.queryByRole("button", { name: /Café Crème|Standard option/ })).toBeNull();

    // The way back to the discovery surface that opened this detail.
    await user.press(screen.getByRole("button", { name: "Go back" }));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("reads the productId route param and passes it to the screen", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());
    mockLocalSearchParams.productId = extraProductIds.kettle;

    // The real generated route: it reads `useLocalSearchParams` and hands the
    // id to the screen as a prop. Proven behaviourally — the screen resolves
    // the exact product the mocked params carry, and no other. Rendered
    // behind the same auth + provider gate the (customer) group provides.
    mockAuthHolder.current = installMockAuth({
      profile: { ...TEST_PROFILE, id: SCREEN_OWNER },
    });
    await renderWithProviders(<AuthedProductDetailRoute />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen(),
    );
    expect(screen.getByRole("button", { name: "Option 3, Out of stock" })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Café Crème" })).toBeNull();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("announces a loading state before the first snapshot resolves", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderWithProviders(
      <ProductDetailScreen productId={catalogFixtureIds.products.coffee} />,
    );

    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    // No product identity, gallery or back affordance pretending to be data
    // while pending.
    expect(screen.queryByRole("header", { name: "Café Crème" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("shows the catalog error with a retry that refetches", async () => {
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    const user = userEvent.setup();

    await renderWithProviders(
      <ProductDetailScreen productId={catalogFixtureIds.products.coffee} />,
    );

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

    await renderWithProviders(
      <ProductDetailScreen productId={catalogFixtureIds.products.coffee} />,
    );

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());

    expect(screen.getByText("You don't have access to browse this catalog.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a whole-catalog empty state when no products are returned, even for a stale product id", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    const user = userEvent.setup();

    await renderWithProviders(<ProductDetailScreen productId={STALE_PRODUCT_ID} />);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());

    // The snapshot layer wins: an empty catalog is not a product-resolution
    // problem, so the local not-found state stays absent.
    expect(screen.queryByText(PRODUCT_NOT_FOUND_TITLE)).toBeNull();

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
      .mockResolvedValueOnce(snapshotWithKettle())
      .mockRejectedValueOnce(retryableCatalogError);

    const { queryClient } = await renderProductDetail(extraProductIds.kettle);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen(),
    );

    // The same background refetch the shared QueryClient triggers on
    // focus/reconnect — the first (successful) load is already consumed.
    // The macrotask flush lets TanStack's batched observer notification land
    // inside act, so the screen has re-rendered before the assertions.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The populated detail stays on screen…
    expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Option 3, Out of stock" })).toBeOnTheScreen();
    // …and the full-screen error state does not replace it.
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.queryByText("We couldn't load the catalog. Please try again.")).toBeNull();
  });

  it("degrades a stale variant selection to the first variant when a refresh removes the picked variant", async () => {
    // R5-R01: the screen's documented stale-selection degradation, unpinned
    // until now. `selectedVariantId` is screen-local state that survives a
    // snapshot refresh; when the REPLACEMENT snapshot no longer contains the
    // picked variant, the screen degrades to the first variant in backend
    // order (`?? product.variants[0]`) instead of crashing — without that
    // fallback, the `variant === undefined` guard below it would turn this
    // reachable refresh path into a loud throw. The shared QueryClient's
    // focus/reconnect refetch is exactly how a customer hits it mid-session.
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithKettle())
      .mockResolvedValueOnce(snapshotWithOption3Removed());
    const user = userEvent.setup();

    const { queryClient } = await renderProductDetail(extraProductIds.kettle);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Matte Black Edition, Available", selected: true }),
      ).toBeOnTheScreen(),
    );

    // A NON-FIRST pick: the customer inspects the last variant.
    await user.press(screen.getByRole("button", { name: "Option 3, Out of stock" }));
    expect(
      screen.getByRole("button", { name: "Option 3, Out of stock", selected: true }),
    ).toBeOnTheScreen();

    // The same background refetch the shared QueryClient triggers on
    // focus/reconnect — this time it delivers a REPLACEMENT snapshot in which
    // the picked variant was removed. The macrotask flush lets TanStack's
    // batched observer notification land inside act, so the screen has
    // re-rendered before the assertions.
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The stale pick degrades to the FIRST variant — selected, on screen, no
    // throw, no blank screen (this assertion is what fails if the
    // `?? product.variants[0]` fallback is removed).
    expect(
      screen.getByRole("button", { name: "Matte Black Edition, Available", selected: true }),
    ).toBeOnTheScreen();

    // The removed variant is gone from the list, and the remaining variants
    // stay inspectable.
    expect(screen.queryByRole("button", { name: "Option 3, Out of stock" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Color: Rouge, Size: Lárge, Out of stock" }),
    ).toBeOnTheScreen();

    // The gallery follows the degraded selection's own media — the matte
    // variant's primary image (the stale media pick degrades the same way, to
    // the resolved variant's primary).
    expect(
      screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2"),
    ).toBeOnTheScreen();
    expect(
      displayedImageUri(screen.getByLabelText("Studio Kettle — Matte Black Edition, image 1 of 2")),
    ).toBe(kettleImageUrls.matte1);

    expect(mockFetchCatalog).toHaveBeenCalledTimes(2);
  });
});

describe("ProductDetailScreen — Add to cart (catalog-cart-integration seam)", () => {
  /**
   * The integration's plan-justified owning-feature edit (brief AC-02): the
   * screen renders the integration's PUBLIC AddToCartButton below the variant
   * list from a structural source derived here. These tests drive the real
   * seam end to end — the real integration provider (for the button's
   * useQuickCart context and the Quick Cart sheet), the real single cart
   * store behind a real auth profile — exactly as the customer layout will
   * mount this screen once T04 wires the provider in.
   */

  it("renders the Add to cart action for a resolved product with an available selected variant, enabled — and nothing in the cart yet", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());

    await renderProductDetail(extraProductIds.kettle, ADD_ACTION_OWNER);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen(),
    );

    // AC-02: the Add action exists on the resolved path, below the variant
    // list, enabled while the selected (default: first) variant is available.
    const addButton = screen.getByRole("button", { name: "Add to cart" });
    expect(addButton).toBeOnTheScreen();
    await waitFor(() => expect(addButton).not.toBeDisabled());

    // Exactly one Add action — the accessible name is unique on the screen.
    expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(1);

    // No press happened: the cart holds nothing for this profile.
    expect(getCartSnapshot().lines).toEqual([]);

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("flips Add disabled when an UNAVAILABLE variant is selected — the variant stays selectable for inspection", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());
    const user = userEvent.setup();

    await renderProductDetail(extraProductIds.kettle, UNAVAILABLE_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());

    // Selecting the unavailable option-backed variant (Design decision 9:
    // inspection stays possible) flips the Add action disabled…
    await user.press(
      screen.getByRole("button", { name: "Color: Rouge, Size: Lárge, Out of stock" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Color: Rouge, Size: Lárge, Out of stock",
        selected: true,
      }),
    ).toBeOnTheScreen();
    expect(addButton).toBeDisabled();

    // …and a press attempt in that state changes nothing in the cart.
    await user.press(addButton);
    await settleDurableWrites();
    expect(getCartSnapshot().lines).toEqual([]);

    // Switching back to the available variant re-enables Add — the
    // affordance is stable, never removed (brief AC-02).
    await user.press(screen.getByRole("button", { name: "Matte Black Edition, Available" }));
    await waitFor(() => expect(addButton).not.toBeDisabled());

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("pressing Add with an available selection puts the T01-mapped line in the real cart and opens the Quick Cart with it", async () => {
    // The Café Crème base fixture: the default selection is the UNAVAILABLE
    // "Signature roast", and the AVAILABLE selection is the option-backed
    // configurable variant — so the press exercises the AC-04 label rule
    // (option TYPE names as the label, values only through the selections).
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderProductDetail(catalogFixtureIds.products.coffee, PRESS_ADD_OWNER);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );
    const addButton = screen.getByRole("button", { name: "Add to cart" });
    // The unavailable default selection leaves Add disabled…
    await waitFor(() => expect(addButton).toBeDisabled());

    // …and selecting the available option-backed variant enables it.
    await user.press(screen.getByRole("button", { name: "Color: Rouge, Size: Lárge, Available" }));
    await waitFor(() => expect(addButton).not.toBeDisabled());

    await user.press(addButton);
    // The Add press persists fire-and-forget; settle the write queue inside
    // act before asserting (the integration suite's settle pattern).
    await settleDurableWrites();

    // The single real cart model holds exactly the mapped line: quantity 1
    // (plan decision 6), the variant's derived primary image (the model
    // already fell back to the product cover for this media-less variant),
    // and the T01 label rule — option TYPE names, values only in selections.
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject({
      variantId: catalogFixtureIds.variants.configurable,
      productId: catalogFixtureIds.products.coffee,
      productDisplayName: "Café Crème",
      variantLabel: "Color, Size",
      optionSelections: [
        {
          optionTypeId: catalogFixtureIds.optionTypes.color,
          optionValueId: catalogFixtureIds.optionValues.rouge,
          optionValueLabel: "Rouge",
        },
        {
          optionTypeId: catalogFixtureIds.optionTypes.size,
          optionValueId: catalogFixtureIds.optionValues.large,
          optionValueLabel: "Lárge",
        },
      ],
      imageUri: "https://res.cloudinary.com/kisok/image/upload/coffee-cover.png",
      quantity: 1,
    });
    expect(snapshot.totalQuantity).toBe(1);

    // And the press opened the Quick Cart through the integration context:
    // the sheet shows the fresh line — the AC-04-composed caption (each
    // option value exactly once) and the updated total in the title.
    expect(screen.getByText("Color, Size · Rouge · Lárge")).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "Your Cart · 1" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();

    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("renders no Add action outside the resolved-product path — loading, error, empty and not-found carry no ordering affordance", async () => {
    // Loading: the first snapshot never resolves.
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));
    await renderWithProviders(
      <ProductDetailScreen productId={catalogFixtureIds.products.coffee} />,
    );
    expect(screen.getByLabelText("Loading the catalog…")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
    mockFetchCatalog.mockReset();

    // Error with no snapshot.
    mockFetchCatalog.mockRejectedValue(retryableCatalogError);
    await renderWithProviders(
      <ProductDetailScreen productId={catalogFixtureIds.products.coffee} />,
    );
    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeOnTheScreen());
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
    mockFetchCatalog.mockReset();

    // Whole-catalog empty.
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());
    await renderWithProviders(<ProductDetailScreen productId={STALE_PRODUCT_ID} />);
    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
    mockFetchCatalog.mockReset();

    // Local not-found projection of a successful snapshot.
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    await renderWithProviders(<ProductDetailScreen productId={STALE_PRODUCT_ID} />);
    await waitFor(() => expect(screen.getByText(PRODUCT_NOT_FOUND_TITLE)).toBeOnTheScreen());
    expect(screen.queryByRole("button", { name: "Add to cart" })).toBeNull();
  });
});
