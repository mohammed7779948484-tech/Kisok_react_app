import { useRouter } from "expo-router";
import { type QueryClient } from "@tanstack/react-query";
import { useWindowDimensions } from "react-native";

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

import { fetchActiveOrders, type ActiveOrderRow } from "../../api/fetch-active-orders";
import { fetchOrderDetail } from "../../api/fetch-order-detail";
import { fetchStoreSettings, type StoreSettingsRow } from "../../api/fetch-store-settings";
import { updateOrderStatus } from "../../api/update-order-status";
import { type OrderStatusUpdate } from "../../model/order-status-update.schema";

import { ANNOUNCEMENT_CLEAR_MILLIS, WorkspaceScreen } from "./workspace-screen";

/**
 * The workspace board's observable contract (AC-01/02/04/05/09/10):
 *
 * - three status lanes — Incoming, In preparation, Ready for pickup — with one
 *   count per lane, oldest first; side by side on a landscape tablet, one at a
 *   time behind tabs in portrait. The layout is driven through the window
 *   size the design system's `useLayout()` reads, not a mocked hook;
 * - the board read's reachable states: loading skeleton, empty state, error
 *   with retry that re-attempts, and a transient inline notice when a refetch
 *   fails while the board still shows data (T11-R04);
 * - Start preparing / Mark ready on the ticket, driven through the real
 *   mutation hook, with the pending disable, one transition at a time, and the
 *   repeat-press guard; Mark ready only for the actor's own order;
 * - rejected transitions surfaced as InlineError feedback beside the order
 *   plus a refresh of the board (the mutation invalidates on success ONLY).
 *   The feedback keeps a home when the order is no longer a VISIBLE ticket —
 *   it left the board under the rejection refetch, or moved into a hidden tab
 *   (R2-01): the screen body beside the board, never nowhere;
 * - on the widest landscape layout a ticket opens beside the board (the focus
 *   panel), which is where cancelling lives — with a confirmation and an
 *   optional reason; narrower layouts open the order's details screen;
 * - the polite arrival announcement (decision 9) and its clearing (T11-R02),
 *   refresh, history and sign-out affordances, and the store clock in the
 *   store timezone with midnight pinned to "00:00" (T11-R05);
 * - the realtime wiring (AC-09): one orders channel while mounted, removed on
 *   unmount, and an event only INVALIDATES — the refetch, never the payload,
 *   re-renders the board.
 *
 * Mocked at the feature's own `api/` boundary (plus `expo-router` and the
 * window size) — a screen test must not know Supabase exists. The realtime
 * tests layer a channel-recording spy onto `installMockAuth`'s client so the
 * subscription can be asserted and a fake event FIRED at it.
 */

jest.mock("../../api/fetch-active-orders", () => ({ fetchActiveOrders: jest.fn() }));
jest.mock("../../api/fetch-order-detail", () => ({ fetchOrderDetail: jest.fn() }));
jest.mock("../../api/fetch-store-settings", () => ({ fetchStoreSettings: jest.fn() }));
jest.mock("../../api/update-order-status", () => ({ updateOrderStatus: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
// FlashList commits its measured layout on a later frame, outside any act()
// scope, so React intermittently warns under jest. FlatList takes the same
// props this screen passes (data, renderItem, keyExtractor, numColumns,
// extraData) and renders the same items, without the native measurement pass.
jest.mock("@shopify/flash-list", () => ({
  FlashList: jest.requireActual("react-native").FlatList,
}));
// `useLayout()` and `usePageGutter()` read the window size; driving that is
// how a test picks a layout without reaching into the design system.
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(),
}));

const fetchOrdersMock = fetchActiveOrders as jest.MockedFunction<typeof fetchActiveOrders>;
const fetchDetailMock = fetchOrderDetail as jest.MockedFunction<typeof fetchOrderDetail>;
const settingsMock = fetchStoreSettings as jest.MockedFunction<typeof fetchStoreSettings>;
const updateMock = updateOrderStatus as jest.MockedFunction<typeof updateOrderStatus>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const windowMock = useWindowDimensions as jest.MockedFunction<typeof useWindowDimensions>;

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

const REJECTED = "This order has already been updated.";

