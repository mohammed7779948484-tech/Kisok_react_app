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
import { hydrateCart, type CartLine } from "@/features/cart";

import { submitOrder } from "../api/submit-order";
import { RecoveryGate as RecoveryGateFromIndex } from "../index";
import type { CreateOrderResponse } from "../model/create-order-response.schema";
import type { CheckoutAttempt } from "../model/checkout-attempt.schema";
import { useAttemptStore } from "../state/attempt-store";

import { RecoveryGate } from "./recovery-gate";

/**
 * T12 — the RecoveryGate (AC-13): the session-level recovery composition,
 * mounted once in the customer layout inside CatalogCartProvider. It runs
 * `recover()` for the active profile at mount (BEFORE any checkout surface is
 * reachable — the composition that closes the sign-out guard's restart
 * window), then routes the outcome: children only for the no-record and
 * discard families, the blocking recovery surface for an unresolved
 * same-owner attempt (auto-replay ONCE with the STORED idempotency identity),
 * the recovery-resolution surface for a confirmed attempt with unsafe
 * cleanup, and the immediate success handoff when cleanup is already safe.
 *
 * Conventions (the T09/T11 screen suites):
 *
 * - lucide-react-native resolves to an untransformed ESM entry under
 *   jest-expo, and the gate's runtime graph reaches it through the Cart
 *   feature's PUBLIC index (useCart re-exports the cart's components and
 *   screen) — the standardized null-rendering stand-ins.
 * - The gate owns the session's way out (`router.replace`), so expo-router is
 *   the full-cart suite's documented module mock: a jest.fn `replace`.
 * - expo-crypto is the counter-backed working uuid (the review suite's
 *   factory): no minting happens on any recovery path, but the module mock
 *   keeps the graph honest if one ever creeps in.
 * - The feature's own api door, mocked at the module (the tests.md seam): the
 *   store's replay path calls `submitOrder` directly, so ONE mock covers every
 *   network flight this suite observes.
 * - The attempt store is the REAL singleton driven through public actions
 *   only: records are seeded through `storage.write` and loaded by the GATE'S
 *   OWN mount effect (`recover()`), which is the honest cold-start path —
 *   exactly what a restart does (the T11 suite's seeding minus the manual
 *   recover, because here the component under test IS the recover caller).
 * - Auth: the layout is authenticated, so the suite uses the T09 wrapper —
 *   `installMockAuth()` + `{ withAuth: true }`, the gate rendering only once
 *   the profile is resolved, exactly like the (customer) group behind the
 *   root layout's auth guard.
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

/** The full-cart suite's precedent, retargeted at the gate's own escape: `replace`. */
const mockRouterReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

/**
 * The counter-backed working uuid (the review suite's factory): every mint is
 * schema-valid and distinct, so a fresh id can never be mistaken for the
 * STORED identity the recovery replay must reuse.
 */
const mockUuidCounter = { current: 0 };
jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    mockUuidCounter.current += 1;
    return `00000000-0000-4000-8000-${String(mockUuidCounter.current).padStart(12, "0")}`;
  },
}));

/**
 * The feature's own api door, mocked at the module (the tests.md seam): the
 * attempt store's replay path (`replayAttempt`) submits through this binding,
 * so the identity assertions below observe the exact network flight.
 */
jest.mock("../api/submit-order", () => ({
  submitOrder: jest.fn(),
}));
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

/** The single durable key the attempt store owns (plan decision D1). */
const ATTEMPT_KEY = storageKey("checkout", "attempt");
/** The cart store's durable key — seeded for the preserved-cart cases. */
const CART_KEY = storageKey("cart", "lines");

/**
 * Store control through the PUBLIC seam (the review suite's pattern): a
 * scratch-owner hydrate is always an owner switch, resetting the cart
 * singleton's lines, lock and persistence between tests.
 */
const SCRATCH_OWNER = "00000000-0000-4000-8000-000000000000";

/** A foreign profile's id — the foreign-owner discard fixture's owner. */
const FOREIGN_OWNER_ID = "11111111-1111-4111-8111-111111111111";

/** The stored idempotency identity the seeded records carry. */
const STORED_CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000001";

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

