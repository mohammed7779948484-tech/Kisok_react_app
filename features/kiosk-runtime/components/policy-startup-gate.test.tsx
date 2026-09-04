import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { act, installMockAuth, renderWithProviders, screen, userEvent } from "@/core/testing";

import { resolveRootTarget } from "../model/root-guard";
import {
  isPolicyModuleAbsenceExpected,
  readDevicePolicySnapshot,
  subscribeToRestrictionsChanges,
} from "../native/policy-source";
import { useDevicePolicySync } from "../native/use-device-policy-sync";
import { useDevicePolicyStore } from "../state/device-policy-store";
import { PolicyStartupGate } from "./policy-startup-gate";

/**
 * The startup gate (RD5-03 / R5-08) — the kiosk-runtime-owned error surface
 * for the UNRESOLVED policy window. R5-08's finding: a first-read failure
 * held a ready preparation session at an INDEFINITE silent spinner. The gate
 * renders ErrorState with a visible manual Retry while `readError` is set,
 * and composes features/auth's StartupScreen otherwise — ONE loading UI, and
 * StartupScreen stays policy-ignorant (the feature owns the surface).
 *
 * The rows run the ROOT composition, not the gate in isolation: the REAL sync
 * hook mounted once (as `app/_layout.tsx` mounts it) plus the gate (as
 * `app/index.tsx` renders it in the `startup` case). Pressing Retry presses
 * the REAL trigger, which re-dispatches the REAL read through the SAME
 * single-flight refresh seam — no mocks between the button and the store.
 *
 * Mock boundaries, mirroring the sync-hook suite:
 * - `../native/policy-source` is mocked (controllable reads + the
 *   module-absence platform answer, defaulting to EXPECTED absence —
 *   jest-expo runs this suite as iOS; android rows flip it to false).
 * - `AppState.addEventListener` is SPIED with a fake subscription (the real
 *   subscription-returning API, no native path).
 * - The store is REAL (the singleton, reset between tests); auth comes from
 *   `installMockAuth({ role: "preparation" })` — the one situation that can
 *   actually be held (ready + preparation + unresolved policy).
 *
 * There is no route-level test file for `app/index.tsx` in this repo (no
 * route test pattern exists — checked); these composition rows are the
 * gate+resolver evidence for the startup case, per the task's evidence row
 * 11. The startup-target assertions compose the store state the flow leaves
 * behind with the pure `resolveRootTarget` table — the same resolver
 * `useRootTarget` consumes.
 *
 * Failing reads log one payload-free error each, by design, so the suite
 * installs a silent sink (zero console output).
 */

/**
 * lucide-react-native ships an ESM build the repo's jest config does not
 * transform, and the gate's public-API import of `@/features/auth` pulls the
 * sign-in form (Eye icons) into the module graph. The accessible contract is
 * what these tests assert, not SVG rendering — same stub the overlay and
 * entry tests use for the same reason.
 */
jest.mock("lucide-react-native", () => ({
  Eye: () => null,
  EyeOff: () => null,
}));

jest.mock("../native/policy-source", () => ({
  readDevicePolicySnapshot: jest.fn(),
  subscribeToRestrictionsChanges: jest.fn(),
  isPolicyModuleAbsenceExpected: jest.fn(),
}));

const readMock = readDevicePolicySnapshot as unknown as jest.Mock;
const subscribeMock = subscribeToRestrictionsChanges as unknown as jest.Mock;
const moduleAbsenceExpectedMock = isPolicyModuleAbsenceExpected as unknown as jest.Mock;

const LOADING_LABEL = "Preparing the application…";
const RETRY = "Try again";
const GATE_TITLE = "We couldn't check this tablet";
const READ_FAILED_MESSAGE =
  "The tablet's kiosk settings couldn't be read. Tap Try again, or restart the tablet if it keeps failing.";
const MODULE_ABSENT_MESSAGE =
  "A component this tablet needs to read its kiosk settings is missing. Restart the tablet, and contact support if it keeps happening.";

const LOCKED_SESSION = { unlocked: false, expiresAt: null };

/** Snapshot shape the controlled reads resolve with (the store validates it). */
type ControlledSnapshot = {
  restrictions: Record<string, unknown>;
  lockTaskPermitted: boolean;
  lockTaskModeState: string;
};

function standardSnapshot(): ControlledSnapshot {
  return {
    restrictions: { kiosk_device_role: "standard" },
    lockTaskPermitted: false,
    lockTaskModeState: "none",
  };
}

