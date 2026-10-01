import { AppState, BackHandler, type AppStateStatus } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { storage, storageKey } from "@/core/storage";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  TEST_PROFILE,
  userEvent,
} from "@/core/testing";
import { hydrateCart, type CartLine } from "@/features/cart";

import type { SavedCheckout } from "../../model/pending-order.schema";
import { useCheckoutStore } from "../../state/checkout-store";
import { OrderSuccessScreen } from "./order-success-screen";

/**
 * The success screen: the order number, large and unmistakable, with what
 * was ordered beside it. It returns the tablet to browsing on its own after
 * a quiet interval (any touch restarts it), or when the customer starts a
 * new order. Without a confirmed order it never shows success content.
 *
 * The real checkout store is loaded through its own recovery path from a
 * saved confirmed record — exactly what a cold start does. The catalog
 * settings/invalidation hooks are mocked at the catalog feature's public
 * module; expo-router is a per-file mock recording navigation.
 */

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
const mockRedirect = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
}));

type SettingsResult = { data?: { customerSuccessResetSeconds?: number } };
const mockSettings: { current: SettingsResult } = { current: {} };
const mockInvalidateCatalog = jest.fn();
jest.mock("@/features/catalog", () => ({
  useCustomerCatalogSettings: () => mockSettings.current,
  useInvalidateCatalog: () => mockInvalidateCatalog,
}));

/**
 * jest-expo resolves react-native to iOS, whose BackHandler drops handlers.
 * This spy stands in for Android's: registrations are recorded, `remove`
 * unregisters, and `pressHardwareBack` dispatches newest-first.
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

/** The countdown's AppState subscription (RN's jest mock records every call). */
function latestAppStateChangeHandler(): (status: AppStateStatus) => void {
  const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls.filter(
    (call) => call[0] === "change",
  );
  const latest = calls[calls.length - 1];
  if (latest === undefined) throw new Error("no AppState change listener was registered");
  return latest[1];
}

jest.useFakeTimers();

