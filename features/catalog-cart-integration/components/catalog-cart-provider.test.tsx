import { readFileSync } from "fs";
import { resolve } from "path";
import type { ReactNode } from "react";
import { Dimensions, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { runSignOutCleanup, useAuth } from "@/core/auth";
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

import { addItem, getCartSnapshot, type AddToCartInput, type CartLine } from "@/features/cart";

import { CatalogCartProvider } from "./catalog-cart-provider";
import { useQuickCart } from "./quick-cart-context";

/**
 * Behaviour of the experience-level `CatalogCartProvider` (plan decision 1,
 * AC-01/AC-05; supporting AC-08/AC-09) and its `useQuickCart` context.
 *
 * The provider is the customer-experience mount point: it renders the cart
 * feature's public `useCart()` (THE session-wide hydration owner — nothing in
 * this test hydrates the store itself), owns the ephemeral Quick Cart open
 * state, renders the public `QuickCartSheet`, and owns the View Full Cart
 * routing intent. The real sheet, the real single cart model, the real
 * durable storage and the real auth profile drive everything — only
 * expo-router's `useRouter` and lucide's icon renderer are stubbed, exactly
 * like the cart feature's own suites.
 *
 * ESLint note: this suite reaches the cart ONLY through `@/features/cart`
 * (the public index). The cart's store singleton is therefore NOT importable
 * here — per-test owner ids + the store's owner-switch reset on hydrate are
 * what re-baseline memory between tests.
 */

/**
 * The provider owns the View Full Cart navigation intent (plan decision 8), so
 * it calls `useRouter()` from expo-router — the full-cart-screen.test.tsx
 * pattern: a minimal module mock whose `useRouter` returns one router whose
 * `push` is a jest.fn the tests assert against. T04 adds the affordance's
 * route gate: the provider calls `usePathname()` to hide the affordance on
 * `/cart`, so the mock also exposes a controllable pathname. The `mock`
 * prefix keeps both references inside jest's factory allowlist.
 */
const mockRouterPush = jest.fn();
/** The pathname the mocked `usePathname` reports — reset per test in beforeEach. */
const mockPathname: { current: string } = { current: "/products" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname.current,
}));

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The cart feature's module
 * graph — which the provider's public import loads — value-imports several
 * icons; they are decorative SVGs, so the standardized null-rendering
 * stand-ins keep this a test of the provider's contract (see the cart suites).
 */
jest.mock("lucide-react-native", () => {
  // Null-rendering stand-ins need no import at all — a component returning
  // null references nothing from react or react-native — which keeps the
  // factory free of `require()` (tests lint with --max-warnings=0).
  const makeIcon = (name: string) => Object.assign(() => null, { displayName: name });
  return {
    Minus: makeIcon("Minus"),
    Plus: makeIcon("Plus"),
    Trash2: makeIcon("Trash2"),
    ImageOff: makeIcon("ImageOff"),
    ShoppingCart: makeIcon("ShoppingCart"),
  };
});

/** The single durable key the cart's hydrate() reads (cart plan decision 1). */
const KEY = storageKey("cart", "lines");

/**
 * One unique owner id per test that renders the provider: the store's
 * owner-switch reset inside hydrate() then re-baselines memory between tests,
 * using only the public surface (see the ESLint note above).
 */
const HYDRATION_OWNER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const SHEET_OWNER = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const CLOSE_OWNER = "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f";
const VIEWCART_OWNER = "4d5e6f7a-8b9c-4d0e-8f1a-3b4c5d6e7f8a";
const CLEANUP_OWNER = "5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8a9b";
const ADD_OWNER = "6f7a8b9c-0d1e-4f2a-8b3c-5d6e7f8a9b0c";
const AFFORDANCE_OWNER = "708192a3-b4c5-4d6e-8f7a-9c0d1e2f3a4b";
const CART_ROUTE_OWNER = "8192a3b4-c5d6-4e7f-8a0b-1e2f3a4b5c6d";

const sizeSelection = {
  optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
  optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
  optionValueLabel: "Large",
};

const milkSelection = {
  optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
  optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  optionValueLabel: "Oat Milk",
};

