import type { ReactNode } from "react";
import { Dimensions, Text } from "react-native";

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
import { HeaderActionHost } from "@/design-system";
import { getCartSnapshot, lockCart, type CartLine } from "@/features/cart";

import { CatalogCartProvider } from "./catalog-cart-provider";

/**
 * The cart affordance has no standalone life: the real provider places it in
 * the catalog chrome's header-action slot while browsing, so every test mounts
 * it that way — inside the provider, behind the auth gate, with a
 * `HeaderActionHost` standing in for the catalog shell's header.
 */
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/products",
}));

const KEY = storageKey("cart", "lines");

/**
 * One owner per test: the cart restores once per customer, so a fresh owner
 * makes each test's mount really read storage.
 */
const EMPTY_OWNER = "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c";
const SEEDED_OWNER = "a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9c0d";
const PRESS_OWNER = "b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1e";
const COMPACT_OWNER = "c9d0e1f2-a3b4-4c5d-9e6f-7a8b9c0d1e2f";
const LOCKED_OWNER = "d0e1f2a3-b4c5-4d6e-8f7a-8b9c0d1e2f3a";

const waterLine: CartLine = {
  lineId: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
  variantId: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
  productId: "8b9c0d1e-2f3a-4b4c-9d5e-6f7a8b9c0d1e",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 2,
};

const cappuccinoLine: CartLine = {
  lineId: "9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  variantId: "9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f",
  productId: "0d1e2f3a-4b5c-4d6e-8f7a-8b9c0d1e2f3a",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [],
  imageUri: null,
  quantity: 3,
};

type Frame = { width: number; height: number };
const LANDSCAPE: Frame = { width: 1024, height: 768 };
const COMPACT: Frame = { width: 480, height: 900 };

function setFrame({ width, height }: Frame) {
  Dimensions.set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CatalogCartProvider>{children}</CatalogCartProvider>;
}

const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderAffordance(
  ownerId: string,
  { frame = LANDSCAPE, lines = [] as CartLine[] }: { frame?: Frame; lines?: CartLine[] } = {},
) {
  setFrame(frame);
  if (lines.length > 0) {
    await storage.write(KEY, { version: 1, ownerId, lines });
  }
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  const view = await renderWithProviders(
    <AuthedHarness>
      <HeaderActionHost />
      <Text>child-probe</Text>
    </AuthedHarness>,
    { withAuth: true },
  );
  // The cart restores itself for the signed-in customer (useCart owns it).
  await waitFor(() => {
    expect(getCartSnapshot()).toMatchObject({ hydrated: true, ownerId });
  });
  return view;
}

beforeEach(async () => {
  setLogSink(() => {});
  jest.clearAllMocks();
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("CartAccessButton", () => {
  it("is named 'Open cart' with no count while the cart is empty", async () => {
    await renderAffordance(EMPTY_OWNER);

    const affordance = screen.getByRole("button", { name: "Open cart" });
    expect(affordance).toBeOnTheScreen();
    expect(affordance).not.toBeDisabled();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("carries the cart's item count in its name and as visible text", async () => {
    await renderAffordance(SEEDED_OWNER, { lines: [waterLine, cappuccinoLine] });

    expect(screen.getByRole("button", { name: "Open cart, 5 items" })).toBeOnTheScreen();
    expect(screen.getByText("5")).toBeOnTheScreen();
  });

  it("opens the quick cart and changes nothing in the cart", async () => {
    const user = userEvent.setup();
    await renderAffordance(PRESS_OWNER, { lines: [waterLine, cappuccinoLine] });
    const before = getCartSnapshot();

    await user.press(screen.getByRole("button", { name: "Open cart, 5 items" }));

    expect(await screen.findByText("Your cart")).toBeOnTheScreen();
    expect(screen.getByText("5 items · 2 selections")).toBeOnTheScreen();
    expect(screen.getAllByText("Sparkling Water").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cappuccino").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Keep browsing" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Review cart" })).toBeOnTheScreen();
    expect(getCartSnapshot()).toEqual(before);
  });

  it("works the same on a narrow portrait screen", async () => {
    const user = userEvent.setup();
    await renderAffordance(COMPACT_OWNER, { frame: COMPACT, lines: [waterLine, cappuccinoLine] });

    await user.press(screen.getByRole("button", { name: "Open cart, 5 items" }));

    expect(await screen.findByText("Your cart")).toBeOnTheScreen();
    expect(screen.getByText("5 items · 2 selections")).toBeOnTheScreen();
  });

  it("still opens the read-only preview while the cart is locked", async () => {
    const user = userEvent.setup();
    await renderAffordance(LOCKED_OWNER, { lines: [waterLine] });
    await act(async () => {
      lockCart();
    });

    const affordance = screen.getByRole("button", { name: "Open cart, 2 items" });
    expect(affordance).not.toBeDisabled();
    await user.press(affordance);

    expect(await screen.findByText("Your cart")).toBeOnTheScreen();
    expect(screen.getByText("2 items · 1 selection")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Increase quantity" })).toBeNull();
  });
});
