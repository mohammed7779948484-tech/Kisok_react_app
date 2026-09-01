/**
 * The Order Details screen's observable contract (AC-07/AC-10, plan decisions
 * 1, 3, 5, 7, 8, 10):
 *
 * - the route-param branch FIRST (T03-R03): an absent or empty `orderId`
 *   renders the unavailable state WITHOUT a read — a fabricated id would
 *   stringify into a doomed retryable request;
 * - the read's reachable states: loading skeleton, failed fetch (an
 *   unavailable error state with retry — never stale content), no-such-order
 *   (an unavailable state with nothing to retry), success;
 * - the immutable item snapshot rendered AS STORED — product name, variant
 *   label, options, brand, quantity prominent, image with alt when captured
 *   and a placeholder when not — in the deterministic client-side
 *   `variant_sku` order, never the server's embed order;
 * - order metadata: display number, status badge, created time in the store
 *   timezone (silent degrade to the device zone when settings are absent or
 *   failing — decision 8), and the assignment indicator by id comparison;
 * - the allowed actions for the order's CURRENT state through the real
 *   mutation hook, with the per-action pending disable + repeat guard
 *   (decision 5), the destructive cancel confirmation, and terminal orders
 *   inspection-only;
 * - rejected transitions (AC-10) surfaced as InlineError feedback near the
 *   actions plus a screen-owned refresh (T05-R02: the hook invalidates on
 *   success ONLY), with the cancel-rejection flow given its own test
 *   (T10-R01's T13 half: dialog closes first, feedback, then refetch). The
 *   feedback ALSO has a home when the actions row is gone or the read failed
 *   (R2-01): the screen body beside the order, never nowhere — and it
 *   persists until the NEXT action dispatch (R2-06, the workspace lifetime
 *   agreement);
 * - the back action.
 *
 * Mocked at the feature's own `api/` boundary (plus `expo-router` for the
 * back wiring, and the one lucide icon AppImage's fallback needs, whose ESM
 * build jest-expo does not transform) — a screen test must not know Supabase
 * exists.
 */
import { useRouter } from "expo-router";
import { type QueryClient } from "@tanstack/react-query";

