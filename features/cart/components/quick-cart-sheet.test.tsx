import { Dimensions } from "react-native";

import { AdaptiveSheetDescription } from "@/components/ui";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, renderWithProviders, screen, userEvent, within } from "@/core/testing";

import type { CartLine } from "../model/cart-line.schema";
import { useCartStore, type PersistenceStatus } from "../state/cart-store";
import { QuickCartSheet, type QuickCartSheetProps } from "./quick-cart-sheet";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The icons are decorative
 * SVGs here — the sheet's accessible names come from text and the buttons'
 * `accessibilityLabel`s — so minimal stand-ins keep this a test of the sheet
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
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
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
 * The sheet's dialog description (H-F03): the screen-reader-useful line that
 * names what the surface is for. The Title already carries the live count, so
 * the description deliberately does not duplicate it.
 */
const QUICK_CART_DESCRIPTION = "Review the items in your cart, or continue shopping.";

/**
 * Which AdaptiveSheet presentation a test exercises is decided by
 * `useLayout()` → `useWindowDimensions()` — the SafeAreaProvider
 * `initialMetrics` in core/testing/render.tsx drive INSETS only, not the
 * layout size. The jest window actually defaults to 750×1334 (compact
 * portrait → bottom sheet), so every test sets its frame BEFORE rendering:
 * 1024×768 → expanded landscape side panel (this suite's default),
 * 480×900 → compact portrait bottom sheet. Setting the frame before render
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
 * the sheet reads the SINGLETON `useCartStore`, so tests place state with real
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

async function renderSheet(props: QuickCartSheetProps, frame: Frame = LANDSCAPE) {
  setFrame(frame);
  return renderWithProviders(<QuickCartSheet {...props} />);
}

/**
 * Behaviour and accessibility, not styling: the quick sheet is the cart's
 * public adaptive surface (AC-10), so the contract that matters is what the
 * single cart store renders through the real AdaptiveSheet primitive —
 * lines, totals, honest persistence, lock — and what its intents report.
 * The real AdaptiveSheet, CartItemRow (with its real ConfirmDialog),
 * QuantityStepper, EmptyState, Alert, Button and Text are driven unmocked;
 * only lucide's icon renderer is stubbed (see the mock above). Conventions
 * follow components/ui/__tests__/button.test.tsx and cart-item-row.test.tsx.
 */