function conflict() {
  return new AppError({ kind: "state-conflict", userMessage: REJECTED, code: "K1004" });
}

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
 * A minimal board-shaped order row. Defaults to the board's entry point: a
 * NEW, unassigned order.
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
    created_at: "2026-08-26T05:00:08.123456+00:00",
    updated_at: "2026-08-26T05:01:41.000000+00:00",
    order_items: [makeItem("c7d8e9f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f", "SO-250G-WB")],
    ...overrides,
  };
}

const PREPARING_ID = "c3d4e5f6-7a8b-4c0d-9e2f-3a4b5c6d7e8f";
const READY_ID = "d4e5f6a7-8b9c-4d0e-9f2a-3b4c5d6e7f8a";
const SECOND_NEW_ID = "b2c3d4e5-6f7a-4b9c-8d1e-2f3a4b5c6d7e";

/** A validated success projection for the given end state. */
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
 * The shared test client plus mutation gcTime: Infinity — a completed
 * useMutation otherwise leaves a five-minute GC timer that keeps jest from
 * exiting.
 */
function createMutationTestClient(): QueryClient {
  const client = createTestQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    mutations: { ...client.getDefaultOptions().mutations, gcTime: Infinity },
  });
  return client;
}

/**
 * The three layouts the board actually has:
 * - `canvas`: a wide landscape tablet — lanes side by side, and a ticket opens
 *   beside the board;
 * - `lanes`: a narrower landscape window — lanes side by side, a ticket opens
 *   the details screen;
 * - `tabs`: portrait — one lane at a time behind tabs.
 */
type BoardLayout = "canvas" | "lanes" | "tabs";

const WINDOWS: Record<BoardLayout, { width: number; height: number }> = {
  canvas: { width: 1280, height: 800 },
  lanes: { width: 1000, height: 700 },
  tabs: { width: 800, height: 1280 },
};

