import { Dimensions } from "react-native";

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
} from "@/core/testing";
import { Button, Text } from "@/design-system";

import type { CartLine } from "../../model/cart-line.schema";
import { persistedCartSchema } from "../../model/persisted-cart.schema";
import { useCartStore } from "../../state/cart-store";
import { hydrateCart, lockCart, unlockCart } from "../../state/use-cart";
import { FullCartScreen, type FullCartScreenProps } from "./full-cart-screen";

/**
 * The screen navigates with `useRouter()`; the real router needs a full
 * navigation container, so a minimal stand-in records the calls.
 */
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/cart",
  useLocalSearchParams: () => ({}),
}));

/**
 * FlashList's deferred layout work fires real timers that escape `act` and
 * print warnings, so this suite runs on fake timers (the catalog screen tests'
 * convention) and advances them explicitly.
 */
jest.useFakeTimers();

const KEY = storageKey("cart", "lines");

const cappuccinoLine: CartLine = {
  lineId:
    "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
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
    {
      optionTypeId: "c9d8b1f2-4a6e-4c3b-8d9a-2e7f1c5b3a4d",
      optionValueId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      optionValueLabel: "Oat Milk",
    },
  ],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

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
 * `useLayout()` follows the window size, so every test sets its frame before
 * rendering: 1024×768 is tablet landscape (summary rail beside the list),
 * 480×900 is a narrow portrait screen (summary stacked below).
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
 * The singleton remembers which customer it last restored. Parking it on a
 * unique throwaway customer makes each test's screen really restore from
 * storage through its own `useCart()`.
 */
let parkingCounter = 0;
async function resetCart() {
  parkingCounter += 1;
  await hydrateCart(`00000000-0000-4000-8000-${String(parkingCounter).padStart(12, "0")}`);
  await storage.remove(KEY);
}

/** Save a cart for the signed-in customer; the screen's own restore must bring it back. */
async function seedSavedCart(lines: CartLine[]) {
  await storage.write(KEY, { version: 1, ownerId: TEST_PROFILE.id, lines });
}

async function readSavedLines() {
  const result = await storage.read(KEY, (raw) => persistedCartSchema.parse(raw));
  return result.status === "hit" ? result.value.lines : null;
}

/** Let the store's fire-and-forget saves settle inside act. */
async function flushStorage() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

function setupUser() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

/** The (customer) routes only mount once auth has resolved a profile. */
function AuthedCartScreen(props: FullCartScreenProps) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <FullCartScreen {...props} />;
}

async function renderScreen(props: FullCartScreenProps = {}, frame: Frame = LANDSCAPE) {
  setFrame(frame);
  mockAuthHolder.current = installMockAuth();
  return renderWithProviders(<AuthedCartScreen {...props} />, { withAuth: true });
}

/** The trigger, then (once the dialog is open) the dialog's own confirm, share a name. */
function clearCartButtons() {
  return screen.getAllByRole("button", { name: "Clear cart" });
}

