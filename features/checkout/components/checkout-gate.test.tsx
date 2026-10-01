import { BackHandler } from "react-native";

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
import { Text } from "@/design-system";
import { getCartSnapshot, hydrateCart, type CartLine } from "@/features/cart";

import { submitOrder } from "../api/submit-order";
import type { CreateOrderResponse } from "../model/create-order-response.schema";
import type { SavedCheckout } from "../model/pending-order.schema";
import { useCheckoutStore } from "../state/checkout-store";
import { CheckoutGate } from "./checkout-gate";

/**
 * CheckoutGate wraps the whole customer experience. It restores this
 * customer's saved checkout before any customer route renders, covers the
 * app while an order is out of the customer's hands (blocking Android back),
 * and hands a confirmed order to the success route.
 *
 * The real checkout and cart stores are driven through their public actions
 * and the real storage seam; the only network seam mocked is the feature's
 * own `api/submit-order`. expo-router is a per-file mock recording navigation.
 */

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
const mockPathname = { current: "/" };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname.current,
}));

/** jest-expo's crypto mock returns undefined; every mint here is a distinct valid uuid. */
const mockUuidCounter = { current: 0 };
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockUuidCounter.current += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter.current).padStart(12, "0")}`;
  },
}));

jest.mock("../api/submit-order", () => ({
  submitOrder: jest.fn(),
}));
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

/**
 * jest-expo resolves react-native to iOS, whose BackHandler drops handlers.
 * This spy stands in for Android's: registrations are recorded, `remove`
 * unregisters, and `pressHardwareBack` dispatches newest-first, stopping at
 * the first handler that consumes the press.
 */
type HardwareBackHandler = () => boolean | null | undefined;
const backHandlers: HardwareBackHandler[] = [];
function installBackHandlerSpy() {
  backHandlers.length = 0;
  jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return {
      remove: () => {
        const index = backHandlers.indexOf(handler);
        if (index !== -1) backHandlers.splice(index, 1);
      },
    };
  });
}
function pressHardwareBack(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i -= 1) {
    if (backHandlers[i]?.()) return true;
  }
  return false;
}

const CHECKOUT_KEY = storageKey("checkout", "order");
const CART_KEY = storageKey("cart", "lines");
const SCRATCH_OWNER = "00000000-0000-4000-8000-000000000000";
const STORED_REQUEST_ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";

const cappuccinoLine: CartLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  variantId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f",
  productId: "0f4a9d3e-2b1c-4f8a-9e7d-5c6b8a3f1d2e",
  productDisplayName: "Cappuccino",
  variantLabel: "Hot",
  optionSelections: [],
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

const ITEMS = [
  { variant_id: cappuccinoLine.variantId, quantity: 2 },
  { variant_id: waterLine.variantId, quantity: 1 },
];

const ORDER_ID = "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b";
const SUCCESS: CreateOrderResponse = {
  kind: "success",
  order_id: ORDER_ID,
  display_number: "KX7QR9",
  created_at: "2026-02-01T10:15:30+00:00",
};

const CHILD_TEXT = "Customer routes";

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

async function seedCheckout(record: SavedCheckout) {
  const written = await storage.write(CHECKOUT_KEY, record);
  expect(written.status).toBe("persisted");
}

/** The real app mounts the customer group only once auth has a profile. */
function AuthedGate() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <CheckoutGate>
      <Text>{CHILD_TEXT}</Text>
    </CheckoutGate>
  );
}

const authHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderGate() {
  authHolder.current = installMockAuth();
  return renderWithProviders(<AuthedGate />, { withAuth: true });
}

/** Place an order the way the cart screen does, from the restored cart. */
async function submitFromCart() {
  await act(async () => {
    void useCheckoutStore.getState().submit(getCartSnapshot().lines);
  });
}

describe("CheckoutGate", () => {
  beforeEach(async () => {
    setLogSink(() => {});
    mockSubmitOrder.mockReset();
    Object.values(mockRouter).forEach((fn) => fn.mockClear());
    mockPathname.current = "/";
    installBackHandlerSpy();
    await storage.remove(CHECKOUT_KEY);
    await storage.remove(CART_KEY);
    // Owner switches reset both singletons, so the gate's own recovery for
    // TEST_PROFILE always starts from a clean slate.
    await hydrateCart(SCRATCH_OWNER);
    await useCheckoutStore.getState().recover(SCRATCH_OWNER);
  });

  afterEach(() => {
    resetLogging();
    jest.restoreAllMocks();
    authHolder.current?.restore();
    authHolder.current = null;
  });

  it("restores the saved checkout before rendering any customer route, and blocks back meanwhile", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const realRead = storage.read.bind(storage);
    jest.spyOn(storage, "read").mockImplementation(async (key, parse) => {
      if (key === CHECKOUT_KEY) await gate;
      return realRead(key, parse);
    });

    await renderGate();

    expect(await screen.findByLabelText("Restoring this customer session")).toBeOnTheScreen();
    expect(screen.getByText("Restoring this session…")).toBeOnTheScreen();
    expect(screen.queryByText(CHILD_TEXT)).toBeNull();
    expect(pressHardwareBack()).toBe(true);

    await act(async () => {
      release();
    });

    expect(await screen.findByText(CHILD_TEXT)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Restoring this customer session")).toBeNull();
    // Nothing to protect any more: back is the system's again.
    expect(pressHardwareBack()).toBe(false);
  });

  it("resumes a saved pending order with its ORIGINAL request id, covering the app until the store answers", async () => {
    await seedCart([cappuccinoLine, waterLine]);
    await seedCheckout({
      version: 1,
      state: "pending",
      ownerId: TEST_PROFILE.id,
      requestId: STORED_REQUEST_ID,
      items: ITEMS,
      lineSnapshots: [cappuccinoLine, waterLine],
    });
    const answer = deferred<CreateOrderResponse>();
    mockSubmitOrder.mockReturnValue(answer.promise);

    await renderGate();

    expect(await screen.findByText("Sending your order to the store")).toBeOnTheScreen();
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      clientRequestId: STORED_REQUEST_ID,
      items: ITEMS,
    });
    // The customer routes stay mounted underneath but are hidden from
    // assistive technology, and back cannot leave the cover.
    expect(screen.queryByText(CHILD_TEXT)).toBeNull();
    expect(screen.getByText(CHILD_TEXT, { includeHiddenElements: true })).toBeTruthy();
    expect(pressHardwareBack()).toBe(true);
    expect(getCartSnapshot().locked).toBe(true);

    await act(async () => {
      answer.resolve(SUCCESS);
    });

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(getCartSnapshot().lines).toHaveLength(0);
    expect(getCartSnapshot().locked).toBe(false);
    expect(screen.queryByText("Sending your order to the store")).toBeNull();
  });

  it("hands a saved confirmed order to the success route on launch, without re-sending it", async () => {
    await seedCart([cappuccinoLine]);
    await seedCheckout({
      version: 1,
      state: "confirmed",
      ownerId: TEST_PROFILE.id,
      success: {
        orderId: ORDER_ID,
        displayNumber: "KX7QR9",
        createdAt: "2026-02-01T10:15:30+00:00",
      },
      lineSnapshots: [cappuccinoLine],
    });

    await renderGate();

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockSubmitOrder).not.toHaveBeenCalled();
    // A restart may have interrupted the cart clear; recovery finishes it.
    expect(getCartSnapshot().lines).toHaveLength(0);
  });

  it("does not navigate again when the success route is already showing", async () => {
    mockPathname.current = "/checkout-success";
    await seedCheckout({
      version: 1,
      state: "confirmed",
      ownerId: TEST_PROFILE.id,
      success: {
        orderId: ORDER_ID,
        displayNumber: "KX7QR9",
        createdAt: "2026-02-01T10:15:30+00:00",
      },
      lineSnapshots: [cappuccinoLine],
    });

    await renderGate();

    expect(await screen.findByText(CHILD_TEXT)).toBeOnTheScreen();
    expect(useCheckoutStore.getState().phase).toBe("confirmed");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("covers an unknown result and re-sends the SAME request when the customer checks again", async () => {
    await seedCart([cappuccinoLine]);
    await renderGate();
    await screen.findByText(CHILD_TEXT);

    mockSubmitOrder.mockRejectedValueOnce(
      new AppError({ kind: "network", userMessage: "offline", technicalMessage: "fetch failed" }),
    );
    await submitFromCart();

    expect(await screen.findByText("We’re checking on your order")).toBeOnTheScreen();
    expect(pressHardwareBack()).toBe(true);
    expect(screen.queryByRole("button", { name: "Back to my cart" })).toBeNull();

    mockSubmitOrder.mockResolvedValueOnce(SUCCESS);
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Check now" }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockSubmitOrder).toHaveBeenCalledTimes(2);
    expect(mockSubmitOrder.mock.calls[1]?.[0]).toEqual(mockSubmitOrder.mock.calls[0]?.[0]);
  });

  it("covers a stock conflict with the affected lines, and Review my cart returns to the cart", async () => {
    await seedCart([cappuccinoLine, waterLine]);
    await renderGate();
    await screen.findByText(CHILD_TEXT);

    mockSubmitOrder.mockResolvedValueOnce({
      kind: "stock_conflict",
      conflicts: [
        { variant_id: cappuccinoLine.variantId, requested_quantity: 2, available_quantity: 1 },
      ],
    });
    await submitFromCart();

    expect(await screen.findByText("A few items just ran low")).toBeOnTheScreen();
    expect(screen.getByText("1 available")).toBeOnTheScreen();
    // Only the affected line is listed to adjust.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.queryByText("Sparkling Water")).toBeNull();
    expect(pressHardwareBack()).toBe(true);
    // No order was placed: the cart is editable again underneath.
    expect(getCartSnapshot().locked).toBe(false);

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Review my cart" }));

    expect(mockRouter.navigate).toHaveBeenCalledWith("/cart");
    expect(useCheckoutStore.getState().phase).toBe("idle");
    expect(screen.queryByText("A few items just ran low")).toBeNull();
    expect(screen.getByText(CHILD_TEXT)).toBeOnTheScreen();
    expect(pressHardwareBack()).toBe(false);
    // The conflict is kept so the cart can show what is left per line.
    expect(useCheckoutStore.getState().conflicts).toHaveLength(1);
  });

  it("does not navigate when the customer is already on the cart", async () => {
    mockPathname.current = "/cart";
    await seedCart([cappuccinoLine]);
    await renderGate();
    await screen.findByText(CHILD_TEXT);

    mockSubmitOrder.mockResolvedValueOnce({
      kind: "stock_conflict",
      conflicts: [
        { variant_id: cappuccinoLine.variantId, requested_quantity: 2, available_quantity: 0 },
      ],
    });
    await submitFromCart();

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Review my cart" }));

    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(screen.getByText(CHILD_TEXT)).toBeOnTheScreen();
  });

  it("on a retryable failure, Try again places the order as a NEW request from the current cart", async () => {
    await seedCart([cappuccinoLine]);
    await renderGate();
    await screen.findByText(CHILD_TEXT);

    mockSubmitOrder.mockRejectedValueOnce(
      new AppError({ kind: "server", userMessage: "The store is busy.", retryable: true }),
    );
    await submitFromCart();

    expect(await screen.findByText("The store is busy.")).toBeOnTheScreen();
    expect(pressHardwareBack()).toBe(true);

    mockSubmitOrder.mockResolvedValueOnce(SUCCESS);
    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockSubmitOrder).toHaveBeenCalledTimes(2);
    const [first, second] = mockSubmitOrder.mock.calls.map(([input]) => input);
    expect(second?.items).toEqual(first?.items);
    // A definite failure placed nothing, so a fresh id is safe — and required.
    expect(second?.clientRequestId).not.toBe(first?.clientRequestId);
  });

  it("on a non-retryable failure, offers only Back to my cart", async () => {
    await seedCart([cappuccinoLine]);
    await renderGate();
    await screen.findByText(CHILD_TEXT);

    mockSubmitOrder.mockRejectedValueOnce(
      new AppError({ kind: "unavailable", userMessage: "gone", code: "K1002" }),
    );
    await submitFromCart();

    expect(await screen.findByText("Some items are no longer available")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    const user = userEvent.setup();
    await user.press(screen.getByRole("button", { name: "Back to my cart" }));

    expect(mockRouter.navigate).toHaveBeenCalledWith("/cart");
    expect(useCheckoutStore.getState().phase).toBe("idle");
    expect(screen.getByText(CHILD_TEXT)).toBeOnTheScreen();
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
  });

  it("removes its back guard when it unmounts", async () => {
    await seedCart([cappuccinoLine]);
    const view = await renderGate();
    await screen.findByText(CHILD_TEXT);

    mockSubmitOrder.mockRejectedValueOnce(
      new AppError({ kind: "network", userMessage: "offline", technicalMessage: "fetch failed" }),
    );
    await submitFromCart();
    await screen.findByText("We’re checking on your order");
    expect(backHandlers).toHaveLength(1);

    await view.unmount();
    expect(backHandlers).toHaveLength(0);

    // Leave the shared store with nothing in flight for the next test.
    mockSubmitOrder.mockResolvedValueOnce(SUCCESS);
    await act(async () => {
      await useCheckoutStore.getState().retry();
    });
  });
});