/** A plain line: no options, no image. */
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

/** A schema-valid UNRESOLVED record for the signed-in profile — the restart payload. */
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

/** The same record owned by a DIFFERENT profile — the foreign-owner discard case. */
function foreignAttempt(): CheckoutAttempt {
  return { ...unresolvedAttempt(), ownerId: FOREIGN_OWNER_ID };
}

/** A schema-valid confirmed record — the durable success payload (D4). */
function confirmedAttempt(cleanup: "pending" | "done"): CheckoutAttempt {
  return {
    version: 1,
    ownerId: TEST_PROFILE.id,
    clientRequestId: STORED_CLIENT_REQUEST_ID,
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

/**
 * Seed the durable attempt record — and nothing else: the component under
 * test runs `recover()` itself at mount, which is the honest cold-start path.
 */
async function seedAttempt(record: CheckoutAttempt) {
  const write = await storage.write(ATTEMPT_KEY, record);
  // The seed really is on disk, or the mount-time recover proves nothing.
  expect(write.status).toBe("persisted");
}

/**
 * Seed the durable cart envelope for the signed-in profile (the review
 * suite's shape): the PRESERVED cart of the interrupted submission — what the
 * layout's own hydration restores and the conflict join reads.
 */
async function seedCartEnvelope(lines: CartLine[]) {
  const writeResult = await storage.write(CART_KEY, {
    version: 1,
    ownerId: TEST_PROFILE.id,
    lines,
  });
  expect(writeResult.status).toBe("persisted");
}

/** The children the gate composes over — the routed customer Stack's stand-in. */
const CHILDREN_TEXT = "The store catalog renders here";

/**
 * Gates the gate on auth readiness, exactly like the app's real route gate
 * (T09's AuthedReviewScreen pattern): the (customer) group mounts once auth
 * has resolved a profile, so the gate's mount effect — the recover() — runs
 * with a live profile, never while one is still resolving.
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

/** The installed mock auth client, restored after every test (T09's holder). */
const mockAuthHolder: { current: ReturnType<typeof installMockAuth> | null } = { current: null };

async function renderGate() {
  return renderWithProviders(<AuthedGate />, { withAuth: true });
}

describe("RecoveryGate", () => {
  beforeEach(async () => {
    // Store mutations and the discard paths log by design; keep the suite
    // silent, per the repo convention.
    setLogSink(() => {});
    mockRouterReplace.mockClear();
    mockUuidCounter.current = 0;
    mockSubmitOrder.mockReset();
    // Disk hygiene (review-suite pattern): neither key may leak between tests.
    await storage.remove(CART_KEY);
    // Cart-singleton reset through the public seam (scratch-owner hydrate).
    await hydrateCart(SCRATCH_OWNER);
    // Attempt-store reset through its own ungated public wipe — durable key
    // AND the full memory envelope (record, phase, recordLoaded, payloads).
    await useAttemptStore.getState().clearForSignOut();
  });
  afterEach(() => {
    resetLogging();
    // No spies are created in this suite, but the restore keeps any future
    // spyOn from leaking a broken storage seam; mockRouterReplace and
    // mockSubmitOrder are plain jest.fns, not spies.
    jest.restoreAllMocks();
    mockAuthHolder.current?.restore();
    mockAuthHolder.current = null;
  });

  it("renders children with no overlay, no navigation and no submit when no attempt record exists", async () => {
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // The normal app: children render and recover() found nothing — the
    // machine is ready for a first submission this session.
    await screen.findByText(CHILDREN_TEXT);
    expect(screen.queryByText("We're checking your last order submission")).toBeNull();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockSubmitOrder).not.toHaveBeenCalled();
    expect(useAttemptStore.getState().recordLoaded).toBe(true);
    expect(useAttemptStore.getState().phase).toBe("idle");
  });

  it("recovers an unresolved same-owner attempt: the blocking overlay, an auto-replay ONCE with the stored identity, and the success handoff when it confirms (AC-13)", async () => {
    await seedAttempt(unresolvedAttempt());
    // The flight stays open until THIS test resolves it, so the in-flight
    // recovery surface is observed while it holds.
    let resolveSubmit!: (value: CreateOrderResponse) => void;
    mockSubmitOrder.mockImplementation(
      () =>
        new Promise<CreateOrderResponse>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // The recovery surface over the dimmed children: the honest copy plus
    // the in-flight checking state — the auto-replay started the moment the
    // durable record landed.
    await screen.findByText("We're checking your last order submission");
    expect(screen.getByText("It may already exist — we won't submit it twice.")).toBeOnTheScreen();
    await screen.findByText("Checking your order…");
    // Children render beneath, BLOCKED by the overlay: `aria-modal` hides
    // them from accessibility queries (the BlockingOverlay mechanism, T09's
    // documented semantics) — unreachable is exactly the design.
    expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();

    // THE T12 entry case, made specific: the auto-replay fired ONCE with the
    // STORED idempotency identity — never a fresh mint.
    await waitFor(() => expect(mockSubmitOrder).toHaveBeenCalledTimes(1));
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      clientRequestId: STORED_CLIENT_REQUEST_ID,
      items: SUBMITTED_ITEMS,
    });
    // The record is in memory now — this mount is what closes the sign-out
    // guard's restart window (the guard reads the in-memory record).
    expect(useAttemptStore.getState().record?.clientRequestId).toBe(STORED_CLIENT_REQUEST_ID);

    // Let the flight land: the server re-confirms idempotently, the machine
    // reaches confirmed, and the success route owns the session from here.
    await act(async () => {
      resolveSubmit(SUCCESS_RESPONSE);
    });
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/checkout-success"));
    expect(useAttemptStore.getState().phase).toBe("confirmed");
    // The overlay is gone and the children are reachable again.
    expect(screen.queryByText("We're checking your last order submission")).toBeNull();
    expect(screen.queryByText("Checking your order…")).toBeNull();
    expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();
    // ONCE — the navigation re-render did not re-fire the replay.
    expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
  });

  it("routes a replayed stock conflict to the recovery panel: rows joined to the preserved cart, requested/available in words and numbers, and Return to Cart (AC-13)", async () => {
    await seedAttempt(unresolvedAttempt());
    // The preserved cart (AC-08): the layout's own hydration restores it, and
    // the conflict join reads its display data.
    await seedCartEnvelope([cappuccinoLine, waterLine]);
    mockSubmitOrder.mockResolvedValue(CONFLICT_RESPONSE);
    const user = userEvent.setup();
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // The definite no-order outcome replaces the checking state: the honest
    // warning plus the conflict rows joined to the restored cart's lines —
    // requested/available as words AND numbers, never colour alone.
    await screen.findByText("Some items aren't available in the requested quantities");
    expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
    expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
    expect(screen.getByText("Requested 2 · Available 1")).toBeOnTheScreen();

    // The one way forward: back to the (preserved, unlocked) cart.
    await user.press(await screen.findByRole("button", { name: "Return to Cart" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/cart");
    // The recovery episode is over — the overlay is gone and the children are
    // reachable again; the machine's stale conflict phase is cleaned by the
    // review screen's own mount-reset when the customer re-enters review.
    expect(
      screen.queryByText("Some items aren't available in the requested quantities"),
    ).toBeNull();
    expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();
  });

  it("holds an ambiguous replay as unknown: the honest copy with a Check Again that replays the SAME identity (AC-13)", async () => {
    await seedAttempt(unresolvedAttempt());
    // The auto-replay's flight never gets a definitive answer; the customer's
    // own Check Again does.
    mockSubmitOrder
      .mockRejectedValueOnce(
        new AppError({
          kind: "network",
          userMessage: "We couldn't reach the network. Check the connection and try again.",
        }),
      )
      .mockResolvedValueOnce(SUCCESS_RESPONSE);
    const user = userEvent.setup();
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // Still unknown: the honest copy stays, now with the customer's way
    // through — the panel is the only interaction while the cart is locked.
    await screen.findByText("We're checking your last order submission");
    const checkAgain = await screen.findByRole("button", { name: "Check Again" });
    expect(checkAgain).not.toBeDisabled();

    await user.press(checkAgain);

    // The identity-reuse proof (AC-13): the customer's replay re-sends the
    // STORED client_request_id — a fresh mint here would be the
    // duplicate-order bug.
    await waitFor(() => expect(mockSubmitOrder).toHaveBeenCalledTimes(2));
    expect(mockSubmitOrder).toHaveBeenNthCalledWith(2, {
      clientRequestId: STORED_CLIENT_REQUEST_ID,
      items: SUBMITTED_ITEMS,
    });
    // The second flight resolves through the store's own path to confirmed.
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/checkout-success"));
    expect(useAttemptStore.getState().phase).toBe("confirmed");
  });

  it("surfaces a definite replay failure's message with Return to Cart (AC-13)", async () => {
    await seedAttempt(unresolvedAttempt());
    mockSubmitOrder.mockRejectedValueOnce(
      new AppError({
        kind: "server",
        userMessage: "Something went wrong on our side. Please try again.",
      }),
    );
    const user = userEvent.setup();
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // The store's failure payload rendered verbatim — the AppError boundary
    // already produced a safe, specific message.
    await screen.findByText("Your order didn't go through");
    expect(
      screen.getByText("Something went wrong on our side. Please try again."),
    ).toBeOnTheScreen();

    await user.press(screen.getByRole("button", { name: "Return to Cart" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/cart");
    expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();
  });

  it("resolves a confirmed attempt with unsafe cleanup: the warning, Try Clearing Again clearing the real cart key, then the success handoff (AC-13/AC-11)", async () => {
    await seedAttempt(confirmedAttempt("pending"));
    // The confirmed order's leftover cart — the clear never landed before the
    // restart, so the tablet is not yet safe.
    await seedCartEnvelope([cappuccinoLine, waterLine]);
    const user = userEvent.setup();
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // The recovery-resolution surface: the same honesty as the success
    // screen's unsafe-cleanup warning, over blocked children.
    await screen.findByText("We couldn't finish clearing this tablet for the next customer");
    expect(
      screen.getByText(
        "This tablet isn't ready for the next person yet. Please let store staff know.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();

    await user.press(screen.getByRole("button", { name: "Try Clearing Again" }));

    // The retried cleanup ran the REAL seam: the cart key is durably gone and
    // the record's tracker flipped to done — then the success route owns the
    // session.
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/checkout-success"));
    const cartKey = await storage.read(CART_KEY, (raw) => raw);
    expect(cartKey.status).toBe("miss");
    const { record } = useAttemptStore.getState();
    if (record?.status !== "confirmed") {
      throw new Error("the attempt record was not confirmed after the retried cleanup");
    }
    expect(record.cleanup.cartClear).toBe("done");
    // No order was ever submitted — the record was already confirmed.
    expect(mockSubmitOrder).not.toHaveBeenCalled();
  });

  it("hands a confirmed attempt with safe cleanup straight to the success route — no overlay, children render beneath (AC-13)", async () => {
    await seedAttempt(confirmedAttempt("done"));
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // A restart mid-success lands back on the success screen (fresh
    // countdown) — immediately, with nothing replayed and nothing blocked.
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith("/checkout-success"));
    expect(mockSubmitOrder).not.toHaveBeenCalled();
    expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();
    expect(screen.queryByText("We're checking your last order submission")).toBeNull();
  });

  it("discards a foreign-owner attempt without replay: children render, nothing submits, nothing navigates (AC-13)", async () => {
    await seedAttempt(foreignAttempt());
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // No path from a foreign-owner replay can be safe (D7): the store
    // discarded the record at recover and the gate rendered children only.
    await screen.findByText(CHILDREN_TEXT);
    expect(screen.queryByText("We're checking your last order submission")).toBeNull();
    expect(mockSubmitOrder).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    const attemptKey = await storage.read(ATTEMPT_KEY, (raw) => raw);
    expect(attemptKey.status).toBe("miss");
  });

  it("exports RecoveryGate from the feature's public index — the customer layout's import (D7)", () => {
    expect(RecoveryGateFromIndex).toBe(RecoveryGate);
  });
});
