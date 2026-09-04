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
import {
  addItem,
  clearCartDurable,
  hydrateCart,
  lockCart,
  setLineQuantity,
  type AddToCartInput,
  type CartLine,
} from "@/features/cart";

import { OrderReviewScreen } from "./order-review-screen";

/**
 * lucide-react-native resolves (via the `react-native` condition) to an
 * untransformed ESM entry under jest-expo, so no test in this repo can
 * value-import it without a jest-config change. The screen's runtime graph
 * includes the Cart feature's PUBLIC index (useCart), which re-exports the
 * cart's components and screen — all of which value-import lucide — so the
 * module graph needs the standardized stand-ins (the full-cart and
 * attempt-store precedents). The icons are decorative SVGs here: ImageOff is
 * AppImage's fallback icon, ShoppingCart the review's empty-state icon, and
 * the stepper/remove icons come along with the cart index surface.
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
 * The review screen owns its escapes (Back to Cart from the footer AND from
 * the empty state), so it calls `useRouter()` from expo-router — the
 * full-cart screen's documented fallback: a minimal, standardized module mock
 * whose `push` is a jest.fn the tests assert against (there is no repo
 * precedent for driving the real router, which needs a full navigation
 * container). The `mock` prefix keeps the reference inside jest's factory
 * allowlist; the factory only closes over it — `useRouter` is called at
 * render time, well after module init — so hoisting is safe.
 */
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

/** The single durable key the cart store's restore reads (cart plan decision 1). */
const KEY = storageKey("cart", "lines");

/**
 * Store control through the PUBLIC API only: `useCartStore` is deliberately
 * not exported by the cart feature (exporting it would freeze the whole state
 * shape as public contract), so this suite cannot copy full-cart's
 * `setState` reset. The sanctioned equivalent is the store's own owner-switch
 * path: `hydrateCart` with a scratch profile id is always a customer switch
 * (or the first hydrate), and the store's serialized owner-switch reset
 * clears lines, lock, and persistence exactly once per test.
 */
const SCRATCH_OWNER = "00000000-0000-4000-8000-000000000000";

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

/**
 * A populated line with an image and two ordered option selections. The
 * lineId is the identity the cart rules derive for this selection (variantId
 * plus the sorted optionValueIds) — required by the persisted-cart schema's
 * restore refinement, so the durable envelopes seeded below restore cleanly.
 */
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

/** The same cappuccino selection as an add-to-cart input (identity is derived). */
const cappuccinoInput: AddToCartInput = {
  variantId: cappuccinoLine.variantId,
  productId: cappuccinoLine.productId,
  productDisplayName: cappuccinoLine.productDisplayName,
  variantLabel: cappuccinoLine.variantLabel,
  optionSelections: cappuccinoLine.optionSelections,
  imageUri: cappuccinoLine.imageUri,
  quantity: cappuccinoLine.quantity,
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
 * Seed the durable cart envelope for the signed-in profile through the app's
 * real storage API — the same key and payload shape the cart store persists
 * (`{ version: 1, ownerId, lines }`, validated by the cart's persisted-cart
 * schema on restore; the fixtures' lineIds are deriveLineId-valid by
 * construction). Only `storage.write` + the store's own restore are involved:
 * this suite drives the cart through its public seam only (see SCRATCH_OWNER).
 */
async function seedDurableEnvelope(lines: CartLine[]) {
  const writeResult = await storage.write(KEY, {
    version: 1,
    ownerId: TEST_PROFILE.id,
    lines,
  });
  // The seed really is on disk, or the restore assertions prove nothing.
  expect(writeResult.status).toBe("persisted");
}

/**
 * The installed mock auth client, restored after every test — use-cart's
 * holder pattern: installMockAuth() places a client in core/supabase's module
 * state, and no test may leave one behind for the next file-shared render.
 */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

/**
 * Gates the screen on auth readiness, exactly like the app's real route gate:
 * the root layout's `Stack.Protected guard` means the (customer) group only
 * mounts once auth has resolved a profile, and `useActiveProfile()` throwing
 * outside an authenticated experience is core/auth's contract, not a defect
 * for the screen to code around. The full-cart suite's AuthedCartScreen
 * pattern, wrapping the real screen instead of a probe component.
 */
function AuthedReviewScreen() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <OrderReviewScreen />;
}

async function renderScreen(frame: Frame = LANDSCAPE) {
  setFrame(frame);
  return renderWithProviders(<AuthedReviewScreen />, { withAuth: true });
}

/**
 * T08 — the Checkout Review screen's CONTENT (AC-02, AC-03): the hydrated
 * cart as a final read-only review. The submission flow itself is T09; here
 * the contract is what the review renders per line (product display name,
 * variant/options caption, quantity), the totals summary, the persistence
 * honesty, the escapes (Back to Cart), and the Confirm Order affordance's
 * enablement — present but inert.
 *
 * Behaviour and accessibility, not styling: every render mounts the screen
 * behind the auth gate with `installMockAuth()` + `{ withAuth: true }` (the
 * full-cart pattern), the cart is driven ONLY through `@/features/cart`'s
 * public API (durable envelope seeds + hydrateCart/lockCart/addItem), and the
 * real Screen, OrderLineRow, AppImage, EmptyState, SkeletonList, Alert,
 * Button and Text are driven unmocked; only lucide's icon renderer and
 * expo-router's `useRouter` are stubbed (documented above).
 */
