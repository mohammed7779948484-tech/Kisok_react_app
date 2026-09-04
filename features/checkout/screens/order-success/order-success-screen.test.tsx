import { AppState, type AppStateStatus } from "react-native";

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
import { getCartSnapshot, hydrateCart, type CartLine } from "@/features/cart";

import type { CheckoutAttempt } from "../../model/checkout-attempt.schema";
import { useAttemptStore } from "../../state/attempt-store";

import { OrderSuccessScreen } from "./order-success-screen";

/**
 * T11 — the Order Success screen (AC-07, AC-14, AC-15): the confirmed
 * experience rendered from the store's CONFIRMED record, the deadline-based
 * inactivity countdown, the gated Next-Customer reset, the cleanup-unsafe
 * honesty (AC-11's presentation), and the stale/direct-route escape.
 *
 * Conventions (T08/T09, the review-screen suite):
 *
 * - lucide-react-native resolves to an untransformed ESM entry under
 *   jest-expo, and the screen's runtime graph reaches it twice (the attempt
 *   store imports the Cart feature's PUBLIC index, which re-exports cart
 *   components; OrderLineRow renders AppImage, whose fallback icon is
 *   ImageOff) — the standardized null-rendering stand-ins.
 * - The screen owns its escapes, so `useRouter()` is the full-cart suite's
 *   documented module mock (a jest.fn `push`).
 * - The settings seam (plan D6): the screen reads
 *   `useCustomerCatalogSettings` from `@/features/catalog`'s public index —
 *   mocked at the module boundary here, because the catalog's own suite owns
 *   the query/selector behaviour and the catalog index has a side-effect
 *   import graph a screen test should not have to load. The mock closes over
 *   a holder (the router-mock pattern) so it stays mutable per test.
 * - The attempt store is the REAL singleton driven through public actions
 *   only: a durable record seeded through `storage.write` + `recover()` —
 *   the honest restart path, loading a confirmed record exactly as a cold
 *   start would (the T09 suite's lightest mechanism).
 * - Fake timers (products-screen precedent): the countdown is deadline-based
 *   and the tests advance the faked clock; userEvent gets `advanceTimers`.
 *   AppState is react-native's own jest mock, so the resume tests capture the
 *   countdown's "change" listener from its recorded calls.
 * - No auth wrapper: unlike the review screen, the success screen renders no
 *   cart hook (the record is in memory), so `installMockAuth` is not needed.
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

/** The review-suite precedent: a minimal router mock whose `push` is asserted. */
const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

/**
 * The D6 settings seam, mocked at the catalog feature's public module: the
 * screen reads only `isPending` / `isError` / `data.customerSuccessResetSeconds`.
 * The holder default is "resolved, configured 25s" — the migration's own
 * default — and each test sets exactly the state it needs.
 */
type SettingsHookResult = {
  isPending: boolean;
  isError: boolean;
  data?: { customerSuccessResetSeconds: number | undefined };
};
const mockSettingsResult: { current: SettingsHookResult } = {
  current: { isPending: false, isError: false, data: { customerSuccessResetSeconds: 25 } },
};
jest.mock("@/features/catalog", () => ({
  useCustomerCatalogSettings: () => mockSettingsResult.current,
}));

/**
 * Fake timers (the products-screen precedent): the countdown is deadline-based
 * against the faked clock, expiry tests advance it, and userEvent gets the
 * `advanceTimers` option the repo's fake-timer suites use.
 */
jest.useFakeTimers();

/** The single durable key the attempt store owns (plan decision D1). */
const ATTEMPT_KEY = storageKey("checkout", "attempt");
/** The cart store's durable key — seeded for the cleanup-retry test. */
const CART_KEY = storageKey("cart", "lines");

/**
 * Store control through the PUBLIC seam (the review suite's pattern): a
 * scratch-owner hydrate is always an owner switch, resetting the cart
 * singleton's lines, lock and persistence between tests.
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

/** A populated submitted line with two ordered option selections and an image. */
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

/** The record's embedded items — T02's output over the two lines above. */
const SUBMITTED_ITEMS = [
  { variant_id: "3a7f2c1d-9b4e-4d6a-8f2c-7e1b5d9a4c3f", quantity: 2 },
  { variant_id: "9c2d5e1a-3f4b-4a8c-b7d6-8e9f0a1b2c3d", quantity: 1 },
];

