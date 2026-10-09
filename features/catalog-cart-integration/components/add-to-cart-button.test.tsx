import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, type ReactNode } from "react";
import { Dimensions, Pressable, Text } from "react-native";

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
import { getCartSnapshot, lockCart, type AddToCartInput } from "@/features/cart";

import { AddToCartButton } from "./add-to-cart-button";
import { CatalogCartProvider } from "./catalog-cart-provider";
import type { CatalogCartSource } from "../model/add-to-cart-mapping";

/**
 * Behaviour of the integration's Add-to-cart action.
 *
 * The button is exercised exactly the way Product Detail mounts it: inside
 * the real `CatalogCartProvider` (the real `useQuickCart` context and the real
 * QuickCartSheet), behind the real auth gate (the button's own `useCart()`
 * restores the cart; nothing in this test hydrates the store itself), against
 * the real cart store driven through the public surface only
 * (`getCartSnapshot`, `lockCart`). One unique owner id per test makes each
 * mount restore its own cart.
 *
 * The pre-restore window is only observable by holding the cart's read open
 * at the AsyncStorage seam the global jest setup already fakes.
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
  usePathname: () => "/product-detail",
}));

const KEY = storageKey("cart", "lines");

const AVAILABLE_OWNER = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UNAVAILABLE_OWNER = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const LOCKED_OWNER = "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f";
const WINDOW_OWNER = "d4e5f6a7-b8c9-4d0e-8f1a-3b4c5d6e7f8a";
const ORDER_OWNER = "e5f6a7b8-c9d0-4e1f-8a2b-4c5d6e7f8a9b";
const STEPPER_OWNER = "f6a7b8c9-d0e1-4f2a-9b3c-5d6e7f8a9b0c";
const STOCK_OWNER = "07b8c9d0-e1f2-4a3b-8c4d-6e7f8a9b0c1d";
const LIMIT_OWNER = "18c9d0e1-f2a3-4b4c-9d5e-7f8a9b0c1d2e";
const CONTROLLED_OWNER = "29d0e1f2-a3b4-4c5d-8e6f-8a9b0c1d2e3f";
const READ_ONLY_OWNER = "3ae1f2a3-b4c5-4d6e-9f7a-9b0c1d2e3f4a";

const flavorOption = {
  optionTypeId: "f1a2b3c4-d5e6-4789-8abc-def012345678",
  optionValueId: "a2b3c4d5-e6f7-489a-9bcd-ef01234567a8",
  optionValueLabel: "Hazelnut",
  optionTypeName: "Flavor",
};

const milkOption = {
  optionTypeId: "b3c4d5e6-f7a8-49ab-8cde-f01234567ab9",
  optionValueId: "c4d5e6f7-a8b9-4abc-9def-01234567bcda",
  optionValueLabel: "Oat",
  optionTypeName: "Milk",
};

const availableSource: CatalogCartSource = {
  productId: "5f6a7b8c-9d0e-4f1a-8a2b-3c4d5e6f7a8b",
  productName: "Almond Cold Brew",
  variant: {
    id: "6a7b8c9d-0e1f-4a2b-8b3c-4d5e6f7a8b9c",
    titleOverride: null,
    isAvailable: true,
    primaryImageUri: "https://images.example.com/products/almond-cold-brew.jpg",
    options: [flavorOption, milkOption],
  },
  variantCount: 3,
  variantIndex: 1,
};

const unavailableSource: CatalogCartSource = {
  ...availableSource,
  variant: { ...availableSource.variant, isAvailable: false },
};

/** The input the available source maps to (label rule: option TYPE names). */
const expectedInput: AddToCartInput = {
  variantId: availableSource.variant.id,
  productId: availableSource.productId,
  productDisplayName: "Almond Cold Brew",
  variantLabel: "Flavor, Milk",
  optionSelections: [
    {
      optionTypeId: flavorOption.optionTypeId,
      optionValueId: flavorOption.optionValueId,
      optionValueLabel: "Hazelnut",
    },
    {
      optionTypeId: milkOption.optionTypeId,
      optionValueId: milkOption.optionValueId,
      optionValueLabel: "Oat",
    },
  ],
  imageUri: "https://images.example.com/products/almond-cold-brew.jpg",
  quantity: 1,
};

/** The composed caption the open sheet renders for that input. */
const expectedCaption = "Flavor, Milk · Hazelnut · Oat";

function setLandscape() {
  const frame = { width: 1024, height: 768, scale: 1, fontScale: 1 };
  Dimensions.set({ window: frame, screen: frame });
}

/** The cart saves fire-and-forget; one macrotask turn lets the save settle inside act. */
async function settleDurableWrites() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Auth-gated like the (customer) group: `useCart()` needs an active profile. */
function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CatalogCartProvider>{children}</CatalogCartProvider>;
}

