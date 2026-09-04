import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearSignOutTasks } from "@/core/auth";
import { resetLogging, setLogSink, type LogRecord } from "@/core/logging";
import {
  act,
  installMockAuth,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/core/testing";

import { useDevicePolicyStore } from "../state/device-policy-store";
import { KioskMaintenanceOverlay } from "./kiosk-maintenance-overlay";

/**
 * lucide-react-native ships an ESM build the repo's jest config does not
 * transform, and the overlay renders the entry's (decorative) wrench icon.
 * The accessible contract is what these tests assert, not SVG rendering —
 * same stub the entry's own test uses.
 */
jest.mock("lucide-react-native", () => ({
  Wrench: () => null,
}));

/**
 * The root overlay (AC-05) — the one place the maintenance UI reads the
 * feature's own store. The policy and the session are driven exactly the way
 * production drives them: valid snapshots applied through `applySnapshot`
 * (the T03 fixtures, reused — no store internals poked), unlocks attempted
 * through the real `tryUnlock`, expiry observed through the overlay's own
 * timer.
 *
 * The panel's account switch runs the REAL shared pipeline (installMockAuth +
 * withAuth), and the negative space is asserted everywhere: neither the
 * managed code nor the typed code ever reaches a log record (captured sink)
 * or a persisted value (the AsyncStorage mock's recorded writes).
 */

const ENTRY_NAME = "Maintenance";
const TITLE = "Maintenance";
const CODE_LABEL = "Maintenance code";
const RETRY_MESSAGE = "That code didn't work.";
const UNLOCK = "Unlock";
const SWITCH_ACCOUNT = "Switch customer account";
const CLOSE = "Close";

const KIOSK_CODE = "4481";
const WRONG_CODE = "not-the-code-7741";
const TIMEOUT_SECONDS = 120;
const SETTLING_NOTE = "Managed settings are updating… Try again in a moment.";

/** Same fixture shape the store tests use (T03) — applied, never injected. */
function kioskSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: TIMEOUT_SECONDS,
    },
    lockTaskPermitted: false,
    lockTaskModeState: "none",
  };
}

function standardSnapshot() {
  return {
    restrictions: { kiosk_device_role: "standard" },
    lockTaskPermitted: false,
    lockTaskModeState: "none",
  };
}

/** Provisional bundle + live LOCKED corroboration — kiosk role (RD-02),
 *  unsettled restrictions: the derivation still carries the code (the policy
 *  self-describes) but it is not yet credential material (RD5-04 / R5-11). */
function provisionalLockedSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: TIMEOUT_SECONDS,
      restrictions_pending: true,
    },
    lockTaskPermitted: true,
    lockTaskModeState: "locked",
  };
}

/** The SAME bundle after settling: identical minus the pending marker. */
function settledKioskSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: TIMEOUT_SECONDS,
    },
    lockTaskPermitted: true,
    lockTaskModeState: "locked",
  };
}

let auth: ReturnType<typeof installMockAuth> | null = null;
let logRecords: LogRecord[] = [];

const multiSetMock = AsyncStorage.multiSet as unknown as jest.Mock;

/** Every value written to durable storage, including ones later removed. */
function persistedPayloads(): string[] {
  return multiSetMock.mock.calls.flatMap((call) =>
    (call[0] as [string, string][]).map(([, value]) => value),
  );
}

async function renderOverlay() {
  return renderWithProviders(<KioskMaintenanceOverlay />, { withAuth: true });
}

/** Open the sheet the way staff do: a deliberate long press on the entry. */
async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.longPress(screen.getByRole("button", { name: ENTRY_NAME }));
  expect(screen.getByText(TITLE)).toBeOnTheScreen();
}

/** Unlock through the real store: type the code, submit. */
async function unlock(user: ReturnType<typeof userEvent.setup>) {
  await openSheet(user);
  await user.type(screen.getByLabelText(CODE_LABEL), KIOSK_CODE);
  await user.press(screen.getByRole("button", { name: UNLOCK }));
  expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);
}

