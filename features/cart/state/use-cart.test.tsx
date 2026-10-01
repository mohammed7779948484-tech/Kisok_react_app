import { Text, View } from "react-native";

import { useAuth } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import { act, installMockAuth, renderWithProviders, screen, TEST_PROFILE } from "@/core/testing";

// The public surface is driven through `@/features/cart`, exactly the way
// Catalog and Checkout reach the cart. The store singleton is imported
// directly only to assert on what the public functions did to it.
import * as cartApi from "@/features/cart";
import type { AddToCartInput, CartLine } from "@/features/cart";

import { deriveLineId } from "../model/cart-rules";
import { persistedCartSchema } from "../model/persisted-cart.schema";
import { useCartStore } from "./cart-store";

const KEY = storageKey("cart", "lines");
/** A second customer — only the id differs from TEST_PROFILE. */
const OTHER_OWNER = "77777777-8888-4999-aaaa-bbbbbbbbbbbb";
/** A plain owner for the non-React action tests. */
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

const cappuccinoInput: AddToCartInput = {
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [sizeSelection, milkSelection],
  imageUri: "https://images.example.com/products/cappuccino.jpg",
  quantity: 2,
};

const cappuccinoLine: CartLine = { ...cappuccinoInput, lineId: deriveLineId(cappuccinoInput) };

const waterInput: AddToCartInput = {
  variantId: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d",
  productId: "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
  productDisplayName: "Sparkling Water",
  variantLabel: "500 ml Bottle",
  optionSelections: [],
  imageUri: null,
  quantity: 1,
};

const waterLine: CartLine = { ...waterInput, lineId: deriveLineId(waterInput) };

/** The whole runtime surface of `@/features/cart`; types are erased and do not count. */
const PUBLIC_RUNTIME_EXPORTS = [
  "CartLineCard",
  "FullCartScreen",
  "MAX_LINE_QUANTITY",
  "QuantityStepper",
  "QuickCartSheet",
  "addItem",
  "cartLineSchema",
  "clearCart",
  "clearCartAfterOrder",
  "customerLineIdentity",
  "getCartSnapshot",
  "hydrateCart",
  "lockCart",
  "removeLine",
  "setLineQuantity",
  "unlockCart",
  "useCart",
];

async function readPersistedCart() {
  return storage.read(KEY, (raw) => persistedCartSchema.parse(raw));
}

async function seedSavedCart(lines: CartLine[], ownerId: string) {
  await storage.write(KEY, { version: 1, ownerId, lines });
}

/** Let the store's queued, fire-and-forget storage operations settle inside act. */
async function flushStorage() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * The singleton remembers which customer it last restored, so a fresh test
 * would otherwise reuse a previous test's restore. Parking it on a unique
 * throwaway customer forces each test's own hydrate to really read storage.
 */
let parkingCounter = 0;
async function resetCartSingleton() {
  parkingCounter += 1;
  const parkingOwner = `00000000-0000-4000-8000-${String(parkingCounter).padStart(12, "0")}`;
  await cartApi.hydrateCart(parkingOwner);
  await storage.remove(KEY);
}

let latestView: ReturnType<typeof cartApi.useCart> | null = null;

function currentView(): ReturnType<typeof cartApi.useCart> {
  if (latestView === null) throw new Error("the probe has not rendered a useCart view yet");
  return latestView;
}

/** A minimal consumer that renders the hook's own view fields. */
function CartProbe() {
  const view = cartApi.useCart();
  latestView = view;
  return (
    <View>
      <Text>{`hydrated:${view.hydrated} total:${view.totalQuantity} lines:${view.distinctLineCount} saveFailed:${view.saveFailed} locked:${view.locked}`}</Text>
      {view.lines.map((line) => (
        <Text key={line.lineId}>{`line:${line.productDisplayName}:${line.quantity}`}</Text>
      ))}
    </View>
  );
}

