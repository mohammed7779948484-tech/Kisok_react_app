import type { QueryClient } from "@tanstack/react-query";
import { BackHandler, Dimensions } from "react-native";

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
  addItem,
  clearCartDurable,
  getCartSnapshot,
  hydrateCart,
  lockCart,
  setLineQuantity,
  type AddToCartInput,
  type CartLine,
} from "@/features/cart";

import { submitOrder } from "../../api/submit-order";
import type { CreateOrderResponse } from "../../model/create-order-response.schema";
import { checkoutAttemptSchema } from "../../model/checkout-attempt.schema";
import { useAttemptStore } from "../../state/attempt-store";

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

/**
 * The attempt store's default idFactory mints through expo-crypto, and
 * jest-expo's ExpoCrypto native-module mock stubs `randomUUID()` to return
 * `undefined` — which would persist a record the attempt schema must reject
 * (the sign-out-cleanup suite's precedent). The factory below is COUNTER-
 * backed rather than fixed: every mint is schema-valid AND distinct, so the
 * identity assertions below prove REUSE — a re-mint under the unknown hold,
 * or a fresh id after a definite failure, shows up as a different counter
 * value. The holder is reset per test so each test's first mint is ...001.
 */
const mockUuidCounter = { current: 0 };
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockUuidCounter.current += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter.current).padStart(12, "0")}`;
  },
}));

/**
 * The feature's own api door, mocked at the module (the tests.md seam): ONE
 * mock covers BOTH transport paths — the mutation hook the screen submits
 * through (plan D13) and the attempt store's default `submit` dep bound at
 * module load — so the replay path in the unknown test drives the same jest
 * fn the confirm path does.
 */
jest.mock("../../api/submit-order", () => ({
  submitOrder: jest.fn(),
}));
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

/**
 * R3-02's jest pattern for BackHandler — no precedent in the repo, so this
 * block establishes it. There is nothing to lean on: RN's jest setup mocks
 * AppState, Clipboard, … but NOT BackHandler, and jest-expo resolves
 * `react-native` to the iOS platform (the preset's haste.defaultPlatform),
 * whose `BackHandler.addEventListener` is a no-op stub that DROPS the
 * handler and whose `remove` is unobservable. So the spy stands in for the
 * ANDROID implementation's contract — the platform this guard exists for:
 * every addEventListener("hardwareBackPress", …) registration lands in a
 * test-visible list, the returned subscription's `remove` splices it back
 * out (mirroring BackHandler.android.js), and `pressHardwareBack()`
 * dispatches with the real dispatcher's semantics — reverse registration
 * order, stop at the first handler returning true (the press is consumed;
 * the default back behavior never runs). Installed in beforeEach;
 * afterEach's restoreAllMocks returns the platform stub, like every other
 * spy in this suite.
 */
type HardwareBackHandler = () => boolean | null | undefined;
type HardwareBackSubscription = { handler: HardwareBackHandler; remove: jest.Mock };

const backPressSubscriptions: HardwareBackSubscription[] = [];

function installBackHandlerSpy() {
  backPressSubscriptions.length = 0;
  jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_eventName, handler: HardwareBackHandler) => {
      const subscription: HardwareBackSubscription = {
        handler,
        remove: jest.fn(() => {
          const index = backPressSubscriptions.indexOf(subscription);
          if (index !== -1) {
            backPressSubscriptions.splice(index, 1);
          }
        }),
      };
      backPressSubscriptions.push(subscription);
      return { remove: subscription.remove };
    });
}

/** The recorded registrations — the AppState-mock reading precedent's cast. */
function hardwareBackRegistrations() {
  return (BackHandler.addEventListener as unknown as jest.Mock).mock.calls;
}

/**
 * The real android dispatcher's walk: last registered first, and the first
 * `true` consumes the press (the default back behavior never runs). The
 * return value is what the native side would act on.
 */
function pressHardwareBack(): boolean {
  for (let i = backPressSubscriptions.length - 1; i >= 0; i -= 1) {
    const subscription = backPressSubscriptions[i];
    if (subscription !== undefined && subscription.handler()) {
      return true;
    }
  }
  return false;
}

/** The single durable key the cart store's restore reads (cart plan decision 1). */
const KEY = storageKey("cart", "lines");

/** The single durable key the attempt store owns (plan decision D1). */
const ATTEMPT_KEY = storageKey("checkout", "attempt");

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

/**
 * A programmatic over-capacity cart (the normalize-refusal branch's fixture):
 * 101 lines of 101 DISTINCT variants. The cart rules cap each line's
 * QUANTITY (1..99, addLine) but never the line count, so this payload is
 * fully restorable through the persisted-cart schema — deterministic
 * zero-padded canonical uuids, unique per line; no-option lines make the
 * derived lineId just the lowercased variantId, exactly like waterLine —
 * and it passes every press-time guard. T02's normalizeCartLines refuses
 * exactly this shape: more than 100 distinct variants after grouping.
 */
const OVER_CAPACITY_LINES: CartLine[] = Array.from({ length: 101 }, (_, index) => {
  const variantId = `${String(index + 1).padStart(8, "0")}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  return {
    lineId: variantId,
    variantId,
    productId: variantId,
    productDisplayName: `Menu Item ${index + 1}`,
    variantLabel: "Regular",
    optionSelections: [],
    imageUri: null,
    quantity: 1,
  };
});

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
 * The exact items payload `create_order` must receive for the seeded lines —
 * T02's output over [cappuccinoLine, waterLine]: unique variants, quantities
 * summed per variant, rows sorted by variant_id ("3a7f…" sorts before
 * "9c2…"). Pinned LITERALLY: the screen's submission must run the REAL
 * normalization rules, and a rules change fails here instead of at the
 * server.
 */