const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderButton(
  source: CatalogCartSource,
  ownerId: string,
  { withQuantity = false }: { withQuantity?: boolean } = {},
) {
  setLandscape();
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  return renderWithProviders(
    <AuthedHarness>
      <AddToCartButton source={source} withQuantity={withQuantity} />
    </AuthedHarness>,
    { withAuth: true },
  );
}

/**
 * Product Detail's side of the controlled pair: it owns the quantity, and a
 * "Remount" control swaps the button for a fresh instance — what happens when
 * the screen moves between its split layout and the Option Browser.
 */
function ControlledQuantityHost({
  source,
  initial,
  onQuantityChange,
}: {
  source: CatalogCartSource;
  initial: number;
  onQuantityChange: (next: number) => void;
}) {
  const [quantity, setQuantity] = useState(initial);
  const [mount, setMount] = useState(0);
  return (
    <>
      <AddToCartButton
        key={mount}
        source={source}
        withQuantity
        quantity={quantity}
        onQuantityChange={(next) => {
          onQuantityChange(next);
          setQuantity(next);
        }}
      />
      <Pressable accessibilityRole="button" onPress={() => setMount((count) => count + 1)}>
        <Text>Remount</Text>
      </Pressable>
    </>
  );
}

async function renderControlled(ui: ReactNode, ownerId: string) {
  setLandscape();
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  return renderWithProviders(<AuthedHarness>{ui}</AuthedHarness>, { withAuth: true });
}

const totalQuantity = () =>
  getCartSnapshot().lines.reduce((total, line) => total + line.quantity, 0);

/** Save a cart for the customer before mount, so their own restore brings it back. */
async function seedSavedCart(ownerId: string, quantity: number) {
  await storage.write(KEY, {
    version: 1,
    ownerId,
    // The store re-derives line identities on restore.
    lines: [{ ...expectedInput, lineId: "re-derived-on-restore", quantity }],
  });
}

/**
 * Holds the cart's read open at the AsyncStorage seam: `getItem` for the cart
 * key resolves (as a miss) only on `release()`. The global setup's mock is
 * already a jest.fn, so the original IMPLEMENTATION is captured and put back
 * explicitly. `release()` must run before the test ends.
 */
function holdCartRead(): { release: () => Promise<void> } {
  let releaseRead: (() => void) | null = null;
  const held = new Promise<string | null>((resolve) => {
    releaseRead = () => resolve(null);
  });
  const spy = jest.spyOn(AsyncStorage, "getItem");
  const originalGetItem = spy.getMockImplementation();
  spy.mockImplementation(async (key?: string) => {
    if (key === undefined) return null;
    if (key === KEY) return held;
    return originalGetItem ? originalGetItem(key) : null;
  });
  return {
    release: async () => {
      releaseRead?.();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      spy.mockRestore();
      if (originalGetItem) spy.mockImplementation(originalGetItem);
    },
  };
}

