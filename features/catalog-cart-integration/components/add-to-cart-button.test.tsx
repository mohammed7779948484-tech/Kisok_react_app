import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactNode } from "react";
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
  waitFor,
} from "@/core/testing";
import { getCartSnapshot, lockCart, type AddToCartInput } from "@/features/cart";

import { AddToCartButton } from "./add-to-cart-button";
import { CatalogCartProvider } from "./catalog-cart-provider";
import type { CatalogCartSource } from "../model/add-to-cart-mapping";

/**
 * Behaviour of the integration's Add-to-cart action (plan decisions 2/6/7 and
 * the F-R1-1 round-review window; brief AC-02, AC-03, AC-04, AC-05).
 *
 * The button is exercised exactly the way its only consumer mounts it: inside
 * the REAL T02 `CatalogCartProvider` (the real `useQuickCart` context and the
 * real QuickCartSheet — no context drift), behind the real auth gate (the
 * provider's mounted `useCart()` is the hydration owner; nothing in this test
 * hydrates the store itself), against the REAL single cart store driven
 * through the public surface only (`getCartSnapshot`, `lockCart`). The store
 * singleton is not importable from this feature, so one unique owner id per
 * test plus the store's owner-switch reset inside `hydrate()` re-baselines
 * memory between tests — the T02 provider suite's pattern, followed
 * deliberately.
 *
 * The pre-hydration window (F-R1-1) is only observable by holding the cart's
 * durable read open at the AsyncStorage seam — the same seam the global jest
 * setup already fakes. The mock-auth and read chains are pure microtasks that
 * settle inside RNTL v14's awaited `render`, so without holding the read the
 * transient `hydrated === false` frame is invisible; a controlled deferred
 * promise keeps it open long enough to assert the honest disabled state and
 * its release.
 *
 * ESLint note: this suite reaches the cart ONLY through `@/features/cart`
 * (the public index) — the same boundary the button itself respects.
 */

/**
 * The provider calls `useRouter()` from expo-router for the View Full Cart
 * intent (plan decision 8), so rendering the real provider needs the module
 * mocked — the T02 provider suite's minimal mock: one stable router whose
 * `push` is a jest.fn. The `mock` prefix keeps the reference inside jest's
 * factory allowlist.
 *
 * T04 (structurally forced, Lead to disposition): the real provider rendered
 * by the harness below now also calls `usePathname()` for the persistent
 * affordance's `/cart` gate, so this suite's module mock must expose it.
 * Assertion-neutral — no assertion in this file changed; the pathname reports
 * the route this suite actually exercises (Product Detail), so the affordance
 * renders exactly as it does in the delivered app there.
 */
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => "/product-detail",
}));

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The button renders the
 * ShoppingCart icon and the provider's sheet graph renders the rest; the
 * standardized null-rendering stand-ins keep this a test of the button's
 * contract (see the cart and provider suites).
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
 * surface (see the ESLint note above).
 */
const AVAILABLE_OWNER = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const UNAVAILABLE_OWNER = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const LOCKED_OWNER = "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f";
const WINDOW_OWNER = "d4e5f6a7-b8c9-4d0e-8f1a-3b4c5d6e7f8a";
const ORDER_OWNER = "e5f6a7b8-c9d0-4e1f-8a2b-4c5d6e7f8a9b";

/** A structural source with an option-backed variant — the caption-hazard family. */
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

/** The same selection with the variant unavailable — inspectable, not addable. */
const unavailableSource: CatalogCartSource = {
  ...availableSource,
  variant: { ...availableSource.variant, isAvailable: false },
};

/** The T01-mapped input the available source must produce (label rule: option TYPE names). */
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

/** The composed row caption the open sheet renders for that input (AC-04). */
const expectedCaption = "Flavor, Milk · Hazelnut · Oat";

/**
 * Which AdaptiveSheet presentation a test exercises is decided by
 * `useLayout()` → `useWindowDimensions()`; setting the frame BEFORE render
 * means no mounted tree reacts to the change (the provider suite's pattern).
 * 1024×768 → expanded landscape side panel.
 */
type Frame = { width: number; height: number };
const LANDSCAPE: Frame = { width: 1024, height: 768 };

