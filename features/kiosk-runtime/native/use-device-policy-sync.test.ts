import { resetLogging, setLogSink, type LogRecord } from "@/core/logging";
import { act, renderHook } from "@/core/testing";
import { AppState, type AppStateStatus } from "react-native";

import { useDevicePolicyStore } from "../state/device-policy-store";
import { readDevicePolicySnapshot, subscribeToRestrictionsChanges } from "./policy-source";
import { useDevicePolicySync } from "./use-device-policy-sync";

/**
 * AC-02 / AC-05 — the sync hook that binds the policy source to the store.
 *
 * Mock boundaries (the plan's test strategy):
 * - `./policy-source` is mocked: controllable read results and a captured
 *   restrictions subscription. The hook must not know the native module
 *   exists.
 * - `AppState.addEventListener` is SPIED (not module-mocked): the hook must
 *   use the real subscription-returning API, and the spy hands tests a fake
 *   subscription whose handler they invoke manually.
 * - The store is REAL (the singleton, reset via setState between tests):
 *   what is asserted is store behaviour — derived policy, session locking —
 *   not mock bookkeeping.
 *
 * The hook logs one error when a read rejects, by design, so the suite
 * installs a capturing (and therefore silent) log sink — zero console
 * output, and the records stay assertable for the payload-free rule.
 */
jest.mock("./policy-source", () => ({
  readDevicePolicySnapshot: jest.fn(),
  subscribeToRestrictionsChanges: jest.fn(),
}));

const readMock = readDevicePolicySnapshot as unknown as jest.Mock;
const subscribeMock = subscribeToRestrictionsChanges as unknown as jest.Mock;

/** One AppState subscription the hook registered, plus its fake subscription. */
type AppStateCapture = {
  subscription: { remove: jest.Mock };
  handler: (state: AppStateStatus) => void;
};

/** One restrictions subscription the hook registered, plus its unsubscribe. */
type RestrictionsCapture = {
  listener: () => void;
  unsubscribe: jest.Mock;
};

let appStateSpy: jest.SpyInstance;
let appStateCaptures: AppStateCapture[];
let restrictionsCaptures: RestrictionsCapture[];
let applySnapshotSpy: jest.SpyInstance;
let clearMaintenanceSpy: jest.SpyInstance;

const KIOSK_CODE = "4481";
const LOCKED_SESSION = { unlocked: false, expiresAt: null };

