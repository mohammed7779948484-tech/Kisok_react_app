import { useAuth } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import {
  installMockAuth,
  renderWithProviders,
  screen,
  TEST_PROFILE,
  userEvent,
  waitFor,
} from "@/core/testing";
import { getCartSnapshot, hydrateCart, type CartLine } from "@/features/cart";

import { submitOrder } from "./api/submit-order";
import { CartOrderScreen, CheckoutGate, OrderSuccessScreen } from "./index";
import type { CreateOrderResponse } from "./model/create-order-response.schema";
import type { SavedCheckout } from "./model/pending-order.schema";
import { useCheckoutStore } from "./state/checkout-store";

/**
 * The customer journey through the feature's PUBLIC surface, composed the
 * way the customer layout composes it: CheckoutGate around each route.
 * Real cart and checkout stores over the real storage seam; the only network
 * seam mocked is the feature's own `api/submit-order`. The router is a
 * per-file mock, so the journey mounts each route in turn, exactly where the
 * recorded navigation says the app would go.
 */

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
const mockPathname = { current: "/cart" };
const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname.current,
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));

const mockUuidCounter = { current: 0 };
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockUuidCounter.current += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter.current).padStart(12, "0")}`;
  },
}));

jest.mock("./api/submit-order", () => ({
  submitOrder: jest.fn(),
}));
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

jest.mock("@/features/catalog", () => ({
  useCustomerCatalogSettings: () => ({ data: { customerSuccessResetSeconds: 25 } }),
  useInvalidateCatalog: () => () => {},
}));

const CART_KEY = storageKey("cart", "lines");
const CHECKOUT_KEY = storageKey("checkout", "order");
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

const SUCCESS: CreateOrderResponse = {
  kind: "success",
  order_id: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  display_number: "KX7QR9",
  created_at: "2026-02-01T10:15:30+00:00",
};

async function seedCart(lines: CartLine[]) {
  const written = await storage.write(CART_KEY, { version: 1, ownerId: TEST_PROFILE.id, lines });
  expect(written.status).toBe("persisted");
}

async function seedCheckout(record: SavedCheckout) {
  const written = await storage.write(CHECKOUT_KEY, record);
  expect(written.status).toBe("persisted");
}

/** The customer layout: the gate around the current route, once auth is ready. */
function CustomerLayout({ route }: { route: "cart" | "success" }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <CheckoutGate>{route === "cart" ? <CartOrderScreen /> : <OrderSuccessScreen />}</CheckoutGate>
  );
}

const authHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function openRoute(route: "cart" | "success") {
  mockPathname.current = route === "cart" ? "/cart" : "/checkout-success";
  authHolder.current?.restore();
  authHolder.current = installMockAuth();
  return renderWithProviders(<CustomerLayout route={route} />, { withAuth: true });
}

describe("checkout journey", () => {
  beforeEach(async () => {
    setLogSink(() => {});
    mockSubmitOrder.mockReset();
    Object.values(mockRouter).forEach((fn) => fn.mockClear());
    mockRedirect.mockClear();
    await storage.remove(CART_KEY);
    await storage.remove(CHECKOUT_KEY);
    await hydrateCart(SCRATCH_OWNER);
    await useCheckoutStore.getState().recover(SCRATCH_OWNER);
  });

  afterEach(() => {
    resetLogging();
    authHolder.current?.restore();
    authHolder.current = null;
  });

  it("cart → Confirm order → order number → Start a new order → a clean slate for the next customer", async () => {
    await seedCart([cappuccinoLine, waterLine]);
    mockSubmitOrder.mockResolvedValueOnce(SUCCESS);
    const user = userEvent.setup();

    // The cart route, restored for this customer.
    const cart = await openRoute("cart");
    await user.press(await screen.findByRole("button", { name: "Confirm order" }));

    // One request with the cart's exact items; the gate hands off to success.
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder.mock.calls[0]?.[0].items).toEqual(ITEMS);
    expect(getCartSnapshot().lines).toHaveLength(0);
    await cart.unmount();

    // The success route shows the order number and what was ordered.
    await openRoute("success");
    expect(await screen.findByLabelText("Order number K X 7 Q R 9")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();

    mockRouter.replace.mockClear();
    await user.press(screen.getByRole("button", { name: "Start a new order" }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/"));
    expect(useCheckoutStore.getState().phase).toBe("idle");
    expect((await storage.read(CHECKOUT_KEY, (raw) => raw)).status).toBe("miss");
    // Exactly one order was ever sent.
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
  });

  it("after a restart, re-sends the saved order with its STORED id and finishes on the success route", async () => {
    // The tablet restarted while an order was on its way: the pending record
    // and the locked customer's cart are both on disk.
    await seedCart([cappuccinoLine, waterLine]);
    await seedCheckout({
      version: 1,
      state: "pending",
      ownerId: TEST_PROFILE.id,
      requestId: STORED_REQUEST_ID,
      items: ITEMS,
      lineSnapshots: [cappuccinoLine, waterLine],
    });
    mockSubmitOrder.mockResolvedValueOnce(SUCCESS);

    const cart = await openRoute("cart");

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      clientRequestId: STORED_REQUEST_ID,
      items: ITEMS,
    });
    expect(getCartSnapshot().lines).toHaveLength(0);
    await cart.unmount();

    await openRoute("success");
    expect(await screen.findByLabelText("Order number K X 7 Q R 9")).toBeOnTheScreen();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