/** Gate on auth readiness like the app's authenticated surfaces do. */
function AuthedCartProbe() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CartProbe />;
}

const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

beforeEach(async () => {
  // Ignored edits and storage discards log by design.
  setLogSink(() => {});
  latestView = null;
  await resetCartSingleton();
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("cart public API", () => {
  it("exposes exactly the planned runtime surface and keeps the store private", () => {
    expect(Object.keys(cartApi).sort()).toEqual([...PUBLIC_RUNTIME_EXPORTS].sort());
    expect("useCartStore" in cartApi).toBe(false);
    expect("createCartStore" in cartApi).toBe(false);
  });
});

describe("useCart()", () => {
  it("restores the signed-in customer's saved cart on its own", async () => {
    await seedSavedCart([cappuccinoLine, waterLine], TEST_PROFILE.id);
    mockAuthHolder.current = installMockAuth();

    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });

    await screen.findByText("hydrated:true total:3 lines:2 saveFailed:false locked:false");
    expect(screen.getByText("line:Cappuccino:2")).toBeOnTheScreen();
    expect(screen.getByText("line:Sparkling Water:1")).toBeOnTheScreen();
    expect(useCartStore.getState().ownerId).toBe(TEST_PROFILE.id);
  });

  it("bound actions edit the customer's cart and the view follows", async () => {
    await seedSavedCart([waterLine], TEST_PROFILE.id);
    mockAuthHolder.current = installMockAuth();
    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });
    await screen.findByText("hydrated:true total:1 lines:1 saveFailed:false locked:false");

    await act(async () => {
      currentView().addItem(waterInput);
    });
    expect(screen.getByText("line:Sparkling Water:2")).toBeOnTheScreen();

    await act(async () => {
      currentView().setLineQuantity(waterLine.lineId, 4);
    });
    expect(screen.getByText("line:Sparkling Water:4")).toBeOnTheScreen();

    await act(async () => {
      currentView().removeLine(waterLine.lineId);
    });
    expect(
      screen.getByText("hydrated:true total:0 lines:0 saveFailed:false locked:false"),
    ).toBeOnTheScreen();
    await flushStorage();
    expect((await readPersistedCart()).status).toBe("miss");
  });

  it("re-hydrates for a new customer: the previous customer's cart is gone from view and disk", async () => {
    await seedSavedCart([waterLine], TEST_PROFILE.id);
    mockAuthHolder.current = installMockAuth();
    const firstTree = await renderWithProviders(<AuthedCartProbe />, { withAuth: true });
    await screen.findByText("hydrated:true total:1 lines:1 saveFailed:false locked:false");

    await firstTree.unmount();
    mockAuthHolder.current.restore();
    mockAuthHolder.current = installMockAuth({
      profile: { ...TEST_PROFILE, id: OTHER_OWNER, display_name: "Next Customer" },
    });

    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });

    await screen.findByText("hydrated:true total:0 lines:0 saveFailed:false locked:false");
    expect(screen.queryByText("line:Sparkling Water:1")).toBeNull();
    expect(useCartStore.getState().ownerId).toBe(OTHER_OWNER);
    expect((await readPersistedCart()).status).toBe("miss");
  });

  it("never shows or edits a cart that belongs to another customer", async () => {
    mockAuthHolder.current = installMockAuth();
    await renderWithProviders(<AuthedCartProbe />, { withAuth: true });
    await screen.findByText("hydrated:true total:0 lines:0 saveFailed:false locked:false");

    // The store moves to another customer underneath this consumer.
    await act(async () => {
      await cartApi.hydrateCart(OTHER_OWNER);
      cartApi.addItem(waterInput);
    });

    // The view is scoped to the signed-in customer: empty and locked.
    expect(
      screen.getByText("hydrated:false total:0 lines:0 saveFailed:false locked:true"),
    ).toBeOnTheScreen();
    expect(screen.queryByText("line:Sparkling Water:1")).toBeNull();

    // Its bound actions are no-ops against the other customer's cart.
    await act(async () => {
      currentView().addItem(cappuccinoInput);
      currentView().setLineQuantity(waterLine.lineId, 9);
      currentView().removeLine(waterLine.lineId);
      currentView().clearCart();
    });
    await flushStorage();
    expect(useCartStore.getState()).toMatchObject({ ownerId: OTHER_OWNER, lines: [waterLine] });
  });
});