/** A read the test controls: it stays pending until the test resolves it. */
function pendingRead() {
  let resolve!: (value: ControlledSnapshot) => void;
  const promise = new Promise<ControlledSnapshot>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let auth: ReturnType<typeof installMockAuth> | null = null;

/** The root composition under test: the hook mounted once + the gate. */
function KioskRoot() {
  useDevicePolicySync();
  return <PolicyStartupGate />;
}

async function renderRoot() {
  return renderWithProviders(<KioskRoot />, { withAuth: true });
}

/** Flush pending refresh microtasks inside act. */
async function flushRefresh() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * RNTL v14 role queries match only accessibility ELEMENTS (`accessible`
 * Views, Text, …). ErrorState's alert container is a plain View that carries
 * `accessibilityRole="alert"` without `accessible` — the design system's
 * contract, not something this feature may re-shape — so the a11y assertions
 * check the role on the rendered tree directly. The maintenance-sheet suite
 * uses the same `screen.root.queryAll` escape hatch for its scrim.
 */
function alertRoleElements() {
  const root = screen.root;
  return root === null ? [] : root.queryAll((node) => node.props.accessibilityRole === "alert");
}

/** The composed root target for the session this suite always runs in. */
function rootTarget() {
  const state = useDevicePolicyStore.getState();
  return resolveRootTarget("ready", "preparation", state.policy.role, state.readiness);
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(AppState, "addEventListener").mockImplementation((type: string) => {
    if (type !== "change") {
      throw new Error(`unexpected AppState event subscription: ${String(type)}`);
    }
    return { remove: jest.fn() };
  });

  readMock.mockReset();
  readMock.mockResolvedValue(null);
  moduleAbsenceExpectedMock.mockReset();
  moduleAbsenceExpectedMock.mockReturnValue(true);
  subscribeMock.mockImplementation(() => jest.fn());

  useDevicePolicyStore.setState({
    policy: {
      role: "standard",
      restrictionsSettled: true,
      maintenance: { code: null, timeoutSeconds: 90 },
    },
    maintenance: LOCKED_SESSION,
    readiness: "pending",
    readError: null,
  });

  await AsyncStorage.clear();
  setLogSink(() => {});
  auth = installMockAuth({ role: "preparation" });
});

afterEach(async () => {
  auth?.restore();
  auth = null;
  jest.restoreAllMocks();
  resetLogging();
  await AsyncStorage.clear();
});

describe("PolicyStartupGate — no read error (the startup hold's loading face)", () => {
  it("composes StartupScreen — ONE loading UI — with no alert anywhere (web/jest: expected module absence resolves, byte-identical)", async () => {
    await renderRoot();
    await flushRefresh();

    expect(screen.getByLabelText(LOADING_LABEL)).toBeOnTheScreen();
    expect(alertRoleElements()).toHaveLength(0);
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().readError).toBeNull();
    // AC-04: the web/jest rows never see an error surface.
    expect(rootTarget()).toBe("preparation");
  });
});

describe("PolicyStartupGate — first-read failure (R5-08, surfaced by RD5-03)", () => {
  it("renders the ErrorState with a visible manual retry — NOT the bare LoadingState — and never shows the native rejection reason", async () => {
    readMock.mockRejectedValue(new Error("native read failed"));

    await renderRoot();
    await flushRefresh();
    await flushRefresh();

    expect(alertRoleElements()).toHaveLength(1);
    expect(screen.getByText(GATE_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(READ_FAILED_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: RETRY })).toBeOnTheScreen();
    // The silent spinner is GONE — that was the finding.
    expect(screen.queryByLabelText(LOADING_LABEL)).toBeNull();
    // AC-05 discipline at the surface: the native rejection reason never
    // renders; the surfaced error is generic and staff-safe.
    expect(screen.queryByText(/native read failed/)).toBeNull();
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });
    // The hold is fail-closed by construction: error ≡ pending ⇒ startup.
    expect(rootTarget()).toBe("startup");
  });

  it("pressing Retry re-dispatches the read, clears the error at dispatch, and a successful re-read leaves startup — the retry CAN authorize, only evidence does", async () => {
    readMock.mockRejectedValueOnce(new Error("native read failed"));
    await renderRoot();
    await flushRefresh();
    expect(alertRoleElements()).toHaveLength(1);

    // The retry's re-read stays pending: the dispatch-time transition is
    // observable before any outcome lands.
    const retryRead = pendingRead();
    readMock.mockReturnValue(retryRead.promise);
    const user = userEvent.setup();

    await user.press(screen.getByRole("button", { name: RETRY }));
    await flushRefresh();

    // The trigger really re-dispatched the read, and the gate is back to its
    // loading face — readError cleared at dispatch, not at outcome.
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().readError).toBeNull();
    expect(screen.getByLabelText(LOADING_LABEL)).toBeOnTheScreen();
    expect(alertRoleElements()).toHaveLength(0);

    // The re-read lands a valid snapshot: the verdict resolves and the root
    // target leaves startup.
    retryRead.resolve(standardSnapshot());
    await flushRefresh();
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().readError).toBeNull();
    expect(rootTarget()).toBe("preparation");
  });

  it("a retry whose re-read fails again re-surfaces the error and keeps the hold — Preparation NEVER mounts on failure", async () => {
    readMock.mockRejectedValue(new Error("native read failed"));
    await renderRoot();
    await flushRefresh();
    const user = userEvent.setup();

    await user.press(screen.getByRole("button", { name: RETRY }));
    await flushRefresh();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(2);
    expect(alertRoleElements()).toHaveLength(1);
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(rootTarget()).toBe("startup");
  });
});

describe("PolicyStartupGate — android module absence (RD5-01's hold, named by RD5-03)", () => {
  it("surfaces the unexpected android module absence with the error surface while readiness stays pending — T21's hold is no longer silent", async () => {
    moduleAbsenceExpectedMock.mockReturnValue(false);
    readMock.mockResolvedValue(null);

    await renderRoot();
    await flushRefresh();
    await flushRefresh();

    expect(alertRoleElements()).toHaveLength(1);
    expect(screen.getByText(MODULE_ABSENT_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: RETRY })).toBeOnTheScreen();
    expect(screen.queryByLabelText(LOADING_LABEL)).toBeNull();
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "module-absent" });
    // The hold stands, named: fail-closed, never Preparation.
    expect(rootTarget()).toBe("startup");
  });
});
