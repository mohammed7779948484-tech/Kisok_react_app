import { readFileSync } from "fs";
import { resolve } from "path";
import type { ReactNode } from "react";
import { Dimensions, Text, View } from "react-native";

import { useAuth } from "@/core/auth";
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
import { Button, HeaderActionHost } from "@/design-system";
import { addItem, getCartSnapshot, type AddToCartInput } from "@/features/cart";

import { CatalogCartProvider } from "./catalog-cart-provider";
import { useQuickCart } from "./quick-cart-context";

/**
 * The customer-experience mount point: it owns the Quick Cart's open state,
 * renders the cart's public QuickCartSheet, places the cart affordance in the
 * catalog chrome's header slot while browsing, and owns the "Review cart"
 * navigation. It does not restore the cart itself — `useCart()` consumers
 * (the affordance here) do. The cart is reached only through its public index.
 */
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
const mockPathname: { current: string } = { current: "/products" };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname.current,
}));

const KEY = storageKey("cart", "lines");

/** One owner per rendering test, so every mount restores its own (empty) cart. */
const SHEET_OWNER = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const CLOSE_OWNER = "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f";
const REVIEW_OWNER = "4d5e6f7a-8b9c-4d0e-8f1a-3b4c5d6e7f8a";
const ROUTE_CHANGE_OWNER = "5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8a9b";
const ADD_OWNER = "6f7a8b9c-0d1e-4f2a-8b3c-5d6e7f8a9b0c";
const ADDED_OWNER = "7a8b9c0d-1e2f-4a3b-8c4d-6e7f8a9b0c1d";
const AFFORDANCE_OWNER = "708192a3-b4c5-4d6e-8f7a-9c0d1e2f3a4b";
const CART_ROUTE_OWNER = "8192a3b4-c5d6-4e7f-8a0b-1e2f3a4b5c6d";
const CHECKOUT_ROUTE_OWNER = "92a3b4c5-d6e7-4f8a-9b1c-2e3f4a5b6c7d";
const SUCCESS_ROUTE_OWNER = "a3b4c5d6-e7f8-4a9b-8c2d-3e4f5a6b7c8e";

const waterInput: AddToCartInput = {
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

const cappuccinoInput: AddToCartInput = {
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [
    {
      optionTypeId: "b2e1a4c3-8f7d-4a2b-9c6e-1d3f5a7b9c2d",
      optionValueId: "e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
      optionValueLabel: "Large",
    },
  ],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 1,
};

function setLandscape() {
  const frame = { width: 1024, height: 768, scale: 1, fontScale: 1 };
  Dimensions.set({ window: frame, screen: frame });
}

/** The layout renders an expo-router Stack, so its mount contract is pinned from source. */
const LAYOUT_PATH = resolve(__dirname, "../../../app/(customer)/_layout.tsx");

function importSpecifiers(source: string): string[] {
  const fromImports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
  const sideEffectImports = [...source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  return [...fromImports, ...sideEffectImports].filter(
    (specifier): specifier is string => typeof specifier === "string",
  );
}

function QuickCartOutsideProbe() {
  useQuickCart();
  return null;
}

/** Consumes the context the way AddToCartButton and the affordance do. */
function QuickCartProbe({ addedLineId }: { addedLineId?: string }) {
  const { open, openQuickCart, closeQuickCart } = useQuickCart();
  return (
    <View>
      <Text>child-probe</Text>
      <Text>{`open:${open}`}</Text>
      <Button onPress={() => openQuickCart(addedLineId)}>
        <Text>Open Quick Cart</Text>
      </Button>
      <Button onPress={() => closeQuickCart()}>
        <Text>Close Quick Cart</Text>
      </Button>
    </View>
  );
}

/**
 * Auth-gated like the (customer) group, with a header-action host standing in
 * for the catalog shell's chrome.
 */
function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <CatalogCartProvider>
      <HeaderActionHost />
      {children}
    </CatalogCartProvider>
  );
}

const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderProvider(children: ReactNode, ownerId: string) {
  setLandscape();
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  return renderWithProviders(<AuthedHarness>{children}</AuthedHarness>, { withAuth: true });
}

async function waitForCartRestored(ownerId: string) {
  await waitFor(() => {
    expect(getCartSnapshot()).toMatchObject({ hydrated: true, ownerId });
  });
}