function kioskSnapshot() {
  return {
    restrictions: {
      kiosk_device_role: "customer_kiosk",
      maintenance_unlock_code: KIOSK_CODE,
      maintenance_unlock_timeout_seconds: 120,
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

const logRecords: LogRecord[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  appStateCaptures = [];
  restrictionsCaptures = [];

  appStateSpy = jest.spyOn(AppState, "addEventListener").mockImplementation((type, handler) => {
    if (type !== "change") {
      throw new Error(`unexpected AppState event subscription: ${String(type)}`);
    }
    const subscription = { remove: jest.fn() };
    appStateCaptures.push({ subscription, handler });
    return subscription;
  });

  // Default read: the web/test fallback. Each test overrides as needed.
  // mockReset (not just the global clearAllMocks) so a once-value queued by a
  // previous test can never leak into this one — clearAllMocks clears calls,
  // not queued implementations.
  readMock.mockReset();
  readMock.mockResolvedValue(null);
  subscribeMock.mockImplementation((listener: () => void) => {
    const unsubscribe = jest.fn();
    restrictionsCaptures.push({ listener, unsubscribe });
    return unsubscribe;
  });

  // REAL store, reset between tests so no policy leaks across cases.
  // Readiness is part of that reset: a test must never inherit a verdict a
  // previous test resolved (the cold-start default is "pending").
  useDevicePolicyStore.setState({
    policy: { role: "standard", maintenance: { code: null, timeoutSeconds: 90 } },
    maintenance: LOCKED_SESSION,
    readiness: "pending",
  });
  applySnapshotSpy = jest.spyOn(useDevicePolicyStore.getState(), "applySnapshot");
  clearMaintenanceSpy = jest.spyOn(useDevicePolicyStore.getState(), "clearMaintenance");

  logRecords.length = 0;
  setLogSink((record) => {
    logRecords.push(record);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  resetLogging();
});

/** Flush pending refresh microtasks inside act. */
async function flushRefresh() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Fire the restrictions-change event into the hook's LATEST subscription. */
function fireRestrictionsChanged() {
  const capture = restrictionsCaptures.at(-1);
  if (!capture) throw new Error("the hook never subscribed to restrictions changes");
  capture.listener();
}

/** Deliver an AppState change to the hook's LATEST subscription. */
function fireAppStateChange(state: AppStateStatus) {
  const capture = appStateCaptures.at(-1);
  if (!capture) throw new Error("the hook never subscribed to AppState changes");
  capture.handler(state);
}

/** Snapshot shapes this suite's controlled reads can resolve with. */
type ControlledSnapshot = ReturnType<typeof kioskSnapshot> | ReturnType<typeof standardSnapshot>;

/** A read the test controls: it stays pending until the test resolves it. */
function pendingRead() {
  let resolve!: (value: ControlledSnapshot) => void;
  const promise = new Promise<ControlledSnapshot>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("mount", () => {
  it("reads the snapshot on mount and applies it to the store", async () => {
    readMock.mockResolvedValue(kioskSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledWith(kioskSnapshot());
    // The REAL store derived the kiosk policy from the applied snapshot.
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
  });

  it("applies nothing when the source resolves null — the store keeps its fail-closed default (web/test fallback)", async () => {
    readMock.mockResolvedValue(null);

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();
    expect(useDevicePolicyStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });

  it("logs exactly one payload-free error and changes nothing when a read rejects", async () => {
    // Last-known-good state the failed read must not disturb: a kiosk policy
    // and an unlocked maintenance session.
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    useDevicePolicyStore.getState().tryUnlock(KIOSK_CODE);
    const policyBefore = useDevicePolicyStore.getState().policy;
    const sessionBefore = useDevicePolicyStore.getState().maintenance;
    applySnapshotSpy.mockClear();
    clearMaintenanceSpy.mockClear();
    readMock.mockRejectedValue(new Error("native read failed"));

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();
    expect(clearMaintenanceSpy).not.toHaveBeenCalled();
    // A failed read is not evidence for any role: last-known-good survives.
    expect(useDevicePolicyStore.getState().policy).toEqual(policyBefore);
    expect(useDevicePolicyStore.getState().maintenance).toEqual(sessionBefore);

    // Exactly one error — and no payload values anywhere in it: the
    // maintenance code travels inside the restrictions (AC-05).
    const errors = logRecords.filter((record) => record.level === "error");
    expect(errors).toHaveLength(1);
    expect(JSON.stringify(logRecords)).not.toContain(KIOSK_CODE);
    expect(JSON.stringify(logRecords)).not.toContain("customer_kiosk");
    expect(JSON.stringify(logRecords)).not.toContain("native read failed");
  });
});

describe("restrictions changes", () => {
  it("re-reads and re-applies on the native restrictions-change event, re-locking the maintenance session", async () => {
    readMock.mockResolvedValueOnce(kioskSnapshot()).mockResolvedValueOnce(standardSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);

    useDevicePolicyStore.getState().tryUnlock(KIOSK_CODE);
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);

    fireRestrictionsChanged();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenLastCalledWith(standardSnapshot());
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    // Every snapshot application clears the maintenance session (T03 design).
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });
});

describe("AppState", () => {
  it("re-reads when the app becomes active", async () => {
    // First read: the web/test fallback (null, nothing applied).
    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();

    readMock.mockResolvedValueOnce(kioskSnapshot());
    fireAppStateChange("active");
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledWith(kioskSnapshot());
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
  });

  it("clears the maintenance session when the app leaves the foreground, without re-reading", async () => {
    readMock.mockResolvedValue(kioskSnapshot());
    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    useDevicePolicyStore.getState().tryUnlock(KIOSK_CODE);
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);

    fireAppStateChange("background");
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(clearMaintenanceSpy).toHaveBeenCalledTimes(1);
    // Leaving the foreground is not a refresh trigger.
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);

    // The inactive state behaves the same way: unlock is ephemeral (AC-05).
    useDevicePolicyStore.getState().tryUnlock(KIOSK_CODE);
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);
    fireAppStateChange("inactive");
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);
    expect(clearMaintenanceSpy).toHaveBeenCalledTimes(2);
    expect(readMock).toHaveBeenCalledTimes(1);
  });
});

describe("unmount", () => {
  it("removes every subscription on unmount, and a re-mount subscribes fresh", async () => {
    const first = await renderHook(() => useDevicePolicySync());
    expect(appStateCaptures).toHaveLength(1);
    expect(restrictionsCaptures).toHaveLength(1);

    await first.unmount();

    expect(restrictionsCaptures[0]?.unsubscribe).toHaveBeenCalledTimes(1);
    expect(appStateCaptures[0]?.subscription.remove).toHaveBeenCalledTimes(1);

    // A re-mount adds NEW subscriptions (nothing is reused or left behind),
    // and unmounting again removes exactly those.
    const second = await renderHook(() => useDevicePolicySync());
    expect(appStateCaptures).toHaveLength(2);
    expect(restrictionsCaptures).toHaveLength(2);

    await second.unmount();

    expect(restrictionsCaptures[1]?.unsubscribe).toHaveBeenCalledTimes(1);
    expect(appStateCaptures[1]?.subscription.remove).toHaveBeenCalledTimes(1);
    // One read and one subscription of each kind per mount — no doubles.
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(appStateSpy).toHaveBeenCalledTimes(2);
  });
});

describe("readiness transitions (RD-01)", () => {
  it("resolves readiness when the source resolves null — the module is absent, so the standard default IS the platform verdict (web/jest never hold)", async () => {
    readMock.mockResolvedValue(null);

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
  });

  it("holds readiness pending while the first read is deferred, and resolves it when the snapshot lands", async () => {
    const firstRead = pendingRead();
    readMock.mockReturnValue(firstRead.promise);

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();

    // Read in flight (Android: "may take several seconds"): the store keeps
    // its pending verdict — the cold-start ordering race's other half.
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");

    firstRead.resolve(standardSnapshot());
    await flushRefresh();
    await flushRefresh();

    expect(applySnapshotSpy).toHaveBeenCalledWith(standardSnapshot());
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
  });

  it("keeps readiness pending when the first read rejects — a failed read carries no evidence", async () => {
    readMock.mockRejectedValue(new Error("native read failed"));

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
  });

  it("leaves readiness unchanged when a read fails AFTER a snapshot resolved it — last-known-good includes the verdict", async () => {
    readMock
      .mockResolvedValueOnce(standardSnapshot())
      .mockRejectedValueOnce(new Error("native read failed"));

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    // A foreground return re-reads, and this time the read fails: neither
    // the policy nor the readiness verdict may move (no evidence either way).
    fireAppStateChange("active");
    await flushRefresh();
    await flushRefresh();

    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    const errors = logRecords.filter((record) => record.level === "error");
    expect(errors).toHaveLength(1);
  });
});

describe("concurrent reads", () => {
  it("collapses a burst of events during a pending read into exactly one follow-up read, applied in order", async () => {
    const firstRead = pendingRead();
    readMock.mockReturnValue(firstRead.promise);

    await renderHook(() => useDevicePolicySync());
    expect(readMock).toHaveBeenCalledTimes(1);

    // A burst arrives while the read is pending: a restrictions change AND a
    // return to active. Neither may interleave applies with the pending read.
    fireRestrictionsChanged();
    fireAppStateChange("active");
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();

    // The follow-up read must apply the NEW MDM state, not replay the stale
    // one, so it returns a different snapshot.
    readMock.mockResolvedValueOnce(standardSnapshot());

    firstRead.resolve(kioskSnapshot());
    await flushRefresh();
    await flushRefresh();

    // The burst collapsed into ONE follow-up: two reads total, not three.
    // A dropped-last-event bug would leave the stale kiosk policy in place.
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(1, kioskSnapshot());
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(2, standardSnapshot());
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");

    // The guard is released afterwards: a later event re-reads normally
    // (the third read falls back to the persistent kiosk mock value).
    fireAppStateChange("active");
    await flushRefresh();
    expect(readMock).toHaveBeenCalledTimes(3);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(3);
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
  });

  it("does not start a follow-up read when nothing re-entered refresh while the read was pending", async () => {
    const firstRead = pendingRead();
    readMock.mockReturnValue(firstRead.promise);

    await renderHook(() => useDevicePolicySync());
    expect(readMock).toHaveBeenCalledTimes(1);

    firstRead.resolve(kioskSnapshot());
    await flushRefresh();
    await flushRefresh();

    // No re-entrant event means no queued re-run: exactly one read, one apply.
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledWith(kioskSnapshot());
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
  });
});