describe("FullCartScreen", () => {
  beforeEach(async () => {
    // Ignored edits and storage discards log by design.
    setLogSink(() => {});
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(false);
    await resetCart();
  });
  afterEach(() => {
    resetLogging();
    mockAuthHolder.current?.restore();
    mockAuthHolder.current = null;
  });

  it("shows a skeleton while the saved cart is being read, then the empty state", async () => {
    let releaseCartRead!: () => void;
    const cartReadGate = new Promise<void>((resolve) => {
      releaseCartRead = resolve;
    });
    const realRead = storage.read;
    const readSpy = jest.spyOn(storage, "read").mockImplementation(async (key, parse) => {
      if (key === KEY) await cartReadGate;
      return realRead(key, parse);
    });

    try {
      await renderScreen();

      expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
      expect(screen.queryByText("Your cart is empty")).toBeNull();
      expect(screen.queryByRole("button", { name: "Clear cart" })).toBeNull();

      await act(async () => {
        releaseCartRead();
      });
      expect(await screen.findByText("Your cart is empty")).toBeOnTheScreen();
    } finally {
      readSpy.mockRestore();
    }
  });

  it("restores the signed-in customer's saved cart on its own", async () => {
    await seedSavedCart([cappuccinoLine, waterLine]);

    await renderScreen();

    expect(await screen.findByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getAllByText("Sparkling Water").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove Sparkling Water" })).toBeOnTheScreen();
    expect(useCartStore.getState().ownerId).toBe(TEST_PROFILE.id);
  });

  it("summarises the cart in the landscape rail", async () => {
    await seedSavedCart([cappuccinoLine, waterLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");

    expect(screen.getByLabelText("3 items")).toBeOnTheScreen();
    expect(screen.getAllByText("2 selections").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Clear cart" })).toBeOnTheScreen();
  });

  it("summarises the cart in one line on a narrow portrait screen", async () => {
    await seedSavedCart([waterLine]);
    await renderScreen({}, COMPACT);
    await screen.findByLabelText("Quantity: 1");

    expect(screen.getByText("1 item · 1 selection")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Clear cart" })).toBeOnTheScreen();
  });

  it("empty cart: Browse products and Search lead back to the store", async () => {
    await renderScreen();
    const user = setupUser();

    expect(await screen.findByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Clear cart" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Browse products" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/products");
    await user.press(screen.getByRole("button", { name: "Search" }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith("/search");
  });

  it("Keep browsing goes back when it can, and otherwise to Home", async () => {
    await seedSavedCart([waterLine]);
    await renderScreen();
    await screen.findByLabelText("Quantity: 1");
    const user = setupUser();

    await user.press(screen.getByRole("button", { name: "Keep browsing" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/");

    mockRouter.canGoBack.mockReturnValue(true);
    await user.press(screen.getByRole("button", { name: "Keep browsing" }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it("a stepper press changes the customer's cart and the saved cart", async () => {
    await seedSavedCart([cappuccinoLine, waterLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");
    const user = setupUser();

    const increaseButtons = screen.getAllByRole("button", { name: "Increase quantity" });
    expect(increaseButtons).toHaveLength(2);
    await user.press(increaseButtons[1]!);
    await flushStorage();

    expect(useCartStore.getState().lines).toEqual([cappuccinoLine, { ...waterLine, quantity: 2 }]);
    expect(screen.getAllByLabelText("Quantity: 2")).toHaveLength(2);
    expect(await readSavedLines()).toEqual([cappuccinoLine, { ...waterLine, quantity: 2 }]);
  });

  it("removes a line in one tap and offers to undo it", async () => {
    await seedSavedCart([cappuccinoLine, waterLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");
    const user = setupUser();

    await user.press(screen.getByRole("button", { name: "Remove Cappuccino" }));

    expect(useCartStore.getState().lines).toEqual([waterLine]);
    expect(screen.getByText("Removed Cappuccino")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Remove Cappuccino" })).toBeNull();

    await user.press(screen.getByRole("button", { name: "Undo" }));

    expect(useCartStore.getState().lines).toEqual([waterLine, cappuccinoLine]);
    expect(screen.queryByText("Removed Cappuccino")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeOnTheScreen();
  });

  it("the undo offer goes away on its own after a few seconds", async () => {
    await seedSavedCart([cappuccinoLine, waterLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");

    await setupUser().press(screen.getByRole("button", { name: "Remove Cappuccino" }));
    expect(screen.getByText("Removed Cappuccino")).toBeOnTheScreen();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(6000);
    });
    expect(screen.queryByText("Removed Cappuccino")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(useCartStore.getState().lines).toEqual([waterLine]);
  });

  it("removing the last line shows the empty state, still with the undo", async () => {
    await seedSavedCart([cappuccinoLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");
    const user = setupUser();

    await user.press(screen.getByRole("button", { name: "Remove Cappuccino" }));

    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(useCartStore.getState().lines).toEqual([cappuccinoLine]);
  });

  it("clears the cart after confirmation; cancelling keeps it", async () => {
    await seedSavedCart([cappuccinoLine, waterLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");
    const user = setupUser();

    await user.press(screen.getByRole("button", { name: "Clear cart" }));
    expect(screen.getByText("Clear your cart?")).toBeOnTheScreen();
    expect(screen.getByText("Every selection will be removed.")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Cancel" }));
    expect(useCartStore.getState().lines).toEqual([cappuccinoLine, waterLine]);

    await user.press(screen.getByRole("button", { name: "Clear cart" }));
    const [, confirm] = clearCartButtons();
    await user.press(confirm!);
    await flushStorage();

    expect(useCartStore.getState().lines).toEqual([]);
    expect(screen.getByText("Your cart is empty")).toBeOnTheScreen();
    expect(await readSavedLines()).toBeNull();
  });

  it("warns when the tablet could not save the latest change", async () => {
    await seedSavedCart([waterLine]);
    await renderScreen();
    await screen.findByLabelText("Quantity: 1");
    expect(screen.queryByText(/couldn’t save your latest change/)).toBeNull();

    await act(async () => {
      useCartStore.setState({ saveFailed: true });
    });

    expect(screen.getByText(/couldn’t save your latest change/)).toBeOnTheScreen();
    expect(screen.getAllByText("Sparkling Water").length).toBeGreaterThan(0);
  });

  it("pauses every edit while an order is being sent", async () => {
    await seedSavedCart([cappuccinoLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");

    await act(async () => {
      lockCart();
    });

    expect(screen.getByText("Editing paused while your order is sent")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear cart" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep browsing" })).toBeDisabled();

    await act(async () => {
      unlockCart();
    });
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).not.toBeDisabled();
  });

  it("interactionDisabled disables editing, and closes an already-open clear dialog", async () => {
    await seedSavedCart([cappuccinoLine]);
    const view = await renderScreen();
    await screen.findByText("Cappuccino");
    const user = setupUser();

    await user.press(screen.getByRole("button", { name: "Clear cart" }));
    expect(screen.getByText("Clear your cart?")).toBeOnTheScreen();

    await view.rerender(<AuthedCartScreen interactionDisabled />);

    expect(screen.queryByText("Clear your cart?")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear cart" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Cappuccino" })).toBeDisabled();
    expect(useCartStore.getState().lines).toEqual([cappuccinoLine]);
  });

  it("renders Checkout's composed final action, notice and line notes", async () => {
    await seedSavedCart([cappuccinoLine]);
    const onConfirm = jest.fn();
    await renderScreen({
      finalAction: (
        <Button onPress={onConfirm}>
          <Text>Confirm order</Text>
        </Button>
      ),
      notice: <Text>Collect at the counter</Text>,
      lineNote: (line) => <Text>{`Only 1 ${line.productDisplayName} left`}</Text>,
    });
    await screen.findByText("Cappuccino");

    expect(screen.getByText("Collect at the counter")).toBeOnTheScreen();
    expect(screen.getByText("Only 1 Cappuccino left")).toBeOnTheScreen();
    await setupUser().press(screen.getByRole("button", { name: "Confirm order" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
