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
import { deriveRequestFingerprint, normalizeCartLines } from "../model/normalized-request";
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
 * R5-T05 adds the fail-closed surfaces the R5-T03 machine created: the HELD
 * panel (a restored OR in-session K1003 hold — the user-facing message the
 * T03 review demanded, RT03-4), the UNSAFE-RECOVERY staff panel
 * (corrupt/foreign/foreign-unclean evidence held on disk, copy per hold
 * reason), and the TERMINAL restore (the durable definite verdict's
 * conflict/failure panels over the same phase-driven presentation, with NO
 * auto-replay).
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
    // The canonical fingerprint of the embedded items — the invariant every
    // real record carries by construction (F-08): the store stamps exactly
    // this binding at mint time.
    fingerprint: deriveRequestFingerprint(SUBMITTED_ITEMS),
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
    fingerprint: deriveRequestFingerprint(SUBMITTED_ITEMS),
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

/** A schema-valid HELD record — the durable K1003 hold evidence (F-04). */
function heldAttempt(): CheckoutAttempt {
  return {
    ...unresolvedAttempt(),
    status: "held",
    hold: { reason: "k1003" },
  };
}

/** A schema-valid TERMINAL stock-conflict record — the durable verdict (F-06). */
function terminalConflictAttempt(): CheckoutAttempt {
  return {
    ...unresolvedAttempt(),
    status: "terminal",
    outcome: { kind: "stock-conflict", conflicts: CONFLICT_RESPONSE.conflicts },
  };
}

/** A schema-valid TERMINAL definite-failure record — the durable verdict (F-06). */
function terminalFailureAttempt(): CheckoutAttempt {
  return {
    ...unresolvedAttempt(),
    status: "terminal",
    outcome: {
      kind: "definite-failure",
      failure: {
        kind: "server",
        userMessage: "Something went wrong on our side. Please try again.",
        retryable: false,
      },
    },
  };
}

/**
 * F-04: the K1003 idempotency conflict — the server PROVED an order already
 * exists for this client_request_id under a different actor or fingerprint
 * (the review suite's own K1003 fixture shape).
 */
