import { useRouter } from "expo-router";
import { type QueryClient } from "@tanstack/react-query";

import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { useLayout, type LayoutSize } from "@/core/responsive";
import {
  act,
  createTestQueryClient,
  installMockAuth,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/core/testing";

import { fetchActiveOrders, type ActiveOrderRow } from "../../api/fetch-active-orders";
import { fetchStoreSettings, type StoreSettingsRow } from "../../api/fetch-store-settings";
import { updateOrderStatus } from "../../api/update-order-status";
import { type OrderStatusUpdate } from "../../model/order-status-update.schema";

import { ANNOUNCEMENT_CLEAR_MILLIS, WorkspaceScreen } from "./workspace-screen";

/**
 * The workspace board's observable contract (AC-01/02/04/05/10, plan decisions
 * 3, 5, 6, 8, 9, 10):
 *
 * - the three groups with one count per group, tabs on compact/medium and
 *   columns on expanded (mocked `useLayout` — the responsive layer's contract);
 * - the board read's reachable states: loading skeleton, empty state, error
 *   with retry that re-attempts;
 * - Start preparing / Mark ready driven through the real mutation hook, with
 *   the per-card pending disable and the repeat-press guard;
 * - rejected transitions surfaced as InlineError feedback near the card plus a
 *   screen-owned refresh (T05-R02: the hook invalidates on success ONLY), with
 *   the cancel-rejection flow given its own test (T10-R01: dialog closes,
 *   feedback near the card, then refetch). The feedback ALSO has a home when
 *   the errored order is no longer a VISIBLE card — it departed the board
 *   under the rejection refetch, or moved into an unmounted tab group (R2-01):
 *   the screen body beside the board, never nowhere;
 * - the polite live region announcing new-order arrivals (decision 9) and
 *   clearing again after a short delay (T11-R02, with fake timers), the
 *   sign-out and manual refresh affordances (decision 10), and the store
 *   timezone for created times degrading silently when settings are absent
 *   (decision 8), with midnight pinned to "00:00" — the h24-cycle ICU hour
 *   absorption the model documents (T11-R05);
 * - an inline notice when a refetch fails while the board still shows data
 *   (T11-R04: realtime multiplies background refetches, so this window is no
 *   longer rare);
 * - the realtime wiring (AC-09): while the screen is mounted it holds ONE
 *   orders channel (removed on unmount), and an incoming event invalidates
 *   the feature's queries so the refetched result — never the payload —
 *   re-renders the board.
 *
 * Two characterization pins guard behaviour that is correct by construction
 * today but unpinned (the R2-04/R2-05 findings): the announcement's no-ops
 * (a refresh returning the same orders, and a departure — neither is an
 *   arrival), and the pending action's derivation from the MUTATION's state
 * alone, which a mid-write realtime refetch must not disturb.
 *
 * Mocked at the feature's own `api/` boundary (plus `useLayout`, per the plan's
 * screen test strategy, and `expo-router` for the details navigation wiring) —
 * a screen test must not know Supabase exists. The realtime tests layer the
 * channel-recording spy of core/realtime's own tests onto `installMockAuth`'s
 * client, so the subscription can be asserted and a fake event FIRED at it.
 */

jest.mock("../../api/fetch-active-orders", () => ({ fetchActiveOrders: jest.fn() }));
jest.mock("../../api/fetch-store-settings", () => ({ fetchStoreSettings: jest.fn() }));
jest.mock("../../api/update-order-status", () => ({ updateOrderStatus: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/core/responsive", () => ({
  ...jest.requireActual("@/core/responsive"),
  useLayout: jest.fn(),
}));

const fetchOrdersMock = fetchActiveOrders as jest.MockedFunction<typeof fetchActiveOrders>;
const settingsMock = fetchStoreSettings as jest.MockedFunction<typeof fetchStoreSettings>;
const updateMock = updateOrderStatus as jest.MockedFunction<typeof updateOrderStatus>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const useLayoutMock = useLayout as jest.MockedFunction<typeof useLayout>;

/** The signed-in employee (the mock auth profile's id), and a colleague. */
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
function makeItem(id: string, variantSku: string): ActiveOrderRow["order_items"][number] {
  return {
    id,
    order_id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    product_id: "d1e2f3a4-5b6c-4d7e-8f9a-0b1c2d3e4f5a",
    variant_id: "e2f3a4b5-6c7d-4e8f-9a0b-1c2d3e4f5a6b",
    product_name: "Single Origin Coffee",
    variant_name: "250g · Whole Bean",
    variant_sku: variantSku,
    variant_options: [{ type: "Grind", value: "Whole bean" }],
    brand_name: "Kisok Roasters",
    image_public_id: null,
    image_secure_url: null,
    quantity: 2,
  };
}

/**
 * A minimal board-shaped order row (the T09 fixture shape). Defaults to the
 * board's entry point: a NEW, unassigned order.
 */
function makeOrder(overrides: Partial<ActiveOrderRow> = {}): ActiveOrderRow {
  return {
    id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
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
    order_items: [makeItem("c7d8e9f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f", "SO-250G-WB")],
    ...overrides,
  };
}

/** A validated `new → preparing` success projection (T01 shape). */
function makePreparingUpdate(order: ActiveOrderRow): OrderStatusUpdate {
  return {
    order_id: order.id,
    display_number: order.display_number,
    status: "preparing",
    assigned_preparation_id: ACTOR_ID,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    updated_at: "2026-08-26T05:05:00.000000+00:00",
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

function setLayout(size: LayoutSize) {
  const width = size === "expanded" ? 1280 : size === "medium" ? 800 : 480;
  useLayoutMock.mockReturnValue({
    width,
    height: 800,
    size,
    isCompact: size === "compact",
    isMedium: size === "medium",
    isExpanded: size === "expanded",
    isPortrait: true,
    isLandscape: false,
  });
}

/** The router's push, captured through the expo-router mock. */
const routerPush = jest.fn();

let mockSupabase: ReturnType<typeof installMockAuth> | undefined;

/**
 * Records every channel the installed mock client opens — core/realtime's own
 * test pattern, layered on `installMockAuth`: a test can assert which
 * subscriptions a render opened, FIRE a fake payload at the recorded handler,
 * and assert the channel was removed on unmount.
 */
type ChannelSpy = {
  created: string[];
  removed: unknown[];
  handlers: ((payload: unknown) => void)[];
};

function spyOnChannels(client: unknown): ChannelSpy {
  const spy: ChannelSpy = { created: [], removed: [], handlers: [] };
  const mutable = client as {
    channel: (name: string) => unknown;
    removeChannel: (channel: unknown) => Promise<void>;
  };
  mutable.channel = (name: string) => {
    spy.created.push(name);
    const channel = {
      on: (_event: string, _filter: unknown, handler: (payload: unknown) => void) => {
        spy.handlers.push(handler);
        return channel;
      },
      subscribe: () => channel,
    };
    return channel;
  };
  mutable.removeChannel = async (channel: unknown) => {
    spy.removed.push(channel);
  };
  return spy;
}

type RenderOptions = {
  orders?: ActiveOrderRow[];
  size?: LayoutSize;
  settings?: StoreSettingsRow | null;
  /** Makes the settings read reject (decision 8's failing-read case). */
  settingsFails?: boolean;
  /** Lets a test fail the first read, or swap the board between fetches. */
  fetchImpl?: () => Promise<ActiveOrderRow[]>;
  /** Records the client's channel plumbing, for the realtime tests. */
  channelSpy?: boolean;
};

async function renderWorkspace({
  orders = [],
  size = "expanded",
  settings = STORE_SETTINGS,
  settingsFails = false,
  fetchImpl,
  channelSpy = false,
}: RenderOptions = {}) {
  setLayout(size);
  fetchOrdersMock.mockImplementation(fetchImpl ?? (() => Promise.resolve(orders)));
  if (settingsFails) settingsMock.mockRejectedValue(new Error("settings read failed"));
  else settingsMock.mockResolvedValue(settings);
  useRouterMock.mockReturnValue({ push: routerPush } as unknown as ReturnType<typeof useRouter>);
  mockSupabase = installMockAuth({
    role: "preparation",
    profile: {
      id: ACTOR_ID,
      display_name: "Prep Employee",
      role: "preparation",
      is_active: true,
    },
  });
  const spy = channelSpy ? spyOnChannels(mockSupabase.client) : null;

  const view = await renderWithProviders(<WorkspaceScreen />, {
    withAuth: true,
    queryClient: createMutationTestClient(),
  });
  return { view, spy };
}

beforeEach(() => {
  // The real AuthProvider (withAuth: true) logs auth state changes by design —
  // a silent sink keeps this suite at zero console output.
  setLogSink(() => {});
  // The default layout is expanded (three columns, everything visible); the
  // tabs tests override to medium before rendering.
  setLayout("expanded");
});

afterEach(() => {
  resetLogging();
  mockSupabase?.restore();
  mockSupabase = undefined;
  fetchOrdersMock.mockReset();
  settingsMock.mockReset();
  updateMock.mockReset();
  useRouterMock.mockReset();
  useLayoutMock.mockReset();
  routerPush.mockClear();
});

describe("WorkspaceScreen board read", () => {
  it("renders a loading skeleton while the first fetch is in flight", async () => {
    await renderWorkspace({
      orders: [makeOrder()],
      fetchImpl: () => new Promise<ActiveOrderRow[]>(() => {}),
    });

    // SkeletonList's own loading affordance — the board's first-fetch state.
    expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
    // No group content leaks out alongside the skeleton.
    expect(screen.queryByText("AB2CD4")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start Preparing" })).toBeNull();
  });

  it("renders the empty state when there are no active orders", async () => {
    await renderWorkspace({ orders: [] });

    expect(await screen.findByText("No active orders")).toBeOnTheScreen();
    // The board itself renders nothing — no empty group headers.
    expect(screen.queryByText(/New \(/)).toBeNull();
  });

  it("renders an error state with retry when the read fails, and retry re-attempts it", async () => {
    // A transport-level throw (T04 O-1: not an AppError at the screen).
    const board = [makeOrder()];
    let failFirstRead = true;
    await renderWorkspace({
      fetchImpl: () =>
        failFirstRead
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve([...board]),
    });

    expect(await screen.findByText("Something went wrong")).toBeOnTheScreen();
    expect(
      screen.getByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();

    failFirstRead = false;
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));

    // Retry re-attempted the read and the board rendered.
    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(fetchOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("shows a transient inline notice when a refetch fails while the board still shows data", async () => {
    // A transport-level throw (T04 O-1: not an AppError at the screen).
    const order = makeOrder();
    let failReads = false;
    await renderWorkspace({
      fetchImpl: () =>
        failReads ? Promise.reject(new Error("Network request failed")) : Promise.resolve([order]),
    });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    // T11-R04: the next read fails, but the board still has its (stale) data —
    // full silence is wrong now that realtime multiplies background refetches.
    failReads = true;
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();
    // The stale board stays the rendered truth; the full error state stays
    // reserved for a board with NO data to show.
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();

    // Transient: the notice clears again on the next successful read.
    failReads = false;
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        screen.queryByText("We couldn't reach the network. Check the connection and try again."),
      ).toBeNull(),
    );
  });
});

describe("WorkspaceScreen grouping", () => {
  it("groups active orders into New, Preparing and Ready with one count per group, as columns on expanded", async () => {
    const newOrder = makeOrder();
    const preparingOrder = makeOrder({
      id: "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      display_number: "C5D6E7",
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    const readyOrder = makeOrder({
      id: "d4e5f6a7-8b9c-9d0e-1f2a-3b4c5d6e7f8a",
      display_number: "F6G7H8",
      status: "ready",
      assigned_preparation_id: ACTOR_ID,
    });
    await renderWorkspace({ orders: [newOrder, preparingOrder, readyOrder] });

    // One count per group, and every active order sits in its own group.
    expect(await screen.findByText("New (1)")).toBeOnTheScreen();
    expect(screen.getByText("Preparing (1)")).toBeOnTheScreen();
    expect(screen.getByText("Ready (1)")).toBeOnTheScreen();
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.getByText("C5D6E7")).toBeOnTheScreen();
    expect(screen.getByText("F6G7H8")).toBeOnTheScreen();
    // Columns, not tabs: all three groups are on screen at once, with no tablist.
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("renders the three groups as tabs on a medium layout, one group visible at a time", async () => {
    const newOrder = makeOrder();
    const preparingOrder = makeOrder({
      id: "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      display_number: "C5D6E7",
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    await renderWorkspace({ orders: [newOrder, preparingOrder], size: "medium" });

    // The counts stay visible on the triggers while only one group renders.
    expect(await screen.findByRole("tab", { name: "New (1)" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Preparing (1)" })).toBeOnTheScreen();
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("C5D6E7")).toBeNull();

    await userEvent.setup().press(screen.getByRole("tab", { name: "Preparing (1)" }));

    expect(await screen.findByText("C5D6E7")).toBeOnTheScreen();
  });

  it("renders empty groups as No orders within a populated expanded board", async () => {
    // A board where only New has work — Preparing and Ready are legitimately
    // empty while their sibling is not.
    await renderWorkspace({ orders: [makeOrder()] });

    // T11-R03: the empty groups render words, not blank panels — pinned so
    // the empty-within-populated state cannot regress silently.
    expect(await screen.findByText("New (1)")).toBeOnTheScreen();
    expect(screen.getByText("Preparing (0)")).toBeOnTheScreen();
    expect(screen.getByText("Ready (0)")).toBeOnTheScreen();
    expect(screen.getAllByText("No orders")).toHaveLength(2);
  });
});

describe("WorkspaceScreen transitions", () => {
  it("starts preparing an eligible new order, ignoring repeat presses while pending, then shows the claimed order", async () => {
    const newOrder = makeOrder();
    let board = [newOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

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
      orderId: newOrder.id,
      targetStatus: "preparing",
    });

    // The board's data changes under the refetch the mutation's success
    // invalidation triggers: the order is now claimed to the actor.
    board = [
      makeOrder({
        status: "preparing",
        assigned_preparation_id: ACTOR_ID,
      }),
    ];
    await act(async () => {
      resolveUpdate(makePreparingUpdate(newOrder));
    });

    // The refetched board shows the order in Preparing, claimed to you.
    await screen.findByText("Preparing (1)");
    expect(screen.getByText("You")).toBeOnTheScreen();
    expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("offers Mark ready only for the actor's own preparing order; a colleague's shows the assignment and no action", async () => {
    const ownOrder = makeOrder({
      id: "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
      display_number: "F6G7H8",
      status: "preparing",
      assigned_preparation_id: ACTOR_ID,
    });
    const colleagueOrder = makeOrder({
      id: "d4e5f6a7-8b9c-9d0e-1f2a-3b4c5d6e7f8a",
      display_number: "C5D6E7",
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    updateMock.mockResolvedValue({
      order_id: ownOrder.id,
      display_number: ownOrder.display_number,
      status: "ready",
      assigned_preparation_id: ACTOR_ID,
      completed_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: "2026-08-26T05:05:00.000000+00:00",
    });
    await renderWorkspace({ orders: [ownOrder, colleagueOrder] });

    const colleagueCard = await screen.findByLabelText(
      "Order C5D6E7, Preparing, assigned to another employee",
    );
    // AC-05: the colleague's order shows the assignment indicator…
    expect(screen.getByText("Assigned to another employee")).toBeOnTheScreen();
    // …and offers NO Mark ready action.
    expect(within(colleagueCard).queryByRole("button", { name: "Mark Ready" })).toBeNull();

    const ownCard = screen.getByLabelText("Order F6G7H8, Preparing, assigned to you");
    const markReady = within(ownCard).getByRole("button", { name: "Mark Ready" });
    await userEvent.setup().press(markReady);

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        orderId: ownOrder.id,
        targetStatus: "ready",
      }),
    );
  });

  it("shows the created time in the store timezone", async () => {
    await renderWorkspace({ orders: [makeOrder()] });

    // 05:00 UTC renders as 08:00 in the settings row's Asia/Riyadh.
    expect(await screen.findByText("08:00")).toBeOnTheScreen();
  });

  it("renders a midnight order as 00:00, never 24:00", async () => {
    // 21:00:08 UTC is 00:00:08 the next day in Asia/Riyadh — the hour an
    // h24-cycle ICU build (Hermes tablets) would render as "24" with a
    // 24-hour clock (T11-R05, the model's own % 24 absorption).
    const midnightOrder = makeOrder({ created_at: "2026-08-26T21:00:08.123456+00:00" });
    await renderWorkspace({ orders: [midnightOrder] });

    expect(await screen.findByText("00:00")).toBeOnTheScreen();
    expect(screen.queryByText("24:00")).toBeNull();
  });

  it("keeps rendering the board when the settings row is absent", async () => {
    await renderWorkspace({ orders: [makeOrder()], settings: null });

    // Decision 8: an absent settings read degrades to the device timezone
    // silently — the board itself must not fail on it.
    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("keeps rendering the board when the settings read fails", async () => {
    await renderWorkspace({ orders: [makeOrder()], settingsFails: true });

    // The same degradation for a failing read: time display is a nicety, the
    // operational board is the point.
    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("WorkspaceScreen rejected transitions", () => {
  it("surfaces a rejected start-preparing transition near the card and refreshes the board", async () => {
    const newOrder = makeOrder();
    await renderWorkspace({ orders: [newOrder] });

    // The K1004 the server answers a stale claim with.
    updateMock.mockRejectedValue(
      new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      }),
    );

    await userEvent.setup().press(await screen.findByRole("button", { name: "Start Preparing" }));

    // Feedback NEAR the action (InlineError beside the card), never swallowed,
    // never fabricated as a local transition — the order is still New.
    expect(await screen.findByText("This order has already been updated.")).toBeOnTheScreen();
    expect(screen.getByText("New (1)")).toBeOnTheScreen();
    // T05-R02: the hook invalidates on success only, so the SCREEN refreshes
    // the affected data on rejection.
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("closes the cancel dialog, shows feedback near the card, and refreshes on a rejected cancel", async () => {
    const newOrder = makeOrder();
    await renderWorkspace({ orders: [newOrder] });

    // A transport-level throw (T04 O-1: not an AppError at the screen).
    updateMock.mockRejectedValue(new Error("rpc channel closed"));

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Cancel" }));

    // The destructive confirmation appeared, then was confirmed.
    expect(screen.getByText("Cancel order AB2CD4?")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Cancel order" }));

    // T10-R01: dialog open=false FIRST (feedback behind an open modal is
    // invisible), then feedback near the card, then the refresh.
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("Something went wrong.")).toBeOnTheScreen();
    // The order is still on the board — the client never fabricates the cancel.
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("still shows the rejection feedback when the refetch removes the rejected order from the board", async () => {
    // R2-01(a): employee A confirms Cancel while employee B's cancel lands
    // first — A's RPC rejects with K1004, and the onError refetch returns a
    // board the order has already left. Feedback attached to a card that no
    // longer exists would render nowhere, making A's failure look like
    // success; it must fall back to the screen body instead.
    const newOrder = makeOrder();
    let board = [newOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    updateMock.mockImplementation(async () => {
      // B's cancel already landed: the order is no longer active.
      board = [];
      throw new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      });
    });

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Cancel" }));
    await user.press(screen.getByRole("button", { name: "Cancel order" }));

    // The dialog closed, the refetched board is empty, and the card is gone…
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("No active orders")).toBeOnTheScreen();
    expect(screen.queryByText("AB2CD4")).toBeNull();
    // …and A's failure is STILL on screen — without its card, the feedback
    // renders beside the board rather than nowhere.
    expect(screen.getByText("This order has already been updated.")).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("still shows the rejection feedback on the tab layout when the rejected order moved to a hidden group", async () => {
    // R2-01(b): the common claim race — a colleague claims the order first,
    // so the K1004 refetch moves the card into Preparing. On the tab layout
    // (portrait, the primary in-store orientation) that group's TabsContent
    // is not mounted, so card-adjacent feedback would render nowhere the
    // employee is looking. The feedback appears beside the board, without the
    // employee having to switch tabs.
    const contestedOrder = makeOrder();
    const claimedByColleague = makeOrder({
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    let board = [contestedOrder];
    await renderWorkspace({ size: "medium", fetchImpl: () => Promise.resolve([...board]) });

    updateMock.mockImplementation(async () => {
      board = [claimedByColleague];
      throw new AppError({
        kind: "state-conflict",
        userMessage: "This order has already been updated.",
        code: "K1004",
      });
    });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Start Preparing" }));

    // The feedback is visible WITHOUT switching tabs…
    expect(await screen.findByText("This order has already been updated.")).toBeOnTheScreen();
    // …exactly once (the card-adjacent copy unmounts with its hidden group, so
    // only the screen-body fallback renders)…
    expect(screen.getAllByText("This order has already been updated.")).toHaveLength(1);
    // …while the order itself has moved into the unmounted Preparing group and
    // the active New tab is legitimately empty.
    expect(screen.getByRole("tab", { name: "Preparing (1)" })).toBeOnTheScreen();
    expect(screen.getByText("No orders")).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("cancels an order after destructive confirmation and removes it from the board", async () => {
    const newOrder = makeOrder();
    let board = [newOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    updateMock.mockImplementation(async () => {
      // The cancelled order leaves the active board on the next read.
      board = [];
      return {
        order_id: newOrder.id,
        display_number: newOrder.display_number,
        status: "cancelled",
        assigned_preparation_id: null,
        completed_at: null,
        cancelled_at: "2026-08-26T05:06:00.000000+00:00",
        cancellation_reason: null,
        updated_at: "2026-08-26T05:06:00.000000+00:00",
      };
    });

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Cancel" }));
    await user.press(screen.getByRole("button", { name: "Cancel order" }));

    // The screen closes the dialog on success and the refetched board is empty.
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("No active orders")).toBeOnTheScreen();
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        orderId: newOrder.id,
        targetStatus: "cancelled",
      }),
    );
  });
});

describe("WorkspaceScreen affordances", () => {
  it("announces a newly arrived order through a polite live region after a manual refresh", async () => {
    const firstOrder = makeOrder();
    const secondOrder = makeOrder({
      id: "b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      display_number: "J4K5L6",
    });
    let board = [firstOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText(/New order/)).toBeNull();

    // A new order arrives between reads; the refresh affordance pulls it in.
    board = [firstOrder, secondOrder];
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh" }));

    // Decision 9: a polite live region (no toast, no sound) with the arrival
    // as its accessible name.
    const announcement = await screen.findByText("New order J4K5L6");
    expect(announcement.props.accessibilityLiveRegion).toBe("polite");
    expect(fetchOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("clears the arrival announcement again after a short delay", async () => {
    const firstOrder = makeOrder();
    const secondOrder = makeOrder({
      id: "b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      display_number: "J4K5L6",
    });
    let board = [firstOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    // Fake timers from here on, so the delay can be advanced deterministically
    // instead of slept out (the announcement's timer starts when the caption
    // is set, i.e. after the refresh below).
    jest.useFakeTimers();
    try {
      board = [firstOrder, secondOrder];
      await userEvent.setup().press(screen.getByRole("button", { name: "Refresh" }));

      expect(await screen.findByText("New order J4K5L6")).toBeOnTheScreen();

      // T11-R02: an all-shift board must not keep a stale arrival caption on
      // screen until the next arrival — it clears after a short delay.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(ANNOUNCEMENT_CLEAR_MILLIS);
      });
      expect(screen.queryByText("New order J4K5L6")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not announce when a refresh returns the same orders", async () => {
    // R2-04 (characterization): the announcement is an ARRIVALS diff — a
    // refresh whose id diff is empty is not an arrival, so no caption.
    const firstOrder = makeOrder();
    const secondOrder = makeOrder({
      id: "b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      display_number: "J4K5L6",
    });
    await renderWorkspace({ orders: [firstOrder, secondOrder] });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchOrdersMock).toHaveBeenCalledTimes(2));

    // Same board again: neither the singular nor the plural announcement.
    expect(screen.queryByText(/New order/)).toBeNull();
    expect(screen.queryByText(/new orders/)).toBeNull();
  });

  it("does not announce when an order departs between reads", async () => {
    // R2-04 (characterization): a departure (a colleague's cancel) is not an
    // arrival — the diff only counts APPEARING ids, so no caption either way.
    const firstOrder = makeOrder();
    const departedOrder = makeOrder({
      id: "b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
      display_number: "J4K5L6",
    });
    let board = [firstOrder, departedOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("J4K5L6")).toBeOnTheScreen();

    // The colleague's cancel removes the second order between reads.
    board = [firstOrder];
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText("J4K5L6")).toBeNull());

    expect(screen.queryByText(/New order/)).toBeNull();
    expect(screen.queryByText(/new orders/)).toBeNull();
  });

  it("keeps the pending action across a mid-mutation realtime refetch, and clears it when the write settles", async () => {
    // R2-05 (characterization): the per-card pending state derives from the
    // MUTATION's state alone — a realtime-driven refetch around an in-flight
    // write (board data unchanged) must not re-enable the action, and the
    // repeat-press guard must hold until the RPC actually settles.
    const newOrder = makeOrder();
    const { spy } = await renderWorkspace({ orders: [newOrder], channelSpy: true });
    if (spy === null) throw new Error("channel spy was not installed");

    let resolveUpdate!: (value: OrderStatusUpdate) => void;
    updateMock.mockImplementation(
      () =>
        new Promise<OrderStatusUpdate>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: "Start Preparing" }));
    expect(await screen.findByRole("button", { name: "Starting…" })).toBeDisabled();

    // An orders event lands while the write is still in flight: the board
    // refetches (unchanged data) around the pending mutation.
    await act(async () => {
      spy.handlers[0]?.({
        schema: "public",
        table: "orders",
        eventType: "UPDATE",
        new: { id: newOrder.id, status: "new" },
        old: { id: newOrder.id, status: "new" },
        errors: null,
      });
    });
    await waitFor(() => expect(fetchOrdersMock).toHaveBeenCalledTimes(2));

    // The pending label survived the refetch…
    const stillStarting = screen.getByRole("button", { name: "Starting…" });
    expect(stillStarting).toBeDisabled();
    // …and a repeat press is still ignored.
    await user.press(stillStarting);
    expect(updateMock).toHaveBeenCalledTimes(1);

    // The write settles — the pending surface clears with it.
    await act(async () => {
      resolveUpdate(makePreparingUpdate(newOrder));
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Starting…" })).toBeNull());
  });

  it("offers a sign-out affordance", async () => {
    await renderWorkspace({ orders: [makeOrder()] });

    // The sign-out control is present (its flow is core/auth's contract).
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeOnTheScreen();
  });

  it("opens order details with the order's id when a card is pressed", async () => {
    const newOrder = makeOrder();
    await renderWorkspace({ orders: [newOrder] });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Order AB2CD4, New" }));

    // Plan decision 1: the static details route with orderId as a query param.
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/order-details",
      params: { orderId: newOrder.id },
    });
  });
});

describe("WorkspaceScreen realtime (AC-09)", () => {
  it("subscribes to orders changes while mounted and removes the channel on unmount", async () => {
    const { view, spy } = await renderWorkspace({ orders: [makeOrder()], channelSpy: true });
    if (spy === null) throw new Error("channel spy was not installed");

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    // ONE channel for the orders table, opened under the feature's own name.
    expect(spy.created).toEqual(["preparation-orders"]);

    // A tablet runs all day — a channel that survives navigation leaks.
    await view.unmount();
    expect(spy.removed).toHaveLength(1);
  });

  it("refetches the board when an orders event arrives; the rendered truth is the query result, never the payload", async () => {
    const newOrder = makeOrder();
    const movedOrder = makeOrder({
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    let board = [newOrder];
    const { spy } = await renderWorkspace({
      fetchImpl: () => Promise.resolve([...board]),
      channelSpy: true,
    });
    if (spy === null) throw new Error("channel spy was not installed");

    expect(await screen.findByText("New (1)")).toBeOnTheScreen();
    expect(fetchOrdersMock).toHaveBeenCalledTimes(1);

    // The order moves on the server while the board is open.
    board = [movedOrder];

    // The realtime event fires — carrying row content the query never returns,
    // to pin that the payload itself is never rendered.
    await act(async () => {
      spy.handlers[0]?.({
        schema: "public",
        table: "orders",
        eventType: "UPDATE",
        new: { id: movedOrder.id, display_number: "ZZ9Y8X", status: "preparing" },
        old: { id: newOrder.id, status: "new" },
        errors: null,
      });
    });

    // The event only INVALIDATED the feature's queries — the refetch re-called
    // the api boundary and the refetched result re-rendered the board.
    await waitFor(() => expect(fetchOrdersMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Preparing (1)")).toBeOnTheScreen();
    expect(screen.queryByText("New (1)")).toBeNull();
    // AC-09's second half: the payload's own content never reaches the screen.
    expect(screen.queryByText("ZZ9Y8X")).toBeNull();
  });
});