beforeEach(async () => {
  setLogSink(() => {});
  jest.clearAllMocks();
  mockPathname.current = "/products";
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("useQuickCart (context contract)", () => {
  it("throws when called outside the provider", async () => {
    // React logs the render error before re-throwing it; keep the suite silent.
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
  it("renders its children", async () => {
    await renderProvider(<Text>child-probe</Text>, SHEET_OWNER);

    expect(await screen.findByText("child-probe")).toBeOnTheScreen();
  });

  it("openQuickCart opens the quick cart; closeQuickCart closes it", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, SHEET_OWNER);
    await waitForCartRestored(SHEET_OWNER);
    expect(screen.getByText("open:false")).toBeOnTheScreen();
    expect(screen.queryByText("Your cart")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));

    expect(screen.getByText("open:true")).toBeOnTheScreen();
    expect(await screen.findByText("Your cart")).toBeOnTheScreen();
    expect(screen.getByText("Nothing here yet.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Review cart" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Close Quick Cart" }));

    await waitFor(() => expect(screen.queryByText("Your cart")).toBeNull());
    expect(screen.getByText("open:false")).toBeOnTheScreen();
  });

  it("the sheet's own Keep browsing closes it", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, CLOSE_OWNER);
    await waitForCartRestored(CLOSE_OWNER);

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await user.press(await screen.findByRole("button", { name: "Keep browsing" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Keep browsing" })).toBeNull());
    expect(screen.getByText("open:false")).toBeOnTheScreen();
  });

  it("Review cart closes on /cart, retains the cart, and can reopen after browsing", async () => {
    const user = userEvent.setup();
    const view = await renderProvider(<QuickCartProbe />, REVIEW_OWNER);
    await waitForCartRestored(REVIEW_OWNER);
    await act(async () => {
      addItem(waterInput);
    });

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await user.press(await screen.findByRole("button", { name: "Review cart" }));

    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigate).toHaveBeenCalledWith("/(customer)/cart");
    expect(mockRouter.push).not.toHaveBeenCalled();
    const linesBeforeNavigation = getCartSnapshot().lines;

    mockPathname.current = "/cart";
    await view.rerender(
      <AuthedHarness>
        <QuickCartProbe />
      </AuthedHarness>,
    );

    expect(screen.queryByText("Your cart")).toBeNull();
    expect(screen.getByText("open:false")).toBeOnTheScreen();
    expect(getCartSnapshot().lines).toEqual(linesBeforeNavigation);

    mockPathname.current = "/products";
    await view.rerender(
      <AuthedHarness>
        <QuickCartProbe />
      </AuthedHarness>,
    );

    expect(screen.queryByText("Your cart")).toBeNull();
    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    expect(await screen.findByText("Your cart")).toBeOnTheScreen();
    expect(screen.getByText("1 item · 1 selection")).toBeOnTheScreen();
    expect(getCartSnapshot().lines).toEqual(linesBeforeNavigation);
  });

  it("closes the quick cart when the route changes", async () => {
    const user = userEvent.setup();
    const view = await renderProvider(<QuickCartProbe />, ROUTE_CHANGE_OWNER);
    await waitForCartRestored(ROUTE_CHANGE_OWNER);

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    expect(await screen.findByText("Your cart")).toBeOnTheScreen();

    mockPathname.current = "/product-detail";
    await view.rerender(
      <AuthedHarness>
        <QuickCartProbe />
      </AuthedHarness>,
    );

    await waitFor(() => expect(screen.queryByText("Your cart")).toBeNull());
    expect(screen.getByText("open:false")).toBeOnTheScreen();
  });

  it("a line added while the sheet is open appears in it", async () => {
    const user = userEvent.setup();
    await renderProvider(<QuickCartProbe />, ADD_OWNER);
    await waitForCartRestored(ADD_OWNER);

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    await screen.findByText("Nothing here yet.");

    await act(async () => {
      addItem(cappuccinoInput);
    });

    expect(screen.getAllByText("Cappuccino").length).toBeGreaterThan(0);
    expect(screen.getByText("1 item · 1 selection")).toBeOnTheScreen();
  });

  it("leads with the line the opener names as just added", async () => {
    const user = userEvent.setup();
    const waterLineId = waterInput.variantId;
    await renderProvider(<QuickCartProbe addedLineId={waterLineId} />, ADDED_OWNER);
    await waitForCartRestored(ADDED_OWNER);
    await act(async () => {
      addItem(cappuccinoInput);
      addItem(waterInput);
    });

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));

    expect(await screen.findByText("Added to your cart")).toBeOnTheScreen();
    expect(screen.getByText("Also in your cart")).toBeOnTheScreen();
  });
});

describe("CatalogCartProvider — cart affordance placement", () => {
  it("places the cart affordance in the header slot on a browsing route", async () => {
    await renderProvider(<Text>child-probe</Text>, AFFORDANCE_OWNER);

    expect(await screen.findByRole("button", { name: "Open cart" })).toBeOnTheScreen();
  });

  it("places the cart affordance on Help Me Choose, a browsing route", async () => {
    mockPathname.current = "/help-me-choose";
    await renderProvider(<Text>child-probe</Text>, AFFORDANCE_OWNER);

    expect(await screen.findByRole("button", { name: "Open cart" })).toBeOnTheScreen();
  });

  it('on "/cart", shows neither the affordance nor the quick cart, even if a child asks', async () => {
    const user = userEvent.setup();
    mockPathname.current = "/cart";
    await renderProvider(<QuickCartProbe />, CART_ROUTE_OWNER);

    expect(await screen.findByText("child-probe")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Open cart" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Open Quick Cart" }));
    expect(screen.queryByText("Your cart")).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep browsing" })).toBeNull();
  });

  it.each([
    ["/checkout", CHECKOUT_ROUTE_OWNER],
    ["/checkout-success", SUCCESS_ROUTE_OWNER],
  ])("hides the affordance on %s", async (pathname, ownerId) => {
    mockPathname.current = pathname;
    await renderProvider(<Text>route-probe</Text>, ownerId);

    expect(await screen.findByText("route-probe")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Open cart" })).toBeNull();
  });
});

describe("customer layout mount", () => {
  it("wraps the Stack in CheckoutGate and CatalogCartProvider, importing only public indexes", () => {
    const layoutSource = readFileSync(LAYOUT_PATH, "utf8");
    const specifiers = importSpecifiers(layoutSource);

    expect(specifiers).toContain("@/features/catalog-cart-integration");
    expect(layoutSource).toContain("<CatalogCartProvider>");
    expect(specifiers).toContain("@/features/checkout");
    expect(layoutSource).toContain("<CheckoutGate>");

    const sanctioned = new Set([
      "expo-router",
      "react-native",
      "@/design-system",
      "@/features/catalog-cart-integration",
      "@/features/checkout",
      "@/features/release-notes",
    ]);
    expect(specifiers.filter((specifier) => !sanctioned.has(specifier))).toEqual([]);
  });
});