function setFrame({ width, height }: Frame) {
  Dimensions.set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

/**
 * The cart's mutations persist fire-and-forget; this feature's tests cannot
 * call the store's own `persistNow` (deep import), so one macrotask turn —
 * the provider suite's `settleDurableWrites` pattern — lets the serialized
 * write chain settle inside act.
 */
async function settleDurableWrites() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/**
 * Gates the button on auth readiness, exactly as the app does: the (customer)
 * group only mounts under `ready && profile?.role === "customer"`, and the
 * button's `useCart()` → `useActiveProfile()` throwing outside authenticated
 * surfaces is core/auth's contract (the provider suite's AuthedHarness
 * pattern).
 */
function AuthedHarness({ children }: { children: ReactNode }) {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <CatalogCartProvider>{children}</CatalogCartProvider>;
}

/** installMockAuth restored after every test — the provider suite's holder pattern. */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderButton(source: CatalogCartSource, ownerId: string) {
  setFrame(LANDSCAPE);
  mockAuthHolder.current = installMockAuth({ profile: { ...TEST_PROFILE, id: ownerId } });
  return renderWithProviders(
    <AuthedHarness>
      <AddToCartButton source={source} />
    </AuthedHarness>,
    { withAuth: true },
  );
}

/**
 * Holds the cart's durable read open (F-R1-1's window) at the AsyncStorage
 * seam: every `getItem` for the cart key resolves only when `release()` is
 * called (with a miss — the honest empty restore); all other keys fall
 * through to the original implementation. `release()` MUST be called before
 * the test ends, or the store's serialized chains stay pending for the rest
 * of this file.
 *
 * Capture subtlety (probed empirically): the global jest setup mocks
 * AsyncStorage with `jest.fn` methods, and `jest.spyOn` on an existing
 * jest.fn shares THAT SAME function (it does not wrap it), so "the original"
 * must be captured as the function's IMPLEMENTATION — a reference to the
 * function itself would recurse into the mock. `release()` restores the
 * captured implementation explicitly for the same reason.
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
      // One act-wrapped macrotask so the released read — and the store update
      // it triggers — land inside act before the caller asserts.
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      // Restore the original implementation explicitly: the property is
      // already a jest.fn (the global setup's mock), so the spy shares the
      // same function and mockRestore alone does not bring the pre-spy
      // implementation back for later tests in this file.
      spy.mockRestore();
      if (originalGetItem) spy.mockImplementation(originalGetItem);
    },
  };
}

beforeEach(async () => {
  // The store's mutation and hydration paths log by design; keep the suite
  // silent per the repo convention.
  setLogSink(() => {});
  mockRouterPush.mockClear();
  // Disk hygiene: hydrate() reads this key, so a previous test's envelope must
  // not leak into the next one's restore. Through the app's own API.
  await storage.remove(KEY);
});

afterEach(() => {
  resetLogging();
  mockAuthHolder.current?.restore();
  mockAuthHolder.current = null;
});

describe("AddToCartButton", () => {
  it("is enabled when the variant is available and the cart is hydrated and unlocked; a press adds the T01-mapped line and opens the Quick Cart showing it", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, AVAILABLE_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    // Available + unlocked: enabled once the provider's own hydration has
    // landed (the awaited render drains the microtask chains).
    await waitFor(() => expect(addButton).not.toBeDisabled());

    await user.press(addButton);
    await settleDurableWrites();

    // The single real cart model holds exactly the mapped line — the T01
    // label rule (option TYPE names; values reach the caption only through
    // optionSelections) and quantity 1 (plan decision 6).
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject(expectedInput);
    expect(snapshot.totalQuantity).toBe(1);

    // And the press opened the Quick Cart through the integration context:
    // the sheet shows the fresh line's product name and the updated total.
    expect(screen.getByText("Almond Cold Brew")).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "Your Cart · 1" })).toBeOnTheScreen();
  });

  it("is disabled for an UNAVAILABLE variant — the label stays stable, and a press attempt changes nothing", async () => {
    const user = userEvent.setup();
    await renderButton(unavailableSource, UNAVAILABLE_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).toBeDisabled());

    // The stable affordance: same accessible name, same label — no text swap
    // for the unavailable state (the variant stays inspectable elsewhere).
    expect(addButton).toBeOnTheScreen();

    // A press attempt on the disabled control is a no-op: no line, no sheet.
    await user.press(addButton);
    await settleDurableWrites();
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toEqual([]);
    expect(snapshot.totalQuantity).toBe(0);
    expect(screen.queryByRole("heading", { name: "Your Cart · 0" })).toBeNull();
  });

  it("is disabled while the cart is locked — a press attempt changes nothing", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, LOCKED_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());

    // A real lock through the public action — the future Checkout path.
    await act(async () => {
      lockCart();
    });
    expect(addButton).toBeDisabled();

    await user.press(addButton);
    await settleDurableWrites();
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toEqual([]);
    expect(snapshot.totalQuantity).toBe(0);
  });

  it("is disabled through the real pre-hydration window, then enabled when hydration lands — no permanent-disable risk (F-R1-1)", async () => {
    const user = userEvent.setup();
    const heldRead = holdCartRead();
    try {
      await renderButton(availableSource, WINDOW_OWNER);

      const addButton = await screen.findByRole("button", { name: "Add to cart" });
      // THE WINDOW: the durable read is still in flight, so `hydrated` is
      // false and a press would be a silent logged no-op — the button is
      // honestly disabled instead (plan decision 7, reconciled for F-R1-1).
      expect(addButton).toBeDisabled();
      expect(getCartSnapshot().hydrated).toBe(false);

      // A press attempt in the window changes nothing.
      await user.press(addButton);
      expect(getCartSnapshot().lines).toEqual([]);
    } finally {
      // Always release: a stuck read would block every later hydrate in this
      // file (the store's serialized chains wait on it).
      await heldRead.release();
    }

    // Hydration landed: the button enables — hydrate() terminates with
    // `hydrated: true` on every path, so the disable can never be permanent.
    const addButton = screen.getByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());
    expect(getCartSnapshot().hydrated).toBe(true);

    // And the now-enabled button really works.
    await user.press(addButton);
    await settleDurableWrites();
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject(expectedInput);
  });

  it("adds FIRST and opens the sheet SECOND — after one press, the store holds the line and the open sheet shows it", async () => {
    const user = userEvent.setup();
    await renderButton(availableSource, ORDER_OWNER);

    const addButton = await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(addButton).not.toBeDisabled());
    await user.press(addButton);
    await settleDurableWrites();

    // After ONE press both hold together: the store has the line…
    const snapshot = getCartSnapshot();
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]).toMatchObject(expectedInput);
    // …and the open sheet shows that fresh line: the product name, the
    // AC-04-composed caption (label + option values, each value exactly
    // once), and the updated total in the title.
    expect(screen.getByText("Almond Cold Brew")).toBeOnTheScreen();
    expect(screen.getByText(expectedCaption)).toBeOnTheScreen();
    expect(screen.getByRole("heading", { name: "Your Cart · 1" })).toBeOnTheScreen();
  });
});
