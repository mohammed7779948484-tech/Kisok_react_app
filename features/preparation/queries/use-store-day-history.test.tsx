import { Text } from "react-native";

import { AppError } from "@/core/errors";
import { renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { fetchStoreDayHistory, type StoreDayHistoryInput } from "../api/fetch-store-day-history";
import { fetchStoreSettings } from "../api/fetch-store-settings";

import { preparationKeys } from "./keys";
import { useStoreDayHistory } from "./use-store-day-history";

/**
 * Hook-level contract test (Probe + renderWithProviders, the api modules
 * mocked at the feature's own boundary — a hook test must not know Supabase
 * exists). The api modules' own wire contracts are covered in their own test
 * files; what this file pins is the COMPOSITION: settings → window → read →
 * client-side day filter, the states around it, and the retry route.
 *
 * Nothing here depends on the runner's clock or timezone. The mock read
 * builds its rows RELATIVE to the `terminalSince` the hook passed — which IS
 * the window start, the prefilter bound — and the assertions are relative to
 * the window the hook resolved, so any zone, any day, any clock gives the
 * same verdict. In-day rows sit at +2h/+3h (inside even a 23-hour DST day);
 * the out-of-day rows sit at −1h (before the window) and +26h (beyond even a
 * 25-hour DST day). The one store-timezone effect pinned absolutely is
 * Asia/Aden being fixed UTC+3 (every store day starts at 21:00Z, exactly 24h
 * long), which cannot pass if the store timezone is ignored in favour of UTC.
 */

jest.mock("../api/fetch-store-settings", () => ({
  fetchStoreSettings: jest.fn(),
}));
jest.mock("../api/fetch-store-day-history", () => ({
  fetchStoreDayHistory: jest.fn(),
}));

const HOUR_MILLIS = 60 * 60 * 1000;

/** The hook's result, captured per render for the detailed assertions below. */
let latest: ReturnType<typeof useStoreDayHistory> | undefined;

/** Renders the hook's state exactly as a screen ladder consumes it, plus retry. */
function HistoryProbe() {
  const history = useStoreDayHistory();
  latest = history;
  return (
    <>
      <Text>
        {history.isPending
          ? "loading"
          : history.isError
            ? "error"
            : `orders:${history.data?.orders.length ?? 0}`}
      </Text>
      {/* The retry affordance a screen's error state carries — wired to the
          hook's refetch, the exact call a manual refresh makes. */}
      <Text accessibilityRole="button" onPress={() => void history.refetch()}>
        retry
      </Text>
    </>
  );
}

type SettingsResult = Awaited<ReturnType<typeof fetchStoreSettings>>;
type HistoryRow = Awaited<ReturnType<typeof fetchStoreDayHistory>>[number];

/** The singleton settings row, pointed at a fixed UTC+03 zone (no DST). */
const storeSettings = {
  id: true,
  store_name: "Kisok Roasters",
  logo_media_asset_id: null,
  global_low_stock_threshold: 5,
  customer_success_reset_seconds: 25,
  // An IANA name; the migration's btrim check only enforces non-blank text.
  store_timezone: "Asia/Aden",
  created_at: "2026-08-26T05:00:00.000000+00:00",
  updated_at: "2026-08-26T05:00:00.000000+00:00",
};

/**
 * A terminal order whose identity is its display number, so filtered-out rows
 * are visible by name in the assertion failures. created_at sits days before
 * the terminal instant on purpose — the weekend-stale order that the
 * terminal-timestamp prefilter (not a created_at bound) must still fetch
 * (T06-R01).
 */
function makeTerminalOrder(
  status: "completed" | "cancelled",
  terminalAt: string,
  displayNumber: string,
): HistoryRow {
  return {
    id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
    display_number: displayNumber,
    client_request_id: "0d4a9d2e-7f3b-4c5a-8e6f-1a2b3c4d5e6f",
    request_fingerprint: "8f2b1c0d4e6a",
    status,
    created_by: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    assigned_preparation_id: null,
    completed_by: status === "completed" ? "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b" : null,
    completed_at: status === "completed" ? terminalAt : null,
    cancelled_by: status === "cancelled" ? "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b" : null,
    cancelled_at: status === "cancelled" ? terminalAt : null,
    cancellation_reason: null,
    created_at: "2026-08-22T05:30:00.000000+00:00",
    updated_at: "2026-08-26T12:34:56.000000+00:00",
  };
}

/**
 * Stub the read so its rows sit at FIXED offsets from the bound the hook
 * passed: `terminalSince` is the window's start itself (the prefilter bound —
 * terminal instants at or after it; the day window [start, end) then decides
 * the end).
 *
 * - INCOMPL1 / INCANCL: terminal instants inside the day — must survive.
 * - OUTCOMPL: terminal the hour BEFORE the window started — must be excluded
 *   by the client-side day filter.
 * - NEXTDAY4: terminal 26h in — beyond even a 25-hour fall-back day — must be
 *   excluded.
 */
function stubHistoryRowsRelativeToBound() {
  const historyMock = fetchStoreDayHistory as jest.MockedFunction<typeof fetchStoreDayHistory>;
  historyMock.mockImplementation(async (input: StoreDayHistoryInput) => {
    const startUtc = Date.parse(input.terminalSince);
    return [
      makeTerminalOrder(
        "completed",
        new Date(startUtc + 2 * HOUR_MILLIS).toISOString(),
        "INCOMPL1",
      ),
      makeTerminalOrder(
        "cancelled",
        new Date(startUtc + 3 * HOUR_MILLIS).toISOString(),
        "INCANCL2",
      ),
      makeTerminalOrder("completed", new Date(startUtc - HOUR_MILLIS).toISOString(), "OUTCOMPL3"),
      makeTerminalOrder(
        "completed",
        new Date(startUtc + 26 * HOUR_MILLIS).toISOString(),
        "NEXTDAY4",
      ),
    ];
  });
}

describe("useStoreDayHistory", () => {
  const settingsMock = fetchStoreSettings as jest.MockedFunction<typeof fetchStoreSettings>;
  const historyMock = fetchStoreDayHistory as jest.MockedFunction<typeof fetchStoreDayHistory>;

  beforeEach(() => {
    latest = undefined;
  });

  afterEach(() => {
    settingsMock.mockReset();
    historyMock.mockReset();
  });

  it("fetches bounded by the window start and keeps only in-day terminal orders", async () => {
    settingsMock.mockResolvedValue(storeSettings);
    stubHistoryRowsRelativeToBound();

    const { queryClient } = await renderWithProviders(<HistoryProbe />);

    await waitFor(() => expect(screen.getByText("orders:2")).toBeOnTheScreen());

    // Exactly the two in-day rows survive — the pre-window order and the
    // beyond-the-day order are excluded by the client-side filter.
    const data = latest?.data;
    expect(data).toBeDefined();
    if (data === undefined) throw new Error("the hook never resolved history data");
    expect(data.orders.map((order) => order.display_number)).toEqual(["INCOMPL1", "INCANCL2"]);

    // The read ran once, and the prefilter bound IS the window start — the
    // terminal timestamps themselves (decision 2), not a created_at lookback.
    expect(historyMock).toHaveBeenCalledTimes(1);
    const terminalSince = historyMock.mock.calls[0]?.[0]?.terminalSince;
    expect(typeof terminalSince).toBe("string");
    if (terminalSince === undefined) throw new Error("the history read was never called");
    expect(Date.parse(terminalSince)).toBe(data.window.startUtc.getTime());

    // The STORE timezone drove the window: Asia/Aden is fixed UTC+03, so the
    // store day starts at 21:00Z and spans exactly 24h (the DST-length cases
    // are pinned in the model tests) — a UTC-defaulted window (00:00Z) fails
    // here.
    expect(data.window.startUtc.getUTCHours()).toBe(21);
    expect(data.window.startUtc.getUTCMinutes()).toBe(0);
    expect(data.window.endUtc.getTime() - data.window.startUtc.getTime()).toBe(24 * HOUR_MILLIS);

    // The day rides the queryKey as the window's startUtc ISO string — a
    // screen left open across the store-day boundary refetches for the new
    // day instead of showing the old one.
    expect(
      queryClient.getQueryData([
        ...preparationKeys.all,
        "store-day-history",
        data.window.startUtc.toISOString(),
      ]),
    ).toEqual(data);
  });

  it("still works when the settings row is absent — the device-timezone fallback (decision 8)", async () => {
    settingsMock.mockResolvedValue(null);
    stubHistoryRowsRelativeToBound();

    await renderWithProviders(<HistoryProbe />);

    // Null settings is a RESOLVED state, not a loading or error state: the
    // window resolves in the fallback zone and the read runs all the same.
    await waitFor(() => expect(screen.getByText("orders:2")).toBeOnTheScreen());
    expect(historyMock).toHaveBeenCalledTimes(1);
    expect(latest?.isError).toBe(false);
  });

  it("is loading while the settings query is loading, and reads nothing yet", async () => {
    settingsMock.mockImplementation(() => new Promise<SettingsResult>(() => {}));

    await renderWithProviders(<HistoryProbe />);

    // No window without settings — so no fetch, and the composed state the
    // screen shows a skeleton for.
    await waitFor(() => expect(screen.getByText("loading")).toBeOnTheScreen());
    expect(historyMock).not.toHaveBeenCalled();
  });

  it("surfaces the settings query's error (no cached history) and never reads until retried", async () => {
    settingsMock.mockRejectedValue(
      new AppError({
        kind: "forbidden",
        userMessage: "You don't have access to do that.",
        code: "42501",
      }),
    );

    await renderWithProviders(<HistoryProbe />);

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
    expect(historyMock).not.toHaveBeenCalled();
    expect(latest?.error).toBeInstanceOf(AppError);
    expect(latest?.error).toMatchObject({ kind: "forbidden", code: "42501" });
  });

  it("retrying in the settings-error state retries the SETTINGS query, not the placeholder-keyed read", async () => {
    // First load fails on settings; a retry must re-run the failing settings
    // read and then fetch history under the freshly-resolved window — the
    // spread-through refetch would instead force the DISABLED history query
    // to run under its placeholder key (T06-R05).
    const forbidden = new AppError({
      kind: "forbidden",
      userMessage: "You don't have access to do that.",
      code: "42501",
    });
    settingsMock.mockRejectedValueOnce(forbidden).mockResolvedValue(storeSettings);
    stubHistoryRowsRelativeToBound();

    const user = userEvent.setup();
    await renderWithProviders(<HistoryProbe />);

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
    expect(historyMock).not.toHaveBeenCalled();

    await user.press(screen.getByText("retry"));

    // The settings read was retried — and the history read ran only AFTER the
    // fresh settings resolved a window (never under the placeholder key).
    await waitFor(() => expect(screen.getByText("orders:2")).toBeOnTheScreen());
    expect(settingsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(historyMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const call of historyMock.mock.calls) {
      expect(typeof call[0]?.terminalSince).toBe("string");
    }
  });

  it("a settings refetch failure with history data cached surfaces the DATA, not the error (T06-R04)", async () => {
    // Load succeeds, then a later settings refetch fails: the day's orders
    // stay on screen — the failed refetch is transient noise under good
    // cached data, not a reason to drop to the error state.
    settingsMock.mockResolvedValueOnce(storeSettings);
    stubHistoryRowsRelativeToBound();

    const user = userEvent.setup();
    await renderWithProviders(<HistoryProbe />);

    await waitFor(() => expect(screen.getByText("orders:2")).toBeOnTheScreen());

    settingsMock.mockRejectedValue(
      new AppError({
        kind: "forbidden",
        userMessage: "You don't have access to do that.",
        code: "42501",
      }),
    );

    await user.press(screen.getByText("retry"));

    // The settings refetch failed — the retry route still ends in the history
    // refetch, whose cached-window read succeeds.
    await waitFor(() => expect(screen.getByText("orders:2")).toBeOnTheScreen());
    expect(settingsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(latest?.isError).toBe(false);
    expect(latest?.error).toBeNull();
    expect(latest?.data?.orders.map((order) => order.display_number)).toEqual([
      "INCOMPL1",
      "INCANCL2",
    ]);
  });

  it("surfaces the history read's OWN failure with the error identity preserved (T06-R06)", async () => {
    settingsMock.mockResolvedValue(storeSettings);
    const readFailure = new AppError({
      kind: "unavailable",
      userMessage: "This isn't available right now.",
      code: "K1002",
    });
    historyMock.mockRejectedValue(readFailure);

    await renderWithProviders(<HistoryProbe />);

    await waitFor(() => expect(screen.getByText("error")).toBeOnTheScreen());
    // The error came from the read, not the settings: settings succeeded, and
    // the surfaced error IS the AppError the api threw — identity preserved.
    expect(settingsMock).toHaveBeenCalledTimes(1);
    expect(latest?.error).toBe(readFailure);
    expect(latest?.data).toBeUndefined();
  });
});
