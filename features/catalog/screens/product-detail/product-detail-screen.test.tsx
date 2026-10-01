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
 * button owns every cart call. Since Product Detail v1.8 that action is the
 * Order Bar's "Add N to cart", offered only once an available option is
 * chosen; nothing is chosen for the customer unless the product has one option.
 */
jest.mock("../../api/fetch-catalog", () => ({
  fetchCatalog: jest.fn(),
}));

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
const mockCanGoBack = jest.fn().mockReturnValue(true);
/** The params the mocked `useLocalSearchParams` hands the route under test. */
const mockLocalSearchParams: { productId?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: mockRouterBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockLocalSearchParams,
  // T04 (structurally forced, Lead to disposition): the catalog-cart
  // integration's provider — which the harness below mounts around this
  // screen — now calls `usePathname()` for the persistent cart affordance's
  // `/cart` gate, so this suite's module mock must expose it. Assertion-
  // neutral — no assertion in this file changed; the pathname reports this
  // screen's own route, so the affordance renders there exactly as the
  // delivered app renders it.
  usePathname: () => "/product-detail",
}));

// AppImage's fallback icon renders a lucide icon; the catalog-cart
// integration's Add action renders the ShoppingCart icon and the Quick Cart
// sheet its rows/steppers — stub the standardized set so gallery fallbacks,
// the Add action and an open sheet render without the SVG machinery.
jest.mock("lucide-react-native", () => {
  const createMockIcon = (name: string) => {
    const MockIcon = () => null;
    MockIcon.displayName = name;
    return MockIcon;
  };
  return new Proxy(
    { __esModule: true },
    {
      get: (target: any, prop: string | symbol) => {
        if (prop in target) return target[prop];
        if (typeof prop === "string") {
          target[prop] = createMockIcon(prop);
          return target[prop];
        }
        return undefined;
      },
    },
  );
});

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
      available_quantity: 12,
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
      available_quantity: 0,
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
      available_quantity: 0,
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

const NO_QUANTITY_HINT = "Select one of the options above to set quantity.";
const CANNOT_ADD = "This option can’t be added right now. Choose another to continue.";

async function renderKettle() {
  mockFetchCatalog.mockResolvedValue(snapshotWithKettle());
  const rendered = await renderProductDetail(extraProductIds.kettle);
  await waitFor(() =>
    expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen(),
  );
  return rendered;
}

/**
 * Product Detail v1.8: the Product Stage (identity, context, gallery) beside
 * the Choice Canvas (every option in place, then the Order Bar). The customer
 * chooses explicitly — only a genuinely single-option product counts as
 * chosen — and adds from the Order Bar.
 */