beforeEach(async () => {
  logRecords = [];
  setLogSink((record) => logRecords.push(record));
  await AsyncStorage.clear();
  multiSetMock.mockClear();
  clearSignOutTasks();
  useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
  auth = installMockAuth();
});

afterEach(async () => {
  auth?.restore();
  auth = null;
  clearSignOutTasks();
  resetLogging();
  await AsyncStorage.clear();
  useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
  jest.useRealTimers();
});

describe("KioskMaintenanceOverlay — entry visibility", () => {
  it("renders nothing on a standard device", async () => {
    await renderOverlay();

    expect(screen.queryByRole("button", { name: ENTRY_NAME })).toBeNull();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("renders the corner entry on a customer-kiosk device and removes it when the policy reverts", async () => {
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();

    expect(screen.getByRole("button", { name: ENTRY_NAME })).toBeOnTheScreen();

    // A role change is a snapshot application — the overlay must follow it.
    await act(async () => {
      useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
    });

    expect(screen.queryByRole("button", { name: ENTRY_NAME })).toBeNull();
  });

  it("opens the unlock sheet on a deliberate long press of the entry", async () => {
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();
    const user = userEvent.setup();

    await openSheet(user);

    expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: UNLOCK })).toBeOnTheScreen();
  });
});

describe("KioskMaintenanceOverlay — unlock flow", () => {
  it("a wrong code leaves the session locked and the sheet open, and leaks nothing", async () => {
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();
    const user = userEvent.setup();
    await openSheet(user);

    await user.type(screen.getByLabelText(CODE_LABEL), WRONG_CODE);
    await user.press(screen.getByRole("button", { name: UNLOCK }));

    // The UI's use of tryUnlock (T03 owns the semantics): the retry state is
    // visible, and nothing else changed — session still locked, sheet open.
    expect(screen.getByText(RETRY_MESSAGE)).toBeOnTheScreen();
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(false);
    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();

    // Negative space (AC-05): zero feature logs; neither the typed code nor
    // the managed code ever reaches a log record or a persisted value.
    expect(logRecords.filter((record) => record.scope.startsWith("kiosk-runtime"))).toEqual([]);
    expect(JSON.stringify(logRecords)).not.toContain(WRONG_CODE);
    expect(JSON.stringify(logRecords)).not.toContain(KIOSK_CODE);
    expect(JSON.stringify(persistedPayloads())).not.toContain(WRONG_CODE);
    expect(JSON.stringify(persistedPayloads())).not.toContain(KIOSK_CODE);
  });

  it("the right code unlocks the session and shows the panel", async () => {
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();
    const user = userEvent.setup();

    await unlock(user);

    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();
    // The managed code never renders anywhere.
    expect(screen.queryByText(KIOSK_CODE)).toBeNull();
  });
});

describe("KioskMaintenanceOverlay — settled-ness gating (R5-11)", () => {
  it("opens the sheet on a provisional+LOCKED kiosk but shows the settling state — the bundle's code is not yet the MDM-managed credential", async () => {
    useDevicePolicyStore.getState().applySnapshot(provisionalLockedSnapshot());
    await renderOverlay();
    const user = userEvent.setup();

    // Routing is unchanged: the entry is long-pressable (live LOCKED
    // corroborates the kiosk role), and the sheet OPENING is fine — only the
    // unlock is gated while the restrictions are unsettled.
    await openSheet(user);

    expect(screen.getByText(SETTLING_NOTE)).toBeOnTheScreen();
    expect(screen.getByLabelText(CODE_LABEL)).toBeDisabled();
    expect(screen.getByRole("button", { name: UNLOCK })).toBeDisabled();
    expect(screen.getByRole("button", { name: CLOSE })).toBeEnabled();

    // Nothing leaked either way (AC-05 discipline): the note names no code.
    expect(screen.queryByText(KIOSK_CODE)).toBeNull();
  });

  it("a settled re-read of the same bundle re-enables the unlock, and the code then works", async () => {
    useDevicePolicyStore.getState().applySnapshot(provisionalLockedSnapshot());
    await renderOverlay();
    const user = userEvent.setup();
    await openSheet(user);
    expect(screen.getByRole("button", { name: UNLOCK })).toBeDisabled();

    await act(async () => {
      useDevicePolicyStore.getState().applySnapshot(settledKioskSnapshot());
    });

    expect(screen.queryByText(SETTLING_NOTE)).toBeNull();
    expect(screen.getByRole("button", { name: UNLOCK })).toBeEnabled();

    await user.type(screen.getByLabelText(CODE_LABEL), KIOSK_CODE);
    await user.press(screen.getByRole("button", { name: UNLOCK }));

    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);
    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();
  });
});

