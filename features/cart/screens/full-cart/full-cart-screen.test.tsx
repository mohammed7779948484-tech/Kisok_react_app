import { readFileSync } from "fs";
import { resolve } from "path";

import { Dimensions } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { act, renderWithProviders, screen, userEvent } from "@/core/testing";

import CartRoute from "@/app/(customer)/cart";
import type { CartLine } from "../../model/cart-line.schema";
import { useCartStore, type PersistenceStatus } from "../../state/cart-store";
import { FullCartScreen } from "./full-cart-screen";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The icons are decorative
 * SVGs here — the screen's accessible names come from text and the buttons'
 * `accessibilityLabel`s — so minimal stand-ins keep this a test of the screen
 * contract, not of lucide's renderer. ImageOff is AppImage's fallback icon;
 * ShoppingCart is the empty state's icon.
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

/**
 * The Full Cart screen owns its empty-state navigation (plan decision 13), so
 * it calls `useRouter()` from expo-router. There is no repo precedent for
 * testing that (probed: no test mocks expo-router; no feature screen calls
 * useRouter yet — features/auth's screens navigate only through the root Stack
 * layout), and the real router needs a full navigation container. This is the
 * sanctioned fallback: a minimal, documented module mock in the standardized
 * lucide-mock style. `useRouter` returns one stable router whose `push` is a
 * jest.fn the tests assert against. The `mock` prefix keeps the reference
 * inside jest's factory allowlist, and the factory only closes over it —
 * `useRouter` is called at render time, well after module init — so hoisting
 * is safe.
 */
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const OWNER = "11111111-2222-4333-8444-555555555555";

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

/** A populated line with an image and two ordered option selections. */
const cappuccinoLine: CartLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|e5d3c8a1|1a2b3c4d",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

/** A plain line: no options, no image — exercises AppImage's fallback. */
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

/**
 * Which presentation a test exercises follows `useLayout()` →
 * `useWindowDimensions()` — the SafeAreaProvider `initialMetrics` in
 * core/testing/render.tsx drive INSETS only, not the layout size. The jest
 * window actually defaults to 750×1334 (compact portrait), so every test sets
 * its frame BEFORE rendering: 1024×768 → tablet landscape (this suite's
 * default), 480×900 → compact portrait. Setting the frame before render
 * means no mounted tree reacts to the change.
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
 * Store control, the sanctioned pattern (see state/sign-out-cleanup.test.ts):
 * the screen reads the SINGLETON `useCartStore`, so tests place state with real
 * zustand `setState` and reset it between tests — no mock framework involved.
 */
function resetCartSingleton() {
  useCartStore.setState({
    lines: [],
    ownerId: null,
    persistence: "unknown",
    hydrated: false,
    locked: false,
  });
}

function seedCart(
  lines: CartLine[],
  {
    persistence = "persisted",
    locked = false,
  }: { persistence?: PersistenceStatus; locked?: boolean } = {},
) {
  useCartStore.setState({ lines, ownerId: OWNER, persistence, locked, hydrated: true });
}

/**
 * The rows' store mutations persist fire-and-forget; settle the write queue
 * inside act so its honest status update can never land outside it.
 */
async function settleDurableWrites() {
  await act(async () => {
    await useCartStore.getState().persistNow();
  });
}

/**
 * `clearCart()`'s durable clear is fire-and-forget too; one macrotask turn
 * lets the serialized remove→fallback chain settle and report its honest
 * status inside act.
 */
async function settleDurableClear() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function renderScreen(frame: Frame = LANDSCAPE) {
  setFrame(frame);
  return renderWithProviders(<FullCartScreen />);
}

/** The generated thin route, pinned statically as well as rendered. */
const ROUTE_PATH = resolve(__dirname, "../../../../app/(customer)/cart.tsx");

/** Every module specifier the route source imports (from-imports and side-effect imports). */
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
 * Behaviour and accessibility, not styling: the Full Cart screen is the cart's
 * routed management surface (AC-11), so the contract that matters is what the
 * single cart store renders through the real Screen/ScrollView/footer
 * composition — restore-pending, empty with an escape, populated rows with a
 * selector-derived summary, honest persistence, lock, and a confirmed clear.
 * The real Screen, CartItemRow (with its real ConfirmDialog), QuantityStepper,
 * EmptyState, SkeletonList, Alert, Button and Text are driven unmocked; only
 * lucide's icon renderer and expo-router's `useRouter` are stubbed (documented
 * above). Conventions follow quick-cart-sheet.test.tsx (T08) verbatim.
 */
