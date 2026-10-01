import { useRouter } from "expo-router";
import { type QueryClient } from "@tanstack/react-query";

import { resetLogging, setLogSink } from "@/core/logging";
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

import { fetchStoreDayHistory, type StoreDayHistoryInput } from "../../api/fetch-store-day-history";
import { fetchStoreSettings, type StoreSettingsRow } from "../../api/fetch-store-settings";
import { preparationKeys } from "../../queries/keys";

import { StoreDayHistoryScreen } from "./store-day-history-screen";

/**
 * The store-day history screen's observable contract (AC-08, plan decisions 2
 * and 8):
 *
 * - the composed read's reachable states: loading skeleton while settings gate
 *   the window, error state with retry that re-attempts the read, day-empty
 *   state, success — plus the workspace's stale-data policy (T11-R04):
 *   a failed refetch with retained data is a transient inline notice, never a
 *   full error state over the day's orders;
 * - the day-boundary contract: only orders terminal INSIDE the current store
 *   day appear (fixed fake-timer fixtures spanning both boundaries, through
 *   the REAL hook + model), grouped into Completed and Cancelled with one
 *   count per group (the outcome filter tabs), newest-terminal-first, under a
 *   date header derived from the window start rendered in the RESOLVED store
 *   timezone — a UTC-keyed header/day fails the pinned string;
 * - read-only entries: no action buttons, terminal-time and created-time in
 *   the store timezone — and the entry press still opens Order Details
 *   (AC-03: read-only hides ACTIONS, not the press);
 * - the back action, and the R1-05 rollover decision: event-driven rollover
 *   (NO refetchInterval) — a screen parked across the store-day boundary with
 *   zero re-renders keeps the day it loaded under (the accepted,
 *   self-correcting edge); the next mount recomputes the window and rolls the
 *   read to the new day's key and bound.
 *
 * Mocked at the feature's own `api/` boundary (plus `expo-router` for the
 * back/details wiring) — a screen test must not know Supabase exists. On the
 * real clock the fixtures are built relative to the `terminalSince` the hook
 * passed (the window start), so any zone, any day, any runner clock gives the
 * same verdict; the two absolute pins (the store-timezone day header and the
 * rollover) use jest fake timers with fixed instants instead.
 */

