import type { QueryClient } from "@tanstack/react-query";
import { Dimensions } from "react-native";

import { Text } from "@/components/ui";
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
import { FullCartScreen, getCartSnapshot, hydrateCart, type CartLine } from "@/features/cart";

import { submitOrder } from "./api/submit-order";
import { OrderReviewScreen, OrderSuccessScreen, RecoveryGate } from "./index";
import { checkoutAttemptSchema, type CheckoutAttempt } from "./model/checkout-attempt.schema";
import type { CreateOrderResponse } from "./model/create-order-response.schema";
import { useAttemptStore } from "./state/attempt-store";

/**
 * T15 — the customer journey integration suite (AC-16): the whole flow —
 * sign-in → durable cart → Review Order → review → confirm → success →
 * next-customer reset — proven TOGETHER, with the real composition. The real
 * cart store driven through `@/features/cart`'s public API, the real attempt
 * store driven through its public actions, the real screens behind the real
 * providers, and exactly ONE network seam mocked: the feature's own api door.
 * This is the convergence.test.tsx precedent applied to checkout — the
 * feature-root suite whose value is that no seam BETWEEN the pieces is mocked
 * away (the pieces' own behaviour is pinned by their own suites).
 *
 * Conventions (the T09/T11/T12/T14 suites — every mock below is one of their
 * established patterns):
 *
 * - lucide-react-native resolves (via the `react-native` condition) to an
 *   untransformed ESM entry under jest-expo, and every screen's runtime graph
 *   reaches it (directly or through the Cart feature's PUBLIC index) — the
 *   standardized null-rendering stand-ins keep the graph loadable.
 * - The screens own their navigation intents (`useRouter().push/replace`), so
 *   expo-router is the full-cart suite's documented module mock: `push` and
 *   `replace` are jest.fns the journey asserts against. The real router needs
 *   a full navigation container and no repo test drives it; the route-level
 *   composition is already pinned by the thin route files + the layout pins.
 *   So the journey mounts each SCREEN in sequence exactly as the router would:
 *   assert the recorded navigation target, then render the next screen.
 * - expo-crypto is the counter-backed working uuid (the review suite's
 *   factory): the happy path's ONE mint is deterministic (...001), and the
 *   restart record below carries a DIFFERENT stored id — so every identity
 *   assertion proves reuse of what the durable record holds, never a
 *   coincidence with a fresh mint.
 * - The feature's own api door — `./api/submit-order` from this feature root,
 *   the same module every path binds — is the single network seam mocked. ONE
 *   jest.fn covers the mutation hook the review screen submits through AND
 *   the attempt store's replay dep (both bind the same module).
 * - The D6 settings seam: `@/features/catalog`'s public module mock returns a
 *   configured `customerSuccessResetSeconds` (10 — small, so the journey can
 *   drive the countdown to expiry quickly; the T11 suite's holder pattern).
 * - Fake timers are scoped to the SUCCESS leg only (the T11 suite's
 *   convention): the cart/review/recovery legs run on the real clock exactly
 *   like their own suites, the countdown's expiry needs the faked clock, and
 *   the real clock is restored before the compact-frame leg (and in
 *   afterEach, before the mutation cleanup). No auth is mounted under the
 *   faked clock — the success screen renders no cart hook (the record is in
 *   memory, the T11 convention), so the mock-auth chain's resolution never
 *   depends on faked timer/microtask globals.
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
 * The full-cart suite's documented router mock, extended with `replace` (the
 * success reset's and the recovery gate's escape — the T11/T12 suites'
 * retargeting of the same pattern). The journey asserts navigation INTENTS
 * through these fns; the screens own them.
 */
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

/**
 * The counter-backed working uuid (the review suite's factory): every mint is
 * schema-valid AND distinct, and the holder is reset per test so the happy
 * path's first mint is deterministically ...001.
 */