describe("plain cart actions (non-React callers)", () => {
  it("hydrateCart restores for an owner, and addItem works outside any component", async () => {
    await seedSavedCart([cappuccinoLine], OWNER);

    await cartApi.hydrateCart(OWNER);
    expect(useCartStore.getState()).toMatchObject({
      ownerId: OWNER,
      hydrated: true,
      lines: [cappuccinoLine],
    });

    cartApi.addItem(waterInput);
    await flushStorage();
    expect(useCartStore.getState().lines).toEqual([cappuccinoLine, waterLine]);
    const saved = await readPersistedCart();
    expect(saved.status === "hit" && saved.value.lines).toEqual([cappuccinoLine, waterLine]);
  });

  it("lockCart holds user edits until unlockCart", async () => {
    await cartApi.hydrateCart(OWNER);
    cartApi.addItem(waterInput);

    cartApi.lockCart();
    cartApi.addItem(cappuccinoInput);
    cartApi.setLineQuantity(waterLine.lineId, 5);
    cartApi.removeLine(waterLine.lineId);
    expect(useCartStore.getState()).toMatchObject({ locked: true, lines: [waterLine] });

    cartApi.unlockCart();
    cartApi.addItem(cappuccinoInput);
    expect(useCartStore.getState()).toMatchObject({
      locked: false,
      lines: [waterLine, cappuccinoLine],
    });
  });

  it("setLineQuantity, removeLine and clearCart drive the store and the saved cart", async () => {
    await cartApi.hydrateCart(OWNER);
    cartApi.addItem(waterInput);
    cartApi.addItem(cappuccinoInput);

    cartApi.setLineQuantity(waterLine.lineId, 5);
    cartApi.removeLine(cappuccinoLine.lineId);
    await flushStorage();
    const saved = await readPersistedCart();
    expect(saved.status === "hit" && saved.value.lines).toEqual([{ ...waterLine, quantity: 5 }]);

    cartApi.clearCart();
    expect(useCartStore.getState().lines).toEqual([]);
    await flushStorage();
    expect((await readPersistedCart()).status).toBe("miss");
  });

  it("clearCartAfterOrder empties the cart while locked and resolves once the tablet is empty", async () => {
    await seedSavedCart([waterLine], OWNER);
    await cartApi.hydrateCart(OWNER);

    cartApi.lockCart();
    await cartApi.clearCartAfterOrder();

    expect(useCartStore.getState()).toMatchObject({ lines: [], locked: true, ownerId: OWNER });
    expect((await readPersistedCart()).status).toBe("miss");
    cartApi.unlockCart();
  });

  it("getCartSnapshot is a point-in-time read including the owner", async () => {
    await seedSavedCart([waterLine, cappuccinoLine], OWNER);
    await cartApi.hydrateCart(OWNER);

    const snapshot = cartApi.getCartSnapshot();

    expect(snapshot).toEqual({
      lines: [waterLine, cappuccinoLine],
      hydrated: true,
      locked: false,
      ownerId: OWNER,
    });

    // A later change does not reach a snapshot already taken.
    cartApi.lockCart();
    expect(snapshot.locked).toBe(false);
    cartApi.unlockCart();
    cartApi.removeLine(waterLine.lineId);
    expect(snapshot.lines).toEqual([waterLine, cappuccinoLine]);
    expect(cartApi.getCartSnapshot().lines).toEqual([cappuccinoLine]);
  });
});