describe("ProductDetailScreen", () => {
  it("renders the product's identity, context and every option, with none chosen yet", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    await renderProductDetail(catalogFixtureIds.products.coffee);

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );
    expect(screen.getByText("A smooth customer favourite.")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Back to products" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Browse brand Maison Élite" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Browse category Drínks" })).toBeOnTheScreen();

    expect(screen.getByLabelText("Variations options")).toBeOnTheScreen();
    const choices = screen.getAllByRole("radio");
    expect(choices).toHaveLength(2);
    for (const choice of choices) expect(choice).not.toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Signature roast, currently unavailable" }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Color: Rouge · Size: Lárge" })).toBeOnTheScreen();

    // Nothing to add until the customer chooses.
    expect(screen.getByText(NO_QUANTITY_HINT)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /to cart$/ })).toBeNull();
  });

  it("shows no price, subtotal or payment wording anywhere", async () => {
    await renderKettle();
    const user = userEvent.setup();
    await user.press(screen.getByRole("radio", { name: "Matte Black Edition" }));

    expect(screen.queryByText(/[$€£]|price|subtotal|total|pay/i)).toBeNull();
  });

  it("choosing an available option previews its images and offers a quantity and Add", async () => {
    await renderKettle();
    const user = userEvent.setup();

    await user.press(screen.getByRole("radio", { name: "Matte Black Edition" }));

    expect(screen.getByRole("radio", { name: "Matte Black Edition" })).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Studio Kettle — Matte Black Edition image 1" }),
    ).toBeSelected();
    expect(screen.getByText("12 available now")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add 1 to cart" })).toBeEnabled();

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: "Add 2 to cart" })).toBeOnTheScreen();
  });

  it("switches images with the thumbnails and returns to the first image for another option", async () => {
    await renderKettle();
    const user = userEvent.setup();
    await user.press(screen.getByRole("radio", { name: "Matte Black Edition" }));

    await user.press(
      screen.getByRole("button", { name: "Studio Kettle — Matte Black Edition image 2" }),
    );
    expect(
      screen.getByRole("button", { name: "Studio Kettle — Matte Black Edition image 2" }),
    ).toBeSelected();
    expect(
      screen.getByRole("button", { name: "Studio Kettle — Matte Black Edition image 1" }),
    ).not.toBeSelected();

    // An option without its own images falls back to the product's cover.
    await user.press(screen.getByRole("radio", { name: "Option 3, currently unavailable" }));
    expect(screen.getByText("This option is shown with the product image.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Matte Black Edition image/ })).toBeNull();
  });

  it("lets an unavailable option be inspected but never added", async () => {
    await renderKettle();
    const user = userEvent.setup();

    await user.press(screen.getByRole("radio", { name: "Option 3, currently unavailable" }));

    expect(screen.getByRole("radio", { name: "Option 3, currently unavailable" })).toBeChecked();
    expect(screen.getByText(CANNOT_ADD)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /to cart$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Increase quantity" })).toBeNull();
  });

  it("treats a product's only option as chosen, and says when it cannot be added", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());

    await renderProductDetail(catalogFixtureIds.products.tote);

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Standard option, currently unavailable" }),
      ).toBeChecked(),
    );
    expect(screen.getByText(CANNOT_ADD)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /to cart$/ })).toBeNull();
  });

  it("opens the brand and category from the product's context", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();
    await renderProductDetail(catalogFixtureIds.products.coffee);
    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("link", { name: "Browse brand Maison Élite" }));
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: "/brand-detail",
      params: { brandId: catalogFixtureIds.brands.elite },
    });

    await user.press(screen.getByRole("link", { name: "Browse category Drínks" }));
    expect(mockRouterPush).toHaveBeenLastCalledWith({
      pathname: "/category-detail",
      params: { categoryId: catalogFixtureIds.categories.drinks },
    });
  });

  it("goes back where the customer came from, or to Products when there is no history", async () => {
    const user = userEvent.setup();
    await renderKettle();

    await user.press(screen.getByRole("link", { name: "Back to products" }));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValueOnce(false);
    await user.press(screen.getByRole("link", { name: "Back to products" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/products");
  });

  it("explains a product that is no longer in the catalog, with ways out", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderProductDetail(STALE_PRODUCT_ID);

    await waitFor(() =>
      expect(screen.getByText("This product is no longer available")).toBeOnTheScreen(),
    );
    // A local projection of a good snapshot — never the load-error state.
    expect(screen.queryByText("The catalog could not load")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Back to Explore" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/");
  });

  it("reads the productId route param and resolves exactly that product", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithKettle());
    mockLocalSearchParams.productId = extraProductIds.kettle;
    mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: SCREEN_OWNER } });

    await renderWithProviders(<AuthedProductDetailRoute />, { withAuth: true });

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen(),
    );
    expect(screen.queryByRole("header", { name: "Café Crème" })).toBeNull();
    expect(mockFetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("announces loading before the first snapshot", async () => {
    mockFetchCatalog.mockReturnValue(new Promise(() => {}));

    await renderProductDetail(catalogFixtureIds.products.coffee);

    expect(screen.getByLabelText("Loading product…")).toBeOnTheScreen();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("offers a retry that refetches when the catalog fails to load", async () => {
    mockFetchCatalog
      .mockRejectedValueOnce(retryableCatalogError)
      .mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();

    await renderProductDetail(catalogFixtureIds.products.coffee);

    await waitFor(() => expect(screen.getByText("The catalog could not load")).toBeOnTheScreen());
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );
  });

  it("offers no retry for a failure that retrying cannot fix", async () => {
    mockFetchCatalog.mockRejectedValue(nonRetryableCatalogError);

    await renderProductDetail(catalogFixtureIds.products.coffee);

    await waitFor(() => expect(screen.getByText("The catalog could not load")).toBeOnTheScreen());
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows the empty catalog state when no products are returned", async () => {
    mockFetchCatalog.mockResolvedValue(emptyCatalogSnapshot());

    await renderProductDetail(STALE_PRODUCT_ID);

    await waitFor(() => expect(screen.getByText("The catalog is empty")).toBeOnTheScreen());
  });

  it("keeps the product on screen when a background refetch fails", async () => {
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithKettle())
      .mockRejectedValueOnce(retryableCatalogError);
    const { queryClient } = await renderKettle();

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole("header", { name: "Studio Kettle" })).toBeOnTheScreen();
    expect(screen.queryByText("The catalog could not load")).toBeNull();
  });

  it("asks the customer to choose again when a refresh removes the chosen option", async () => {
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithKettle())
      .mockResolvedValueOnce(snapshotWithOption3Removed());
    const user = userEvent.setup();
    const { queryClient } = await renderKettle();
    await user.press(screen.getByRole("radio", { name: "Option 3, currently unavailable" }));

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByRole("radio", { name: /^Option 3/ })).toBeNull();
    // Nothing is re-picked on the customer's behalf.
    for (const choice of screen.getAllByRole("radio")) expect(choice).not.toBeChecked();
    expect(screen.getByText(NO_QUANTITY_HINT)).toBeOnTheScreen();
  });
});

describe("ProductDetailScreen — adding to the cart", () => {
  it("adds the chosen option with its quantity and opens the Quick Cart", async () => {
    mockFetchCatalog.mockResolvedValue(createCatalogSnapshotFixture());
    const user = userEvent.setup();
    await renderProductDetail(catalogFixtureIds.products.coffee, PRESS_ADD_OWNER);
    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Café Crème" })).toBeOnTheScreen(),
    );

    await user.press(screen.getByRole("radio", { name: "Color: Rouge · Size: Lárge" }));
    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await user.press(screen.getByRole("button", { name: "Add 2 to cart" }));
    await settleDurableWrites();

    const { lines } = getCartSnapshot();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      variantId: catalogFixtureIds.variants.configurable,
      productId: catalogFixtureIds.products.coffee,
      productDisplayName: "Café Crème",
      optionSelections: [
        expect.objectContaining({ optionValueLabel: "Rouge" }),
        expect.objectContaining({ optionValueLabel: "Lárge" }),
      ],
      quantity: 2,
    });
    expect(screen.getByRole("button", { name: "Review cart" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Keep browsing" })).toBeOnTheScreen();
  });
});