jest.mock("../../api/fetch-store-day-history", () => ({ fetchStoreDayHistory: jest.fn() }));
jest.mock("../../api/fetch-store-settings", () => ({ fetchStoreSettings: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
// FlashList commits its measured layout on a later frame, outside any act()
// scope, so React intermittently warns under jest. FlatList takes the same
// props this screen passes (data, renderItem, keyExtractor, numColumns,
// extraData) and renders the same items, without the native measurement pass.
jest.mock("@shopify/flash-list", () => ({
  FlashList: jest.requireActual("react-native").FlatList,
}));

const historyMock = fetchStoreDayHistory as jest.MockedFunction<typeof fetchStoreDayHistory>;
const settingsMock = fetchStoreSettings as jest.MockedFunction<typeof fetchStoreSettings>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;

const HOUR_MILLIS = 60 * 60 * 1000;

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

/** The same settings row keyed on UTC, for the fake-timer rollover test. */
const UTC_SETTINGS: StoreSettingsRow = { ...STORE_SETTINGS, store_timezone: "UTC" };

type HistoryRow = Awaited<ReturnType<typeof fetchStoreDayHistory>>[number];

/**
 * A terminal order row (the lean history read has NO item embed — that is the
 * read's own documented shape). Identity is the display number, so
 * filtered-out rows are visible by name in assertion failures.
 */
function makeTerminalOrder(
  status: "completed" | "cancelled",
  terminalAt: string,
  displayNumber: string,
  overrides: Partial<HistoryRow> = {},
): HistoryRow {
  return {
    id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    display_number: displayNumber,
    client_request_id: "0d4a9d2e-7f3b-4c5a-8e6f-1a2b3c4d5e6f",
    request_fingerprint: "8f2b1c0d4e6a",
    status,
    created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    assigned_preparation_id: null,
    completed_by: status === "completed" ? COLLEAGUE_ID : null,
    completed_at: status === "completed" ? terminalAt : null,
    cancelled_by: status === "cancelled" ? ACTOR_ID : null,
    cancelled_at: status === "cancelled" ? terminalAt : null,
    cancellation_reason: null,
    created_at: "2026-08-26T15:00:08.123456+00:00",
    updated_at: terminalAt,
    ...overrides,
  };
}

/**
 * One row spec for the clock-relative stub: terminal `offsetHours` after the
 * bound the hook passed — which IS the window start — so in-day specs stay
 * in-day on any runner clock, any day, even a 23-hour DST store day.
 */
type RelativeSpec = {
  status: "completed" | "cancelled";
  offsetHours: number;
  displayNumber: string;
  id: string;
  overrides?: Partial<HistoryRow>;
};

/**
 * The clock-relative read implementation: rows terminal `offsetHours` after
 * the bound the hook passed — which IS the window start — so in-day specs
 * stay in-day on any runner clock, any day, even a 23-hour DST store day.
 */
function relativeRows(specs: RelativeSpec[]) {
  return async (input: StoreDayHistoryInput): Promise<HistoryRow[]> => {
    const startUtc = Date.parse(input.terminalSince);
    return specs.map((spec) =>
      makeTerminalOrder(
        spec.status,
        new Date(startUtc + spec.offsetHours * HOUR_MILLIS).toISOString(),
        spec.displayNumber,
        { id: spec.id, ...spec.overrides },
      ),
    );
  };
}

/** The router's navigation calls, captured through the expo-router mock. */
const routerBack = jest.fn();
const routerPush = jest.fn();
const routerReplace = jest.fn();
const routerCanGoBack = jest.fn(() => true);

let mockSupabase: ReturnType<typeof installMockAuth> | undefined;

type RenderOptions = {
  orders?: HistoryRow[];
  settings?: StoreSettingsRow | null;
  /** Makes the settings read hang — the composed loading state. */
  settingsPending?: boolean;
  /** Lets a test fail the first read, or swap the rows between fetches. */
  fetchImpl?: (input: StoreDayHistoryInput) => Promise<HistoryRow[]>;
  /** Reuses a client across renders (the rollover test's remount). */
  queryClient?: QueryClient;
};

async function renderHistory({
  orders = [],
  settings = STORE_SETTINGS,
  settingsPending = false,
  fetchImpl,
  queryClient,
}: RenderOptions = {}) {
  historyMock.mockImplementation(fetchImpl ?? (async () => orders));
  if (settingsPending) {
    settingsMock.mockImplementation(() => new Promise<StoreSettingsRow | null>(() => {}));
  } else {
    settingsMock.mockResolvedValue(settings);
  }
  useRouterMock.mockReturnValue({
    back: routerBack,
    push: routerPush,
    replace: routerReplace,
    canGoBack: routerCanGoBack,
  } as unknown as ReturnType<typeof useRouter>);
  mockSupabase = installMockAuth({
    role: "preparation",
    profile: {
      id: ACTOR_ID,
      display_name: "Prep Employee",
      role: "preparation",
      is_active: true,
    },
  });

  const view = await renderWithProviders(<StoreDayHistoryScreen />, {
    withAuth: true,
    queryClient: queryClient ?? createTestQueryClient(),
  });
  return view;
}

beforeEach(() => {
  // The real AuthProvider (withAuth: true) logs auth state changes by design —
  // a silent sink keeps this suite at zero console output.
  setLogSink(() => {});
});

afterEach(() => {
  resetLogging();
  mockSupabase?.restore();
  mockSupabase = undefined;
  historyMock.mockReset();
  settingsMock.mockReset();
  useRouterMock.mockReset();
  routerBack.mockClear();
  routerPush.mockClear();
  routerReplace.mockClear();
  routerCanGoBack.mockReset();
  routerCanGoBack.mockReturnValue(true);
});

/**
 * Each outcome group is a filter tab carrying its label and its count as two
 * separate `Text` nodes. `within` the tab keeps the count scoped to it.
 */
function groupTab(label: "All" | "Completed" | "Cancelled") {
  return screen.getByRole("tab", { name: new RegExp(`^${label}\\b`) });
}

function expectGroupCount(label: "All" | "Completed" | "Cancelled", count: number) {
  expect(within(groupTab(label)).getByText(String(count))).toBeOnTheScreen();
}

/** The rendered order numbers, in on-screen order. */
function renderedOrderNumbers(pattern: RegExp) {
  return screen.getAllByText(pattern).map((element) => element.props.children);
}

describe("StoreDayHistoryScreen read states", () => {
  it("renders a loading skeleton while the settings read is in flight", async () => {
    await renderHistory({ settingsPending: true });

    // SkeletonList's own loading affordance — the composed first-fetch state.
    expect(screen.getByLabelText("Loading content")).toBeOnTheScreen();
    // No window without settings, so no read and no day content.
    expect(historyMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("renders an error state with retry when the read fails, and retry re-attempts it", async () => {
    // A transport-level throw (T04 O-1: not an AppError at the screen — the
    // screen must not assume error.kind).
    let failReads = true;
    await renderHistory({
      fetchImpl: () =>
        failReads
          ? Promise.reject(new Error("Network request failed"))
          : Promise.resolve([
              makeTerminalOrder("completed", new Date().toISOString(), "R3TRYM1", {
                id: "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1",
              }),
            ]),
    });

    expect(await screen.findByText("Something went wrong")).toBeOnTheScreen();
    expect(
      screen.getByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();

    failReads = false;
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));

    // Retry re-attempted the read and the day rendered.
    expect(await screen.findByText("R3TRYM1")).toBeOnTheScreen();
    expect(historyMock).toHaveBeenCalledTimes(2);
  });

  it("shows a transient inline notice when a refetch fails while the day still shows data", async () => {
    // The realtime-shaped trigger: an orders event invalidates the feature's
    // queries (the workspace beneath this screen on the stack stays
    // subscribed), and the refetch fails under the retained day data — the
    // exact window the workspace handles with a banner (T11-R04).
    let failReads = false;
    const oneRetainedRow = async (): Promise<HistoryRow[]> => [
      makeTerminalOrder("completed", new Date().toISOString(), "STAL3M1", {
        id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
      }),
    ];
    const view = await renderHistory({
      fetchImpl: () =>
        failReads ? Promise.reject(new Error("Network request failed")) : oneRetainedRow(),
    });

    expect(await screen.findByText("STAL3M1")).toBeOnTheScreen();

    failReads = true;
    const { queryClient } = view;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: preparationKeys.all });
    });

    expect(
      await screen.findByText("We couldn't reach the network. Check the connection and try again."),
    ).toBeOnTheScreen();
    // The stale day stays the rendered truth; the full error state stays
    // reserved for a history with NO data to show.
    expect(screen.getByText("STAL3M1")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();

    // Transient: the notice clears again on the next successful read.
    failReads = false;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: preparationKeys.all });
    });
    await waitFor(() =>
      expect(
        screen.queryByText("We couldn't reach the network. Check the connection and try again."),
      ).toBeNull(),
    );
  });

  it("renders the day's empty state when the store day has no terminal orders", async () => {
    await renderHistory({ orders: [] });

    expect(await screen.findByText("Nothing finished yet today")).toBeOnTheScreen();
    // The day-level empty state REPLACES the groups — no empty group tabs.
    expect(screen.queryByRole("tab")).toBeNull();
    // The empty state is still grounded in the day it describes: the date
    // header and the zero counts render above it (shape-pinned; the exact
    // date string is pinned by the fake-timer day-boundary test).
    expect(screen.getByText(/^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2}$/)).toBeOnTheScreen();
    expect(screen.getByText("0 completed · 0 cancelled")).toBeOnTheScreen();
  });

  it("keeps rendering the day when the settings row is absent (decision 8)", async () => {
    await renderHistory({
      settings: null,
      fetchImpl: relativeRows([
        {
          status: "completed",
          offsetHours: 2,
          displayNumber: "NOS3TT1",
          id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3",
        },
      ]),
    });

    // An absent settings read degrades to the device timezone silently — the
    // day itself must not fail on it.
    expect(await screen.findByText("NOS3TT1")).toBeOnTheScreen();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("StoreDayHistoryScreen groups (AC-08)", () => {
  it("shows only the current store day's terminal orders, grouped with counts, under the store-timezone date header", async () => {
    // 22:00Z on Aug 26: the Riyadh store day (UTC+3) is Aug 27 — the window
    // [2026-08-26T21:00Z, 2026-08-27T21:00Z). A UTC-keyed day/header fails.
    jest.useFakeTimers({ now: new Date("2026-08-26T22:00:00Z") });
    try {
      await renderHistory({
        // Terminal instants spanning BOTH day boundaries.
        orders: [
          // In-day completed: 22:30Z is 01:30 on Aug 27 in Riyadh.
          makeTerminalOrder("completed", "2026-08-26T22:30:00.000000+00:00", "B3K9Z1", {
            id: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4",
            assigned_preparation_id: ACTOR_ID,
            // 15:00Z renders as 18:00 in Riyadh (UTC+3) — the created-time
            // caption, pinned below.
            created_at: "2026-08-26T15:00:08.123456+00:00",
          }),
          // In-day cancelled: 23:45Z is 02:45 on Aug 27 in Riyadh.
          makeTerminalOrder("cancelled", "2026-08-26T23:45:00.000000+00:00", "C7F2M8", {
            id: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5",
            assigned_preparation_id: COLLEAGUE_ID,
            // 14:07Z renders as 17:07 in Riyadh — the second card's created-time
            // caption, distinct so each is assertable once.
            created_at: "2026-08-26T14:07:41.123456+00:00",
          }),
          // OUT: 20:45Z is still Aug 26 in UTC but 23:45 Aug 26 in Riyadh —
          // the PREVIOUS store day. A UTC-keyed day filter would keep it.
          makeTerminalOrder("completed", "2026-08-26T20:45:00.000000+00:00", "A1E5Y7", {
            id: "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6",
          }),
          // OUT: 21:30Z next day is beyond the window end — the NEXT store day.
          makeTerminalOrder("completed", "2026-08-27T21:30:00.000000+00:00", "D9J4X6", {
            id: "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7",
          }),
        ],
      });

      // The date header: the window start rendered in the STORE timezone —
      // Riyadh's Aug 27, not UTC's Aug 26.
      expect(await screen.findByText("Thursday, August 27")).toBeOnTheScreen();

      // One count per group; exactly the two in-day rows survive the model's
      // client-side day filter.
      expect(screen.getByText("1 completed · 1 cancelled")).toBeOnTheScreen();
      expectGroupCount("All", 2);
      expectGroupCount("Completed", 1);
      expectGroupCount("Cancelled", 1);
      expect(screen.getByText("B3K9Z1")).toBeOnTheScreen();
      expect(screen.getByText("C7F2M8")).toBeOnTheScreen();
      expect(screen.queryByText("A1E5Y7")).toBeNull();
      expect(screen.queryByText("D9J4X6")).toBeNull();

      // Read-only: no action buttons anywhere (the card press is the only
      // card-level affordance, plus the screen's own back button).
      expect(screen.queryByRole("button", { name: "Start preparing" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Mark ready" })).toBeNull();
      expect(screen.queryByRole("button", { name: /^Cancel/ })).toBeNull();

      // The terminal instants in the store timezone (22:30Z → 01:30 Riyadh;
      // 23:45Z → 02:45 Riyadh), carried by each entry's accessible name…
      expect(
        screen.getByRole("button", { name: "Order B3K9Z1, Completed at 01:30" }),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole("button", { name: "Order C7F2M8, Cancelled at 02:45" }),
      ).toBeOnTheScreen();
      expect(screen.getByText("01:30")).toBeOnTheScreen();
      expect(screen.getByText("02:45")).toBeOnTheScreen();
      // …and the created time, per entry, in the same zone (15:00Z → 18:00
      // Riyadh; 14:07Z → 17:07 Riyadh).
      expect(screen.getByText("Completed · placed 18:00")).toBeOnTheScreen();
      expect(screen.getByText("Cancelled · placed 17:07")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("renders a group's orders newest-terminal-first regardless of fetch order", async () => {
    await renderHistory({
      fetchImpl: relativeRows([
        // The read returns the OLDER terminal order first…
        {
          status: "completed",
          offsetHours: 1,
          displayNumber: "OLDCMP1",
          id: "1a2b3c4d-0001-4000-8000-000000000001",
        },
        {
          status: "completed",
          offsetHours: 2,
          displayNumber: "NEWCMP2",
          id: "1a2b3c4d-0002-4000-8000-000000000002",
        },
      ]),
    });

    // …and the day re-sorts by terminal instant.
    await screen.findByText("NEWCMP2");
    expectGroupCount("Completed", 2);
    expect(renderedOrderNumbers(/^(OLDCMP1|NEWCMP2)$/)).toEqual(["NEWCMP2", "OLDCMP1"]);
  });

  it("shows a cancellation's reason with the cancelled entry", async () => {
    await renderHistory({
      fetchImpl: relativeRows([
        {
          status: "cancelled",
          offsetHours: 2,
          displayNumber: "RSN0N1",
          id: "1a2b3c4d-0007-4000-8000-000000000007",
          overrides: { cancellation_reason: "Out of stock" },
        },
      ]),
    });

    expect(await screen.findByText("RSN0N1")).toBeOnTheScreen();
    expect(screen.getByText(/^Cancelled · Out of stock · placed \d{2}:\d{2}$/)).toBeOnTheScreen();
  });

  it("filters the day by outcome, newest first within the chosen group", async () => {
    await renderHistory({
      fetchImpl: relativeRows([
        {
          status: "completed",
          offsetHours: 1,
          displayNumber: "CMPOLD1",
          id: "1a2b3c4d-0008-4000-8000-000000000008",
        },
        {
          status: "cancelled",
          offsetHours: 2,
          displayNumber: "CNCMID1",
          id: "1a2b3c4d-0009-4000-8000-000000000009",
        },
        {
          status: "completed",
          offsetHours: 3,
          displayNumber: "CMPNEW1",
          id: "1a2b3c4d-0010-4000-8000-000000000010",
        },
      ]),
    });
    const user = userEvent.setup();
    const ALL = /^(CMPOLD1|CNCMID1|CMPNEW1)$/;

    // "All" is the default: every terminal order of the day, newest first.
    await screen.findByText("CMPNEW1");
    expect(groupTab("All")).toBeSelected();
    expect(renderedOrderNumbers(ALL)).toEqual(["CMPNEW1", "CNCMID1", "CMPOLD1"]);

    await user.press(groupTab("Completed"));
    expect(groupTab("Completed")).toBeSelected();
    expect(groupTab("All")).not.toBeSelected();
    expect(renderedOrderNumbers(ALL)).toEqual(["CMPNEW1", "CMPOLD1"]);

    await user.press(groupTab("Cancelled"));
    expect(renderedOrderNumbers(ALL)).toEqual(["CNCMID1"]);
  });

  it("renders a per-section empty state for a group with no orders", async () => {
    await renderHistory({
      fetchImpl: relativeRows([
        {
          status: "completed",
          offsetHours: 2,
          displayNumber: "ONLY1C1",
          id: "1a2b3c4d-0003-4000-8000-000000000003",
        },
      ]),
    });

    // A group can be legitimately empty while its sibling is not — words, not
    // a blank panel.
    await screen.findByText("ONLY1C1");
    expectGroupCount("Completed", 1);
    expectGroupCount("Cancelled", 0);

    await userEvent.setup().press(groupTab("Cancelled"));

    expect(screen.getByText("No cancelled orders today.")).toBeOnTheScreen();
    expect(screen.queryByText("ONLY1C1")).toBeNull();
  });
});

describe("StoreDayHistoryScreen navigation", () => {
  it("opens order details with the order's id when a card is pressed", async () => {
    const orderId = "1a2b3c4d-0004-4000-8000-000000000004";
    await renderHistory({
      fetchImpl: relativeRows([
        {
          status: "completed",
          offsetHours: 2,
          displayNumber: "PR3SSM1",
          id: orderId,
        },
      ]),
    });

    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: /^Order PR3SSM1, Completed at / }));

    // Plan decision 1: the static details route with orderId as a query param.
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/order-details",
      params: { orderId },
    });
  });

  it("navigates back when the back button is pressed", async () => {
    await renderHistory({
      fetchImpl: relativeRows([
        {
          status: "completed",
          offsetHours: 2,
          displayNumber: "BACK1M1",
          id: "1a2b3c4d-0005-4000-8000-000000000005",
        },
      ]),
    });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Back to the board" }));

    expect(routerBack).toHaveBeenCalledTimes(1);
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("returns to the board when there is no screen to go back to", async () => {
    routerCanGoBack.mockReturnValue(false);
    await renderHistory({ orders: [] });

    await userEvent.setup().press(await screen.findByRole("button", { name: "Back to the board" }));

    expect(routerBack).not.toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/(preparation)");
  });
});

describe("StoreDayHistoryScreen store-day rollover (R1-05)", () => {
  it("keeps the previous day until a re-render, then serves the new store day on the next mount", async () => {
    // The R1-05 decision: event-driven rollover, NO refetchInterval. The day
    // key rolls on the next render (the window is recomputed from `new Date()`
    // at render time), so a screen parked across store midnight with ZERO
    // re-renders keeps the day it loaded under — an accepted, self-correcting
    // edge — while any mount/navigation/invalidation re-render rolls it.
    jest.useFakeTimers({ now: new Date("2026-08-26T23:50:00Z") });
    const oneRowAfterTheBound = async (input: StoreDayHistoryInput): Promise<HistoryRow[]> => [
      makeTerminalOrder(
        "completed",
        new Date(Date.parse(input.terminalSince) + HOUR_MILLIS).toISOString(),
        "ROLL1V1",
        { id: "1a2b3c4d-0006-4000-8000-000000000006" },
      ),
    ];
    try {
      const first = await renderHistory({
        settings: UTC_SETTINGS,
        fetchImpl: oneRowAfterTheBound,
      });

      // Loaded under the Aug 26 UTC store day.
      expect(await screen.findByText("Wednesday, August 26")).toBeOnTheScreen();
      expect(historyMock).toHaveBeenCalledTimes(1);
      expect(Date.parse(historyMock.mock.calls[0]?.[0]?.terminalSince ?? "")).toBe(
        Date.parse("2026-08-26T00:00:00.000Z"),
      );

      // Store midnight passes with zero re-renders: no timer exists to roll
      // the day — the parked screen keeps the day it already loaded.
      // Advancing the clock fires every scheduled timer — a reintroduced
      // refetchInterval would fire here and re-call the read; the R1-05
      // "NO timed poll" claim is falsifiable, not just asserted (T14-R01).
      // Wrapped in act: the advance also fires the mock auth's pending
      // INITIAL_SESSION update, which must not update the provider outside
      // act (R3-01).
      await act(async () => {
        jest.setSystemTime(new Date("2026-08-27T00:10:00Z"));
        jest.advanceTimersByTime(2 * HOUR_MILLIS);
      });
      expect(historyMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Wednesday, August 26")).toBeOnTheScreen();

      // The next mount (the event that any navigation or re-render is)
      // recomputes the window: the day key rolls and the read re-runs under
      // the NEW day's bound.
      await first.unmount();
      await renderHistory({
        settings: UTC_SETTINGS,
        fetchImpl: oneRowAfterTheBound,
        queryClient: first.queryClient,
      });

      expect(await screen.findByText("Thursday, August 27")).toBeOnTheScreen();
      expect(historyMock).toHaveBeenCalledTimes(2);
      expect(Date.parse(historyMock.mock.calls[1]?.[0]?.terminalSince ?? "")).toBe(
        Date.parse("2026-08-27T00:00:00.000Z"),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