/** A plain persisted line: no options, no image — the minimal valid envelope. */
const waterLine: CartLine = {
  lineId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

/** The matching AddToCartInput — a line minus its derived identity. */
const waterInput: AddToCartInput = {
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

/** A richer input — two option selections and an image. */
const cappuccinoInput: AddToCartInput = {
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 1,
};

/**
 * Which AdaptiveSheet presentation a test exercises is decided by
 * `useLayout()` → `useWindowDimensions()`; setting the frame BEFORE render
 * means no mounted tree reacts to the change (the quick-cart-sheet suite's
 * pattern). 1024×768 → expanded landscape side panel.
 */
type Frame = { width: number; height: number };
const LANDSCAPE: Frame = { width: 1024, height: 768 };

function setFrame({ width, height }: Frame) {
  Dimensions.set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

/** Read the cart key back through the app's real storage API (identity parse — only the hit/miss status matters here). */
async function readCartKey() {
  return storage.read(KEY, (raw) => raw);
}

/**
 * The customer layout the provider is mounted in — the T04 thin mount. Read
 * as SOURCE (the full-cart suite's ROUTE_PATH pattern): the layout renders an
 * expo-router `Stack`, which needs a navigation container no jest tree here
 * supplies, so the mount contract is pinned structurally instead.
 */
const LAYOUT_PATH = resolve(__dirname, "../../../app/(customer)/_layout.tsx");

/** Every module specifier the layout source imports (from-imports and side-effect imports). */
function importSpecifiers(source: string): string[] {
  // Each regex captures exactly one specifier, but `noUncheckedIndexedAccess`
  // types a match group as possibly absent — narrow honestly rather than cast.
  const fromImports = [...source.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
  const sideEffectImports = [...source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => typeof specifier === "string");
  return [...fromImports, ...sideEffectImports];
}

/**
 * The cart's mutations persist fire-and-forget; this feature's tests cannot
 * call the store's own `persistNow` (deep import), so one macrotask turn —
 * the full-cart suite's `settleDurableClear` pattern — lets the serialized
 * write chain settle inside act.
 */
async function settleDurableWrites() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/** Calls the context hook with NO provider above it — the fail-loudly probe. */
function QuickCartOutsideProbe() {
  useQuickCart();
  return null;
}

/**
 * A child that consumes the context exactly the way T03's AddToCartButton and
 * T04's affordance will: the open flag, and the two intents. Rendered as the
 * provider's children, so the children-render assertions and the open-state
 * assertions share one shape.
 */
function QuickCartProbe() {
  const { open, openQuickCart, closeQuickCart } = useQuickCart();
  return (
    <View>
      <Text>child-probe</Text>
      <Text>{`open:${open}`}</Text>
      <Button onPress={() => openQuickCart()}>
        <Text>Open Quick Cart</Text>
      </Button>
      <Button onPress={() => closeQuickCart()}>
        <Text>Close Quick Cart</Text>
      </Button>
    </View>
  );
}

/**
 * Gates the provider on auth readiness, exactly as the app does: the root
 * navigator renders the (customer) group only under
 * `ready && profile?.role === "customer"`, and the provider mounts inside
 * that group — `useActiveProfile()` throwing outside authenticated surfaces
 * is core/auth's contract, not something the provider codes around (the
 * use-cart suite's AuthedCartProbe pattern).
 */
function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CatalogCartProvider>{children}</CatalogCartProvider>;
}

/** installMockAuth restored after every test — the use-cart suite's holder pattern. */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderProvider(children: ReactNode, ownerId: string) {
  setFrame(LANDSCAPE);
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  return renderWithProviders(<AuthedHarness>{children}</AuthedHarness>, { withAuth: true });
}

beforeEach(async () => {
  // The store's mutation and hydration paths log by design; keep the suite
  // silent per the repo convention.
  setLogSink(() => {});
  mockRouterPush.mockClear();
  // Every test starts on a browsing route; the /cart-gate tests override this
  // before rendering.
  mockPathname.current = "/products";
  // Disk hygiene: hydrate() reads this key, so a previous test's envelope must
  // not leak into the next one's restore. Through the app's own API.
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("useQuickCart (context contract)", () => {
  it("throws when called outside the provider — a missing provider is a programmer error", async () => {
    // React logs the render error to console.error before re-throwing it; the
    // suite must stay silent, so the log is captured for this test only.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let caught: unknown;
    try {
      await renderWithProviders(<QuickCartOutsideProbe />);
    } catch (error) {
      caught = error;
    }
    errorSpy.mockRestore();

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("useQuickCart must be used inside");
  });
});

describe("CatalogCartProvider", () => {
  it("renders children inside the provider (the generated placeholder is gone)", async () => {
    await renderProvider(<Text>child-probe</Text>, SHEET_OWNER);

    expect(screen.getByText("child-probe")).toBeOnTheScreen();
    expect(screen.queryByText("TODO: build CatalogCartProvider.")).toBeNull();
  });

  it("openQuickCart opens the real QuickCartSheet; closeQuickCart closes it", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, SHEET_OWNER);
    await screen.findByText("open:false");

    // Closed at mount: no sheet content is rendered (controlled open).
    expect(screen.queryByRole("heading", { name: "Your Cart · 0" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));

    // The context flips, and the sheet the provider renders shows its real
    // content through the single cart model (hydrated empty for this owner).
    expect(screen.getByText("open:true")).toBeOnTheScreen();
    await screen.findByRole("heading", { name: "Your Cart · 0" });
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "View Full Cart" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Close Quick Cart" }));

    // The sheet's controlled open state is what unmounts its content.
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Your Cart · 0" })).toBeNull(),
    );
    expect(screen.getByText("open:false")).toBeOnTheScreen();
  });

  it("the sheet's own Continue Shopping close reports onOpenChange(false) and closes the sheet", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, CLOSE_OWNER);

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await screen.findByRole("button", { name: "Continue Shopping" });

    await user.press(screen.getByRole("button", { name: "Continue Shopping" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Continue Shopping" })).toBeNull(),
    );
    expect(screen.getByText("open:false")).toBeOnTheScreen();
  });

  it("View Full Cart pushes /cart through the router and closes the sheet", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, VIEWCART_OWNER);

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await screen.findByRole("button", { name: "View Full Cart" });

    await user.press(screen.getByRole("button", { name: "View Full Cart" }));

    // The provider owns the navigation intent (plan decision 8): the public
    // router is pushed to the cart feature's existing route, exactly once.
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/cart");
    // And the intent closes the sheet before leaving.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "View Full Cart" })).toBeNull(),
    );
    expect(screen.getByText("open:false")).toBeOnTheScreen();
  });

  it("mounting the provider hydrates the cart for the active profile from durable storage (AC-01)", async () => {
    // A previous session's durable cart for the profile that is about to sign
    // in — seeded directly through the app's storage API as the persisted
    // envelope the store's own restore reads. Nothing in this test hydrates
    // the store itself, so a restore can only mean the provider's mounted
    // useCart() did (the sanctioned hydration owner).
    await storage.write(KEY, { version: 1, ownerId: HYDRATION_OWNER, lines: [waterLine] });
    expect((await readCartKey()).status).toBe("hit");

    await renderProvider(<Text>child-probe</Text>, HYDRATION_OWNER);

    await waitFor(() => {
      const snapshot = getCartSnapshot();
      expect(snapshot.hydrated).toBe(true);
      expect(snapshot.ownerId).toBe(HYDRATION_OWNER);
      expect(snapshot.lines).toEqual([waterLine]);
      expect(snapshot.totalQuantity).toBe(1);
    });
  });

  it("runSignOutCleanup clears the cart after the provider loaded the cart module (AC-09 / R-FR-05 closure)", async () => {
    await renderProvider(<QuickCartProbe />, CLEANUP_OWNER);
    await waitFor(() => expect(getCartSnapshot().hydrated).toBe(true));

    // A real add through the cart's public action: memory holds a line and
    // the durable write lands (fire-and-forget, settled below).
    await act(async () => {
      addItem(waterInput);
    });
    await settleDurableWrites();
    expect((await readCartKey()).status).toBe("hit");
    expect(getCartSnapshot().lines).toHaveLength(1);

    // The sign-out contract: with the provider mounted, the cart feature
    // module (loaded through this graph — the provider's import and this
    // test's own public imports share one jest registry) has registered
    // its cleanup with core/auth's public registry, and running that
    // registry here clears memory AND the durable key with no failure.
    // The provider's runtime DEPENDENCY on the cart module is proven
    // causally by the hydration test above (nothing else there hydrates);
    // this test proves the end-to-end public contract. (C-T02-R1 note.)
    // Inside act: the cleanup's store clear re-renders the still-mounted
    // provider tree, and that update must land wrapped.
    let cleanupResult: { failures: string[] } | undefined;
    await act(async () => {
      cleanupResult = await runSignOutCleanup();
    });

    expect(cleanupResult).toEqual({ failures: [] });
    expect(getCartSnapshot().lines).toEqual([]);
    expect((await readCartKey()).status).toBe("miss");
  });

  it("a real add through the cart's public addItem surfaces in the open sheet (AC-05)", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, ADD_OWNER);

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await screen.findByText("Your cart is empty");

    await act(async () => {
      addItem(cappuccinoInput);
    });

    // The sheet is a live subscriber of the single cart model: the added line
    // is visible without reopening — product name, and the updated total in
    // the title.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "Your Cart · 1" })).toBeOnTheScreen();
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]?.productDisplayName).toBe("Cappuccino");
    expect(snapshot.totalQuantity).toBe(1);
  });
});

