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
import { getCartSnapshot, lockCart, type CartLine } from "@/features/cart";

import { CatalogCartProvider } from "./catalog-cart-provider";

/**
 * Behaviour of the persistent cart affordance (plan decision 5; brief AC-06,
 * AC-10's affordance share).
 *
 * The affordance has no props and no standalone life: it is rendered by the
 * REAL T02 `CatalogCartProvider` (whose `usePathname` gate keeps it off
 * `/cart` — pinned in the provider suite), so every test here exercises it
 * exactly the way the customer layout mounts it: inside the provider, behind
 * the real auth gate, with the provider's mounted `useCart()` as the ONE
 * hydration owner. The real single cart store is driven through the public
 * surface only (`getCartSnapshot`, `lockCart`, and the durable envelope the
 * provider's own hydrate() restores); per-test owner ids plus the store's
 * owner-switch reset re-baseline memory between tests — the T03 button
 * suite's pattern, followed deliberately.
 *
 * The contract under test: a 48dp icon button whose accessible name carries
 * the live count ("Open cart" / "Open cart, 5 items" — the one deliberate
 * naming approach), a text-carrying Badge only when the count is > 0, and a
 * press that opens the real QuickCartSheet while mutating NOTHING — the
 * affordance is browsing movement, never a cart write.
 */

/**
 * The provider calls `useRouter()` (View Full Cart intent) and `usePathname()`
 * (the affordance's `/cart` gate) from expo-router, so rendering the real
 * provider needs the module mocked — the T02/T03 suites' minimal mock: one
 * stable router whose `push` is a jest.fn, plus a controllable pathname. The
 * `mock` prefix keeps the references inside jest's factory allowlist.
 */
const mockRouterPush = jest.fn();
const mockPathname: { current: string } = { current: "/products" };
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => mockPathname.current,
}));

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The affordance renders the
 * ShoppingCart icon and the provider's sheet graph renders the rest; the
 * standardized null-rendering stand-ins keep this a test of the affordance's
 * contract (see the cart, provider and button suites).
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
 * One unique owner id per test: the store's owner-switch reset inside
 * hydrate() then re-baselines memory between tests, using only the public
 * surface.
 */
const EMPTY_OWNER = "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c";
const SEEDED_OWNER = "a7b8c9d0-e1f2-4a3b-9c4d-5e6f7a8b9c0d";
const PRESS_OWNER = "b8c9d0e1-f2a3-4b4c-8d5e-6f7a8b9c0d1e";
const COMPACT_OWNER = "c9d0e1f2-a3b4-4c5d-9e6f-7a8b9c0d1e2f";
const LOCKED_OWNER = "d0e1f2a3-b4c5-4d6e-8f7a-8b9c0d1e2f3a";

/** A plain persisted line, quantity 2 — half of the seeded 5-item cart. */
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

/** The other half — a distinct line, quantity 3. */
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

/**
 * Which AdaptiveSheet presentation a test exercises is decided by
 * `useLayout()` → `useWindowDimensions()`; setting the frame BEFORE render
 * means no mounted tree reacts to the change (the provider suite's pattern).
 * 1024×768 → expanded landscape side panel; 480×900 → compact portrait
 * bottom sheet.
 */
type Frame = { width: number; height: number };
const LANDSCAPE: Frame = { width: 1024, height: 768 };
const COMPACT: Frame = { width: 480, height: 900 };

function setFrame({ width, height }: Frame) {
  Dimensions.set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

/**
 * Gates the provider on auth readiness, exactly as the app does: the (customer)
 * group only mounts under `ready && profile?.role === "customer"`, and the
 * affordance's `useCart()` → `useActiveProfile()` throwing outside
 * authenticated surfaces is core/auth's contract (the provider/button suites'
 * AuthedHarness pattern).
 */
function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CatalogCartProvider>{children}</CatalogCartProvider>;
}

/** installMockAuth restored after every test — the provider suite's holder pattern. */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

/**
 * Renders the affordance the only way it exists: inside the real provider,
 * behind the real auth gate, with an optional durable envelope seeded BEFORE
 * mount so the provider's own hydrate() is the only thing that restores it.
 */
async function renderAffordance(
  ownerId: string,
  { frame = LANDSCAPE, lines = [] as CartLine[] }: { frame?: Frame; lines?: CartLine[] } = {},
) {
  setFrame(frame);
  if (lines.length > 0) {
    await storage.write(KEY, { version: 1, ownerId, lines });
  }
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  return renderWithProviders(
    <AuthedHarness>
      <Text>child-probe</Text>
    </AuthedHarness>,
    { withAuth: true },
  );
}

/** Waits until the provider's mounted hydration has landed for this owner. */
async function waitForHydration(ownerId: string) {
  await waitFor(() => {
    const snapshot = getCartSnapshot();
    expect(snapshot.hydrated).toBe(true);
    expect(snapshot.ownerId).toBe(ownerId);
  });
}