beforeEach(async () => {
  // Ignored edits and storage paths log by design.
  setLogSink(() => {});
  jest.clearAllMocks();
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("AddToCartButton", () => {
  it("adds the mapped line once the cart is restored, and opens the quick cart showing it", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, AVAILABLE_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());

    await user.press(addButton);
    await settleDurableWrites();

    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject(expectedInput);

    expect(screen.getByText("Added to your cart")).toBeOnTheScreen();
    expect(screen.getAllByText("Almond Cold Brew").length).toBeGreaterThan(0);
    expect(screen.getByText("1 item · 1 selection")).toBeOnTheScreen();
  });

  it("is disabled for an unavailable variant, keeps its label, and a press changes nothing", async () => {
    const user = userEvent.setup();
    await renderButton(unavailableSource, UNAVAILABLE_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(getCartSnapshot().hydrated).toBe(true));
    expect(addButton).toBeDisabled();

    await user.press(addButton);
    await settleDurableWrites();
    expect(getCartSnapshot().lines).toEqual([]);
    expect(screen.queryByText("Added to your cart")).toBeNull();
  });

  it("is disabled while the cart is locked, and a press changes nothing", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, LOCKED_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());

    await act(async () => {
      lockCart();
    });
    expect(addButton).toBeDisabled();

    await user.press(addButton);
    await settleDurableWrites();
    expect(getCartSnapshot().lines).toEqual([]);
  });

  it("is disabled while the saved cart is being read, then enabled once it is restored", async () => {
    const user = userEvent.setup();
    const heldRead = holdCartRead();
    try {
      await renderButton(availableSource, WINDOW_OWNER);

      const addButton = await screen.findByRole("button", { name: "Add to cart" });
      expect(addButton).toBeDisabled();
      expect(getCartSnapshot().hydrated).toBe(false);

      await user.press(addButton);
      expect(getCartSnapshot().lines).toEqual([]);
    } finally {
      // Always release: a stuck read would block every later restore in this file.
      await heldRead.release();
    }

    const addButton = screen.getByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());
    expect(getCartSnapshot().hydrated).toBe(true);

    await user.press(addButton);
    await settleDurableWrites();
    expect(getCartSnapshot().lines).toHaveLength(1);
    expect(getCartSnapshot().lines[0]).toMatchObject(expectedInput);
  });

  it("adds first and opens the sheet second — the open sheet already shows the new line", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, ORDER_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());
    await user.press(addButton);
    await settleDurableWrites();

    expect(getCartSnapshot().lines[0]).toMatchObject(expectedInput);
    expect(screen.getByText("Added to your cart")).toBeOnTheScreen();
    expect(screen.getByText(expectedCaption)).toBeOnTheScreen();
  });

  it("with a quantity picker, adds the chosen amount and confirms it", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, STEPPER_OWNER, { withQuantity: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add 1 to cart" })).not.toBeDisabled(),
    );

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    await user.press(screen.getByRole("button", { name: "Add 2 to cart" }));
    await settleDurableWrites();

    expect(getCartSnapshot().lines[0]).toMatchObject({ ...expectedInput, quantity: 2 });
    expect(screen.getByText("Added 2 to your cart.")).toBeOnTheScreen();
    // The picker resets for the next add.
    expect(screen.getByRole("button", { name: "Add 1 to cart" })).toBeOnTheScreen();
  });

  it("never offers more than the store has: the picker stops at what is left, then the add disables", async () => {
    const user = userEvent.setup();
    const stocked: CatalogCartSource = {
      ...availableSource,
      variant: { ...availableSource.variant, availableQuantity: 2 },
    };
    await renderButton(stocked, STOCK_OWNER, { withQuantity: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add 1 to cart" })).not.toBeDisabled(),
    );

    await user.press(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
    await user.press(screen.getByRole("button", { name: "Add 2 to cart" }));
    await settleDurableWrites();

    expect(totalQuantity()).toBe(2);
    expect(screen.getByText("Added 2 to your cart.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Add 1 to cart" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase quantity" })).toBeDisabled();
  });

  it("says so when the line is already at the cart's limit", async () => {
    const user = userEvent.setup();
    await seedSavedCart(LIMIT_OWNER, 99);
    await renderButton(availableSource, LIMIT_OWNER, { withQuantity: true });
    await waitFor(() => expect(totalQuantity()).toBe(99));

    await user.press(screen.getByRole("button", { name: "Add 1 to cart" }));
    await settleDurableWrites();

    expect(totalQuantity()).toBe(99);
    expect(screen.getByText("This option is already at the cart's limit.")).toBeOnTheScreen();
  });

  describe("with a controlled quantity", () => {
    it("shows the owner's quantity, reports stepper changes, survives a remount, and asks for 1 after an add", async () => {
      const user = userEvent.setup();
      const onQuantityChange = jest.fn();
      await renderControlled(
        <ControlledQuantityHost
          source={availableSource}
          initial={3}
          onQuantityChange={onQuantityChange}
        />,
        CONTROLLED_OWNER,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Add 3 to cart" })).not.toBeDisabled(),
      );

      await user.press(screen.getByRole("button", { name: "Increase quantity" }));
      expect(onQuantityChange).toHaveBeenLastCalledWith(4);
      expect(screen.getByRole("button", { name: "Add 4 to cart" })).toBeOnTheScreen();

      // A fresh button instance still shows the owner's quantity.
      await user.press(screen.getByRole("button", { name: "Remount" }));
      expect(screen.getByRole("button", { name: "Add 4 to cart" })).toBeOnTheScreen();

      await user.press(screen.getByRole("button", { name: "Add 4 to cart" }));
      await settleDurableWrites();

      expect(getCartSnapshot().lines[0]).toMatchObject({ ...expectedInput, quantity: 4 });
      expect(screen.getByText("Added 4 to your cart.")).toBeOnTheScreen();
      expect(onQuantityChange).toHaveBeenLastCalledWith(1);
      expect(screen.getByRole("button", { name: "Add 1 to cart" })).toBeOnTheScreen();
    });

    it("treats a quantity without a change handler as read-only", async () => {
      const user = userEvent.setup();
      await renderControlled(
        <AddToCartButton source={availableSource} withQuantity quantity={2} />,
        READ_ONLY_OWNER,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Add 2 to cart" })).not.toBeDisabled(),
      );

      await user.press(screen.getByRole("button", { name: "Increase quantity" }));
      expect(screen.getByRole("button", { name: "Add 2 to cart" })).toBeOnTheScreen();

      await user.press(screen.getByRole("button", { name: "Add 2 to cart" }));
      await settleDurableWrites();
      expect(totalQuantity()).toBe(2);
      expect(screen.getByRole("button", { name: "Add 2 to cart" })).toBeOnTheScreen();
    });
  });
});