describe("FullCartScreen", () => {
  beforeEach(() => {
    // Store mutations and the persistence paths log by design; keep the suite
    // silent, per the repo convention.
    setLogSink(() => {});
    resetCartSingleton();
    mockRouterPush.mockClear();
  });
  afterEach(resetLogging);

  it("renders the restore-pending skeleton — no rows, no empty state, no summary guess", async () => {
    // resetCartSingleton() left the store restore-pending: hydrated=false.
    await renderScreen();

    expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
    expect(screen.queryByText("Cappuccino")).toBeNull();
    expect(screen.queryByText("Your cart is empty")).toBeNull();
    expect(screen.queryByRole("button", { name: "Browse Products" })).toBeNull();
    // No footer or summary before the restore lands — guessing totals from an
    // unrestored cart would be dishonest.
    expect(screen.queryByRole("button", { name: "Clear Cart" })).toBeNull();
  });

  it("renders the empty state, and Browse Products navigates to the customer root", async () => {
    seedCart([]);
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.getByText("Items you add while browsing will appear here.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Browse Products" })).toBeOnTheScreen();
    // `persisted` renders NO alert (R-T08-03 pattern): the exact inverse of
    // the memoryOnly/clearFailed tests below. The Alert's
    // accessibilityRole="alert" is not role-queryable under this RNTL build
    // (T08 carry-forward), so the inverse pins the alert copy, exactly as
    // those tests positively query it.
    expect(screen.queryByText("Saved in memory only")).toBeNull();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();

    await user.press(screen.getByRole("button", { name: "Browse Products" }));
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
  });

  it("renders every line with a selector-derived summary, and a stepper press mutates the real store", async () => {
    seedCart([cappuccinoLine, waterLine]);
    const user = userEvent.setup();
    await renderScreen();

    // Each line renders through the shared CartItemRow.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Sparkling Water" })).toBeOnTheScreen();
    // Summary derived through the T04 selectors from the SAME cart model:
    // 2 + 1 = 3 total quantity across 2 distinct lines — never a mirror.
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
    // The footer's clear affordance is present.
    expect(screen.getByRole("button", { name: "Clear Cart" })).toBeOnTheScreen();
    // `persisted` renders NO alert (R-T08-03) — inverse of the warning tests.
    expect(screen.queryByText("Saved in memory only")).toBeNull();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();

    // Stateful: the rows are wired straight into the store's actions. Rows
    // render in store order, so index 1 is Sparkling Water's stepper.
    const increaseButtons = screen.getAllByRole("button", { name: "Increase quantity" });
    expect(increaseButtons).toHaveLength(2);
    const waterIncrease = increaseButtons[1];
    if (waterIncrease === undefined) {
      throw new Error("expected one Increase quantity button per row");
    }
    await user.press(waterIncrease);
    await settleDurableWrites();

    // The screen wired the row straight into the store's actions — the
    // assertion is the store's own state, not a callback prop.
    expect(useCartStore.getState().lines).toEqual([cappuccinoLine, { ...waterLine, quantity: 2 }]);
    expect(screen.getAllByLabelText("Quantity: 2")).toHaveLength(2);
  });

  it("removes a line end-to-end: row remove → real confirm dialog → store line removed", async () => {
    seedCart([cappuccinoLine]);
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByRole("button", { name: "Remove Cappuccino" }));
    // The row's own real ConfirmDialog is open and destructive.
    expect(screen.getByRole("heading", { name: "Remove Cappuccino?" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Remove" }));
    await settleDurableWrites();

    expect(useCartStore.getState().lines).toEqual([]);
    expect(screen.queryByText("Cappuccino")).toBeNull();
    // The screen reacts to the store: removing the last line reveals the
    // empty state (and, with it, the footer-less presentation).
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
  });

  it("renders the memoryOnly persistence warning (AC-06)", async () => {
    seedCart([waterLine], { persistence: "memoryOnly" });
    await renderScreen();

    expect(screen.getByText("Saved in memory only")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "We couldn't save your cart to this tablet, so it may be lost if the app closes.",
      ),
    ).toBeOnTheScreen();
    // The warning coexists with the cart itself, and the safety issue is not
    // conflated with it.
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();
  });

  it("renders the clearFailed persistence status as a destructive alert, never a memory-only warning", async () => {
    seedCart([waterLine], { persistence: "clearFailed" });
    await renderScreen();

    expect(screen.getByText("Couldn't clear the saved cart")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "A previous cart may still be stored on this tablet. Please let store staff know.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Saved in memory only")).toBeNull();
  });

  it("locks the row controls AND the Clear Cart trigger while the cart is locked", async () => {
    seedCart([cappuccinoLine], { locked: true });
    await renderScreen();

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeDisabled();
    // The user-driven clear is disabled mid-lock too (AC-09): the store-level
    // clear exemption exists for the PROGRAMMATIC post-checkout path, not for
    // a user clearing while a critical operation runs.
    expect(screen.getByRole("button", { name: "Clear Cart" })).toBeDisabled();
  });

  it("keeps the empty state's escape enabled while locked — the lock blocks cart edits, not movement", async () => {
    seedCart([], { locked: true });
    await renderScreen();

    expect(screen.getByRole("button", { name: "Browse Products" })).not.toBeDisabled();
  });

  it("clears the cart end-to-end: Clear Cart → real confirm dialog → store emptied durably", async () => {
    // Seeded memoryOnly so the honest post-clear status transition is
    // discriminating: a successful durable clear reports `persisted`.
    seedCart([cappuccinoLine, waterLine], { persistence: "memoryOnly" });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByRole("button", { name: "Clear Cart" }));
    // The shared ConfirmDialog is open and destructive.
    expect(screen.getByRole("heading", { name: "Clear the cart?" })).toBeOnTheScreen();
    expect(
      screen.getByText("All items will be removed from your cart. This can't be undone."),
    ).toBeOnTheScreen();

    // Cancel is the safe path: nothing is cleared.
    await user.press(screen.getByRole("button", { name: "Cancel" }));
    expect(useCartStore.getState().lines).toEqual([cappuccinoLine, waterLine]);

    await user.press(screen.getByRole("button", { name: "Clear Cart" }));
    await user.press(screen.getByRole("button", { name: "Remove All" }));

    // Memory clears immediately; the durable clear settles and reports
    // honestly (persisted — NOT a silent failure).
    expect(useCartStore.getState().lines).toEqual([]);
    await settleDurableClear();
    expect(useCartStore.getState().persistence).toBe("persisted");
    // The screen reacts to the store: the empty state replaces the rows, and
    // the standing warning is gone because the clear succeeded durably.
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.queryByText("Saved in memory only")).toBeNull();
  });

  it("renders the same cart content at the compact portrait frame (480×900)", async () => {
    seedCart([waterLine]);
    await renderScreen(COMPACT);

    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByText("1 item · 1 line")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear Cart" })).toBeOnTheScreen();
  });

  it("renders the same cart content at the tablet landscape frame (1024×768)", async () => {
    seedCart([waterLine]);
    await renderScreen(LANDSCAPE);

    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByText("1 item · 1 line")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear Cart" })).toBeOnTheScreen();
  });
});