describe("QuickCartSheet", () => {
  beforeEach(() => {
    // Store mutations and the persistence paths log by design; keep the suite
    // silent, per the repo convention.
    setLogSink(() => {});
    resetCartSingleton();
  });
  afterEach(resetLogging);

  it("renders the open sheet: total quantity in the title, every line's row, and both footer intents", async () => {
    seedCart([cappuccinoLine, waterLine]);
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    // The title derives its total through the store's selector: 2 + 1.
    expect(screen.getByRole("heading", { name: "Your Cart · 3" })).toBeOnTheScreen();
    // Each line renders through the shared CartItemRow.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Sparkling Water" })).toBeOnTheScreen();
    // Both footer intents are present.
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "View Full Cart" })).toBeOnTheScreen();
    // `persisted` renders NO alert (R-T08-03): the exact inverse of the
    // memoryOnly/clearFailed assertions below. The Alert's
    // accessibilityRole="alert" is not role-queryable under this RNTL build
    // (probed empirically; same limitation as the T07 dialog carry-forward),
    // so the inverse pins the alert copy, exactly as those tests positively
    // query it.
    expect(screen.queryByText("Saved in memory only")).toBeNull();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();
  });

  it("exposes the AdaptiveSheetDescription member through the shared ui barrel (H-F03)", () => {
    // The Radix DialogContent missing-Description warning fires on the web
    // variant of the dialog primitive; the shared AdaptiveSheet must expose
    // the same Description member its sibling dialog.tsx exports, so no
    // consumer is forced into the warning state. jest-expo resolves the
    // native variant (the warning never fires there), so the jest pin is this
    // member contract plus the rendered description below — the live browser
    // journey owns the zero-warning console evidence.
    expect(typeof AdaptiveSheetDescription).toBe("function");
  });

  it("renders a screen-reader description of the sheet alongside the title", async () => {
    seedCart([waterLine]);
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    expect(screen.getByText(QUICK_CART_DESCRIPTION)).toBeOnTheScreen();
  });

  it("renders the description inside the sheet's dialog content, with the header's title", async () => {
    seedCart([waterLine]);
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    // role="dialog" Views are invisible to ByRole queries under this RNTL
    // build (a View without `accessible` is not an accessibility element —
    // the T07 carry-forward), so locate the sheet's dialog content through the
    // public test-renderer queryAll, then scope the text query inside it: the
    // description must be a descendant of the content the primitive hands to
    // the dialog, where the description belongs (header, under the title).
    const sheetDialogs = screen.root?.queryAll((node) => node.props.role === "dialog") ?? [];
    expect(sheetDialogs).toHaveLength(1);
    const sheetDialog = sheetDialogs[0];
    if (!sheetDialog) {
      throw new Error("Expected the sheet's dialog content to exist");
    }
    expect(within(sheetDialog).getByText(QUICK_CART_DESCRIPTION)).toBeOnTheScreen();
  });

  it("is stateful: a stepper press mutates the real store, and the row re-renders from it", async () => {
    seedCart([waterLine]);
    const user = userEvent.setup();
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await settleDurableWrites();

    // The sheet wired the row straight into the store's actions — the
    // assertion is the store's own state, not a callback prop.
    expect(useCartStore.getState().lines).toEqual([{ ...waterLine, quantity: 2 }]);
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
  });

  it("removes a line end-to-end: row remove → real confirm dialog → store line removed", async () => {
    seedCart([cappuccinoLine]);
    const user = userEvent.setup();
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    await user.press(screen.getByRole("button", { name: "Remove Cappuccino" }));
    // The row's own real ConfirmDialog is open and destructive.
    expect(screen.getByRole("heading", { name: "Remove Cappuccino?" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Remove" }));
    await settleDurableWrites();

    expect(useCartStore.getState().lines).toEqual([]);
    expect(screen.queryByText("Cappuccino")).toBeNull();
    // The sheet reacts to the store: removing the last line reveals the
    // empty state.
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
  });

  it("renders the empty state when the cart has no lines — with the footer as the way forward", async () => {
    seedCart([]);
    await renderSheet({ open: true, onOpenChange: jest.fn() });

    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.getByText("Items you add while browsing will appear here.")).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "Your Cart · 0" })).toBeOnTheScreen();
    expect(screen.queryByText("Cappuccino")).toBeNull();
    // `persisted` renders NO alert here either (R-T08-03) — the same inverse
    // as the populated test, on the empty-state branch.
    expect(screen.queryByText("Saved in memory only")).toBeNull();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
  });

  it("renders the memoryOnly persistence warning (AC-06)", async () => {
    seedCart([waterLine], { persistence: "memoryOnly" });
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

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
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    expect(screen.getByText("Couldn't clear the saved cart")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "A previous cart may still be stored on this tablet. Please let store staff know.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Saved in memory only")).toBeNull();
  });

  it("locks the row controls while the cart is locked, but keeps the navigation intents enabled", async () => {
    seedCart([cappuccinoLine], { locked: true });
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart: jest.fn() });

    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeDisabled();
    // Navigation is not a mutation: the lock must not block it (AC-09).
    expect(screen.getByRole("button", { name: "Continue Shopping" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "View Full Cart" })).not.toBeDisabled();
  });

  it("reports the footer intents: Continue Shopping closes, View Full Cart calls the callback", async () => {
    seedCart([waterLine]);
    const onOpenChange = jest.fn();
    const onViewFullCart = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ open: true, onOpenChange, onViewFullCart });

    await user.press(screen.getByRole("button", { name: "Continue Shopping" }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await user.press(screen.getByRole("button", { name: "View Full Cart" }));
    expect(onViewFullCart).toHaveBeenCalledTimes(1);
  });

  it("omits the View Full Cart button when no onViewFullCart intent is provided", async () => {
    seedCart([waterLine]);
    await renderSheet({ open: true, onOpenChange: jest.fn() });

    expect(screen.queryByRole("button", { name: "View Full Cart" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
  });

  it("renders sheet content only while open (controlled open)", async () => {
    seedCart([waterLine]);
    // Two instances, one open and one closed: the closed one must contribute
    // nothing, so the open sheet's title appears EXACTLY once. (An absence
    // assertion against a single closed sheet would pass vacuously while the
    // component is unbuilt; the pair makes it discriminating.)
    setFrame(LANDSCAPE);
    await renderWithProviders(
      <>
        <QuickCartSheet open onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />
        <QuickCartSheet open={false} onOpenChange={jest.fn()} onViewFullCart={jest.fn()} />
      </>,
    );

    expect(screen.getAllByRole("heading", { name: "Your Cart · 1" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Continue Shopping" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "View Full Cart" })).toHaveLength(1);
  });

  it("shows the same cart content in the compact portrait (bottom sheet) presentation, and its intents work", async () => {
    seedCart([waterLine]);
    const onViewFullCart = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ open: true, onOpenChange: jest.fn(), onViewFullCart }, COMPACT);

    expect(screen.getByRole("heading", { name: "Your Cart · 1" })).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continue Shopping" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "View Full Cart" })).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "View Full Cart" }));
    expect(onViewFullCart).toHaveBeenCalledTimes(1);
  });
});