const SUBMITTED_ITEMS = [
  { variant_id: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f", quantity: 2 },
  { variant_id: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d", quantity: 1 },
];

/** The success-family response fixture (the store suite's shape). */
const SUCCESS_RESPONSE: Extract<CreateOrderResponse, { kind: "success" }> = {
  kind: "success",
  order_id: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  display_number: "KX7QR9",
  created_at: "2026-02-01T10:15:30+00:00",
};

/** A one-variant stock-conflict family return — a normal 2xx JSON, no order. */
const CONFLICT_RESPONSE: Extract<CreateOrderResponse, { kind: "stock_conflict" }> = {
  kind: "stock_conflict",
  conflicts: [
    { variant_id: cappuccinoLine.variantId, requested_quantity: 2, available_quantity: 1 },
  ],
};

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

/** The client renderWithProviders built, held for afterEach cleanup (see below). */
const queryClientRef: { current: QueryClient | null } = { current: null };

async function renderScreen(frame: Frame = LANDSCAPE) {
  setFrame(frame);
  const result = await renderWithProviders(<AuthedReviewScreen />, { withAuth: true });
  queryClientRef.current = result.queryClient;
  return result;
}

/**
 * T12's RecoveryGate stand-in: in the delivered app the gate mounted in the
 * customer layout runs `recover()` for the active profile before any review
 * screen is reachable (plan D7) — which is what lifts prepareAttempt's
 * recovery-pending gate (F-06-02). T09 precedes T12, so the suite drives the
 * same public action directly; the asserted "none" pins that the beforeEach
 * wipe really landed and every submission starts from a clean machine.
 */
async function recoverAttemptStore() {
  const outcome = await useAttemptStore.getState().recover(TEST_PROFILE.id);
  expect(outcome).toBe("none");
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
    // R3-02: the BackHandler spy (its block above) — fresh registry per
    // test, restored by afterEach's restoreAllMocks like the storage spies.
    installBackHandlerSpy();
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
    // The attempt-store singleton reset, the same way the screen suite reaches
    // everything: a public action, not `setState` (the store is not exported
    // frozen for that). `clearForSignOut` is the store's own ungated wipe —
    // durable key AND the full memory envelope (record, phase, recordLoaded,
    // outcome payloads) — which the sign-out cleanup drives in production.
    await useAttemptStore.getState().clearForSignOut();
  });
  afterEach(() => {
    resetLogging();
    // The delayed-read / failing-write spies are spyOn-created; restore them
    // so no test inherits a broken storage seam. mockRouterPush is a plain
    // jest.fn, not a spy, so it survives untouched.
    jest.restoreAllMocks();
    mockAuthHolder.current?.restore();
    mockAuthHolder.current = null;
    // TanStack schedules a five-minute GC timer for each completed mutation
    // the moment its observer unmounts — the shared test client caps gcTime
    // for QUERIES only (the use-submit-order-mutation suite's precedent).
    // Destroying the mutations cancels those timers; without this the suite
    // passes but jest never exits.
    for (const mutation of queryClientRef.current?.getMutationCache().getAll() ?? []) {
      mutation.destroy();
    }
    queryClientRef.current = null;
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
    // PARKED on a test-controlled deferred through the real storage seam —
    // the read cannot resolve until THIS test releases it, so the
    // `!hydrated` presentation is genuinely observable and DETERMINISTIC
    // (the original one-macrotask setTimeout delay raced the awaited render
    // under parallel worker load — the suite flaked ~2 runs in 6; a parked
    // promise cannot fire early, whatever the scheduler does). The gate is
    // scoped to the cart key ONLY (the sign-out-cleanup spy precedent): the
    // auth chain's handoff-marker read must not be parked, or its
    // resolution lands outside every act window.
    let releaseCartRead!: () => void;
    const cartReadGate = new Promise<void>((resolve) => {
      releaseCartRead = resolve;
    });
    const realRead = storage.read;
    const readSpy = jest.spyOn(storage, "read").mockImplementation(async (key, parse) => {
      if (key !== KEY) return realRead(key, parse);
      await cartReadGate;
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

      // Release the parked read inside act, then the honest landing: nothing
      // is on disk (beforeEach removed the key), so the review lands on its
      // empty escape — restored only by the screen's own runtime wiring.
      await act(async () => {
        releaseCartRead();
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

  // T09 — the submission flow (AC-04, AC-08, AC-09, AC-10). The store owns
  // every phase transition (plan D8); this surface owns the orchestration:
  // guard → normalize (T02) → prepare (durable-before-network, AC-06) →
  // submit through the generated mutation hook (plan D13) → classify (D3's
  // single ambiguity boundary) → resolve through the store's actions. The
  // outcome panels render from the store's per-field selectors, never from
  // screen-local loading/error flags.
  describe("submission flow (T09)", () => {
    beforeEach(() => {
      // Each test's FIRST mint is deterministic (...001): the counter-backed
      // expo-crypto mock (see its factory comment) resets per test, while the
      // api mock drops any previous test's implementations.
      mockUuidCounter.current = 0;
      mockSubmitOrder.mockReset();
    });

    it("submits through the real flow: one api call with the exact normalized request, the durable record written before the network resolves, confirmed phase, cleared cart, one success push (AC-04/AC-06/AC-07)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      // The flight stays open until THIS test resolves it, so the mid-flight
      // invariants are observed while they hold, not reconstructed after.
      let resolveSubmit!: (value: CreateOrderResponse) => void;
      mockSubmitOrder.mockImplementation(
        () =>
          new Promise<CreateOrderResponse>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

      // THE T09 RED case, made specific: the press reached the api exactly
      // once, with the freshly minted id and the T02-normalized items.
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
      expect(mockSubmitOrder).toHaveBeenCalledWith({
        clientRequestId: "00000000-0000-4000-8000-000000000001",
        items: SUBMITTED_ITEMS,
      });

      // Mid-flight (AC-04): the blocking overlay owns the screen, and the cart
      // is locked against edits. The footer buttons beneath the overlay are
      // asserted UNREACHABLE by accessibility queries — that is the overlay's
      // documented design working, not a gap: `BlockingOverlay` sets
      // `aria-modal`, and RNTL (mirroring screen-reader semantics) marks every
      // element whose host sibling carries `aria-modal` as inaccessible, so
      // neither getByRole nor userEvent can touch the buttons while the
      // overlay is up. Unreachable + disabled beneath is exactly the
      // UI-layer double-press and back-navigation prevention of AC-04; the
      // server's idempotency contract remains the actual duplicate guard.
      expect(screen.getByLabelText("Submitting your order…")).toBeOnTheScreen();
      expect(useAttemptStore.getState().phase).toBe("submitting");
      expect(screen.queryByRole("button", { name: "Confirm Order" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Back to Cart" })).toBeNull();
      expect(getCartSnapshot().locked).toBe(true);

      // Durable-before-network (AC-06), observed mid-flight: while the
      // network promise is still pending, the UNRESOLVED record is already
      // on disk under the attempt key, carrying the exact id in flight.
      const midFlight = await storage.read(ATTEMPT_KEY, (raw) => checkoutAttemptSchema.parse(raw));
      if (midFlight.status !== "hit") {
        throw new Error("the attempt record was not on disk while the submit was in flight");
      }
      expect(midFlight.value.status).toBe("unresolved");
      expect(midFlight.value.ownerId).toBe(TEST_PROFILE.id);
      expect(midFlight.value.clientRequestId).toBe("00000000-0000-4000-8000-000000000001");

      // Let the flight land: capture → durably confirm → clear (D4), the
      // machine reaches "confirmed", the cart is cleared through the REAL
      // cart store, and the success route push fires EXACTLY once — the
      // re-render after the clear must not re-navigate.
      await act(async () => {
        resolveSubmit(SUCCESS_RESPONSE);
      });
      await waitFor(() => expect(getCartSnapshot().lines).toEqual([]));
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(useAttemptStore.getState().phase).toBe("confirmed");
      expect(mockRouterPush).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).toHaveBeenCalledWith("/checkout-success");
    });

    it("ignores a second Confirm press while the submission is in flight — one api call, no second order (AC-04)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      let resolveSubmit!: (value: CreateOrderResponse) => void;
      mockSubmitOrder.mockImplementation(
        () =>
          new Promise<CreateOrderResponse>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      const user = userEvent.setup();
      await renderScreen();

      const confirm = await screen.findByRole("button", { name: "Confirm Order" });
      await user.press(confirm);

      // In flight: the overlay is up and the trigger is disabled beneath it —
      // the second press below is a no-op at every layer (the overlay's touch
      // interception, the disabled affordance, the handler's phase guard).
      expect(screen.getByLabelText("Submitting your order…")).toBeOnTheScreen();
      expect(confirm).toBeDisabled();
      await user.press(confirm);
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);

      // Settle the flight so no dangling mutation state leaks past this test.
      await act(async () => {
        resolveSubmit(SUCCESS_RESPONSE);
      });
      await waitFor(() => expect(useAttemptStore.getState().phase).toBe("confirmed"));
    });

    it("resolves a stock_conflict response into the conflict panel: joined rows, requested/available in words and numbers, preserved unlocked cart, Return to Cart instead of Confirm (AC-08)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder.mockResolvedValue(CONFLICT_RESPONSE);
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

      // The panel (AC-08): the honest warning, the conflict rows joined to
      // the cart's display data, and requested/available as words AND
      // numbers — never colour alone.
      await screen.findByText("Some items aren't available in the requested quantities");
      expect(
        screen.getByText(
          "No order was submitted, and your cart wasn't changed. Return to your cart to adjust the quantities.",
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
      expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
      expect(screen.getByText("Requested 2 · Available 1")).toBeOnTheScreen();
      // The cart is preserved without silent mutation and the interaction
      // lock is released — the store owns both at resolve time.
      expect(getCartSnapshot().lines).toHaveLength(2);
      expect(getCartSnapshot().locked).toBe(false);
      // The only way forward is the explicit return; the confirm affordance
      // is gone in this phase, and nothing auto-retried the RPC.
      expect(screen.getByRole("button", { name: "Return to Cart" })).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Confirm Order" })).toBeNull();
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    });

    it("holds an ambiguous network result as unknown: locked cart, honest copy, no Back to Cart, and Check Again replays the SAME identity (AC-09)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      // The first flight never gets a definitive answer; the replay does.
      mockSubmitOrder
        .mockRejectedValueOnce(
          new AppError({
            kind: "network",
            userMessage: "We couldn't reach the network. Check the connection and try again.",
          }),
        )
        .mockResolvedValueOnce(SUCCESS_RESPONSE);
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

      // The unknown panel — deliberately NOT the failure panel (AC-09): a
      // warning, not a destructive presentation, with copy that says what
      // "check again" actually does.
      await screen.findByText("We couldn't confirm whether your order went through");
      expect(
        screen.getByText(
          "It may already exist — we'll check safely without submitting a duplicate.",
        ),
      ).toBeOnTheScreen();
      // The cart stays locked: editing is unsafe while the outcome is unknown.
      expect(getCartSnapshot().locked).toBe(true);
      // Movement in this phase is the panel's action ONLY — no Back to Cart.
      expect(screen.queryByRole("button", { name: "Back to Cart" })).toBeNull();
      const checkAgain = screen.getByRole("button", { name: "Check Again" });
      expect(checkAgain).not.toBeDisabled();

      await user.press(checkAgain);

      // The identity-reuse proof (AC-09): the replay re-sends the SAME
      // client_request_id — the counter-backed id factory would surface a
      // different value if the flow had re-minted instead of replaying.
      await waitFor(() => expect(mockSubmitOrder).toHaveBeenCalledTimes(2));
      expect(mockSubmitOrder).toHaveBeenNthCalledWith(2, {
        clientRequestId: "00000000-0000-4000-8000-000000000001",
        items: SUBMITTED_ITEMS,
      });
      // The replay resolves through the store's own path — the same machine
      // and the same classifier — landing on confirmed + the success push.
      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/checkout-success"));
      expect(useAttemptStore.getState().phase).toBe("confirmed");
    });

    it("resolves a retryable server failure into the failure panel, and Try Again mints a NEW attempt identity (AC-10)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder
        .mockRejectedValueOnce(
          new AppError({
            kind: "server",
            userMessage: "Something went wrong on our side. Please try again.",
          }),
        )
        .mockResolvedValueOnce(SUCCESS_RESPONSE);
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

      // The failure panel (AC-10): the mapped userMessage, destructive and
      // distinct from the unknown panel, with the retry affordance the kind
      // allows (server failures are retryable) and the way back.
      await screen.findByText("Something went wrong on our side. Please try again.");
      expect(screen.getByRole("button", { name: "Try Again" })).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Back to Cart" })).not.toBeDisabled();
      // A definite failure released the interaction lock.
      expect(getCartSnapshot().locked).toBe(false);

      await user.press(screen.getByRole("button", { name: "Try Again" }));

      // The distinction from the unknown-state retry: the definite failure's
      // identity was DISCARDED at resolve, so the new attempt mints a fresh
      // id (...002) — a same-identity replay here would be the K1003 bug.
      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/checkout-success"));
      expect(mockSubmitOrder).toHaveBeenCalledTimes(2);
      expect(mockSubmitOrder).toHaveBeenNthCalledWith(2, {
        clientRequestId: "00000000-0000-4000-8000-000000000002",
        items: SUBMITTED_ITEMS,
      });
    });

    it("renders a non-retryable validation failure without any Try Again affordance (AC-10)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder.mockRejectedValueOnce(
        new AppError({
          kind: "validation",
          userMessage: "We couldn't process that request. Please try again.",
        }),
      );
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

      await screen.findByText("We couldn't process that request. Please try again.");
      // Retrying the same payload fails identically — the kind is honest
      // about that, and the affordance is absent, not merely disabled.
      expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
      expect(screen.getByRole("button", { name: "Back to Cart" })).toBeOnTheScreen();
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    });

    it("surfaces a K1003 idempotency-conflict honestly: its message renders, nothing re-submits, nothing re-mints (AC-10)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder.mockRejectedValueOnce(
        new AppError({
          kind: "idempotency-conflict",
          userMessage: "This order was already submitted with different items.",
        }),
      );
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

      // The honest message (D11): never auto-resolved by re-minting.
      await screen.findByText("This order was already submitted with different items.");
      expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
      // The ONE api call is all that ever happened.
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
      // The machine treated it as definite: the attempt is discarded and the
      // cart unlocked — no unresolved hold, no automatic replay.
      expect(useAttemptStore.getState().record).toBeNull();
      expect(getCartSnapshot().locked).toBe(false);
    });

    it("surfaces a failed pre-submit durable write as a local warning — the network call never happens (AC-06's screen half)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      const user = userEvent.setup();
      await renderScreen();

      // Reject ONLY the attempt key's write (the sign-out suite's filtered
      // spy precedent): the pre-submit durable write fails, and the honest
      // refusal must stop the flow BEFORE any network call.
      const realWrite = storage.write;
      const writeSpy = jest
        .spyOn(storage, "write")
        .mockImplementation(async (key: string, value: unknown) => {
          if (key !== ATTEMPT_KEY) return realWrite(key, value);
          return { status: "rejected", error: new Error("disk full") };
        });
      try {
        await user.press(await screen.findByRole("button", { name: "Confirm Order" }));

        await screen.findByText("We couldn't save your order details to this tablet");
        expect(mockSubmitOrder).not.toHaveBeenCalled();
        // The store stayed idle — a pre-submission refusal is a local
        // warning, never an outcome phase.
        expect(useAttemptStore.getState().phase).toBe("idle");
      } finally {
        writeSpy.mockRestore();
      }
    });

    it("refuses a 101-distinct-variant cart as a local validation warning — no network call, the store stays idle (AC-05's hard stop)", async () => {
      await seedDurableEnvelope(OVER_CAPACITY_LINES);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      const user = userEvent.setup();
      await renderScreen();

      // Every press-time guard PASSES — hydrated, 101 populated lines,
      // unlocked, owned — because the cart caps line quantity, not the line
      // count: the press reaches normalization, which refuses the
      // over-capacity cart (T02: at most 100 distinct variants).
      const confirm = await screen.findByRole("button", { name: "Confirm Order" });
      expect(confirm).not.toBeDisabled();
      await user.press(confirm);

      // The catch's local warning renders with the review — never a crash,
      // never an outcome phase owning the screen.
      await screen.findByText("We couldn't prepare your order");
      expect(
        screen.getByText("Please try again. If it keeps happening, please let store staff know."),
      ).toBeOnTheScreen();
      // Hard-stopped before anything left the device: no submit, no minted
      // durable attempt — the machine never left idle.
      expect(mockSubmitOrder).not.toHaveBeenCalled();
      expect(useAttemptStore.getState().record).toBeNull();
      expect(useAttemptStore.getState().phase).toBe("idle");
    });

    it("resets a stale stock-conflict outcome when the review is re-entered — the panel does not survive a fresh mount", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder.mockResolvedValue(CONFLICT_RESPONSE);
      const user = userEvent.setup();
      const firstMount = await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));
      await screen.findByText("Some items aren't available in the requested quantities");
      // The customer's exit: the panel's own way back to the (preserved) cart.
      await user.press(screen.getByRole("button", { name: "Return to Cart" }));
      expect(mockRouterPush).toHaveBeenCalledWith("/cart");
      // RNTL v14's `unmount` is an ASYNC act (the use-cart suite's precedent):
      // it must be awaited. Left un-awaited, the second renderScreen() below
      // opens its act while the unmount's is still draining — React's
      // overlapping-act() warnings, and the second AuthProvider's mount
      // effects then flush through the orphaned act queue outside any act
      // window ("not configured to support act"). Awaiting settles the first
      // tree completely before the second one mounts.
      await firstMount.unmount();

      // Re-entry — a fresh Review push from the corrected cart: the
      // mount-time reset (enterReview) clears the STALE outcome phase, so
      // the panel cannot greet the corrected cart. The reset is mount-time
      // ONLY by design: while this screen stays mounted, a resolved panel
      // persists instead of flickering away.
      await renderScreen();
      await screen.findByRole("button", { name: "Confirm Order" });
      expect(useAttemptStore.getState().phase).toBe("idle");
      expect(
        screen.queryByText("Some items aren't available in the requested quantities"),
      ).toBeNull();
    });
  });

  // R3-02 — the hardware/gesture-BACK guard (AC-04's back-navigation half).
  // Android's back button must not pop this screen while a submission owns
  // the session: during "submitting" a pop strands a locked cart mid-flight,
  // and during "unknown" it strands the customer OFF the only Check Again
  // affordance — a dead end until a restart. The guard consumes the press
  // (the handler returns true); every other phase keeps standard back
  // semantics (the footer's escapes are the explicit way back). Driven
  // through the real flow (seed → recover → press → outcome), asserted
  // through the BackHandler spy's registry and dispatcher above.
  describe("hardware back guard (R3-02 / AC-04)", () => {
    beforeEach(() => {
      // The submission-flow suite's reset: deterministic first mint, and the
      // api mock drops any previous test's implementations.
      mockUuidCounter.current = 0;
      mockSubmitOrder.mockReset();
    });

    it("consumes the hardware back press while the outcome is unknown — the panel's Check Again cannot be stranded off-screen, and unmount removes the guard (R3-02 / AC-04)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder.mockRejectedValueOnce(
        new AppError({
          kind: "network",
          userMessage: "We couldn't reach the network. Check the connection and try again.",
        }),
      );
      const user = userEvent.setup();
      const view = await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));
      await screen.findByText("We couldn't confirm whether your order went through");
      // The unknown hold (the T09 pins): the cart is locked and the panel's
      // action is the only way through — exactly the state a back pop must
      // not strand the customer off of.
      expect(getCartSnapshot().locked).toBe(true);

      // The guard is live: ONE registration, on the hardware event.
      expect(backPressSubscriptions).toHaveLength(1);
      expect(hardwareBackRegistrations()).toHaveLength(1);
      expect(hardwareBackRegistrations()[0]?.[0]).toBe("hardwareBackPress");
      // The press is CONSUMED (the dispatcher's true stops the default back
      // behavior): no navigation fires, and Check Again is still the
      // customer's way through.
      expect(pressHardwareBack()).toBe(true);
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Check Again" })).not.toBeDisabled();

      // The leak rule: unmounting the screen removes the listener.
      await view.unmount();
      expect(backPressSubscriptions).toHaveLength(0);
    });

    it("consumes the hardware back press mid-flight, and the guard leaves when the phase does (R3-02 / AC-04)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      // The flight stays open until THIS test resolves it, so the mid-flight
      // guard is observed while the phase genuinely holds.
      let resolveSubmit!: (value: CreateOrderResponse) => void;
      mockSubmitOrder.mockImplementation(
        () =>
          new Promise<CreateOrderResponse>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      const user = userEvent.setup();
      await renderScreen();

      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));
      expect(useAttemptStore.getState().phase).toBe("submitting");

      expect(backPressSubscriptions).toHaveLength(1);
      expect(pressHardwareBack()).toBe(true);
      expect(mockRouterPush).not.toHaveBeenCalled();

      // The flight lands: the phase leaves the guarded set and the guard
      // goes with it — back is the system's again the moment the submission
      // stops owning the session (the success surface mounts its own).
      await act(async () => {
        resolveSubmit(SUCCESS_RESPONSE);
      });
      await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/checkout-success"));
      expect(useAttemptStore.getState().phase).toBe("confirmed");
      expect(backPressSubscriptions).toHaveLength(0);
    });

    it("subscribes in NO unguarded phase — idle, stock-conflict, and failed leave hardware back to the system (R3-02)", async () => {
      await seedDurableEnvelope([cappuccinoLine, waterLine]);
      await recoverAttemptStore();
      mockAuthHolder.current = installMockAuth();
      mockSubmitOrder.mockResolvedValue(CONFLICT_RESPONSE);
      const user = userEvent.setup();
      const firstMount = await renderScreen();

      // Idle review: reading a review owns no session — the footer's Back to
      // Cart is the explicit escape and hardware back stays standard.
      await screen.findByRole("button", { name: "Confirm Order" });
      expect(backPressSubscriptions).toHaveLength(0);

      // The conflict phase: the store unlocked the cart and the panel's
      // Return to Cart is the way forward — standard back semantics again.
      await user.press(screen.getByRole("button", { name: "Confirm Order" }));
      await screen.findByText("Some items aren't available in the requested quantities");
      expect(backPressSubscriptions).toHaveLength(0);

      // The failed panel, through the suite's re-entry pattern (the mount
      // reset returns the machine to idle first).
      await firstMount.unmount();
      await renderScreen();
      mockSubmitOrder.mockRejectedValueOnce(
        new AppError({
          kind: "server",
          userMessage: "Something went wrong on our side. Please try again.",
        }),
      );
      await user.press(await screen.findByRole("button", { name: "Confirm Order" }));
      await screen.findByText("Something went wrong on our side. Please try again.");
      expect(backPressSubscriptions).toHaveLength(0);
    });
  });
});