import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import {
  act,
  createTestQueryClient,
  installMockAuth,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/core/testing";

import { type ActiveOrderRow } from "../../api/fetch-active-orders";
import { fetchOrderDetail } from "../../api/fetch-order-detail";
import { fetchStoreSettings, type StoreSettingsRow } from "../../api/fetch-store-settings";
import { updateOrderStatus } from "../../api/update-order-status";
import { type OrderStatusUpdate } from "../../model/order-status-update.schema";

import { OrderDetailsScreen } from "./order-details-screen";

// AppImage's fallback icon comes from lucide-react-native, whose ESM build
// jest-expo does not transform — mock the one icon the tree imports.
jest.mock("lucide-react-native", () => ({ ImageOff: () => null }));
jest.mock("../../api/fetch-order-detail", () => ({ fetchOrderDetail: jest.fn() }));
jest.mock("../../api/fetch-store-settings", () => ({ fetchStoreSettings: jest.fn() }));
jest.mock("../../api/update-order-status", () => ({ updateOrderStatus: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const fetchOrderMock = fetchOrderDetail as jest.MockedFunction<typeof fetchOrderDetail>;
const settingsMock = fetchStoreSettings as jest.MockedFunction<typeof fetchStoreSettings>;
const updateMock = updateOrderStatus as jest.MockedFunction<typeof updateOrderStatus>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;

/** The order under test, and the signed-in employee vs a colleague. */
const ORDER_ID = "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const ACTOR_ID = "3d0e9c14-64e8-4b6b-9d55-1f7d2a9c0e88";
const COLLEAGUE_ID = "9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d";

/** Asia/Riyadh is UTC+3 with no DST — a fully deterministic display zone. */
const STORE_SETTINGS: StoreSettingsRow = {
  id: true,
  store_name: "Kisok Roasters",
  logo_media_asset_id: null,
  global_low_stock_threshold: 5,
  customer_success_reset_seconds: 25,
  store_timezone: "Asia/Riyadh",
  created_at: "2026-08-26T05:00:00.000000+00:00",
  updated_at: "2026-08-26T05:00:00.000000+00:00",
};

/** One item row — the migration-07 snapshot shape. */
type ItemRow = ActiveOrderRow["order_items"][number];

function makeItem(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: "c7d8e9f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f",
    order_id: ORDER_ID,
    product_id: "d1e2f3a4-5b6c-4d7e-8f9a-0b1c2d3e4f5a",
    variant_id: "e2f3a4b5-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
    product_name: "Single Origin Coffee",
    variant_name: "250g · Whole Bean",
    variant_sku: "SO-250G-WB",
    variant_options: [{ type: "Grind", value: "Whole bean" }],
    brand_name: "Kisok Roasters",
    image_public_id: null,
    image_secure_url: null,
    quantity: 2,
    ...overrides,
  };
}

/**
 * A minimal detail-shaped order row (the T09 fixture shape). Defaults to the
 * details screen's board entry point: a NEW, unassigned order.
 */
function makeOrder(overrides: Partial<ActiveOrderRow> = {}): ActiveOrderRow {
  return {
    id: ORDER_ID,
    display_number: "AB2CD4",
    client_request_id: "0d4a9d2e-7f3b-4c5a-8e6f-1a2b3c4d5e6f",
    request_fingerprint: "8f2b1c0d4e6a",
    status: "new",
    created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    assigned_preparation_id: null,
    completed_by: null,
    completed_at: null,
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    // 05:00 UTC renders as 08:00 in Asia/Riyadh (UTC+3, no DST) — pinned below.
    created_at: "2026-08-26T05:00:08.123456+00:00",
    updated_at: "2026-08-26T05:01:41.000000+00:00",
    order_items: [makeItem()],
    ...overrides,
  };
}

/** A validated success projection (T01 shape) for the given end state. */
function makeUpdate(
  order: ActiveOrderRow,
  overrides: Partial<OrderStatusUpdate> = {},
): OrderStatusUpdate {
  return {
    order_id: order.id,
    display_number: order.display_number,
    status: "preparing",
    assigned_preparation_id: ACTOR_ID,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    updated_at: "2026-08-26T05:05:00.000000+00:00",
    ...overrides,
  };
}

/**
 * The shared test client plus mutation gcTime: Infinity (the T05 convention) —
 * a completed useMutation otherwise leaves a five-minute GC timer that keeps
 * jest from exiting.
 */
function createMutationTestClient(): QueryClient {
  const client = createTestQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { ...client.getDefaultOptions().mutations, gcTime: Infinity },
  });
  return client;
}

/** The router's back, captured through the expo-router mock. */
const routerBack = jest.fn();

type RenderOptions = {
  /** The route param under test; `null` forces the absent-param branch (an explicit `undefined` would fall through to the ORDER_ID default). */
  orderId?: string | null;
  order?: ActiveOrderRow | null;
  settings?: StoreSettingsRow | null;
  /** Makes the settings read reject (decision 8's failing-read case). */
  settingsFails?: boolean;
  /** Lets a test fail the first read, or swap the order between fetches. */
  fetchImpl?: () => Promise<ActiveOrderRow | null>;
};

async function renderDetails({
  orderId = ORDER_ID,
  order = makeOrder(),
  settings = STORE_SETTINGS,
  settingsFails = false,
  fetchImpl,
}: RenderOptions = {}) {
  fetchOrderMock.mockImplementation(fetchImpl ?? (() => Promise.resolve(order)));
  if (settingsFails) settingsMock.mockRejectedValue(new Error("settings read failed"));
  else settingsMock.mockResolvedValue(settings);
  useRouterMock.mockReturnValue({ back: routerBack } as unknown as ReturnType<typeof useRouter>);
  mockSupabase = installMockAuth({
    role: "preparation",
    profile: {
      id: ACTOR_ID,
      display_name: "Prep Employee",
      role: "preparation",
      is_active: true,
    },
  });

  const view = await renderWithProviders(
    <OrderDetailsScreen orderId={orderId === null ? undefined : orderId} />,
    {
      withAuth: true,
      queryClient: createMutationTestClient(),
    },
  );
  return view;
}

let mockSupabase: ReturnType<typeof installMockAuth> | undefined;

beforeEach(() => {
  // The real AuthProvider (withAuth: true) logs auth state changes by design —
  // a silent sink keeps this suite at zero console output.
  setLogSink(() => {});
});

afterEach(() => {
  resetLogging();
  mockSupabase?.restore();
  mockSupabase = undefined;
  fetchOrderMock.mockReset();
  settingsMock.mockReset();
  updateMock.mockReset();
  useRouterMock.mockReset();
  routerBack.mockClear();
});

describe("OrderDetailsScreen param and read states", () => {
  it("renders the unavailable state without fetching when the orderId param is absent", async () => {
    await renderDetails({ orderId: null });

    // T03-R03: the screen branches FIRST — no id, no read. A fabricated id
    // would stringify into a doomed retryable request.
    expect(await screen.findByText("Order unavailable")).toBeOnTheScreen();
    expect(fetchOrderMock).not.toHaveBeenCalled();
    // The way out of a paramless details screen is the back action.
    expect(screen.getByRole("button", { name: "Back" })).toBeOnTheScreen();
  });

  it("renders the unavailable state without fetching when the orderId param is empty", async () => {
    await renderDetails({ orderId: "" });

    // The empty string is as missing as undefined for a route param.
    expect(await screen.findByText("Order unavailable")).toBeOnTheScreen();
    expect(fetchOrderMock).not.toHaveBeenCalled();
  });

  it("renders a loading skeleton while the fetch is in flight", async () => {
    await renderDetails({ fetchImpl: () => new Promise<ActiveOrderRow | null>(() => {}) });

    // SkeletonList's own loading affordance — the details read's first-fetch state.
    expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
    // No order content leaks out alongside the skeleton.
    expect(screen.queryByText("AB2CD4")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();
  });

  it("renders the unavailable state with retry when the fetch fails, and retry re-attempts it", async () => {
    // A transport-level throw (T04 O-1: not an AppError at the screen).
    const order = makeOrder();
    let failFirstRead = true;
    await renderDetails({
      fetchImpl: () =>
        failFirstRead
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve(order),
    });

    // A failed fetch shows the unavailable state, never stale content.
    expect(await screen.findByText("Order unavailable")).toBeOnTheScreen();
    expect(
      screen.getByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("AB2CD4")).toBeNull();

    failFirstRead = false;
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));

    // Retry re-attempted the read and the order rendered.
    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(fetchOrderMock).toHaveBeenCalledTimes(2);
  });

  it("renders the unavailable state without retry when the order does not exist", async () => {
    await renderDetails({ order: null });

    // "No such order" is a value, not a failure — there is nothing to retry.
    expect(await screen.findByText("Order unavailable")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(fetchOrderMock).toHaveBeenCalledTimes(1);
  });
});

describe("OrderDetailsScreen snapshot (AC-07)", () => {
  it("renders the order metadata: display number, status, created time in the store timezone, and assignment", async () => {
    const preparingOrder = makeOrder({
      status: "preparing",
      assigned_preparation_id: ACTOR_ID,
    });
    await renderDetails({ order: preparingOrder });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    // The status in words, through the badge's own label source.
    expect(screen.getByText("Preparing")).toBeOnTheScreen();
    // 05:00 UTC renders as 08:00 in the settings row's Asia/Riyadh.
    expect(screen.getByText("Created 08:00")).toBeOnTheScreen();
    // Decision 3: the assignment indicator compares ids — "you", not a name.
    expect(screen.getByText("You")).toBeOnTheScreen();
  });

  it("renders the immutable item snapshot fields as stored, with the quantity prominent", async () => {
    await renderDetails();

    // The snapshot fields exactly as captured when the order was placed —
    // never rebuilt from the catalog.
    expect(await screen.findByText("Single Origin Coffee")).toBeOnTheScreen();
    expect(screen.getByText("250g · Whole Bean")).toBeOnTheScreen();
    expect(screen.getByText("Grind: Whole bean")).toBeOnTheScreen();
    expect(screen.getByText("Kisok Roasters")).toBeOnTheScreen();
    expect(screen.getByText("SO-250G-WB")).toBeOnTheScreen();
    // The quantity is its own prominent label, not buried in a sentence.
    expect(screen.getByText("×2")).toBeOnTheScreen();
  });

  it("renders item images with alt text, and a placeholder for items without one", async () => {
    const withImage = makeItem({
      id: "aa11aa11-aa11-4aa1-8aa1-aa11aa11aa11",
      image_public_id: "kisok/coffee",
      image_secure_url: "https://res.cloudinary.com/kisok/image/upload/coffee.jpg",
    });
    const withoutImage = makeItem({
      id: "bb22bb22-bb22-4bb2-8bb2-bb22bb22bb22",
      product_name: "Sencha Green Tea",
      variant_name: "100g · Loose Leaf",
      variant_sku: "GT-100G-LL",
    });
    await renderDetails({
      order: makeOrder({ order_items: [withImage, withoutImage] }),
    });

    // The captured image renders with a real alt (AC-07's image-alt contract)…
    expect(
      await screen.findByLabelText("Single Origin Coffee, 250g · Whole Bean"),
    ).toBeOnTheScreen();
    // …and an item with no captured image gets the placeholder, not nothing.
    expect(
      screen.getByRole("image", { name: "Sencha Green Tea, 100g · Loose Leaf" }),
    ).toBeOnTheScreen();
  });

  it("renders items in the deterministic variant_sku order regardless of fetch order", async () => {
    // The read returns the items in reverse — decision 7's client-side order
    // (variant_sku) must not depend on the server's embed order.
    const zulu = makeItem({
      id: "cc33cc33-cc33-4cc3-8cc3-cc33cc33cc33",
      product_name: "Zulu Beans",
      variant_sku: "ZZ-9",
    });
    const alpha = makeItem({
      id: "dd44dd44-dd44-4dd4-8dd4-dd44dd44dd44",
      product_name: "Alpha Beans",
      variant_sku: "AA-1",
    });
    await renderDetails({ order: makeOrder({ order_items: [zulu, alpha] }) });

    // Tree order follows variant_sku, not the fetch order.
    const skuTexts = screen.getAllByText(/^(AA-1|ZZ-9)$/).map((element) => element.props.children);
    expect(skuTexts).toEqual(["AA-1", "ZZ-9"]);
  });

  it("renders the created time as 00:00 at midnight, never 24:00", async () => {
    // 21:00:08 UTC is 00:00:08 the next day in Asia/Riyadh — the hour an
    // h24-cycle ICU build (Hermes tablets) would render as "24" with a
    // 24-hour clock (the model's own % 24 absorption, T11-R05).
    const midnightOrder = makeOrder({ created_at: "2026-08-26T21:00:08.123456+00:00" });
    await renderDetails({ order: midnightOrder });

    expect(await screen.findByText("Created 00:00")).toBeOnTheScreen();
    expect(screen.queryByText("Created 24:00")).toBeNull();
  });

  it("keeps rendering the order when the settings row is absent", async () => {
    await renderDetails({ settings: null });

    // Decision 8: an absent settings read degrades to the device timezone
    // silently — the order itself must not fail on it.
    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Order unavailable")).toBeNull();
  });

  it("keeps rendering the order when the settings read fails", async () => {
    await renderDetails({ settingsFails: true });

    // The same degradation for a failing read: time display is a nicety, the
    // order snapshot is the point.
    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Order unavailable")).toBeNull();
  });
});

describe("OrderDetailsScreen actions per state", () => {
  it("offers Start Preparing and Cancel for a new unassigned order", async () => {
    await renderDetails();

    expect(await screen.findByRole("button", { name: "Start Preparing" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Mark Ready" })).toBeNull();
  });

  it("offers Mark Ready and Cancel for the actor's own preparing order", async () => {
    await renderDetails({
      order: makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID }),
    });

    expect(await screen.findByRole("button", { name: "Mark Ready" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();
  });

  it("shows the assignment and offers Cancel — not Mark Ready — for a colleague's preparing order", async () => {
    await renderDetails({
      order: makeOrder({ status: "preparing", assigned_preparation_id: COLLEAGUE_ID }),
    });

    // AC-05: mark-ready is assignee-only; the assignment indicator is words.
    expect(await screen.findByText("Assigned to another employee")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Mark Ready" })).toBeNull();
    // Cancel is the one transition with no assignee check — still offered.
    expect(screen.getByRole("button", { name: "Cancel" })).toBeOnTheScreen();
  });

  it("renders inspection-only for a completed order — no action buttons", async () => {
    await renderDetails({
      order: makeOrder({
        status: "completed",
        assigned_preparation_id: ACTOR_ID,
        completed_by: COLLEAGUE_ID,
        completed_at: "2026-08-26T05:10:00.000000+00:00",
      }),
    });

    expect(await screen.findByText("Completed")).toBeOnTheScreen();
    // Terminal: the snapshot stays inspectable, the actions are gone.
    expect(screen.getByText("Single Origin Coffee")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark Ready" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    // The back action survives — inspection still needs a way out.
    expect(screen.getByRole("button", { name: "Back" })).toBeOnTheScreen();
  });
});

describe("OrderDetailsScreen transitions", () => {
  it("starts preparing the order, ignoring repeat presses while pending, then shows the claimed order", async () => {
    const order = makeOrder();
    const claimedOrder = makeOrder({
      status: "preparing",
      assigned_preparation_id: ACTOR_ID,
    });
    let current = order;
    await renderDetails({ fetchImpl: () => Promise.resolve(current) });

    // The write stays in flight until the test resolves it, exactly like a
    // slow RPC round trip.
    let resolveUpdate!: (value: OrderStatusUpdate) => void;
    updateMock.mockImplementation(
      () =>
        new Promise<OrderStatusUpdate>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Start Preparing" }));

    // Pending: the action is disabled with its label swapped, and a repeat
    // press cannot fire a second write (decision 5's repeat guard).
    const starting = await screen.findByRole("button", { name: "Starting…" });
    expect(starting).toBeDisabled();
    await user.press(starting);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      orderId: order.id,
      targetStatus: "preparing",
    });

    // The read's data changes under the refetch the mutation's success
    // invalidation triggers: the order is now claimed to the actor.
    current = claimedOrder;
    await act(async () => {
      resolveUpdate(makeUpdate(order));
    });

    // The refetched order shows Preparing, claimed to you, with Mark Ready
    // now the offered action.
    await screen.findByText("Preparing");
    expect(screen.getByText("You")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Mark Ready" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Starting…" })).toBeNull();
    expect(fetchOrderMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("marks the actor's own order ready and shows it ready with no further actions", async () => {
    const order = makeOrder({
      status: "preparing",
      assigned_preparation_id: ACTOR_ID,
    });
    const readyOrder = makeOrder({
      status: "ready",
      assigned_preparation_id: ACTOR_ID,
    });
    let current = order;
    await renderDetails({ fetchImpl: () => Promise.resolve(current) });

    updateMock.mockImplementation(async () => {
      current = readyOrder;
      return makeUpdate(order, {
        status: "ready",
        updated_at: "2026-08-26T05:06:00.000000+00:00",
      });
    });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Mark Ready" }));

    // The refetched order is Ready — visible on the board, but no preparation
    // action is the tablet's to take.
    expect(await screen.findByText("Ready")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark Ready" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("cancels the order after destructive confirmation and renders it inspection-only", async () => {
    const order = makeOrder();
    const cancelledOrder = makeOrder({
      status: "cancelled",
      cancelled_by: ACTOR_ID,
      cancelled_at: "2026-08-26T05:06:00.000000+00:00",
    });
    let current = order;
    await renderDetails({ fetchImpl: () => Promise.resolve(current) });

    updateMock.mockImplementation(async () => {
      current = cancelledOrder;
      return makeUpdate(order, {
        status: "cancelled",
        assigned_preparation_id: null,
        cancelled_at: "2026-08-26T05:06:00.000000+00:00",
        updated_at: "2026-08-26T05:06:00.000000+00:00",
      });
    });

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Cancel" }));

    // The destructive confirmation appeared, then was confirmed.
    expect(screen.getByText("Cancel order AB2CD4?")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Cancel order" }));

    // The screen closes the dialog on success and the refetched order is
    // terminal — inspection-only, snapshot still visible.
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("Cancelled")).toBeOnTheScreen();
    expect(screen.getByText("Single Origin Coffee")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        orderId: order.id,
        targetStatus: "cancelled",
      }),
    );
  });
});

describe("OrderDetailsScreen rejected transitions (AC-10)", () => {
  it("surfaces a rejected start-preparing near the actions and refreshes the order", async () => {
    const order = makeOrder();
    await renderDetails({ order });

    // The K1004 the server answers a stale claim with.
    updateMock.mockRejectedValue(
      new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      }),
    );

    await userEvent.setup().press(await screen.findByRole("button", { name: "Start Preparing" }));

    // Feedback NEAR the action, never swallowed, never fabricated as a local
    // transition — the order is still New.
    expect(await screen.findByText("This order has already been updated.")).toBeOnTheScreen();
    expect(screen.getByText("New")).toBeOnTheScreen();
    // T05-R02: the hook invalidates on success only, so the SCREEN refreshes
    // the affected data on rejection.
    await waitFor(() => expect(fetchOrderMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("closes the cancel dialog, shows feedback near the actions, and refreshes on a rejected cancel", async () => {
    // T10-R01 (the T13 half): the cancel-rejection flow gets its OWN test —
    // dialog open=false first, feedback near the action, then the refresh.
    const order = makeOrder();
    await renderDetails({ order });

    // A transport-level throw (T04 O-1: not an AppError at the screen).
    updateMock.mockRejectedValue(new Error("rpc channel closed"));

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Cancel" }));

    // The destructive confirmation appeared, then was confirmed.
    expect(screen.getByText("Cancel order AB2CD4?")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Cancel order" }));

    // Dialog open=false FIRST (feedback behind an open modal is invisible),
    // then feedback near the actions, then the refresh.
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("Something went wrong.")).toBeOnTheScreen();
    // The order is still on screen — the client never fabricates the cancel.
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.getByText("New")).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrderMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("still shows the rejection feedback when the refetch returns the order as terminal", async () => {
    // R2-01 for this screen: employee A confirms Cancel while employee B's
    // cancel lands first — A's RPC rejects with K1004, and the rejection
    // refetch returns the order as CANCELLED. A terminal order renders
    // inspection-only with NO actions row, so feedback attached to the
    // actions would render nowhere, making A's failure look like success; it
    // must fall back to the screen body instead.
    const order = makeOrder();
    const cancelledOrder = makeOrder({
      status: "cancelled",
      cancelled_by: COLLEAGUE_ID,
      cancelled_at: "2026-08-26T05:06:00.000000+00:00",
    });
    let current = order;
    await renderDetails({ fetchImpl: () => Promise.resolve(current) });

    updateMock.mockImplementation(async () => {
      // B's cancel already landed: the order is terminal.
      current = cancelledOrder;
      throw new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      });
    });

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Cancel" }));
    await user.press(screen.getByRole("button", { name: "Cancel order" }));

    // The dialog closed, the refetched order is terminal…
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("Cancelled")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    // …and A's failure is STILL on screen — without an actions row, the
    // feedback renders beside the order body rather than nowhere, exactly once.
    expect(screen.getAllByText("This order has already been updated.")).toHaveLength(1);
    await waitFor(() => expect(fetchOrderMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("still shows the rejection feedback when the post-rejection refetch fails", async () => {
    // R2-01's data-independence clause: the feedback must not depend on the
    // order being rendered. A rejection whose invalidation refetch FAILS puts
    // the screen into its error state — the feedback survives it.
    const order = makeOrder();
    let failReads = false;
    await renderDetails({
      fetchImpl: () =>
        failReads ? Promise.reject(new Error("Network request failed")) : Promise.resolve(order),
    });

    updateMock.mockRejectedValue(
      new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      }),
    );

    failReads = true;
    await userEvent.setup().press(await screen.findByRole("button", { name: "Start Preparing" }));

    // The error state replaced the content (no stale order)…
    expect(await screen.findByText("Order unavailable")).toBeOnTheScreen();
    expect(screen.queryByText("AB2CD4")).toBeNull();
    // …and the rejection feedback is still visible beside it.
    expect(screen.getByText("This order has already been updated.")).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrderMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe("OrderDetailsScreen navigation", () => {
  it("navigates back when the back button is pressed", async () => {
    await renderDetails();

    await userEvent.setup().press(await screen.findByRole("button", { name: "Back" }));

    expect(routerBack).toHaveBeenCalledTimes(1);
  });
});