describe("/cart route", () => {
  beforeEach(() => {
    setLogSink(() => {});
    resetCartSingleton();
    mockRouterPush.mockClear();
  });
  afterEach(resetLogging);

  it("renders the Full Cart screen through the feature's public index export", async () => {
    seedCart([waterLine]);
    setFrame(LANDSCAPE);
    await renderWithProviders(<CartRoute />);

    // Real screen content, not just "it mounts": a seeded line, its summary,
    // and the footer's clear affordance all appear through @/features/cart.
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("1 item · 1 line")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear Cart" })).toBeOnTheScreen();
  });

  it("stays thin: the route imports the public index and nothing but sanctioned necessities", () => {
    const routeSource = readFileSync(ROUTE_PATH, "utf8");
    const specifiers = importSpecifiers(routeSource);

    // The route-gen wiring: the screen arrives through the feature's public
    // API, not a deep import.
    expect(specifiers).toContain("@/features/cart");
    // Anything beyond the public index must be a thin-route necessity
    // (react / react-native / expo-router e.g. for route params) — never a
    // store, never Supabase, never a deep feature import: those fail here
    // AND at the app/** ESLint boundary.
    const sanctioned = new Set(["@/features/cart", "react", "react-native", "expo-router"]);
    expect(specifiers.filter((specifier) => !sanctioned.has(specifier))).toEqual([]);
  });
});
