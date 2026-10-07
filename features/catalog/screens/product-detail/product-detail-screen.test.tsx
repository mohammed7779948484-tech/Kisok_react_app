import { BackHandler, Keyboard } from "react-native";

import { useAuth } from "@/core/auth";
import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import {
  act,
  fireEvent,
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
  // The Option Browser's Android Back handler and its grid both register
  // through `useFocusEffect`; outside a navigator the screen is focused while
  // it is mounted, so the callback runs as an ordinary effect.
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(effect, [effect]);
  },
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

/**
 * A product shaped like the real store catalog (phase 4): one Flavor
 * dimension with 30 values, six of them out of stock — two inside the first
 * six — so the preview, the available-first browser order and search are all
 * observable. Four flavours contain "berry" (two of them unavailable).
 */
const VAPE_PRODUCT_ID = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
const FLAVOR_TYPE_ID = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
const VAPE_FLAVORS = [
  "Apple",
  "Apricot",
  "Banana",
  "Blackberry",
  "Blueberry",
  "Cherry",
  "Coconut",
  "Cola",
  "Grape",
  "Guava",
  "Kiwi",
  "Lemon",
  "Lime",
  "Lychee",
  "Mango",
  "Melon",
  "Mint",
  "Nectarine",
  "Orange",
  "Papaya",
  "Passion Fruit",
  "Peach",
  "Pear",
  "Pineapple",
  "Plum",
  "Raspberry",
  "Strawberry",
  "Tangerine",
  "Vanilla",
  "Watermelon",
] as const;
const UNAVAILABLE_FLAVORS = new Set([
  "Apricot",
  "Blackberry",
  "Kiwi",
  "Melon",
  "Passion Fruit",
  "Raspberry",
]);

function vapeIdFor(prefix: string, index: number): string {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}
const vapeVariantId = (flavor: (typeof VAPE_FLAVORS)[number]) =>
  vapeIdFor("f1000000", VAPE_FLAVORS.indexOf(flavor));