describe("KioskMaintenanceOverlay — sheet lifecycle across role transitions (R5-10)", () => {
  it("a kiosk→standard→kiosk transition within one mounted overlay leaves the sheet CLOSED on return", async () => {
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();
    const user = userEvent.setup();

    // Open the sheet AND unlock, so both halves of the maintenance UI hold
    // live state the transition must not preserve.
    await unlock(user);
    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();

    // kiosk → standard (a snapshot application). React PRESERVES component
    // state while the overlay stays mounted — returning null does not
    // unmount it — so `sheetOpen` would survive the transition (R5-10).
    await act(async () => {
      useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
    });
    expect(screen.queryByRole("button", { name: ENTRY_NAME })).toBeNull();
    // The snapshot application already cleared the session (existing
    // behavior — assert it holds).
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(false);

    // standard → kiosk (another snapshot application): the entry is back…
    await act(async () => {
      useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    });
    expect(screen.getByRole("button", { name: ENTRY_NAME })).toBeOnTheScreen();

    // …but the sheet is NOT open, and the session is still locked.
    expect(screen.queryByText(TITLE)).toBeNull();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(false);
  });
});

describe("KioskMaintenanceOverlay — unlock expiry", () => {
  it("clears the session at expiry and returns an open sheet to its locked state", async () => {
    jest.useFakeTimers();
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();
    const user = userEvent.setup();

    await unlock(user);
    const expiresAt = useDevicePolicyStore.getState().maintenance.expiresAt;
    expect(expiresAt).not.toBeNull();

    // One ms before the window elapses: still unlocked, panel still showing.
    await act(async () => {
      jest.advanceTimersByTime(expiresAt! - Date.now() - 1);
    });
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);
    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();

    // At the expiry instant the overlay's timer clears the session; an open
    // sheet falls back to its locked state.
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(false);
    expect(useDevicePolicyStore.getState().maintenance.expiresAt).toBeNull();
    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: SWITCH_ACCOUNT })).toBeNull();
  });

  it("does not fire the expiry timer after unmount", async () => {
    jest.useFakeTimers();
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    const view = await renderOverlay();
    const user = userEvent.setup();

    await unlock(user);
    // RNTL v14's unmount is async (it unmounts inside act) — awaiting it is
    // what guarantees the overlay's timer cleanup has actually run.
    await view.unmount();

    // The timer was cleaned up on unmount: advancing well past the window
    // leaves the store's session object exactly as the unlock left it.
    await act(async () => {
      jest.advanceTimersByTime(TIMEOUT_SECONDS * 1000 + 5000);
    });
    const session = useDevicePolicyStore.getState().maintenance;
    expect(session.unlocked).toBe(true);
    expect(session.expiresAt).not.toBeNull();
  });
});

describe("KioskMaintenanceOverlay — account switch", () => {
  it("switching the account runs the shared sign-out, clears the session, and closes the sheet", async () => {
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    await renderOverlay();
    const user = userEvent.setup();

    await unlock(user);
    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    // The shared pipeline's own contract (AC-06): local scope, real path.
    await waitFor(() => expect(auth?.signOutCalls).toEqual([{ scope: "local" }]));
    // The account switch ends the maintenance session (AC-05)…
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(false);
    // …and closes the sheet, so no panel lingers over the sign-in screen.
    await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());

    // And nothing the pipeline persisted ever carried the codes.
    expect(JSON.stringify(logRecords)).not.toContain(KIOSK_CODE);
    expect(JSON.stringify(persistedPayloads())).not.toContain(KIOSK_CODE);
  });
});