const k1003Error = new AppError({
  kind: "idempotency-conflict",
  userMessage: "This order was already submitted with different items.",
});

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

  it("holds a foreign-owner attempt fail-closed without replay: the staff surface over blocked children, nothing submits, nothing navigates (AC-13, F-05)", async () => {
    await seedAttempt(foreignAttempt());
    mockAuthHolder.current = installMockAuth();
    await renderGate();

    // No path from a foreign-owner replay can be safe (D7). F-05 contract
    // change: a foreign UNRESOLVED record is no longer discarded — deleting
    // it would let its owner's next session mint a fresh id and duplicate
    // THEIR order. The store holds it fail-closed (evidence kept on disk and
    // in memory); the R5-T05 surface renders the staff panel over blocked
    // children — the hold's exit is staff intervention, never a client-side
    // action the gate could offer.
    await screen.findByText("This tablet needs staff attention");
    expect(
      screen.getByText(
        "A previous customer's unfinished order submission is saved on this tablet. Please let store staff know.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("We're checking your last order submission")).toBeNull();
    expect(mockSubmitOrder).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    // The durable record is KEPT — byte-identical evidence, not a miss.
    const attemptKey = await storage.read(ATTEMPT_KEY, (raw) => raw);
    expect(attemptKey.status).toBe("hit");
    expect(useAttemptStore.getState().phase).toBe("unsafe-recovery");
    expect(useAttemptStore.getState().unsafeHold).toEqual({ reason: "foreign-unresolved" });
  });

  it("exports RecoveryGate from the feature's public index — the customer layout's import (D7)", () => {
    expect(RecoveryGateFromIndex).toBe(RecoveryGate);
  });

  describe("fail-closed hold and terminal surfaces (R5-T05, RT03-4)", () => {
    it("restarts into a HELD record: the staff-help K1003 panel over blocked children, no auto-replay, no way out (F-04)", async () => {
      await seedAttempt(heldAttempt());
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      // The durable K1003 hold surfaces as the staff-help panel: the server
      // PROVED an order may already exist for this request, and the hold has
      // NO client-side exit (R5-T04's design) — the copy says exactly that.
      await screen.findByText("This order request needs staff help");
      expect(
        screen.getByText(
          "An order may already exist for this request. Please let store staff know so they can check it before this tablet is used again.",
        ),
      ).toBeOnTheScreen();
      // Children render beneath, BLOCKED by the aria-modal overlay — checkout
      // is impossible while the hold stands, and the panel is the only truth.
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      // NO action buttons: a button that pretended a way out would be
      // dishonest (the exit is staff intervention).
      expect(screen.queryByRole("button")).toBeNull();
      // A held record must NEVER auto-replay — the hold is durable session
      // state, not something to resubmit.
      expect(mockSubmitOrder).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
      // The machine restored the hold exactly as it was persisted.
      expect(useAttemptStore.getState().phase).toBe("held");
      expect(useAttemptStore.getState().record?.status).toBe("held");
      expect(useAttemptStore.getState().unsafeHold).toBeNull();
    });

    it("rises the held surface MID-SESSION when a submission resolves K1003 — the gate, not the review screen, owns the message (RT03-4, F-04)", async () => {
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      // The session started clean: recover found nothing (outcome "none").
      await screen.findByText(CHILDREN_TEXT);
      await waitFor(() => expect(useAttemptStore.getState().recordLoaded).toBe(true));

      // Drive the REAL store the way the review screen's submission flow
      // does: prepare (mint + durable persist, phase "submitting") — the
      // gate's own mount already ran recover. Wrapped in act: the phase flip
      // and the cart lock re-render the gate.
      const prepared = await act(async () => {
        const result = await useAttemptStore.getState().prepareAttempt({
          ownerId: TEST_PROFILE.id,
          lines: [cappuccinoLine, waterLine],
          normalized: normalizeCartLines([cappuccinoLine, waterLine]),
        });
        if (!result.ok) {
          throw new Error(`prepareAttempt was expected to mint, but refused: ${result.reason}`);
        }
        return result.request;
      });
      // In-session, the review screen owns the in-flight presentation — the
      // gate stays down while the submission is "submitting".
      expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();

      // The submission resolves K1003 (the store is driven directly — the
      // gate does not render the review screen): the machine holds the
      // attempt, and the gate surface must rise over the live session.
      await act(async () => {
        await useAttemptStore.getState().resolveDefiniteFailure(k1003Error);
      });

      // THE RT03-4 pin: the in-session hold is VISIBLE — the customer never
      // stares at a normal app while checkout is impossible.
      await screen.findByText("This order request needs staff help");
      expect(
        screen.getByText(
          "An order may already exist for this request. Please let store staff know so they can check it before this tablet is used again.",
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      // No replay fired (the store was driven directly; the hold never
      // auto-resubmits) and no navigation happened.
      expect(mockSubmitOrder).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
      // The held record kept the ONE identity the prepared submission minted.
      expect(useAttemptStore.getState().phase).toBe("held");
      expect(useAttemptStore.getState().record?.status).toBe("held");
      expect(useAttemptStore.getState().record?.clientRequestId).toBe(prepared.clientRequestId);
    });

    it("restarts into a CORRUPT durable record: the unsafe-recovery staff panel with the corrupt description, no submit, the hold stays up (F-05)", async () => {
      // A payload the attempt schema rejects — held fail-closed on disk,
      // never deleted (evidence a session cannot interpret).
      const write = await storage.write(ATTEMPT_KEY, { version: 99, not: "an attempt" });
      expect(write.status).toBe("persisted");
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      // The unsafe-recovery staff panel, copy per hold reason: corrupt means
      // this tablet's saved order information is unreadable.
      await screen.findByText("This tablet needs staff attention");
      expect(
        screen.getByText(
          "We couldn't read this tablet's saved order information. Please let store staff know.",
        ),
      ).toBeOnTheScreen();
      // The overlay claims the session — blocked children, no actions, no
      // submit, no navigation. Nothing can dismiss it client-side.
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(mockSubmitOrder).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
      // The corrupt evidence is still exactly there, and the machine is held.
      const attemptKey = await storage.read(ATTEMPT_KEY, (raw) => raw);
      expect(attemptKey.status).toBe("hit");
      expect(useAttemptStore.getState().phase).toBe("unsafe-recovery");
      expect(useAttemptStore.getState().unsafeHold).toEqual({ reason: "corrupt" });
    });

    it("restarts into a FOREIGN-UNRESOLVED record: the staff panel with the foreign-unresolved description, no submit (F-05)", async () => {
      await seedAttempt(foreignAttempt());
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      // A previous customer's unfinished submission is held as evidence —
      // the copy is reason-specific and customer-safe (no internal ids).
      await screen.findByText("This tablet needs staff attention");
      expect(
        screen.getByText(
          "A previous customer's unfinished order submission is saved on this tablet. Please let store staff know.",
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      // Never a replay under the wrong actor.
      expect(mockSubmitOrder).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
      expect(useAttemptStore.getState().phase).toBe("unsafe-recovery");
      expect(useAttemptStore.getState().unsafeHold).toEqual({ reason: "foreign-unresolved" });
    });

    it("restarts into a FOREIGN confirmed record with unclean cleanup: the staff panel with the cleanup description, no submit (F-05, RT05-2)", async () => {
      // The third unsafe-hold reason: a previous customer's order IS
      // confirmed but their cart clear never finished — deleting the record
      // would orphan their unclean cart (a fresh-ID re-submission for THEM),
      // so it is held fail-closed with its own copy.
      await seedAttempt({ ...confirmedAttempt("pending"), ownerId: FOREIGN_OWNER_ID });
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      await screen.findByText("This tablet needs staff attention");
      expect(
        screen.getByText(
          "A previous customer's order cleanup couldn't finish on this tablet. Please let store staff know.",
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(mockSubmitOrder).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
      expect(useAttemptStore.getState().phase).toBe("unsafe-recovery");
      expect(useAttemptStore.getState().unsafeHold).toEqual({
        reason: "foreign-confirmed-unsafe-cleanup",
      });
    });

    it("the held surface rises EVEN AFTER a previous episode ended (RT05-1)", async () => {
      // The episode flag must never suppress a HOLD: end the recovery
      // episode via a terminal restore's Return to Cart, then drive the
      // machine into a fresh held state — the staff panel must rise over the
      // reachable children, not leave a locked-cart normal app behind.
      await seedAttempt(terminalFailureAttempt());
      const user = userEvent.setup();
      mockAuthHolder.current = installMockAuth();
      await renderGate();
      await screen.findByText("Your order didn't go through");
      await user.press(await screen.findByRole("button", { name: "Return to Cart" }));
      expect(mockRouterReplace).toHaveBeenCalledWith("/cart");
      expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();

      // A fresh submission after the episode: prepare mints over the
      // terminal record (F-06 design), the server answers K1003, the hold
      // lands — the phase-scoped surface must rise despite episodeEnded.
      await act(async () => {
        const prepared = await useAttemptStore.getState().prepareAttempt({
          ownerId: TEST_PROFILE.id,
          lines: [cappuccinoLine, waterLine],
          normalized: normalizeCartLines([cappuccinoLine, waterLine]),
        });
        if (!prepared.ok) throw new Error(`fixture prepare failed: ${prepared.reason}`);
        await useAttemptStore.getState().resolveDefiniteFailure(k1003Error);
      });

      await screen.findByText("This order request needs staff help");
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      expect(useAttemptStore.getState().phase).toBe("held");
      expect(useAttemptStore.getState().record?.status).toBe("held");
    });

    it("restarts into a TERMINAL stock-conflict record: the conflict panel with the cart-joined rows and Return to Cart, ZERO submits (F-06)", async () => {
      await seedAttempt(terminalConflictAttempt());
      // The preserved cart: the conflict join reads its display data, exactly
      // like the unresolved family's panel.
      await seedCartEnvelope([cappuccinoLine, waterLine]);
      const user = userEvent.setup();
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      // The durable definite verdict restores as the SAME conflict panel the
      // unresolved family renders: honest title, rows joined to the restored
      // cart, requested/available in words AND numbers.
      await screen.findByText("Some items aren't available in the requested quantities");
      expect(screen.getByText("Cappuccino")).toBeOnTheScreen();
      expect(screen.getByText("Hot · Large · Oat Milk")).toBeOnTheScreen();
      expect(screen.getByText("Requested 2 · Available 1")).toBeOnTheScreen();
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      // NO auto-replay: a terminal verdict is durable — a restart must never
      // resubmit it.
      expect(mockSubmitOrder).not.toHaveBeenCalled();

      // The one way forward: back to the (preserved) cart — the episode ends
      // and the children are reachable again.
      await user.press(await screen.findByRole("button", { name: "Return to Cart" }));
      expect(mockRouterReplace).toHaveBeenCalledWith("/cart");
      expect(
        screen.queryByText("Some items aren't available in the requested quantities"),
      ).toBeNull();
      expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();
      // ZERO submits across the whole episode.
      expect(mockSubmitOrder).not.toHaveBeenCalled();
    });

    it("restarts into a TERMINAL failure record: the failure panel with Return to Cart, ZERO submits (F-06)", async () => {
      await seedAttempt(terminalFailureAttempt());
      const user = userEvent.setup();
      mockAuthHolder.current = installMockAuth();
      await renderGate();

      // The durable failure verdict restores as the SAME failure panel: the
      // stored userMessage verbatim plus Return to Cart.
      await screen.findByText("Your order didn't go through");
      expect(
        screen.getByText("Something went wrong on our side. Please try again."),
      ).toBeOnTheScreen();
      expect(screen.queryByText(CHILDREN_TEXT)).toBeNull();
      // NO auto-replay for the terminal verdict.
      expect(mockSubmitOrder).not.toHaveBeenCalled();

      await user.press(await screen.findByRole("button", { name: "Return to Cart" }));
      expect(mockRouterReplace).toHaveBeenCalledWith("/cart");
      expect(screen.getByText(CHILDREN_TEXT)).toBeOnTheScreen();
      expect(mockSubmitOrder).not.toHaveBeenCalled();
    });
  });
});