/** The vape catalog; `flavorCount` trims the flavour list (a refresh that shrinks it). */
function snapshotWithVape(flavorCount: number = VAPE_FLAVORS.length): CatalogSnapshot {
  const base = createCatalogSnapshotFixture();
  const flavors = VAPE_FLAVORS.slice(0, flavorCount);
  return createCatalogSnapshotFixture({
    products: [
      ...base.products,
      {
        id: VAPE_PRODUCT_ID,
        name: "Cloud Vape",
        brand_id: null,
        cover_media_asset_id: null,
        cover_public_id: null,
        cover_secure_url: null,
        short_description: null,
        search_keywords: null,
        display_order: 50,
        is_featured: false,
      },
    ],
    option_types: [...base.option_types, { id: FLAVOR_TYPE_ID, name: "Flavor", display_order: 30 }],
    option_values: [
      ...base.option_values,
      ...flavors.map((value, index) => ({
        id: vapeIdFor("f2000000", index),
        option_type_id: FLAVOR_TYPE_ID,
        value,
        display_order: index + 1,
      })),
    ],
    variants: [
      ...base.variants,
      ...flavors.map(
        (flavor, index): CatalogVariant => ({
          id: vapeIdFor("f1000000", index),
          product_id: VAPE_PRODUCT_ID,
          sku: `SECRET-SKU-VAPE-${index}`,
          barcode: null,
          title_override: null,
          search_keywords: null,
          display_order: index + 1,
          is_available: !UNAVAILABLE_FLAVORS.has(flavor),
          available_quantity: UNAVAILABLE_FLAVORS.has(flavor) ? 0 : 20,
        }),
      ),
    ],
    variant_option_values: [
      ...base.variant_option_values,
      ...flavors.map((_, index) => ({
        variant_id: vapeIdFor("f1000000", index),
        option_type_id: FLAVOR_TYPE_ID,
        option_value_id: vapeIdFor("f2000000", index),
      })),
    ],
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
const BROWSER_ADD_OWNER = "b2c3d4e5-6f70-4a81-8c9d-0e1f2a3b4c5d";

/**
 * Gates the screen on auth readiness and the integration provider, exactly
 * as the app will mount it once T04 wires the customer layout: the (customer)
 * group renders behind `ready && profile?.role === "customer"`, and the
 * provider supplies the Quick Cart context the screen's Add action consumes
 * (`useActiveProfile()`/`useQuickCart()` throwing outside their providers is
 * the contract, not a defect for the screen to code around — the
 * full-cart and integration suites' AuthedHarness pattern).
 */
function AuthedProductDetail({ productId, match }: { productId: string; match?: string }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <CatalogCartProvider>
      <ProductDetailScreen productId={productId} match={match} />
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
async function renderProductDetail(
  productId: string,
  ownerId: string = SCREEN_OWNER,
  match?: string,
) {
  mockAuthHolder.current = installMockAuth({
    profile: { ...TEST_PROFILE, id: ownerId },
  });
  return renderWithProviders(<AuthedProductDetail productId={productId} match={match} />, {
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

/**
 * Jest-expo resolves react-native to iOS, whose BackHandler drops handlers.
 * This spy stands in for Android's (the checkout-gate suite's pattern):
 * registrations are recorded, `remove` unregisters, and `pressHardwareBack`
 * dispatches newest-first, stopping at the first handler that consumes it.
 */
type HardwareBackHandler = () => boolean | null | undefined;
const backHandlers: HardwareBackHandler[] = [];
function installBackHandlerSpy() {
  backHandlers.length = 0;
  return jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return {
      remove: () => {
        const index = backHandlers.indexOf(handler);
        if (index !== -1) backHandlers.splice(index, 1);
      },
    };
  });
}
function pressHardwareBack(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i -= 1) {
    if (backHandlers[i]?.()) return true;
  }
  return false;
}

async function renderVape(ownerId: string = SCREEN_OWNER) {
  const rendered = await renderProductDetail(VAPE_PRODUCT_ID, ownerId);
  await waitFor(() => expect(screen.getByRole("header", { name: "Cloud Vape" })).toBeOnTheScreen());
  return rendered;
}

type HostNode = { children: readonly (HostNode | string)[] };

/**
 * The browser's grid renders rows only once it has measured the width it is
 * given; deliver that layout pass (the catalog-grid suite's technique) at a
 * tablet-portrait content width.
 */
async function layoutBrowserGrid(width = 700) {
  const host = screen.getByTestId("catalog-option-browser-grid") as unknown as HostNode;
  const container = host.children[0];
  if (container === undefined || typeof container === "string") {
    throw new Error("The Option Browser did not render its grid");
  }
  await fireEvent(container as never, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 900 } },
  });
}

async function openBrowser(user: ReturnType<typeof userEvent.setup>) {
  await user.press(screen.getByRole("button", { name: "Browse all 30 flavors" }));
  expect(screen.getByTestId("catalog-option-browser")).toBeOnTheScreen();
  await layoutBrowserGrid();
}

function radioNames(): string[] {
  return screen.getAllByRole("radio").map((radio) => String(radio.props.accessibilityLabel ?? ""));
}

/**
 * Phase 4 (GD-01–GD-03): a large variant set previews six choices in the
 * Choice Canvas and browses the full range in the Option Browser, which
 * replaces the Stage and Canvas in place — never a route or a sheet.
 */
describe("ProductDetailScreen — large variant sets", () => {
  it("keeps every choice in place for a product with six or fewer, with nothing to browse", async () => {
    await renderKettle();

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByTestId("catalog-option-show-all")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Browse all/ })).toBeNull();
  });

  it("previews six choices and offers to browse all of them, with no search in the canvas", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithVape());
    await renderVape();

    expect(screen.getAllByRole("radio")).toHaveLength(6);
    const browseAll = screen.getByRole("button", { name: "Browse all 30 flavors" });
    expect(browseAll).toBe(screen.getByTestId("catalog-option-show-all"));
    expect(screen.getByText("Browse all 30 flavors")).toBeOnTheScreen();
    // The in-place expand and the in-place rack search are gone.
    expect(screen.queryByLabelText("Search flavors")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
    expect(screen.getByText("Start with 6 visible flavors, or browse all 30.")).toBeOnTheScreen();
  });

  it("browses every choice in one grid, available ones first, in place of the product view", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithVape());
    const user = userEvent.setup();
    await renderVape();

    await openBrowser(user);

    // The Stage and the Canvas make way for the browser.
    expect(screen.queryByRole("link", { name: "Back to products" })).toBeNull();
    expect(screen.queryByTestId("catalog-option-rack")).toBeNull();
    expect(screen.getByRole("button", { name: "Back to product" })).toBe(
      screen.getByTestId("catalog-option-browser-close"),
    );
    expect(screen.getByLabelText("Flavor options")).toBeOnTheScreen();
    expect(screen.getByText("24 of 30 available")).toBeOnTheScreen();

    const names = radioNames();
    expect(names).toHaveLength(30);
    const available = VAPE_FLAVORS.filter((flavor) => !UNAVAILABLE_FLAVORS.has(flavor));
    const unavailable = VAPE_FLAVORS.filter((flavor) => UNAVAILABLE_FLAVORS.has(flavor));
    // Store order within each group.
    expect(names).toEqual([
      ...available,
      ...unavailable.map((flavor) => `${flavor}, currently unavailable`),
    ]);
  });

  it("searches the full range, says how many match, and recovers from no match", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithVape());
    const user = userEvent.setup();
    await renderVape();
    await openBrowser(user);

    expect(screen.getByText("Showing 30 of 30")).toBeOnTheScreen();
    await user.type(screen.getByLabelText("Search flavors"), "berry");

    expect(radioNames()).toEqual([
      "Blueberry",
      "Strawberry",
      "Blackberry, currently unavailable",
      "Raspberry, currently unavailable",
    ]);
    expect(screen.getByText("Showing 4 of 30")).toBeOnTheScreen();

    await user.clear(screen.getByLabelText("Search flavors"));
    await user.type(screen.getByLabelText("Search flavors"), "zzz");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByText("No matching flavors.")).toBeOnTheScreen();
    expect(screen.getByText("Showing 0 of 30")).toBeOnTheScreen();

    await user.press(screen.getByTestId("catalog-option-browser-clear"));
    expect(screen.getAllByRole("radio")).toHaveLength(30);
    expect(screen.getByLabelText("Search flavors")).toHaveDisplayValue("");
  });

  it("keeps the chosen option and quantity across the browser, and resets quantity only for another option", async () => {
    mockFetchCatalog.mockResolvedValue(snapshotWithVape());
    const user = userEvent.setup();
    await renderVape(BROWSER_ADD_OWNER);
    await openBrowser(user);

    // Mango is not in the six-choice preview.
    await user.press(screen.getByRole("radio", { name: "Mango" }));
    expect(screen.getByRole("radio", { name: "Mango" })).toBeChecked();
    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: "Add 3 to cart" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Back to product" }));
    expect(screen.queryByTestId("catalog-option-browser")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to products" })).toBeOnTheScreen();
    // The preview swaps the selection in, and the quantity survived.
    expect(screen.getByRole("radio", { name: "Mango" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add 3 to cart" })).toBeOnTheScreen();

    // Choosing the same option again keeps the quantity.
    await user.press(screen.getByRole("radio", { name: "Mango" }));
    expect(screen.getByRole("button", { name: "Add 3 to cart" })).toBeOnTheScreen();

    await openBrowser(user);
    expect(screen.getByRole("radio", { name: "Mango" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Add 3 to cart" })).toBeOnTheScreen();

    // Another option starts again at one.
    await user.press(screen.getByRole("radio", { name: "Lemon" }));
    expect(screen.getByRole("button", { name: "Add 1 to cart" })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await user.press(screen.getByRole("button", { name: "Add 2 to cart" }));
    await settleDurableWrites();

    const { lines } = getCartSnapshot();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      variantId: vapeVariantId("Lemon"),
      productId: VAPE_PRODUCT_ID,
      quantity: 2,
    });
  });

  it("closes the browser on Android Back, and leaves Back alone otherwise", async () => {
    const spy = installBackHandlerSpy();
    try {
      mockFetchCatalog.mockResolvedValue(snapshotWithVape());
      const user = userEvent.setup();
      await renderVape();
      expect(backHandlers).toHaveLength(0);

      await openBrowser(user);
      let consumed = false;
      await act(async () => {
        consumed = pressHardwareBack();
      });

      expect(consumed).toBe(true);
      expect(screen.queryByTestId("catalog-option-browser")).toBeNull();
      expect(screen.getByRole("button", { name: "Browse all 30 flavors" })).toBeOnTheScreen();
      expect(backHandlers).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("returns to the product view when a refresh leaves too few choices to browse", async () => {
    mockFetchCatalog
      .mockResolvedValueOnce(snapshotWithVape())
      .mockResolvedValueOnce(snapshotWithVape(5));
    const user = userEvent.setup();
    const { queryClient } = await renderVape();
    await openBrowser(user);

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: catalogKeys.all });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByTestId("catalog-option-browser")).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.queryByTestId("catalog-option-show-all")).toBeNull();
  });
});

/**
 * Phase 4 (GD-08): a product opened from Help Me Choose lists the choices that
 * match the customer's answers first and says how many match — it never
 * chooses for them.
 */
describe("ProductDetailScreen — opened from Help Me Choose", () => {
  const berries = VAPE_FLAVORS.filter(
    (flavor) => flavor.toLowerCase().includes("berry") && !UNAVAILABLE_FLAVORS.has(flavor),
  );

  async function renderMatched(match: string) {
    mockFetchCatalog.mockResolvedValue(snapshotWithVape());
    await renderProductDetail(VAPE_PRODUCT_ID, SCREEN_OWNER, match);
    await waitFor(() =>
      expect(screen.getByRole("header", { name: "Cloud Vape" })).toBeOnTheScreen(),
    );
  }

  it("previews the matching choices first, says how many match, and selects nothing", async () => {
    expect(berries.length).toBeGreaterThan(1);
    await renderMatched("t.berry");

    expect(radioNames().slice(0, berries.length)).toEqual(berries);
    expect(screen.getByText(`${berries.length} flavors match your choices.`)).toBeOnTheScreen();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.props.accessibilityState?.checked).toBe(false);
    }
  });

  it("puts the matching choices first in the Option Browser too", async () => {
    const user = userEvent.setup();
    await renderMatched("t.berry");

    await openBrowser(user);

    expect(radioNames().slice(0, berries.length)).toEqual(berries);
  });

  it("ignores a match that fits none of this product's choices", async () => {
    await renderMatched("t.zzzz");

    expect(screen.queryByText(/match your choices/)).toBeNull();
    expect(screen.getByText("Start with 6 visible flavors, or browse all 30.")).toBeOnTheScreen();
  });
});

/**
 * Review M-01: in the stacked browser the Order Bar steps aside only while the
 * keyboard is actually up. Android can hide the keyboard (Back, hide key)
 * without blurring the field, so focus alone must not keep the bar away.
 */
describe("ProductDetailScreen — stacked browser and the keyboard", () => {
  afterEach(() => jest.restoreAllMocks());

  it("brings the Order Bar back when the keyboard hides, even if the search keeps focus", async () => {
    const listeners = new Map<string, () => void>();
    jest.spyOn(Keyboard, "addListener").mockImplementation(((
      event: string,
      handler: () => void,
    ) => {
      listeners.set(event, handler);
      return { remove: () => listeners.delete(event) };
    }) as never);
    mockFetchCatalog.mockResolvedValue(snapshotWithVape());
    const user = userEvent.setup();
    await renderVape();
    await openBrowser(user);

    const prompt = "Select one of the options above to set quantity.";
    expect(screen.getByText(prompt)).toBeOnTheScreen();

    // The customer starts searching: the field takes focus and keeps it below.
    await act(async () => {
      fireEvent(screen.getByLabelText("Search flavors"), "focus");
    });
    await act(async () => listeners.get("keyboardDidShow")?.());
    expect(screen.queryByText(prompt)).toBeNull();

    // No blur: the field keeps focus while the keyboard goes away.
    await act(async () => listeners.get("keyboardDidHide")?.());
    expect(screen.getByText(prompt)).toBeOnTheScreen();
  });
});