/**
 * jsdom-style px measurement is not available under jest-expo's
 * react-test-renderer (no layout pass), and the repo convention forbids
 * asserting NativeWind's resolved styles — so the 48dp contract is pinned at
 * the class level: the touch target comes from the Button primitive's
 * `size="icon"` variant, whose classes are exactly `h-touch w-touch`.
 */
function pinTouchTarget(affordance: { props: { className?: unknown } }) {
  const sizeClasses = String(affordance.props.className ?? "");
  expect(sizeClasses).toContain("h-touch");
  expect(sizeClasses).toContain("w-touch");
}

beforeEach(async () => {
  // The store's mutation and hydration paths log by design; keep the suite
  // silent per the repo convention.
  setLogSink(() => {});
  mockRouterPush.mockClear();
  mockPathname.current = "/products";
  // Disk hygiene: hydrate() reads this key, so a previous test's envelope must
  // not leak into this one's restore. Through the app's own API.
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("CartAccessButton", () => {
  it("renders with its deliberate accessible name and NO badge while the cart is empty", async () => {
    await renderAffordance(EMPTY_OWNER);
    await waitForHydration(EMPTY_OWNER);
    expect(getCartSnapshot().totalQuantity).toBe(0);

    // The one deliberate naming approach: "Open cart" when empty — the icon is
    // decorative, the label is the whole name.
    const affordance = screen.getByRole("button", { name: "Open cart" });
    expect(affordance).toBeOnTheScreen();
    pinTouchTarget(affordance);
    expect(affordance).not.toBeDisabled();

    // Zero items render NO badge (the button alone signals the honest empty
    // case — opening it shows the empty state). No stray "0" text anywhere.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("derives its badge from the single cart model: 2 lines / 5 items render the text '5'", async () => {
    await renderAffordance(SEEDED_OWNER, { lines: [waterLine, cappuccinoLine] });
    await waitForHydration(SEEDED_OWNER);

    // The count is the store's own totalQuantity — never a mirrored value.
    expect(getCartSnapshot().totalQuantity).toBe(5);
    expect(getCartSnapshot().distinctLineCount).toBe(2);

    // The accessible name carries the same count (the deliberate approach)…
    const affordance = screen.getByRole("button", { name: "Open cart, 5 items" });
    expect(affordance).toBeOnTheScreen();
    pinTouchTarget(affordance);

    // …and the badge carries it as TEXT (never colour-only).
    expect(screen.getByText("5")).toBeOnTheScreen();
  });

  it("pressing it opens the real QuickCartSheet and mutates nothing in the store", async () => {
    const user = userEvent.setup();
    await renderAffordance(PRESS_OWNER, { lines: [waterLine, cappuccinoLine] });
    await waitForHydration(PRESS_OWNER);

    const before = getCartSnapshot();

    await user.press(screen.getByRole("button", { name: "Open cart, 5 items" }));

    // The real sheet renders through the provider's controlled open state:
    // the live total, both seeded lines, and both footer intents.
    expect(await screen.findByRole("heading", { name: "Your Cart · 5" })).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "View Full Cart" })).toBeOnTheScreen();

    // Browsing movement only: the single cart model is bit-for-bit unchanged.
    const after = getCartSnapshot();
    expect(after).toEqual(before);
  });

  it("renders and opens the sheet at the compact portrait frame (480×900) too", async () => {
    const user = userEvent.setup();
    await renderAffordance(COMPACT_OWNER, {
      frame: COMPACT,
      lines: [waterLine, cappuccinoLine],
    });
    await waitForHydration(COMPACT_OWNER);

    // Same affordance, same name, same 48dp target classes in the compact
    // frame — the placement is provider-owned and orientation-independent.
    const affordance = screen.getByRole("button", { name: "Open cart, 5 items" });
    expect(affordance).toBeOnTheScreen();
    pinTouchTarget(affordance);

    await user.press(affordance);
    expect(await screen.findByRole("heading", { name: "Your Cart · 5" })).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
  });

  it("still opens the sheet while the cart is locked — the sheet's own rows render disabled", async () => {
    const user = userEvent.setup();
    await renderAffordance(LOCKED_OWNER, { lines: [waterLine] });
    await waitForHydration(LOCKED_OWNER);

    // A real lock through the public action — the future Checkout path. The
    // affordance itself NEVER disables: opening the cart is browsing
    // movement, and the lock blocks cart edits, not movement.
    await act(async () => {
      lockCart();
    });

    const affordance = screen.getByRole("button", { name: "Open cart, 2 items" });
    expect(affordance).not.toBeDisabled();

    await user.press(affordance);

    // The sheet opens with its content, and the row's mutation control is
    // honestly disabled inside it — the cart's own lock contract, surfacing
    // through the real sheet.
    expect(await screen.findByRole("heading", { name: "Your Cart · 2" })).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });
});