/**
 * A schema-valid confirmed attempt record for the signed-in profile — the
 * DURABLE success payload the restart path (recover) loads honestly.
 */
function confirmedAttempt(cleanup: "pending" | "done" | "failed"): CheckoutAttempt {
  return {
    version: 1,
    ownerId: TEST_PROFILE.id,
    clientRequestId: "00000000-0000-4000-8000-000000000001",
    items: SUBMITTED_ITEMS,
    fingerprint: "seeded-fingerprint-cappuccino-water",
    lineSnapshots: [cappuccinoLine, waterLine],
    status: "confirmed",
    success: {
      orderId: "d0a1b2c3-4d5e-4f60-8a7b-8c9d0e1f2a3b",
      displayNumber: "KX7QR9",
      createdAt: "2026-02-01T10:15:30+00:00",
    },
    cleanup: { cartClear: cleanup },
  };
}

/** A schema-valid UNRESOLVED record — the escape test's "record exists, but not a success". */
function unresolvedAttempt(): CheckoutAttempt {
  return {
    version: 1,
    ownerId: TEST_PROFILE.id,
    clientRequestId: "00000000-0000-4000-8000-000000000001",
    items: SUBMITTED_ITEMS,
    fingerprint: "seeded-fingerprint-cappuccino-water",
    lineSnapshots: [cappuccinoLine, waterLine],
    status: "unresolved",
  };
}

/**
 * Seed the durable attempt record and load it through the store's own
 * recovery path — the honest restart: `recover()` validates and classifies
 * exactly as a cold start would, so the screen renders from real store state.
 */
async function seedConfirmedAttempt(cleanup: "pending" | "done" | "failed") {
  const write = await storage.write(ATTEMPT_KEY, confirmedAttempt(cleanup));
  // The seed really is on disk, or the recover assertions prove nothing.
  expect(write.status).toBe("persisted");
  const outcome = await useAttemptStore.getState().recover(TEST_PROFILE.id);
  expect(outcome).toBe(cleanup === "done" ? "confirmed-cleanup-done" : "confirmed-cleanup-pending");
}

/** Seed the durable attempt record, unresolved, and recover it. */
async function seedUnresolvedAttempt() {
  const write = await storage.write(ATTEMPT_KEY, unresolvedAttempt());
  expect(write.status).toBe("persisted");
  const outcome = await useAttemptStore.getState().recover(TEST_PROFILE.id);
  expect(outcome).toBe("unresolved");
}

/** The store's durable record key, read the way the store would on a cold start. */
async function readAttemptKeyOnDisk() {
  return storage.read(ATTEMPT_KEY, (raw) => raw);
}

/**
 * The most recently registered AppState "change" listener — the countdown's
 * subscription (react-native's jest mock records every addEventListener call,
 * and nothing else in this suite registers one).
 */
function latestAppStateChangeHandler(): (status: AppStateStatus) => void {
  const addEventListener = AppState.addEventListener as unknown as jest.Mock;
  const changeCalls = addEventListener.mock.calls.filter((call) => call[0] === "change");
  const latest = changeCalls[changeCalls.length - 1];
  if (latest === undefined) {
    throw new Error("no AppState change listener was registered by the countdown");
  }
  return latest[1];
}