function setWindow(layout: BoardLayout) {
  windowMock.mockReturnValue({ ...WINDOWS[layout], scale: 2, fontScale: 1 });
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

function ordersEvent(payload: Record<string, unknown>) {
  return { schema: "public", table: "orders", eventType: "UPDATE", errors: null, ...payload };
}

type RenderOptions = {
  orders?: ActiveOrderRow[];
  layout?: BoardLayout;
  settings?: StoreSettingsRow | null;
  /** Makes the settings read reject (decision 8's failing-read case). */
  settingsFails?: boolean;
  /** Lets a test fail the first read, or swap the board between fetches. */
  fetchImpl?: () => Promise<ActiveOrderRow[]>;
  /** The single-order read the focus panel makes; defaults to the board's row. */
  detailImpl?: (orderId: string) => Promise<ActiveOrderRow | null>;
  /** Records the client's channel plumbing, for the realtime tests. */
  channelSpy?: boolean;
};

async function renderWorkspace({
  orders = [],
  layout = "lanes",
  settings = STORE_SETTINGS,
  settingsFails = false,
  fetchImpl,
  detailImpl,
  channelSpy = false,
}: RenderOptions = {}) {
  setWindow(layout);
  const readBoard = fetchImpl ?? (() => Promise.resolve([...orders]));
  fetchOrdersMock.mockImplementation(readBoard);
  fetchDetailMock.mockImplementation(
    detailImpl ??
      (async (orderId) => (await readBoard()).find((order) => order.id === orderId) ?? null),
  );
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

/** A lane's own count, announced on its header (side-by-side layouts). */
function expectLaneCount(title: "Incoming" | "In preparation" | "Ready for pickup", n: number) {
  expect(screen.getByLabelText(`${n} ${title}`)).toBeOnTheScreen();
}

/** A ticket's pressable body; its accessible name starts with the order number. */
function ticket(displayNumber: string) {
  return screen.getByRole("button", { name: new RegExp(`^Order ${displayNumber},`) });
}

function startPreparing(displayNumber: string) {
  return screen.getByRole("button", { name: `Start preparing, order ${displayNumber}` });
}

function markReady(displayNumber: string) {
  return screen.getByRole("button", { name: `Mark ready, order ${displayNumber}` });
}

/** The display numbers on screen, in tree order. */
function renderedNumbers(pattern: RegExp) {
  return screen.getAllByText(pattern).map((element) => element.props.children);
}

/**
 * The destructive confirm inside the cancel dialog. The focus panel's own
 * "Cancel order" opener stays mounted beneath the dialog, and the dialog
 * renders into the portal host after the screen, so its confirm is the last.
 */
function confirmCancelButton() {
  const buttons = screen.getAllByRole("button", { name: "Cancel order" });
  expect(buttons).toHaveLength(2);
  return buttons[buttons.length - 1]!;
}

beforeEach(() => {
  // The real AuthProvider (withAuth: true) logs auth state changes by design —
  // a silent sink keeps this suite at zero console output.
  setLogSink(() => {});
  setWindow("lanes");
});

afterEach(() => {
  resetLogging();
  mockSupabase?.restore();
  mockSupabase = undefined;
  fetchOrdersMock.mockReset();
  fetchDetailMock.mockReset();
  settingsMock.mockReset();
  updateMock.mockReset();
  useRouterMock.mockReset();
  windowMock.mockReset();
  routerPush.mockClear();
});

describe("WorkspaceScreen board read", () => {
  it("renders a loading skeleton while the first fetch is in flight", async () => {
    await renderWorkspace({ fetchImpl: () => new Promise<ActiveOrderRow[]>(() => {}) });

    expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
    // No board content leaks out alongside the skeleton.
    expect(screen.queryByText("AB2CD4")).toBeNull();
    expect(screen.queryByText("All caught up")).toBeNull();
  });

  it("renders the empty state when there are no active orders", async () => {
    await renderWorkspace({ orders: [] });

    expect(await screen.findByText("All caught up")).toBeOnTheScreen();
    // The board itself renders no lanes, while the header still counts zero.
    expect(screen.queryByText("Incoming")).toBeNull();
    expect(screen.getByLabelText("0 waiting")).toBeOnTheScreen();
  });

  it("renders an error state with retry when the read fails, and retry re-attempts it", async () => {
    // A transport-level throw (not an AppError at the screen).
    let failFirstRead = true;
    await renderWorkspace({
      fetchImpl: () =>
        failFirstRead
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve([makeOrder()]),
    });

    expect(await screen.findByText("Something went wrong")).toBeOnTheScreen();
    expect(
      screen.getByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();

    failFirstRead = false;
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(fetchOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("shows a transient inline notice when a refetch fails while the board still shows data", async () => {
    let failReads = false;
    await renderWorkspace({
      fetchImpl: () =>
        failReads
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve([makeOrder()]),
    });
    const user = userEvent.setup();

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    // T11-R04: the next read fails, but the board still has its (stale) data.
    failReads = true;
    await user.press(screen.getByRole("button", { name: "Refresh orders" }));

    expect(
      await screen.findByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();
    // The stale board stays the rendered truth; the full error state stays
    // reserved for a board with NO data to show.
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();

    // Transient: the notice clears again on the next successful read.
    failReads = false;
    await user.press(screen.getByRole("button", { name: "Refresh orders" }));
    await waitFor(() =>
      expect(
        screen.queryByText("We couldn't reach the network. Check the connection and try again."),
      ).toBeNull(),
    );
  });
});

describe("WorkspaceScreen lanes", () => {
  it("groups active orders into Incoming, In preparation and Ready for pickup side by side", async () => {
    await renderWorkspace({
      orders: [
        makeOrder(),
        makeOrder({
          id: PREPARING_ID,
          display_number: "C5D6E7",
          status: "preparing",
          assigned_preparation_id: COLLEAGUE_ID,
        }),
        makeOrder({
          id: READY_ID,
          display_number: "F6G7H8",
          status: "ready",
          assigned_preparation_id: ACTOR_ID,
        }),
      ],
    });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    // One count per lane, and every active order sits in its own lane…
    expectLaneCount("Incoming", 1);
    expectLaneCount("In preparation", 1);
    expectLaneCount("Ready for pickup", 1);
    expect(screen.getByText("C5D6E7")).toBeOnTheScreen();
    expect(screen.getByText("F6G7H8")).toBeOnTheScreen();
    // …the header states the shape of the shift…
    expect(screen.getByLabelText("1 waiting")).toBeOnTheScreen();
    expect(screen.getByLabelText("1 in preparation")).toBeOnTheScreen();
    expect(screen.getByLabelText("1 ready")).toBeOnTheScreen();
    // …and all three lanes are on screen at once, with no tablist.
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("orders each lane oldest first, whatever order the read returns", async () => {
    await renderWorkspace({
      orders: [
        makeOrder({
          id: SECOND_NEW_ID,
          display_number: "NEW2ND",
          created_at: "2026-08-26T05:10:00.000000+00:00",
        }),
        makeOrder({ display_number: "NEW1ST", created_at: "2026-08-26T05:00:00.000000+00:00" }),
      ],
    });

    expect(await screen.findByText("NEW1ST")).toBeOnTheScreen();
    // The order that has waited longest is the one to act on, so it leads.
    expect(renderedNumbers(/^NEW(1ST|2ND)$/)).toEqual(["NEW1ST", "NEW2ND"]);
  });

  it("renders empty lanes in words within a populated board", async () => {
    await renderWorkspace({ orders: [makeOrder()] });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expectLaneCount("Incoming", 1);
    expectLaneCount("In preparation", 0);
    expectLaneCount("Ready for pickup", 0);
    expect(screen.getByText("Nothing in progress")).toBeOnTheScreen();
    expect(screen.getByText("Nothing waiting")).toBeOnTheScreen();
  });

  it("shows one lane at a time behind tabs in portrait, with every lane's count on its tab", async () => {
    await renderWorkspace({
      layout: "tabs",
      orders: [
        makeOrder(),
        makeOrder({
          id: PREPARING_ID,
          display_number: "C5D6E7",
          status: "preparing",
          assigned_preparation_id: COLLEAGUE_ID,
        }),
      ],
    });
    const user = userEvent.setup();

    const incoming = await screen.findByRole("tab", { name: "Incoming, 1" });
    expect(incoming).toBeSelected();
    expect(screen.getByRole("tab", { name: "In preparation, 1" })).not.toBeSelected();
    expect(screen.getByRole("tab", { name: "Ready for pickup, 0" })).toBeOnTheScreen();
    expect(screen.getByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("C5D6E7")).toBeNull();

    await user.press(screen.getByRole("tab", { name: "In preparation, 1" }));

    expect(await screen.findByText("C5D6E7")).toBeOnTheScreen();
    expect(screen.queryByText("AB2CD4")).toBeNull();
    expect(screen.getByRole("tab", { name: "In preparation, 1" })).toBeSelected();

    await user.press(screen.getByRole("tab", { name: "Ready for pickup, 0" }));
    expect(await screen.findByText("Nothing waiting")).toBeOnTheScreen();
  });
});

describe("WorkspaceScreen transitions", () => {
  it("starts preparing an eligible new order, one transition at a time, then shows it claimed", async () => {
    const newOrder = makeOrder();
    const otherNew = makeOrder({
      id: SECOND_NEW_ID,
      display_number: "J4K5L6",
      created_at: "2026-08-26T05:10:00.000000+00:00",
    });
    let board = [newOrder, otherNew];
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
    await screen.findByText("AB2CD4");
    await user.press(startPreparing("AB2CD4"));

    // Pending: the action is disabled with its label swapped, the other
    // ticket's action is locked (one transition at a time), and a repeat
    // press cannot fire a second write.
    expect(await screen.findByText("Starting…")).toBeOnTheScreen();
    expect(startPreparing("AB2CD4")).toBeDisabled();
    expect(startPreparing("J4K5L6")).toBeDisabled();
    await user.press(startPreparing("AB2CD4"));
    await user.press(startPreparing("J4K5L6"));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      orderId: newOrder.id,
      targetStatus: "preparing",
      reason: undefined,
    });

    // The board's data changes under the refetch the mutation's success
    // invalidation triggers: the order is now claimed to the actor.
    board = [makeOrder({ status: "preparing", assigned_preparation_id: ACTOR_ID }), otherNew];
    await act(async () => {
      resolveUpdate(makeUpdate(newOrder));
    });

    await waitFor(() => expectLaneCount("In preparation", 1));
    expectLaneCount("Incoming", 1);
    expect(screen.getByText("Yours")).toBeOnTheScreen();
    expect(screen.getByText("is yours")).toBeOnTheScreen();
    expect(markReady("AB2CD4")).toBeEnabled();
    expect(startPreparing("J4K5L6")).toBeEnabled();
    expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("offers Mark ready only for the actor's own preparing order; a colleague's shows who has it and no action", async () => {
    const ownOrder = makeOrder({
      id: PREPARING_ID,
      display_number: "F6G7H8",
      status: "preparing",
      assigned_preparation_id: ACTOR_ID,
    });
    const colleagueOrder = makeOrder({
      id: READY_ID,
      display_number: "C5D6E7",
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    updateMock.mockResolvedValue(makeUpdate(ownOrder, { status: "ready" }));
    await renderWorkspace({ orders: [ownOrder, colleagueOrder] });

    // AC-05: the colleague's order says who has it, in words and in its name…
    expect(await screen.findByText("Taken by a colleague")).toBeOnTheScreen();
    expect(ticket("C5D6E7")).toHaveAccessibleName(/taken by a colleague$/);
    expect(ticket("F6G7H8")).toHaveAccessibleName(/yours$/);
    // …and offers no transition at all.
    expect(screen.queryByRole("button", { name: "Mark ready, order C5D6E7" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Start preparing/ })).toBeNull();

    await userEvent.setup().press(markReady("F6G7H8"));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        orderId: ownOrder.id,
        targetStatus: "ready",
        reason: undefined,
      }),
    );
  });

  it("offers no transition on a ready order, only a way to open it", async () => {
    const readyOrder = makeOrder({
      id: READY_ID,
      display_number: "F6G7H8",
      status: "ready",
      assigned_preparation_id: ACTOR_ID,
    });
    await renderWorkspace({ orders: [readyOrder] });

    expect(await screen.findByText("Waiting for pickup")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^(Start preparing|Mark ready)/ })).toBeNull();

    await userEvent.setup().press(screen.getByRole("button", { name: "Open order F6G7H8" }));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/order-details",
      params: { orderId: READY_ID },
    });
  });

  it("shows the store clock and each order's wait in the store timezone", async () => {
    // 05:07 UTC is 08:07 in Riyadh; the order was placed seven minutes earlier.
    jest.useFakeTimers({ now: new Date("2026-08-26T05:07:30Z") });
    try {
      await renderWorkspace({
        orders: [makeOrder({ created_at: "2026-08-26T05:00:08.123456+00:00" })],
      });

      expect(await screen.findByText("Live · store time 08:07")).toBeOnTheScreen();
      expect(ticket("AB2CD4")).toHaveAccessibleName("Order AB2CD4, Waiting 7 min, 1 line");
      expect(screen.getByText("Waiting 7 min")).toBeOnTheScreen();
      expect(screen.getByText("2 units · 1 line")).toBeOnTheScreen();
      expect(screen.getByText("Single Origin Coffee ×2")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("renders the store clock at midnight as 00:00, never 24:00", async () => {
    // 21:00 UTC is 00:00 the next day in Asia/Riyadh — the hour an h24-cycle
    // ICU build (Hermes tablets) would render as "24" (T11-R05).
    jest.useFakeTimers({ now: new Date("2026-08-26T21:00:08Z") });
    try {
      await renderWorkspace({ orders: [makeOrder()] });

      expect(await screen.findByText("Live · store time 00:00")).toBeOnTheScreen();
      expect(screen.queryByText("Live · store time 24:00")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
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

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("WorkspaceScreen rejected transitions", () => {
  it("surfaces a rejected start-preparing beside the ticket and refreshes the board", async () => {
    await renderWorkspace({ orders: [makeOrder()] });
    updateMock.mockRejectedValue(conflict());

    await screen.findByText("AB2CD4");
    await userEvent.setup().press(startPreparing("AB2CD4"));

    // Feedback beside the order, never swallowed, never fabricated as a local
    // transition — the order is still Incoming.
    expect(await screen.findByText(REJECTED)).toBeOnTheScreen();
    expect(screen.getAllByText(REJECTED)).toHaveLength(1);
    expectLaneCount("Incoming", 1);
    // The order actions refresh the board on rejection.
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("still shows the rejection feedback when the refetch removes the rejected order from the board", async () => {
    // R2-01(a): a colleague's cancel lands first — the RPC rejects, and the
    // refetch returns a board the order has already left. Feedback attached
    // to a ticket that no longer exists would render nowhere.
    let board = [makeOrder()];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });
    updateMock.mockImplementation(async () => {
      board = [];
      throw conflict();
    });

    await screen.findByText("AB2CD4");
    await userEvent.setup().press(startPreparing("AB2CD4"));

    expect(await screen.findByText("All caught up")).toBeOnTheScreen();
    expect(screen.queryByText("AB2CD4")).toBeNull();
    expect(screen.getByText(REJECTED)).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("still shows the rejection feedback in portrait when the rejected order moved to a hidden lane", async () => {
    // R2-01(b): the common claim race — a colleague claims the order first,
    // so the refetch moves it into In preparation, a tab that is not shown.
    const contested = makeOrder();
    const claimedByColleague = makeOrder({
      status: "preparing",
      assigned_preparation_id: COLLEAGUE_ID,
    });
    let board = [contested];
    await renderWorkspace({ layout: "tabs", fetchImpl: () => Promise.resolve([...board]) });
    updateMock.mockImplementation(async () => {
      board = [claimedByColleague];
      throw conflict();
    });

    await screen.findByText("AB2CD4");
    await userEvent.setup().press(startPreparing("AB2CD4"));

    // Visible WITHOUT switching tabs, exactly once…
    expect(await screen.findByRole("tab", { name: "In preparation, 1" })).toBeOnTheScreen();
    expect(screen.getAllByText(REJECTED)).toHaveLength(1);
    // …while the active Incoming tab is legitimately empty.
    expect(screen.getByText("No new orders")).toBeOnTheScreen();
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe("WorkspaceScreen focus panel (wide landscape)", () => {
  it("opens a ticket beside the board instead of navigating, and closes it again", async () => {
    await renderWorkspace({ layout: "canvas", orders: [makeOrder()] });
    const user = userEvent.setup();

    await screen.findByText("AB2CD4");
    await user.press(ticket("AB2CD4"));

    // The whole order beside the board: its status, its items, its actions.
    expect(await screen.findByRole("button", { name: "Close order" })).toBeOnTheScreen();
    expect(ticket("AB2CD4")).toBeSelected();
    expect(screen.getByLabelText("Order status: New")).toBeOnTheScreen();
    expect(screen.getByText("SO-250G-WB")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeOnTheScreen();
    expect(routerPush).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: "Close order" }));
    expect(screen.queryByRole("button", { name: "Close order" })).toBeNull();
    expect(ticket("AB2CD4")).not.toBeSelected();

    // Pressing the ticket toggles the panel.
    await user.press(ticket("AB2CD4"));
    expect(await screen.findByRole("button", { name: "Close order" })).toBeOnTheScreen();
    await user.press(ticket("AB2CD4"));
    expect(screen.queryByRole("button", { name: "Close order" })).toBeNull();
  });

  it("cancels an order with a reason after destructive confirmation, and the board drops it", async () => {
    const order = makeOrder();
    const cancelled = makeOrder({
      status: "cancelled",
      cancelled_by: ACTOR_ID,
      cancelled_at: "2026-08-26T05:06:00.000000+00:00",
      cancellation_reason: "Out of stock",
    });
    let board = [order];
    let detail: ActiveOrderRow = order;
    await renderWorkspace({
      layout: "canvas",
      fetchImpl: () => Promise.resolve([...board]),
      detailImpl: () => Promise.resolve(detail),
    });
    updateMock.mockImplementation(async () => {
      board = [];
      detail = cancelled;
      return makeUpdate(order, {
        status: "cancelled",
        assigned_preparation_id: null,
        cancelled_at: "2026-08-26T05:06:00.000000+00:00",
        cancellation_reason: "Out of stock",
      });
    });
    const user = userEvent.setup();

    await screen.findByText("AB2CD4");
    await user.press(ticket("AB2CD4"));
    await user.press(await screen.findByRole("button", { name: "Cancel order" }));

    // The destructive confirmation, with an optional reason.
    expect(screen.getByText("Cancel order AB2CD4?")).toBeOnTheScreen();
    await user.press(screen.getByRole("radio", { name: "Out of stock" }));
    await user.press(confirmCancelButton());

    expect(updateMock).toHaveBeenCalledWith({
      orderId: order.id,
      targetStatus: "cancelled",
      reason: "Out of stock",
    });
    // The dialog closes, and the refetched board no longer holds the order.
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect(await screen.findByText("All caught up")).toBeOnTheScreen();
  });

  it("closes the cancel dialog, shows feedback beside the order, and refreshes on a rejected cancel", async () => {
    await renderWorkspace({ layout: "canvas", orders: [makeOrder()] });
    // A transport-level throw (not an AppError at the screen).
    updateMock.mockRejectedValue(new Error("rpc channel closed"));
    const user = userEvent.setup();

    await screen.findByText("AB2CD4");
    await user.press(ticket("AB2CD4"));
    await user.press(await screen.findByRole("button", { name: "Cancel order" }));
    await user.press(confirmCancelButton());

    // The dialog closes (feedback behind an open modal is invisible), the
    // failure is shown beside the order, and the board refreshes.
    await waitFor(() => expect(screen.queryByText("Cancel order AB2CD4?")).toBeNull());
    expect((await screen.findAllByText("Something went wrong.")).length).toBeGreaterThan(0);
    // The order is still on the board — the client never fabricates the cancel.
    expect(ticket("AB2CD4")).toBeOnTheScreen();
    expectLaneCount("Incoming", 1);
    await waitFor(() => expect(fetchOrdersMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe("WorkspaceScreen affordances", () => {
  it("announces a newly arrived order through a polite live region after a manual refresh", async () => {
    const firstOrder = makeOrder();
    const secondOrder = makeOrder({ id: SECOND_NEW_ID, display_number: "J4K5L6" });
    let board = [firstOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();
    expect(screen.queryByText(/New order/)).toBeNull();

    board = [firstOrder, secondOrder];
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh orders" }));

    // Decision 9: a polite live region (no toast, no sound).
    const announcement = await screen.findByText("New order J4K5L6");
    expect(announcement.props.accessibilityLiveRegion).toBe("polite");
    expect(fetchOrdersMock).toHaveBeenCalledTimes(2);
  });

  it("announces several arrivals at once as a count", async () => {
    const firstOrder = makeOrder();
    let board = [firstOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    board = [
      firstOrder,
      makeOrder({ id: SECOND_NEW_ID, display_number: "J4K5L6" }),
      makeOrder({ id: PREPARING_ID, display_number: "M7N8P9" }),
    ];
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh orders" }));

    expect(await screen.findByText("2 new orders")).toBeOnTheScreen();
  });

  it("clears the arrival announcement again after a short delay", async () => {
    const firstOrder = makeOrder();
    const secondOrder = makeOrder({ id: SECOND_NEW_ID, display_number: "J4K5L6" });
    let board = [firstOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    // Fake timers from here on, so the delay can be advanced deterministically.
    jest.useFakeTimers();
    try {
      board = [firstOrder, secondOrder];
      await userEvent.setup().press(screen.getByRole("button", { name: "Refresh orders" }));

      expect(await screen.findByText("New order J4K5L6")).toBeOnTheScreen();

      // T11-R02: an all-shift board must not keep a stale arrival caption.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(ANNOUNCEMENT_CLEAR_MILLIS);
      });
      expect(screen.queryByText("New order J4K5L6")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not announce when a refresh returns the same orders", async () => {
    // R2-04 (characterization): the announcement is an ARRIVALS diff.
    await renderWorkspace({
      orders: [makeOrder(), makeOrder({ id: SECOND_NEW_ID, display_number: "J4K5L6" })],
    });

    expect(await screen.findByText("AB2CD4")).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh orders" }));
    await waitFor(() => expect(fetchOrdersMock).toHaveBeenCalledTimes(2));

    expect(screen.queryByText(/New order/)).toBeNull();
    expect(screen.queryByText(/new orders/)).toBeNull();
  });

  it("does not announce when an order departs between reads", async () => {
    // R2-04 (characterization): a departure is not an arrival.
    const firstOrder = makeOrder();
    const departedOrder = makeOrder({ id: SECOND_NEW_ID, display_number: "J4K5L6" });
    let board = [firstOrder, departedOrder];
    await renderWorkspace({ fetchImpl: () => Promise.resolve([...board]) });

    expect(await screen.findByText("J4K5L6")).toBeOnTheScreen();

    board = [firstOrder];
    await userEvent.setup().press(screen.getByRole("button", { name: "Refresh orders" }));
    await waitFor(() => expect(screen.queryByText("J4K5L6")).toBeNull());

    expect(screen.queryByText(/New order/)).toBeNull();
    expect(screen.queryByText(/new orders/)).toBeNull();
  });

  it("keeps the pending action across a mid-mutation realtime refetch, and clears it when the write settles", async () => {
    // R2-05 (characterization): the pending state derives from the MUTATION's
    // state alone — a realtime-driven refetch around an in-flight write must
    // not re-enable the action.
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
    await screen.findByText("AB2CD4");
    await user.press(startPreparing("AB2CD4"));
    expect(await screen.findByText("Starting…")).toBeOnTheScreen();
    expect(startPreparing("AB2CD4")).toBeDisabled();

    // An orders event lands while the write is still in flight.
    await act(async () => {
      spy.handlers[0]?.(
        ordersEvent({
          new: { id: newOrder.id, status: "new" },
          old: { id: newOrder.id, status: "new" },
        }),
      );
    });
    await waitFor(() => expect(fetchOrdersMock).toHaveBeenCalledTimes(2));

    // The pending label survived the refetch, and a repeat press is ignored.
    expect(screen.getByText("Starting…")).toBeOnTheScreen();
    expect(startPreparing("AB2CD4")).toBeDisabled();
    await user.press(startPreparing("AB2CD4"));
    expect(updateMock).toHaveBeenCalledTimes(1);

    // The write settles — the pending surface clears with it.
    await act(async () => {
      resolveUpdate(makeUpdate(newOrder));
    });
    await waitFor(() => expect(screen.queryByText("Starting…")).toBeNull());
  });

  it("signs this device out from the workspace", async () => {
    await renderWorkspace({ orders: [] });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mockSupabase?.signOutCalls).toEqual([{ scope: "local" }]));
  });

  it("opens order details with the order's id when a ticket is pressed on a narrower layout", async () => {
    const newOrder = makeOrder();
    await renderWorkspace({ orders: [newOrder] });

    await screen.findByText("AB2CD4");
    await userEvent.setup().press(ticket("AB2CD4"));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/order-details",
      params: { orderId: newOrder.id },
    });
    expect(screen.queryByRole("button", { name: "Close order" })).toBeNull();
  });

  it("navigates to today's history from the header", async () => {
    await renderWorkspace({ orders: [makeOrder()] });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Today’s history" }));

    // AC-08: history is reached from the workspace's header affordance.
    expect(routerPush).toHaveBeenCalledWith("/history");
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
    const movedOrder = makeOrder({ status: "preparing", assigned_preparation_id: COLLEAGUE_ID });
    let board = [newOrder];
    const { spy } = await renderWorkspace({
      fetchImpl: () => Promise.resolve([...board]),
      channelSpy: true,
    });
    if (spy === null) throw new Error("channel spy was not installed");

    await screen.findByText("AB2CD4");
    expectLaneCount("Incoming", 1);
    expect(fetchOrdersMock).toHaveBeenCalledTimes(1);

    // The order moves on the server while the board is open.
    board = [movedOrder];

    // The event carries row content the query never returns, to pin that the
    // payload itself is never rendered.
    await act(async () => {
      spy.handlers[0]?.(
        ordersEvent({
          new: { id: movedOrder.id, display_number: "ZZ9Y8X", status: "preparing" },
          old: { id: newOrder.id, status: "new" },
        }),
      );
    });

    await waitFor(() => expect(fetchOrdersMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expectLaneCount("In preparation", 1));
    expectLaneCount("Incoming", 0);
    expect(screen.queryByText("ZZ9Y8X")).toBeNull();
  });
});