async function advanceClock(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

const CHECKOUT_KEY = storageKey("checkout", "order");
const SCRATCH_OWNER = "00000000-0000-4000-8000-000000000000";

const cappuccinoLine: CartLine = {
  lineId: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f|e5d3c8a1-6f2b-4c9d-8a7e-3b1f4d6c8a2b",
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

const CONFIRMED: SavedCheckout = {
  version: 1,
  state: "confirmed",
  ownerId: TEST_PROFILE.id,
  success: {
    orderId: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
    displayNumber: "KX7QR9",
    createdAt: "2026-02-01T10:15:30+00:00",
  },
  lineSnapshots: [cappuccinoLine, waterLine],
};

/** Load a confirmed order the way a cold start does: saved record + recovery. */
async function seedConfirmedOrder() {
  const written = await storage.write(CHECKOUT_KEY, CONFIRMED);
  expect(written.status).toBe("persisted");
  await useCheckoutStore.getState().recover(TEST_PROFILE.id);
  expect(useCheckoutStore.getState().phase).toBe("confirmed");
}

async function savedRecordStatus() {
  return (await storage.read(CHECKOUT_KEY, (raw) => raw)).status;
}

/** The start-over flow is async (store finish, then navigation); let it settle. */
async function settle() {
  for (let i = 0; i < 5 && mockRouter.replace.mock.calls.length === 0; i += 1) {
    await advanceClock(0);
  }
}

describe("OrderSuccessScreen", () => {
  beforeEach(async () => {
    setLogSink(() => {});
    Object.values(mockRouter).forEach((fn) => fn.mockClear());
    mockRedirect.mockClear();
    mockInvalidateCatalog.mockClear();
    mockSettings.current = { data: { customerSuccessResetSeconds: 25 } };
    installBackHandlerSpy();
    await storage.remove(CHECKOUT_KEY);
    await hydrateCart(SCRATCH_OWNER);
    // An owner switch resets the checkout singleton between tests.
    await useCheckoutStore.getState().recover(SCRATCH_OWNER);
  });

  afterEach(() => {
    resetLogging();
    jest.restoreAllMocks();
  });

  it("shows the order number and what was ordered, with no price-like content", async () => {
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    expect(screen.getByText("Order confirmed")).toBeOnTheScreen();
    expect(screen.getByText("Your order number")).toBeOnTheScreen();
    expect(screen.getByText("KX7QR9")).toBeOnTheScreen();
    // Read character by character, the way staff would say it.
    expect(screen.getByLabelText("Order number K X 7 Q R 9")).toBeOnTheScreen();
    expect(screen.getByText("What you ordered")).toBeOnTheScreen();
    expect(screen.getByText("3 items")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity 2")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity 1")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Start a new order" })).toBeEnabled();
    expect(screen.getByLabelText("Returning to the store in 25 seconds")).toBeOnTheScreen();
    expect(screen.queryByText(/\$|price|total/i)).toBeNull();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("uses singular wording for a single item", async () => {
    const written = await storage.write(CHECKOUT_KEY, {
      ...CONFIRMED,
      lineSnapshots: [waterLine],
    });
    expect(written.status).toBe("persisted");
    await useCheckoutStore.getState().recover(TEST_PROFILE.id);
    await renderWithProviders(<OrderSuccessScreen />);

    expect(screen.getByText("1 item")).toBeOnTheScreen();
  });

  it("refreshes the catalog once, since the order lowered the store's stock", async () => {
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    expect(mockInvalidateCatalog).toHaveBeenCalledTimes(1);
  });

  it("redirects home without any success content when there is no confirmed order", async () => {
    await useCheckoutStore.getState().recover(TEST_PROFILE.id);
    await renderWithProviders(<OrderSuccessScreen />);

    expect(mockRedirect).toHaveBeenCalledWith("/");
    expect(screen.queryByText("Order confirmed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start a new order" })).toBeNull();
    expect(mockInvalidateCatalog).not.toHaveBeenCalled();
    // Nothing to guard: back keeps its normal meaning.
    expect(backHandlers).toHaveLength(0);
  });

  it("Start a new order forgets the order and returns to the store", async () => {
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByRole("button", { name: "Start a new order" }));
    await settle();

    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    expect(useCheckoutStore.getState().phase).toBe("idle");
    expect(useCheckoutStore.getState().confirmed).toBeNull();
    expect(await savedRecordStatus()).toBe("miss");
  });

  it("returns to the store on its own when the configured quiet interval passes", async () => {
    mockSettings.current = { data: { customerSuccessResetSeconds: 10 } };
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    expect(screen.getByLabelText("Returning to the store in 10 seconds")).toBeOnTheScreen();
    await advanceClock(9_000);
    expect(screen.getByLabelText("Returning to the store in 1 second")).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await advanceClock(1_000);
    await settle();

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    expect(await savedRecordStatus()).toBe("miss");
  });

  it("falls back to 25 seconds when the setting is not available", async () => {
    mockSettings.current = {};
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    expect(screen.getByLabelText("Returning to the store in 25 seconds")).toBeOnTheScreen();
  });

  it("keeps the running deadline when settings arrive late", async () => {
    mockSettings.current = {};
    await seedConfirmedOrder();
    const view = await renderWithProviders(<OrderSuccessScreen />);

    await advanceClock(10_000);
    expect(screen.getByLabelText("Returning to the store in 15 seconds")).toBeOnTheScreen();

    // A late settings answer must not move a deadline the customer is watching.
    mockSettings.current = { data: { customerSuccessResetSeconds: 60 } };
    await act(async () => {
      await view.rerender(<OrderSuccessScreen />);
    });
    expect(screen.getByLabelText("Returning to the store in 15 seconds")).toBeOnTheScreen();

    await advanceClock(15_000);
    await settle();
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("restarts the quiet interval when the customer touches anywhere on the screen", async () => {
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    await advanceClock(10_000);
    expect(screen.getByLabelText("Returning to the store in 15 seconds")).toBeOnTheScreen();

    // A touch on the order summary, outside the countdown block.
    await fireEvent(screen.getByText("Cappuccino"), "touchStart");
    expect(screen.getByLabelText("Returning to the store in 25 seconds")).toBeOnTheScreen();

    // The old deadline passes without effect.
    await advanceClock(20_000);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Returning to the store in 5 seconds")).toBeOnTheScreen();
  });

  it("returns to the store immediately on resume when the interval ran out while suspended", async () => {
    await seedConfirmedOrder();
    await renderWithProviders(<OrderSuccessScreen />);

    await act(async () => {
      latestAppStateChangeHandler()("background");
    });
    // The wall clock moves on while the JS timers are frozen.
    jest.setSystemTime(Date.now() + 30_000);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      latestAppStateChangeHandler()("active");
    });
    await settle();

    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    expect(useCheckoutStore.getState().phase).toBe("idle");
  });

  it("consumes hardware back while the confirmation shows, so the auto-return still runs", async () => {
    await seedConfirmedOrder();
    const view = await renderWithProviders(<OrderSuccessScreen />);

    expect(pressHardwareBack()).toBe(true);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByText("Order confirmed")).toBeOnTheScreen();

    await view.unmount();
    expect(backHandlers).toHaveLength(0);
  });
});