describe("CatalogCartProvider — persistent affordance (AC-06, plan decision 5)", () => {
  it('renders the affordance while on a browsing route (pathname "/products")', async () => {
    await renderProvider(<Text>child-probe</Text>, AFFORDANCE_OWNER);

    // The affordance is part of the provider's tree on every browsing
    // surface: Home, Products, Search, Brands, Categories, Product Detail.
    expect(await screen.findByRole("button", { name: "Open cart" })).toBeOnTheScreen();
  });

  it('hides the affordance exactly on "/cart" — children and the sheet stay functional', async () => {
    const user = userEvent.setup();
    mockPathname.current = "/cart";
    await renderProvider(<QuickCartProbe />, CART_ROUTE_OWNER);

    // Children render as before…
    expect(screen.getByText("child-probe")).toBeOnTheScreen();
    // …the affordance is ABSENT (a cart button on the full cart screen would
    // be a redundant no-op — plan decision 5)…
    expect(screen.queryByRole("button", { name: "Open cart" })).toBeNull();

    // …and the sheet the provider renders still works through the context the
    // children consume — hiding the button removes nothing else.
    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await screen.findByRole("heading", { name: "Your Cart · 0" });
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "View Full Cart" })).toBeOnTheScreen();
  });
});

describe("customer layout mount (plan decision 1; brief AC-11 thin-mount share)", () => {
  it("app/(customer)/_layout.tsx is the thin mount: CatalogCartProvider and RecoveryGate wrap the Stack, and only sanctioned public indexes are imported", () => {
    const layoutSource = readFileSync(LAYOUT_PATH, "utf8");
    const specifiers = importSpecifiers(layoutSource);

    // The T04 mount: the provider arrives through the integration's public
    // index — the one sanctioned way another module may reach this feature.
    expect(specifiers).toContain("@/features/catalog-cart-integration");
    // And the provider actually WRAPS the Stack, not just an unused import.
    expect(layoutSource).toContain("CatalogCartProvider");
    // The checkout RecoveryGate too (F-T12-01: a positive mount pin — the
    // sanctioned-set check alone is one-directional and would silently pass
    // if the gate AND its import were removed). The gate mounting here is
    // checkout plan D7; it is also what makes the T07 sign-out-guard
    // registration live for the session.
    expect(specifiers).toContain("@/features/checkout");
    expect(layoutSource).toContain("RecoveryGate");

    // Thin-mount discipline, the full-cart route suite's sanctioned-set shape:
    // anything beyond the router's own Stack and the public indexes is out of
    // place here (and would fail the app/** ESLint boundary anyway).
    // `@/features/checkout` joined the set when the checkout feature mounted
    // its session-level RecoveryGate here (checkout plan D7, listed in that
    // plan's external-changes): through the public index, exactly the shape
    // this pin enforces.
    const sanctioned = new Set([
      "expo-router",
      "@/features/catalog-cart-integration",
      "@/features/checkout",
    ]);
    expect(specifiers.filter((specifier) => !sanctioned.has(specifier))).toEqual([]);
  });
});
