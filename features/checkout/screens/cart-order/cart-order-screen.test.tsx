import { Dimensions } from "react-native";

import { useAuth } from "@/core/auth";
import { AppError } from "@/core/errors";
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
import {
  getCartSnapshot,
  hydrateCart,
  lockCart,
  setLineQuantity,
  unlockCart,
  type CartLine,
} from "@/features/cart";

import { submitOrder } from "../../api/submit-order";
import type { CreateOrderResponse } from "../../model/create-order-response.schema";
import { MAX_NORMALIZED_ITEMS } from "../../model/normalized-request";
import { useCheckoutStore } from "../../state/checkout-store";
import { CartOrderScreen } from "./cart-order-screen";

/**
 * The cart is the order review: Checkout composes the Confirm order action
 * into the Cart feature's FullCartScreen, enforces the one-order limit, and
 * after a stock conflict shows what the store has left next to each line.
 *
 * The real cart and checkout stores are driven through public actions over
 * the real storage seam; the only network seam mocked is the feature's own
 * `api/submit-order`. The status cover itself belongs to CheckoutGate (its
 * own suite) — this suite pins the screen's half of the flow.
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
}));

/** jest-expo's crypto mock returns undefined; every mint here is a distinct valid uuid. */
const mockUuidCounter = { current: 0 };
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockUuidCounter.current += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter.current).padStart(12, "0")}`;
  },
}));

jest.mock("../../api/submit-order", () => ({
  submitOrder: jest.fn(),
}));
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

const CART_KEY = storageKey("cart", "lines");
const CHECKOUT_KEY = storageKey("checkout", "order");
const SCRATCH_OWNER = "00000000-0000-4000-8000-000000000000";

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
  imageUri: "https://images.example.com/products/water.jpg",
  quantity: 1,
};

/** One more distinct variant than one order may hold. */
const OVER_LIMIT_LINES: CartLine[] = Array.from({ length: MAX_NORMALIZED_ITEMS + 1 }, (_, i) => {
  const variantId = `${String(i + 1).padStart(8, "0")}-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
  return {
    lineId: variantId,
    variantId,
    productId: variantId,
    productDisplayName: `Menu Item ${i + 1}`,
    variantLabel: "Regular",
    optionSelections: [],
    imageUri: null,
    quantity: 1,
  };
});

/** create_order's items for [cappuccino, water]: one entry per variant, sorted. */
const SUBMITTED_ITEMS = [
  { variant_id: cappuccinoLine.variantId, quantity: 2 },
  { variant_id: waterLine.variantId, quantity: 1 },
];

const SUCCESS: CreateOrderResponse = {
  kind: "success",
  order_id: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  display_number: "KX7QR9",
  created_at: "2026-02-01T10:15:30+00:00",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function seedCart(lines: CartLine[]) {
  const written = await storage.write(CART_KEY, { version: 1, ownerId: TEST_PROFILE.id, lines });
  expect(written.status).toBe("persisted");
}

/** The real app mounts the customer group only once auth has a profile. */
function AuthedScreen() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CartOrderScreen />;
}

const authHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

/**
 * Render at tablet landscape (the summary rail layout). In the app, the
 * CheckoutGate has restored this customer's checkout before the cart route
 * can render, so the suite does the same through the store's own action.
 */
async function renderScreen({ recover = true }: { recover?: boolean } = {}) {
  Dimensions.set({
    window: { width: 1024, height: 768, scale: 1, fontScale: 1 },
    screen: { width: 1024, height: 768, scale: 1, fontScale: 1 },
  });
  if (recover) await useCheckoutStore.getState().recover(TEST_PROFILE.id);
  authHolder.current = installMockAuth();
  return renderWithProviders(<AuthedScreen />, { withAuth: true });
}

function confirmButton() {
  return screen.getByRole("button", { name: /^(Confirm order|Sending…)$/ });
}