/** Advance the faked clock (wall clock + timers) inside a proper act window. */
async function advanceClock(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/**
 * Flush a fire-and-forget async chain (the store's serialized durable ops a
 * press or a countdown expiry started) inside proper act windows, until the
 * predicate holds. RNTL's `waitFor` under fake timers drives its own act
 * loop, which in this suite's render-heavy sequence left the React 19
 * scheduler in a state the NEXT test's fresh render could not recover from
 * (probed directly while writing this suite: the same expectation flushed
 * this way passes AND the following test renders); so the explicit act-flush
 * is this suite's waiting form.
 */
async function flushAsyncWork(predicate: () => boolean, rounds = 10) {
  for (let round = 0; round < rounds && !predicate(); round += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
  }
}

/** Simulate an OS app-state transition reaching the mounted countdown. */
async function emitAppState(status: AppStateStatus) {
  await act(async () => {
    latestAppStateChangeHandler()(status);
  });
}

async function renderScreen() {
  return renderWithProviders(<OrderSuccessScreen />);
}

describe("OrderSuccessScreen", () => {
  beforeEach(async () => {
    // Store mutations and refusal paths log by design; keep the suite silent.
    setLogSink(() => {});
    mockRouterPush.mockClear();
    // The per-test settings default: resolved with the migration's 25s.
    mockSettingsResult.current = {
      isPending: false,
      isError: false,
      data: { customerSuccessResetSeconds: 25 },
    };
    // Disk hygiene (review-suite pattern): the cart key is seeded by the
    // cleanup-retry test, so it must not leak into the next restore.
    await storage.remove(CART_KEY);
    // Cart-singleton reset through the public seam (scratch-owner hydrate).
    await hydrateCart(SCRATCH_OWNER);
    // Attempt-store reset through its own ungated public wipe — durable key
    // AND the full memory envelope (record, phase, recordLoaded, payloads).
    await useAttemptStore.getState().clearForSignOut();
  });
  afterEach(() => {
    resetLogging();
    // The failing-remove test's spyOn is restored so no later test inherits
    // a broken storage seam; mockRouterPush is a plain jest.fn, not a spy.
    jest.restoreAllMocks();
  });

  it("renders the confirmed record's success content: heading, order number, submitted snapshots, summary, countdown, and Next Customer (AC-07)", async () => {
    await seedConfirmedAttempt("done");
    await renderScreen();

    // The strong confirmed state.
    await screen.findByText("Order Confirmed");
    expect(screen.getByText("Your order has been sent to the store")).toBeOnTheScreen();
    // The display number, LARGE and mono (read aloud across a counter), with
    // an accessible name that says what the code is.
    expect(screen.getByText("Order number")).toBeOnTheScreen();
    expect(screen.getByLabelText("Order number KX7QR9")).toBeOnTheScreen();
    // The immutable submitted snapshots through T08's read-only row: names,
    // variant/options captions, and each quantity by its label convention.
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("500 ml Bottle")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    // The summary DERIVED from the record's snapshots — 2 + 1 across 2 lines.
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
    // The countdown (default settings: 25s) and the gated reset affordance.
    expect(screen.getByLabelText("Order resets in 25 seconds")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Next Customer" })).not.toBeDisabled();
    // NO price-like content anywhere — the product boundary.
    expect(screen.queryByText(/\$|price|total/i)).toBeNull();
  });

  it("renders the settings-pending skeleton without crashing — no success content guesses while the shared query is in flight", async () => {
    mockSettingsResult.current = { isPending: true, isError: false };
    await seedConfirmedAttempt("done");
    await renderScreen();

    // The record is in memory, but the countdown needs a number the shared
    // query has not resolved yet: the whole presentation waits honestly.
    expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
    expect(screen.queryByText("Order Confirmed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next Customer" })).toBeNull();
    expect(screen.queryByLabelText(/Order resets in/)).toBeNull();
  });

  it("honors the configured customer_success_reset_seconds for the countdown window (AC-14)", async () => {
    mockSettingsResult.current = {
      isPending: false,
      isError: false,
      data: { customerSuccessResetSeconds: 10 },
    };
    await seedConfirmedAttempt("done");
    await renderScreen();

    expect(await screen.findByLabelText("Order resets in 10 seconds")).toBeOnTheScreen();
  });

  it("falls back to 25 seconds when the setting is absent, and when the settings read failed (AC-14)", async () => {
    // The `{}` settings union member: the field is undefined.
    mockSettingsResult.current = {
      isPending: false,
      isError: false,
      data: { customerSuccessResetSeconds: undefined },
    };
    await seedConfirmedAttempt("done");
    const first = await renderScreen();
    expect(await screen.findByLabelText("Order resets in 25 seconds")).toBeOnTheScreen();

    // An unreachable/failed read resolves the same way: the fallback window.
    mockSettingsResult.current = { isPending: false, isError: true, data: undefined };
    await act(async () => {
      first.rerender(<OrderSuccessScreen />);
    });
    expect(screen.getByLabelText("Order resets in 25 seconds")).toBeOnTheScreen();
  });

  it("drives the gated reset from the countdown's expiry: attempt data cleared, phase idle, navigation to the customer home (AC-14)", async () => {
    await seedConfirmedAttempt("done");
    await renderScreen();
    await screen.findByLabelText("Order resets in 25 seconds");

    // The window elapses with the screen in the foreground.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(25_000);
    });

    // The reset ran through the store's gate: the durable attempt record is
    // GONE (a cold start would find nothing), the machine is idle, and the
    // kiosk navigates to the customer home.
    await flushAsyncWork(() => mockRouterPush.mock.calls.length > 0);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
    expect(useAttemptStore.getState().record).toBeNull();
    expect(useAttemptStore.getState().phase).toBe("idle");
    expect((await readAttemptKeyOnDisk()).status).toBe("miss");
  });

  it("restarts the countdown on interaction — the label goes back up after ticks have run it down (AC-14)", async () => {
    await seedConfirmedAttempt("done");
    await renderScreen();
    await screen.findByLabelText("Order resets in 25 seconds");

    await advanceClock(10_000);
    expect(screen.getByLabelText("Order resets in 15 seconds")).toBeOnTheScreen();

    // Any touch in the countdown's wrapper (the responder grant IS the touch
    // landing) re-arms the deadline.
    await fireEvent(screen.getByTestId("success-countdown"), "responderGrant");
    expect(screen.getByLabelText("Order resets in 25 seconds")).toBeOnTheScreen();

    // The reset did NOT fire while the window is fresh again.
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(useAttemptStore.getState().record).not.toBeNull();
  });

  it("re-arms the countdown for a touch ANYWHERE on the content — the reading customer keeps their window (F-T11-01 / AC-14)", async () => {
    await seedConfirmedAttempt("done");
    await renderScreen();
    await screen.findByLabelText("Order resets in 25 seconds");

    await advanceClock(10_000);
    expect(screen.getByLabelText("Order resets in 15 seconds")).toBeOnTheScreen();

    // A touch on the CONTENT (a submitted-item row, not the countdown block):
    // the content root's pass-through onTouchStart re-arms the window.
    await fireEvent(screen.getByText("Cappuccino"), "touchStart");
    expect(screen.getByLabelText("Order resets in 25 seconds")).toBeOnTheScreen();

    // The old deadline passes without expiring; the re-armed one owns it.
    await advanceClock(5_000);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Order resets in 20 seconds")).toBeOnTheScreen();
  });

  it("recomputes on app resume: a deadline that expired while suspended fires immediately (AC-14)", async () => {
    await seedConfirmedAttempt("done");
    await renderScreen();
    await screen.findByLabelText("Order resets in 25 seconds");

    // Background the app; the WALL clock passes the deadline while the JS
    // thread's timers are frozen (setSystemTime advances the clock without
    // firing the interval — the suspended-process shape).
    await emitAppState("background");
    jest.setSystemTime(Date.now() + 30_000);
    expect(mockRouterPush).not.toHaveBeenCalled();

    // Resume: the active transition re-checks the deadline and the gated
    // reset fires NOW — not on the next drifted tick.
    await emitAppState("active");
    await flushAsyncWork(() => mockRouterPush.mock.calls.length > 0);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
    expect(useAttemptStore.getState().record).toBeNull();
    expect(useAttemptStore.getState().phase).toBe("idle");
    expect((await readAttemptKeyOnDisk()).status).toBe("miss");
  });

  it("Next Customer resets the kiosk: attempt data cleared, phase idle, customer home (AC-14)", async () => {
    await seedConfirmedAttempt("done");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderScreen();
    await user.press(await screen.findByRole("button", { name: "Next Customer" }));

    await flushAsyncWork(() => mockRouterPush.mock.calls.length > 0);
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
    expect(useAttemptStore.getState().record).toBeNull();
    expect(useAttemptStore.getState().phase).toBe("idle");
    expect((await readAttemptKeyOnDisk()).status).toBe("miss");
  });

  it("holds Next Customer behind an accessible reason while the post-success clear is still pending", async () => {
    await seedConfirmedAttempt("pending");
    await renderScreen();

    await screen.findByText("Order Confirmed");
    // The reset is NOT offered as an enabled action while cleanup is
    // unfinished — the store's own gate would refuse it.
    const next = screen.getByRole("button", { name: "Next Customer" });
    expect(next).toBeDisabled();
    expect(
      screen.getByText("We're finishing clearing this tablet for the next customer — one moment."),
    ).toBeOnTheScreen();
    // The countdown still runs (its expiry lands on the same gated reset).
    expect(screen.getByLabelText("Order resets in 25 seconds")).toBeOnTheScreen();
  });

  it("surfaces the unsafe-cleanup state: the warning renders, Next Customer is not offered, no countdown — and Try Clearing Again finishes cleanup and the reset (AC-11)", async () => {
    // A real cart envelope for the record's owner, so the retried clear has
    // something real to clear (asserted through the public cart API after).
    const seedCart = await storage.write(CART_KEY, {
      version: 1,
      ownerId: TEST_PROFILE.id,
      lines: [cappuccinoLine],
    });
    expect(seedCart.status).toBe("persisted");
    await seedConfirmedAttempt("failed");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderScreen();

    // The confirmed content is still shown (the order IS confirmed)…
    await screen.findByText("Order Confirmed");
    expect(screen.getByText("KX7QR9")).toBeOnTheScreen();
    // …but the destructive honesty replaces the reset affordances entirely:
    // no Next Customer, no countdown offering an auto-reset.
    expect(
      screen.getByText("We couldn't finish clearing this tablet for the next customer"),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Next Customer" })).toBeNull();
    expect(screen.queryByLabelText(/Order resets in/)).toBeNull();

    // The one way forward: finish the clear, then the gated reset.
    await user.press(await screen.findByRole("button", { name: "Try Clearing Again" }));
    await flushAsyncWork(() => mockRouterPush.mock.calls.length > 0);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
    // The cart really was cleared through the Cart feature's public seam…
    expect(getCartSnapshot().lines.length).toBe(0);
    // …and the checkout-owned success data is gone with the machine idle.
    expect(useAttemptStore.getState().record).toBeNull();
    expect(useAttemptStore.getState().phase).toBe("idle");
    expect((await readAttemptKeyOnDisk()).status).toBe("miss");
  });

  it("surfaces a refused reset honestly: a failed durable remove keeps the record and offers the retry, which completes the reset", async () => {
    await seedConfirmedAttempt("done");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // The attempt record's durable remove fails: the reset is REFUSED, the
    // record is kept for the next attempt (the store's clearFailed honesty).
    const removeSpy = jest
      .spyOn(storage, "remove")
      .mockResolvedValue({ status: "rejected", error: new Error("disk full") });
    await renderScreen();
    await user.press(await screen.findByRole("button", { name: "Next Customer" }));

    // Refused: no navigation, the record is still confirmed, and the honest
    // warning with its retry action replaces the reset affordances.
    expect(mockRouterPush).not.toHaveBeenCalled();
    await flushAsyncWork(
      () =>
        screen.queryByText("We couldn't finish clearing this tablet for the next customer") !==
        null,
    );
    expect(
      screen.getByText("We couldn't finish clearing this tablet for the next customer"),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Next Customer" })).toBeNull();

    // The storage seam heals; the retry re-runs the (idempotent) cleanup and
    // the gated reset, and the kiosk lands on the customer home.
    removeSpy.mockRestore();
    await user.press(await screen.findByRole("button", { name: "Try Clearing Again" }));
    await flushAsyncWork(() => mockRouterPush.mock.calls.length > 0);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
    expect((await readAttemptKeyOnDisk()).status).toBe("miss");
    expect(useAttemptStore.getState().phase).toBe("idle");
  });

  it("renders the safe escape for a stale/direct route with no record — never the success content — and Back to Browse returns home (AC-15)", async () => {
    // Fresh machine: recover() has run (the T12 gate's composition) and found
    // nothing on disk.
    const outcome = await useAttemptStore.getState().recover(TEST_PROFILE.id);
    expect(outcome).toBe("none");
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderScreen();

    // The escape: a warning that does NOT encourage resubmission.
    await screen.findByText("This order can't be shown here.");
    expect(
      screen.getByText(
        "If you just placed an order, it's safe — don't submit it again. Let store staff know if you need help.",
      ),
    ).toBeOnTheScreen();
    // NEVER the success content and never the cart.
    expect(screen.queryByText("Order Confirmed")).toBeNull();
    expect(screen.queryByText("KX7QR9")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next Customer" })).toBeNull();
    expect(screen.queryByLabelText(/Order resets in/)).toBeNull();

    const escape = screen.getByRole("button", { name: "Back to Browse" });
    expect(escape).not.toBeDisabled();
    await user.press(escape);
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
  });

  it("renders the escape for an UNRESOLVED record too — an ambiguous attempt is not a success (AC-15)", async () => {
    await seedUnresolvedAttempt();
    await renderScreen();

    await screen.findByText("This order can't be shown here.");
    expect(screen.queryByText("Order Confirmed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next Customer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to Browse" })).toBeOnTheScreen();
  });
});