describe("OrderReviewScreen", () => {
  beforeEach(async () => {
    // Store mutations and the persistence paths log by design; keep the suite
    // silent, per the repo convention.
    setLogSink(() => {});
    mockRouterPush.mockClear();
    // Disk hygiene (full-cart's pattern): the store's restore reads this key,
    // so a previous test's envelope must not leak into the next one's
    // restore. Through the app's own API.
    await storage.remove(KEY);
    // Store reset through the public seam: the scratch-owner hydrate is
    // always an owner switch (or first hydrate) for the singleton, so the
    // store's serialized reset clears the previous test's lines, lock, and
    // persistence status — the public-API equivalent of full-cart's
    // resetCartSingleton, which reached the store directly.
    await hydrateCart(SCRATCH_OWNER);
  });
  afterEach(() => {
    resetLogging();
    // The delayed-read / failing-write spies are spyOn-created; restore them
    // so no test inherits a broken storage seam. mockRouterPush is a plain
    // jest.fn, not a spy, so it survives untouched.
    jest.restoreAllMocks();
    mockAuthHolder.current?.restore();
    mockAuthHolder.current = null;
  });

  it("renders the hydrated cart as the final review: rows, captions, quantities, the totals summary, and both footer actions (AC-02)", async () => {
    // The RED case (T08 entry evidence): a previous session's durable cart for
    // the signed-in profile, restored by the screen's own runtime wiring — no
    // manual hydrate anywhere, exactly the full-cart restore pattern.
    await seedDurableEnvelope([cappuccinoLine, waterLine]);
    mockAuthHolder.current = installMockAuth();
    await renderScreen();

    // The review heading and each line's snapshot through the shared
    // read-only OrderLineRow.
    await screen.findByText("Review Your Order");
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("500 ml Bottle")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    // The summary derived through the cart view's selectors — never a mirror:
    // 2 + 1 = 3 total quantity across 2 distinct lines.
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
    // Both footer actions by role+name. Hydrated + populated + unlocked →
    // Confirm Order is ENABLED (AC-03's no-unsafe-submit rule's happy case;
    // the press itself is T09's, deliberately inert here).
    expect(screen.getByRole("button", { name: "Back to Cart" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm Order" })).not.toBeDisabled();
    // `persisted` renders NO alert — the exact inverse of the warning tests
    // below (the full-cart R-T08-03 pattern).
    expect(screen.queryByText("Saved in memory only")).toBeNull();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();
    // NO price-like content anywhere in the review — the product boundary.
    expect(screen.queryByText(/\$|price|total/i)).toBeNull();
  });

  it("renders the restore-pending skeleton while the durable read is in flight — no rows, no summary, no actions, no guesses", async () => {
    // The full-cart suite could not observe this transient frame (R-T11-01:
    // the mock-auth + AsyncStorage chains are pure microtasks that settle
    // inside RNTL v14's awaited render). Here the cart's durable read is
    // delayed by ONE macrotask through the real storage seam — the awaited
    // render drains microtasks but cannot drain a pending timer — so the
    // `!hydrated` presentation is genuinely observable, then gives way. The
    // delay is scoped to the cart key ONLY (the sign-out-cleanup spy
    // precedent): the auth chain's handoff-marker read must not be delayed
    // past the test, or its resolution lands outside every act window.
    const realRead = storage.read;
    const readSpy = jest.spyOn(storage, "read").mockImplementation(async (key, parse) => {
      if (key !== KEY) return realRead(key, parse);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      return realRead(key, parse);
    });

    try {
      mockAuthHolder.current = installMockAuth();
      await renderScreen();

      // The restore is genuinely in flight: the skeleton is the screen's
      // whole presentation. No heading, no rows, no summary, no footer
      // actions, and no empty-state guess from an unrestored cart.
      expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
      expect(screen.queryByText("Review Your Order")).toBeNull();
      expect(screen.queryByText("Cappuccino")).toBeNull();
      expect(screen.queryByText(/items? · /)).toBeNull();
      expect(screen.queryByRole("button", { name: "Back to Cart" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Confirm Order" })).toBeNull();

      // Settle the delayed read inside act, then the honest landing: nothing
      // is on disk (beforeEach removed the key), so the review lands on its
      // empty escape — restored only by the screen's own runtime wiring.
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      await screen.findByText("Your cart is empty");
    } finally {
      readSpy.mockRestore();
    }
  });

  it("renders the empty escape — no Confirm Order anywhere — and Back to Cart returns to /cart", async () => {
    mockAuthHolder.current = installMockAuth();
    const user = userEvent.setup();
    await renderScreen();

    // The review's empty state: nothing to submit, so the escape is the way
    // forward — no dead end on a kiosk.
    await screen.findByText("Your cart is empty");
    expect(screen.getByText("There's nothing to review or submit yet.")).toBeOnTheScreen();
    // The empty presentation has no footer: with nothing to confirm, the
    // confirm affordance does not exist here at all (AC-03).
    expect(screen.queryByRole("button", { name: "Confirm Order" })).toBeNull();
    const escape = screen.getByRole("button", { name: "Back to Cart" });
    expect(escape).not.toBeDisabled();

    await user.press(escape);
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/cart");
  });

  it("surfaces the memory-only persistence warning alongside the lines (AC-03)", async () => {
    mockAuthHolder.current = installMockAuth();
    // A real cart in review, then a REAL failed durable write: a public-API
    // mutation whose persist the storage seam rejects — the store's honest
    // memoryOnly, never a seeded status.
    await seedDurableEnvelope([cappuccinoLine, waterLine]);
    await hydrateCart(TEST_PROFILE.id);
    const writeSpy = jest
      .spyOn(storage, "write")
      .mockResolvedValue({ status: "rejected", error: new Error("disk full") });
    try {
      setLineQuantity(waterLine.lineId, 2);
      // Settle the fire-and-forget persist queue so the honest status lands
      // before the screen ever renders.
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    } finally {
      writeSpy.mockRestore();
    }
    await renderScreen();

    await screen.findByText("Saved in memory only");
    expect(
      screen.getByText(
        "We couldn't save your cart to this tablet, so it may be lost if the app closes.",
      ),
    ).toBeOnTheScreen();
    // The warning coexists with the review itself (the mutated quantity is
    // live: 2 + 2 = 4 across 2 lines), and is not conflated with the
    // clear-failure status.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("4 items · 2 lines")).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't clear the saved cart")).toBeNull();
  });

  it("surfaces a failed durable clear as the destructive warning — never a memory-only nuisance (AC-03)", async () => {
    mockAuthHolder.current = installMockAuth();
    // A durable clear whose remove AND its empty-envelope fallback both fail:
    // the previous cart genuinely remains on disk — the store's honest
    // clearFailed. The customer re-adds a line and reviews; the standing
    // clearFailed persists through the also-failing write (the store's status
    // precedence: never undersold as memoryOnly). All through the public API.
    await hydrateCart(TEST_PROFILE.id);
    const writeSpy = jest
      .spyOn(storage, "write")
      .mockResolvedValue({ status: "rejected", error: new Error("disk full") });
    const removeSpy = jest
      .spyOn(storage, "remove")
      .mockResolvedValue({ status: "rejected", error: new Error("disk full") });
    try {
      await clearCartDurable();
      addItem(cappuccinoInput);
      // Settle the re-add's fire-and-forget persist (its failure must land
      // while the clearFailed status is standing, before the screen renders).
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
    } finally {
      writeSpy.mockRestore();
      removeSpy.mockRestore();
    }
    await renderScreen();

    await screen.findByText("Couldn't clear the saved cart");
    expect(
      screen.getByText(
        "A previous cart may still be stored on this tablet. Please let store staff know.",
      ),
    ).toBeOnTheScreen();
    // The alert coexists with the re-added line under review.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.queryByText("Saved in memory only")).toBeNull();
  });

  it("Back to Cart in the footer pushes /cart — explicit navigation, valid from any entry (AC-02)", async () => {
    await seedDurableEnvelope([waterLine]);
    mockAuthHolder.current = installMockAuth();
    const user = userEvent.setup();
    await renderScreen();

    await screen.findByRole("button", { name: "Back to Cart" });
    await user.press(screen.getByRole("button", { name: "Back to Cart" }));
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/cart");
  });

  it("disables Confirm Order while the cart is locked — Back to Cart stays enabled (the lock blocks submission, not movement)", async () => {
    await seedDurableEnvelope([cappuccinoLine, waterLine]);
    mockAuthHolder.current = installMockAuth();
    // Restore for the signed-in profile through the public seam, then the
    // cart-wide interaction lock a submission would hold.
    await hydrateCart(TEST_PROFILE.id);
    lockCart();
    await renderScreen();

    await screen.findByRole("button", { name: "Confirm Order" });
    expect(screen.getByRole("button", { name: "Confirm Order" })).toBeDisabled();
    // The lock blocks cart mutation and submission, never movement: the
    // escape stays enabled (the full-cart locked-escape convention).
    expect(screen.getByRole("button", { name: "Back to Cart" })).not.toBeDisabled();
    // The read-only review itself is unaffected by the lock: rows + summary.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
  });

  it("renders the same review content at the compact portrait frame (480×900)", async () => {
    await seedDurableEnvelope([waterLine]);
    mockAuthHolder.current = installMockAuth();
    await renderScreen(COMPACT);

    await screen.findByText("Sparkling Water");
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByText("1 item · 1 line")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm Order" })).toBeOnTheScreen();
  });
});