describe("CartOrderScreen", () => {
  beforeEach(async () => {
    setLogSink(() => {});
    mockSubmitOrder.mockReset();
    Object.values(mockRouter).forEach((fn) => fn.mockClear());
    await storage.remove(CART_KEY);
    await storage.remove(CHECKOUT_KEY);
    // Owner switches reset both singletons between tests.
    await hydrateCart(SCRATCH_OWNER);
    await useCheckoutStore.getState().recover(SCRATCH_OWNER);
  });

  afterEach(() => {
    resetLogging();
    jest.restoreAllMocks();
    authHolder.current?.restore();
    authHolder.current = null;
  });

  it("shows the restored cart as the order review with Confirm order enabled", async () => {
    await seedCart([cappuccinoLine, waterLine]);
    await renderScreen();

    expect(await screen.findByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("3 items")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm order" })).toBeEnabled();
    // No price-like content anywhere — a product boundary.
    expect(screen.queryByText(/\$|price|total/i)).toBeNull();
  });

  it("keeps Confirm order disabled until this customer's checkout is restored", async () => {
    await seedCart([cappuccinoLine]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const realRead = storage.read.bind(storage);
    jest.spyOn(storage, "read").mockImplementation(async (key, parse) => {
      if (key === CHECKOUT_KEY) await gate;
      return realRead(key, parse);
    });
    const recovering = useCheckoutStore.getState().recover(TEST_PROFILE.id);
    await renderScreen({ recover: false });

    await screen.findByText("Cappuccino");
    expect(confirmButton()).toBeDisabled();

    await act(async () => {
      release();
      await recovering;
    });
    expect(confirmButton()).toBeEnabled();
  });

  it("offers no Confirm order for an empty cart", async () => {
    await renderScreen();

    expect(await screen.findByText("Your cart is empty")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Confirm order" })).toBeNull();
  });

  it("disables Confirm order while the cart is locked", async () => {
    await seedCart([cappuccinoLine]);
    await renderScreen();
    await screen.findByText("Cappuccino");

    await act(async () => {
      lockCart();
    });
    expect(confirmButton()).toBeDisabled();

    await act(async () => {
      unlockCart();
    });
    expect(confirmButton()).toBeEnabled();
  });

  it("explains and blocks an order over the distinct-option limit, without contacting the store", async () => {
    await seedCart(OVER_LIMIT_LINES);
    await renderScreen();

    expect(
      await screen.findByText(
        `One order can hold up to ${MAX_NORMALIZED_ITEMS} different options. Remove 1 to continue.`,
      ),
    ).toBeOnTheScreen();
    const confirm = confirmButton();
    expect(confirm).toBeDisabled();

    const user = userEvent.setup();
    await user.press(confirm);
    expect(mockSubmitOrder).not.toHaveBeenCalled();
    expect(useCheckoutStore.getState().phase).toBe("idle");
  });

  it("confirms the cart as one request: Sending… while in flight, then confirmed with the cart cleared", async () => {
    await seedCart([cappuccinoLine, waterLine]);
    const answer = deferred<CreateOrderResponse>();
    mockSubmitOrder.mockReturnValue(answer.promise);
    await renderScreen();
    await screen.findByText("Cappuccino");

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Confirm order" }));

    expect(await screen.findByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      clientRequestId: expect.stringMatching(/^00000000-0000-4000-8000-\d{12}$/),
      items: SUBMITTED_ITEMS,
    });
    // The cart is held, not emptied, until the store answers.
    expect(getCartSnapshot().locked).toBe(true);
    expect(getCartSnapshot().lines).toHaveLength(2);

    await act(async () => {
      answer.resolve(SUCCESS);
    });

    await waitFor(() => expect(useCheckoutStore.getState().phase).toBe("confirmed"));
    expect(getCartSnapshot().lines).toHaveLength(0);
    expect(useCheckoutStore.getState().confirmed?.success.displayNumber).toBe("KX7QR9");
  });

  it("ignores a second Confirm press while the first is in flight — one request, one order", async () => {
    await seedCart([cappuccinoLine]);
    const answer = deferred<CreateOrderResponse>();
    mockSubmitOrder.mockReturnValue(answer.promise);
    await renderScreen();
    await screen.findByText("Cappuccino");

    const user = userEvent.setup();
    const confirm = screen.getByRole("button", { name: "Confirm order" });
    await user.press(confirm);
    await user.press(confirmButton());

    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer.resolve(SUCCESS);
    });
    await waitFor(() => expect(useCheckoutStore.getState().phase).toBe("confirmed"));
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps Confirm order disabled while a failure is still showing, until the customer returns to the cart", async () => {
    await seedCart([cappuccinoLine]);
    mockSubmitOrder.mockRejectedValueOnce(
      new AppError({ kind: "server", userMessage: "busy", retryable: true }),
    );
    await renderScreen();
    await screen.findByText("Cappuccino");

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Confirm order" }));

    await waitFor(() => expect(useCheckoutStore.getState().phase).toBe("failure"));
    expect(confirmButton()).toBeDisabled();
    // A definite failure placed nothing: the cart is kept and editable.
    expect(getCartSnapshot().lines).toHaveLength(1);
    expect(getCartSnapshot().locked).toBe(false);

    await act(async () => {
      useCheckoutStore.getState().backToCart();
    });
    expect(confirmButton()).toBeEnabled();
  });

  it("after a stock conflict, notes what is left on each affected line until the customer fixes it", async () => {
    await seedCart([cappuccinoLine, waterLine]);
    mockSubmitOrder.mockResolvedValueOnce({
      kind: "stock_conflict",
      conflicts: [
        { variant_id: cappuccinoLine.variantId, requested_quantity: 2, available_quantity: 1 },
        {
          variant_id: waterLine.variantId.toUpperCase(),
          requested_quantity: 1,
          available_quantity: 0,
        },
      ],
    });
    await renderScreen();
    await screen.findByText("Cappuccino");

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Confirm order" }));
    await waitFor(() => expect(useCheckoutStore.getState().phase).toBe("conflict"));
    await act(async () => {
      useCheckoutStore.getState().backToCart();
    });

    expect(screen.getByText("Only 1 available for this option")).toBeOnTheScreen();
    expect(screen.getByText("Sold out right now — please remove it")).toBeOnTheScreen();
    expect(confirmButton()).toBeEnabled();

    // Bringing the line within what is left removes its note.
    await act(async () => {
      setLineQuantity(cappuccinoLine.lineId, 1);
    });
    expect(screen.queryByText("Only 1 available for this option")).toBeNull();
    expect(screen.getByText("Sold out right now — please remove it")).toBeOnTheScreen();
  });
});