const mockUuidCounter = { current: 0 };
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockUuidCounter.current += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter.current).padStart(12, "0")}`;
  },
}));

/**
 * The feature's own api door, mocked at the module (the tests.md seam) — from
 * this feature root the specifier resolves to the same module the mutation
 * hook (`../api/submit-order`) and the attempt store's default submit dep
 * (`../api/submit-order`) bind, so ONE mock covers every network flight the
 * journey observes.
 */
jest.mock("./api/submit-order", () => ({
  submitOrder: jest.fn(),
}));
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

/**
 * The D6 settings seam, mocked at the catalog feature's public module (the
 * T11 suite's pattern): the success screen reads only
 * `isPending` / `data.customerSuccessResetSeconds`. The holder default is
 * "resolved, configured 10s" — small enough to drive the countdown to expiry
 * quickly while still proving the CONFIGURED value (not the 25s fallback)
 * drives the journey's reset.
 */
type SettingsHookResult = {
  isPending: boolean;
  isError: boolean;
  data?: { customerSuccessResetSeconds: number | undefined };
};
const mockSettingsResult: { current: SettingsHookResult } = {
  current: { isPending: false, isError: false, data: { customerSuccessResetSeconds: 10 } },
};
jest.mock("@/features/catalog", () => ({
  useCustomerCatalogSettings: () => mockSettingsResult.current,
}));

/** The single durable key the cart store's restore reads (cart plan decision 1). */
const KEY = storageKey("cart", "lines");

/** The single durable key the attempt store owns (plan decision D1). */
const ATTEMPT_KEY = storageKey("checkout", "attempt");

/**
 * Store control through the PUBLIC API only (the review suite's pattern): a
 * scratch-owner hydrate is always an owner switch (or the first hydrate), and
 * the store's serialized owner-switch reset clears the previous test's lines,
 * lock, and persistence status.
 */
const SCRATCH_OWNER = "00000000-0000-4000-8000-000000000000";

/**
 * The stored idempotency identity the restart record carries — deliberately
 * NOT the counter mock's first-mint value (...001), so the restart journey's
 * identity assertions prove the replay reused the STORED id; a re-mint would
 * surface as a different value here.
 */
const STORED_CLIENT_REQUEST_ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";

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
 * A populated line with an image and two ordered option selections. The lineId
 * is the identity the cart rules derive for this selection (variantId plus the
 * sorted optionValueIds) — required by the persisted-cart schema's restore
 * refinement, so the durable envelopes seeded below restore cleanly.
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
 * The exact items payload `create_order` must receive for the seeded lines —
 * T02's output over [cappuccinoLine, waterLine]: unique variants, quantities
 * summed per variant, rows sorted by variant_id. Pinned LITERALLY (the review
 * suite's rationale): the journey's submission runs the REAL normalization
 * rules, and a rules change fails here instead of at the server.
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

/**
 * A schema-valid UNRESOLVED record for the signed-in profile — the restart
 * payload of the recovery journey: a submission whose transport result was
 * ambiguous, durable on disk with its idempotency identity intact (AC-09).
 */
function unresolvedAttempt(): CheckoutAttempt {
  return {
    version: 1,
    ownerId: TEST_PROFILE.id,
    clientRequestId: STORED_CLIENT_REQUEST_ID,
    items: SUBMITTED_ITEMS,
    fingerprint: "seeded-fingerprint-cappuccino-water",
    lineSnapshots: [cappuccinoLine, waterLine],
    status: "unresolved",
  };
}

/**
 * Seed the durable cart envelope for the signed-in profile through the app's
 * real storage API (the review suite's shape): `{ version: 1, ownerId, lines }`
 * — the same key and payload the cart store persists and restores. Only
 * `storage.write` + the screens' own runtime hydration are involved: the cart
 * is driven through its public seam only.
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
 * Seed the durable attempt record — and nothing else: the component under
 * test in the restart journey (the RecoveryGate) runs `recover()` itself at
 * mount, which is the honest cold-start path.
 */
async function seedAttemptRecord(record: CheckoutAttempt) {
  const writeResult = await storage.write(ATTEMPT_KEY, record);
  expect(writeResult.status).toBe("persisted");
}

/**
 * Which presentation a test exercises follows `useLayout()` →
 * `useWindowDimensions()` (the review suite's frame pattern). The jest window
 * defaults to 750×1334 (compact portrait), so every leg sets its frame BEFORE
 * rendering: 1024×768 → tablet landscape (the journey's default, tablet-first
 * per AC-16), 480×900 → the compact-frame variant.
 */
type Frame = { width: number; height: number };

const LANDSCAPE: Frame = { width: 1024, height: 768 };
const PORTRAIT: Frame = { width: 800, height: 1180 };
const COMPACT: Frame = { width: 480, height: 900 };

function setFrame({ width, height }: Frame) {
  Dimensions.set({
    window: { width, height, scale: 1, fontScale: 1 },
    screen: { width, height, scale: 1, fontScale: 1 },
  });
}

/**
 * The installed mock auth client, restored after every test — the use-cart
 * holder pattern: installMockAuth() places a client in core/supabase's module
 * state, and no test may leave one behind for the next file-shared render.
 */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

/**
 * Gates a screen on auth readiness, exactly like the app's real route gate
 * (the full-cart suite's AuthedCartScreen pattern): the root layout's guard
 * means the (customer) group only mounts once auth has resolved a profile.
 */
function AuthedCartScreen() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <FullCartScreen />;
}

/** The same gate for the review screen (the review suite's wrapper). */
function AuthedReviewScreen() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return <OrderReviewScreen />;
}

/** The children the gate composes over — the routed customer Stack's stand-in (the T12 pattern). */
const CHILDREN_TEXT = "The store catalog renders here";

/**
 * The restart journey's harness: the T12 gate wrapper — the layout
 * composition the (customer) layout actually mounts around its Stack.
 */
function AuthedGate() {
  const { status, profile } = useAuth();
  if (status !== "ready" || profile === null) return null;
  return (
    <RecoveryGate>
      <Text>{CHILDREN_TEXT}</Text>
    </RecoveryGate>
  );
}

/**
 * Every query client this journey's renders created, held for afterEach's
 * mutation cleanup (see below). Each render builds its own client, so the
 * array — not a single ref — is the honest ledger.
 */
const queryClients: QueryClient[] = [];

/**
 * Render one journey leg behind the real providers. The frame is set BEFORE
 * render (no mounted tree reacts to the change), and the query client joins
 * the afterEach ledger. `withAuth` defaults on — the (customer) routes sit
 * behind the auth gate — except the success leg (see the file header).
 */
async function renderJourney(
  ui: React.ReactElement,
  { frame = LANDSCAPE, withAuth = true }: { frame?: Frame; withAuth?: boolean } = {},
) {
  setFrame(frame);
  const result = await renderWithProviders(ui, { withAuth });
  queryClients.push(result.queryClient);
  return result;
}

/**
 * Flush a fire-and-forget async chain (the store's serialized durable ops a
 * countdown expiry started) inside proper act windows, until the predicate
 * holds — the T11 suite's waiting form, valid under the FAKED clock only (it
 * advances the fake timers), which is the only place this journey uses it.
 */
async function flushAsyncWork(predicate: () => boolean, rounds = 10) {
  for (let round = 0; round < rounds && !predicate(); round += 1) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
  }
}

/** The store's durable record key, read the way the store would on a cold start. */
async function readAttemptKey() {
  return storage.read(ATTEMPT_KEY, (raw) => raw);
}

describe("checkout journey (T15 / AC-16)", () => {
  beforeEach(async () => {
    // Store mutations and the persistence paths log by design; keep the suite
    // silent, per the repo convention.
    setLogSink(() => {});
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
    // Deterministic first mint (...001) for the happy path's single identity.
    mockUuidCounter.current = 0;
    mockSubmitOrder.mockReset();
    // The settings seam's per-test default: resolved with the configured 10s.
    mockSettingsResult.current = {
      isPending: false,
      isError: false,
      data: { customerSuccessResetSeconds: 10 },
    };
    // Disk hygiene (the review suite's pattern): the stores' restores read
    // these keys, so a previous test's envelopes must not leak into the next
    // one's restore. Through the app's own API — the attempt key is wiped by
    // clearForSignOut below, exactly like the review suite's beforeEach.
    await storage.remove(KEY);
    // Cart-singleton reset through the public seam (scratch-owner hydrate).
    await hydrateCart(SCRATCH_OWNER);
    // Attempt-store reset through its own ungated public wipe — durable key
    // AND the full memory envelope (record, phase, recordLoaded, payloads).
    await useAttemptStore.getState().clearForSignOut();
  });
  afterEach(() => {
    resetLogging();
    // The success leg installs the faked clock; restore the REAL clock FIRST
    // so the mutation cleanup below runs against real timer globals (a fake
    // clearTimeout cannot cancel a real pending timer).
    jest.useRealTimers();
    mockAuthHolder.current?.restore();
    mockAuthHolder.current = null;
    // Belt-and-braces mutation cleanup (the review suite's afterEach): the
    // shared test client caps mutation gcTime at Infinity, so no GC timer is
    // ever scheduled, but destroying the completed mutation keeps the cache
    // honest whatever a future config change does.
    for (const client of queryClients) {
      for (const mutation of client.getMutationCache().getAll()) {
        mutation.destroy();
      }
    }
    queryClients.length = 0;
  });

  it("drives the whole journey at the tablet frame: sign-in → durable cart → Review Order → review → confirm → success → countdown reset, plus the compact-frame variant (AC-16)", async () => {
    // ---- 1. The customer's session: mock auth + a previous browsing
    // session's durable cart (2 lines, one with options), and the layout
    // gate's recover() having found nothing — the T09 suite's stand-in for
    // the T12 RecoveryGate the layout mounts, which in the delivered app runs
    // before any review is reachable.
    await seedDurableEnvelope([cappuccinoLine, waterLine]);
    mockAuthHolder.current = installMockAuth();
    const recoverOutcome = await useAttemptStore.getState().recover(TEST_PROFILE.id);
    expect(recoverOutcome).toBe("none");

    const user = userEvent.setup();

    // ---- 2. The Full Cart screen (the cart feature's public surface, exactly
    // what the /cart route renders): its own runtime hydration restores the
    // durable envelope, and the checkout entry seam (AC-01) is the enabled
    // Review Order CTA.
    const cartView = await renderJourney(<AuthedCartScreen />);
    await screen.findByText("Cappuccino");
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
    const reviewOrder = screen.getByRole("button", { name: "Review Order" });
    expect(reviewOrder).not.toBeDisabled();

    await user.press(reviewOrder);
    // The navigation intent the router would act on: the checkout route.
    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith("/checkout");
    await cartView.unmount();

    // ---- 3. The Checkout Review screen (what /checkout renders): the final
    // read-only review of the same single cart model, then the real
    // submission flow through the store's machine.
    const reviewView = await renderJourney(<AuthedReviewScreen />);
    await screen.findByText("Review Your Order");
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();

    // The flight stays open until THIS test resolves it, so the mid-flight
    // invariants (the announced submitting state, the durable record written
    // BEFORE the network) are observed while they hold (the T09 deferred
    // pattern).
    let resolveSubmit!: (value: CreateOrderResponse) => void;
    mockSubmitOrder.mockImplementation(
      () =>
        new Promise<CreateOrderResponse>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    await user.press(screen.getByRole("button", { name: "Confirm Order" }));

    // The submission reached the api exactly once, with the freshly minted
    // idempotency identity and the T02-normalized items.
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      clientRequestId: "00000000-0000-4000-8000-000000000001",
      items: SUBMITTED_ITEMS,
    });
    // The announced in-flight state (AC-04/AC-16: states are announced, not
    // colour-only) — the blocking overlay owns the screen while it holds.
    expect(screen.getByLabelText("Submitting your order…")).toBeOnTheScreen();

    // Durable-before-network (AC-06), observed mid-flight: while the network
    // promise is still pending, the UNRESOLVED record is already on disk under
    // the attempt key, carrying the exact id in flight.
    const midFlight = await storage.read(ATTEMPT_KEY, (raw) => checkoutAttemptSchema.parse(raw));
    if (midFlight.status !== "hit") {
      throw new Error("the attempt record was not on disk while the submit was in flight");
    }
    expect(midFlight.value.status).toBe("unresolved");
    expect(midFlight.value.ownerId).toBe(TEST_PROFILE.id);
    expect(midFlight.value.clientRequestId).toBe("00000000-0000-4000-8000-000000000001");

    // Let the flight land: capture → durably confirm → clear (D4). The
    // machine reaches "confirmed", the REAL cart store is cleared through its
    // public snapshot, the durable cart key is gone (the next customer starts
    // clean), and the success route push fires EXACTLY once.
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
    const cartKey = await storage.read(KEY, (raw) => raw);
    expect(cartKey.status).toBe("miss");
    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenLastCalledWith("/checkout-success");
    await reviewView.unmount();

    // ---- 4. The Order Success screen (what /checkout-success renders): the
    // confirmed record's content — the strong confirmed state, the display
    // number read aloud across a counter, the immutable submitted snapshots,
    // and the gated Next-Customer reset driven by the configured countdown.
    // The countdown is deadline-based, so this leg switches to the faked
    // clock (the T11 convention; see the file header) — no auth is mounted
    // here, and the real clock is restored before the compact leg below.
    jest.useFakeTimers();
    const successView = await renderJourney(<OrderSuccessScreen />, { withAuth: false });
    await screen.findByText("Order Confirmed");
    expect(screen.getByText("Your order has been sent to the store")).toBeOnTheScreen();
    expect(screen.getByLabelText("Order number KX7QR9")).toBeOnTheScreen();
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Sparkling Water")).toBeOnTheScreen();
    expect(screen.getByText("500 ml Bottle")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
    // The CONFIGURED settings value drives the window (D6), and the countdown
    // is announced with the remaining time (AC-16's accessible states).
    expect(screen.getByLabelText("Order resets in 10 seconds")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Next Customer" })).not.toBeDisabled();

    // The window elapses with the screen in the foreground: the gated reset
    // fires — the kiosk is durably reset for the next customer (AC-14).
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    await flushAsyncWork(() => mockRouterReplace.mock.calls.length > 0);
    expect(mockRouterReplace).toHaveBeenCalledTimes(1);
    expect(mockRouterReplace).toHaveBeenCalledWith("/");
    expect(useAttemptStore.getState().record).toBeNull();
    expect(useAttemptStore.getState().phase).toBe("idle");
    expect((await readAttemptKey()).status).toBe("miss");
    await successView.unmount();
    jest.useRealTimers();

    // ---- 5. The compact-frame variant (AC-16's responsive half): the same
    // review, re-seeded and re-rendered at 480×900. The reset flow left the
    // cart store hydrated for the signed-in profile, so the scratch-owner
    // hydrate is the public owner-switch reset that lets the seeded envelope
    // restore through the screen's own runtime wiring again.
    await hydrateCart(SCRATCH_OWNER);
    await seedDurableEnvelope([waterLine]);
    const compactView = await renderJourney(<AuthedReviewScreen />, { frame: COMPACT });
    await screen.findByText("Sparkling Water");
    expect(screen.getByLabelText("Quantity: 1")).toBeOnTheScreen();
    expect(screen.getByText("1 item · 1 line")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm Order" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to Cart" })).not.toBeDisabled();
    await compactView.unmount();

    // ---- 6. The tablet-PORTRAIT variant (AC-16's third bucket, F-T15-02:
    // 800×1180 is the `medium` breakpoint — the only one the deterministic
    // suites had not exercised). Same honest re-seed + re-render pattern.
    await hydrateCart(SCRATCH_OWNER);
    await seedDurableEnvelope([cappuccinoLine, waterLine]);
    const portraitView = await renderJourney(<AuthedReviewScreen />, { frame: PORTRAIT });
    await screen.findByText("Cappuccino");
    expect(screen.getByLabelText("Quantity: 2")).toBeOnTheScreen();
    expect(screen.getByText("3 items · 2 lines")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirm Order" })).not.toBeDisabled();
    await portraitView.unmount();
  });

  it("recovers the restart journey: an unresolved record and its preserved cart replay through the gate with the STORED identity, and the session hands to the success route with the cart cleared (AC-16/AC-13)", async () => {
    // A previous session's interrupted submission, exactly as a restart
    // mid-flight leaves it: the durable UNRESOLVED record + the preserved
    // cart envelope.
    await seedAttemptRecord(unresolvedAttempt());
    await seedDurableEnvelope([cappuccinoLine, waterLine]);
    // The auto-replay's flight gets no definitive answer; the customer's
    // explicit Check Again does (the T12 journey shape).
    mockSubmitOrder
      .mockRejectedValueOnce(
        new AppError({
          kind: "network",
          userMessage: "We couldn't reach the network. Check the connection and try again.",
        }),
      )
      .mockResolvedValueOnce(SUCCESS_RESPONSE);
    mockAuthHolder.current = installMockAuth();
    const user = userEvent.setup();

    await renderJourney(<AuthedGate />);

    // The gate's own mount-time recover() found the record, and the
    // auto-replay fired ONCE with the STORED idempotency identity — never a
    // fresh mint (which would surface as the counter's ...001 here).
    await screen.findByText("We're checking your last order submission");
    await waitFor(() => expect(mockSubmitOrder).toHaveBeenCalledTimes(1));
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      clientRequestId: STORED_CLIENT_REQUEST_ID,
      items: SUBMITTED_ITEMS,
    });

    // The ambiguous result holds as the recovery surface's unknown state: the
    // honest copy stays, the cart stays locked, and the panel's Check Again
    // is the only way through.
    const checkAgain = await screen.findByRole("button", { name: "Check Again" });
    expect(checkAgain).not.toBeDisabled();
    expect(getCartSnapshot().locked).toBe(true);

    await user.press(checkAgain);

    // The customer's replay re-sends the SAME stored identity (the
    // duplicate-order barrier, AC-09/AC-13) and resolves through the store's
    // own path: the machine confirms and the recovery episode hands the
    // session to the success route.
    await waitFor(() => expect(mockSubmitOrder).toHaveBeenCalledTimes(2));
    expect(mockSubmitOrder).toHaveBeenNthCalledWith(2, {
      clientRequestId: STORED_CLIENT_REQUEST_ID,
      items: SUBMITTED_ITEMS,
    });
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/checkout-success"));
    expect(useAttemptStore.getState().phase).toBe("confirmed");
    const { record } = useAttemptStore.getState();
    if (record?.status !== "confirmed") {
      throw new Error("the recovered attempt record was not confirmed after the replay");
    }
    expect(record.success.displayNumber).toBe("KX7QR9");

    // The episode is over — the children (the routed Stack's stand-in) are
    // reachable again beneath the inert gate.
    expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();

    // The PRESERVED cart was cleared through the real cart store: the next
    // customer starts from a clean kiosk, on disk and in memory.
    await waitFor(() => expect(getCartSnapshot().lines).toEqual([]));
    const cartKey = await storage.read(KEY, (raw) => raw);
    expect(cartKey.status).toBe("miss");
    expect(record.cleanup.cartClear).toBe("done");
  });
});
