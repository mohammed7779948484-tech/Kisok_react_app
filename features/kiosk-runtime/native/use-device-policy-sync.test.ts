import { resetLogging, setLogSink, type LogRecord } from "@/core/logging";
import { act, renderHook } from "@/core/testing";
import { AppState, type AppStateStatus } from "react-native";

import { resolveRootTarget } from "../model/root-guard";
import { useDevicePolicyStore } from "../state/device-policy-store";
import {
  isPolicyModuleAbsenceExpected,
  readDevicePolicySnapshot,
  subscribeToRestrictionsChanges,
} from "./policy-source";
import { requestDevicePolicyRead, useDevicePolicySync } from "./use-device-policy-sync";

/**
 * AC-02 / AC-05 — the sync hook that binds the policy source to the store.
 *
 * Mock boundaries (the plan's test strategy):
 * - `./policy-source` is mocked: controllable read results, the module-
 *   absence platform answer (RD5-01), and a captured restrictions
 *   subscription. The hook must not know the native module exists. The
 *   platform answer defaults to EXPECTED absence — jest-expo runs this
 *   suite as iOS, a non-Android platform; android rows flip it to false.
 * - `AppState.addEventListener` is SPIED (not module-mocked): the hook must
 *   use the real subscription-returning API, and the spy hands tests a fake
 *   subscription whose handler they invoke manually.
 * - The store is REAL (the singleton, reset via setState between tests):
 *   what is asserted is store behaviour — derived policy, session locking —
 *   not mock bookkeeping.
 *
 * RD5-01/RD5-02 rows: the startup-target assertions compose the REAL store
 * state the hook leaves behind with the pure `resolveRootTarget` table (the
 * same resolver `useRootTarget` consumes) — AC-03's amended UNRESOLVED
 * window, checked end-to-end without mounting routing. T21-R1 rows pin the
 * epoch guard: a read superseded mid-flight by a restrictions event is
 * discarded so it can never resurrect the verdict the event destroyed.
 *
 * RD5-03 rows: the same composition pins the readError wiring — set ONLY
 * while no verdict exists (first-read rejections; the android module-absent
 * hold), never while resolved, never for a superseded rejection — and the
 * manual retry trigger (`requestDevicePolicyRead`) re-invokes the SAME
 * single-flight refresh seam, clearing readError at dispatch.
 *
 * The hook logs one error when a read rejects, by design, so the suite
 * installs a capturing (and therefore silent) log sink — zero console
 * output, and the records stay assertable for the payload-free rule.
 */
jest.mock("./policy-source", () => ({
  readDevicePolicySnapshot: jest.fn(),
  subscribeToRestrictionsChanges: jest.fn(),
  isPolicyModuleAbsenceExpected: jest.fn(),
}));

const readMock = readDevicePolicySnapshot as unknown as jest.Mock;
const subscribeMock = subscribeToRestrictionsChanges as unknown as jest.Mock;
const moduleAbsenceExpectedMock = isPolicyModuleAbsenceExpected as unknown as jest.Mock;

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
let markModuleAbsentSpy: jest.SpyInstance;

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
  // Default platform answer: module absence EXPECTED — jest-expo runs this
  // suite as iOS (non-Android; RD5-01). Android rows override to false.
  moduleAbsenceExpectedMock.mockReset();
  moduleAbsenceExpectedMock.mockReturnValue(true);
  subscribeMock.mockImplementation((listener: () => void) => {
    const unsubscribe = jest.fn();
    restrictionsCaptures.push({ listener, unsubscribe });
    return unsubscribe;
  });

  // REAL store, reset between tests so no policy leaks across cases.
  // Readiness AND the UI-only readError are part of that reset: a test must
  // never inherit a verdict or a pending-failure error a previous test left
  // behind (the cold-start defaults are "pending" and null).
  useDevicePolicyStore.setState({
    policy: { role: "standard", maintenance: { code: null, timeoutSeconds: 90 } },
    maintenance: LOCKED_SESSION,
    readiness: "pending",
    readError: null,
  });
  applySnapshotSpy = jest.spyOn(useDevicePolicyStore.getState(), "applySnapshot");
  clearMaintenanceSpy = jest.spyOn(useDevicePolicyStore.getState(), "clearMaintenance");
  markModuleAbsentSpy = jest.spyOn(useDevicePolicyStore.getState(), "markModuleAbsent");

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

/** A read the test controls: it stays pending until the test REJECTS it. */
function rejectableRead() {
  let rejectRead!: (reason?: unknown) => void;
  const promise = new Promise<ControlledSnapshot>((_, rej) => {
    rejectRead = rej;
  });
  return { promise, rejectRead };
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
    // RD5-03: a rejection while a verdict is RESOLVED sets no readError —
    // last-known-good stands and nobody is held, so there is no surface.
    expect(useDevicePolicyStore.getState().readError).toBeNull();
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

describe("restrictions-change event invalidation (RD5-02)", () => {
  it("invalidates a resolved STANDARD verdict and clears the session SYNCHRONOUSLY — before the re-read resolves", async () => {
    readMock.mockResolvedValueOnce(standardSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");

    // The post-event re-read stays pending: every assertion below holds
    // while it is still in flight.
    const reRead = pendingRead();
    readMock.mockReturnValue(reRead.promise);

    fireRestrictionsChanged();

    // SYNCHRONOUS — no await of any kind between the event and these
    // assertions. The event means the restrictions CHANGED (the system
    // broadcasts AFTER persisting the new state), so the old permissive
    // verdict is evidence about a superseded world: pending NOW, not after
    // the async re-read.
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);

    reRead.resolve(standardSnapshot());
    await flushRefresh();
    await flushRefresh();
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
  });

  it("keeps readiness PENDING when the post-event re-read rejects — the event destroyed the stale verdict, and a failed read cannot resurrect it", async () => {
    readMock.mockResolvedValueOnce(standardSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    readMock.mockRejectedValueOnce(new Error("native read failed"));
    fireRestrictionsChanged();
    await flushRefresh();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    // Exactly one payload-free error for the failed read (the existing
    // logging contract, unchanged).
    const errors = logRecords.filter((record) => record.level === "error");
    expect(errors).toHaveLength(1);
    // RD5-03: the EVENT destroyed the verdict, so this failed re-read holds
    // a user at the startup target — the failure is surfaced (retry offered
    // while held) and the hold stands: fail-closed, never a stale permissive
    // verdict, never Preparation on failure.
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("startup");
  });

  it("resolves with the NEW policy when the post-event re-read lands a valid snapshot", async () => {
    readMock.mockResolvedValueOnce(standardSnapshot()).mockResolvedValueOnce(kioskSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    fireRestrictionsChanged();
    await flushRefresh();

    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenLastCalledWith(kioskSnapshot());
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
  });

  it("NEVER reverts a kiosk role on the event but ALWAYS clears its maintenance session synchronously; a failed post-event re-read must not demote it either", async () => {
    readMock.mockResolvedValueOnce(kioskSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().tryUnlock(KIOSK_CODE)).toBe(true);
    expect(useDevicePolicyStore.getState().isMaintenanceUnlocked()).toBe(true);

    readMock.mockRejectedValueOnce(new Error("native read failed"));
    fireRestrictionsChanged();

    // Synchronous, re-read not yet processed: the role and the verdict are
    // untouched (kiosk rows are not readiness-gated — RD5-02c), while the
    // maintenance session is already cleared (RD5-02b).
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);

    await flushRefresh();
    await flushRefresh();

    // The failed re-read must not demote the kiosk either — last-known-good
    // survives for the customer experience (availability), while the
    // session stays cleared (protection).
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().maintenance).toEqual(LOCKED_SESSION);
  });
});

describe("event supersession of an in-flight read (T21-R1 — the epoch guard)", () => {
  it("discards a stale in-flight read's PRE-CHANGE snapshot when the event lands mid-read, and a failed post-event re-read still leaves no stale permissive verdict", async () => {
    // The reviewer's repro (T21-R1): cold read resolves standard → a re-read
    // is dispatched (AppState-active) and held pending → the restrictions
    // event fires during it (synchronous invalidation + a queued re-run) →
    // the STALE read resolves with the PRE-change snapshot → without the
    // epoch guard, that apply re-resolves the permissive verdict, and the
    // queued re-run's rejection leaves it standing: resolved/standard.
    readMock.mockResolvedValueOnce(standardSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    const staleRead = pendingRead();
    readMock.mockReturnValue(staleRead.promise);
    fireAppStateChange("active");
    expect(readMock).toHaveBeenCalledTimes(2);

    // The queued post-event re-run (read #3) rejects — the current, not the
    // superseded, read fails.
    readMock.mockRejectedValueOnce(new Error("native read failed"));

    fireRestrictionsChanged();

    // Synchronous invalidation (RD5-02): the event destroyed the stale
    // permissive verdict and the re-read was re-entrantly queued.
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");

    // The stale read now resolves with the PRE-change (standard) snapshot.
    staleRead.resolve(standardSnapshot());
    await flushRefresh();
    await flushRefresh();

    // The stale apply is DISCARDED: the cold read stays the only apply, and
    // the verdict the event destroyed is not resurrected by pre-change
    // evidence. The queued re-run rejected — a CURRENT failure, logged once
    // — and readiness stays pending: the exact end state RD5-02(a) exists
    // to guarantee, which the pre-guard code violated (resolved/standard).
    expect(readMock).toHaveBeenCalledTimes(3);
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenCalledWith(standardSnapshot());
    const errors = logRecords.filter((record) => record.level === "error");
    expect(errors).toHaveLength(1);
  });

  it("discards the stale in-flight snapshot but resolves with the POST-change snapshot once the queued re-read lands it — the discard loses nothing", async () => {
    readMock.mockResolvedValueOnce(standardSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    const staleRead = pendingRead();
    readMock.mockReturnValue(staleRead.promise);
    fireAppStateChange("active");
    expect(readMock).toHaveBeenCalledTimes(2);

    // The queued post-event re-run (read #3) lands the POST-change state.
    readMock.mockResolvedValueOnce(kioskSnapshot());

    fireRestrictionsChanged();
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");

    staleRead.resolve(standardSnapshot());
    await flushRefresh();
    await flushRefresh();

    // Exactly two applies: the cold read's standard and the queued re-run's
    // kiosk. The stale standard apply never happened — and the fresh
    // post-change evidence still resolves the verdict (no data loss from
    // the discard: the re-run is guaranteed by the re-entrant guard).
    expect(readMock).toHaveBeenCalledTimes(3);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(1, standardSnapshot());
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(2, kioskSnapshot());
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
  });

  it("an event-superseded read that REJECTS logs nothing and leaves the queued re-run in charge", async () => {
    readMock.mockResolvedValueOnce(standardSnapshot());

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    // Read #2 is dispatched (AppState-active) and held pending.
    const staleRead = rejectableRead();
    readMock.mockReturnValue(staleRead.promise);
    fireAppStateChange("active");
    expect(readMock).toHaveBeenCalledTimes(2);

    // The queued post-event re-run (read #3) lands the POST-change snapshot.
    readMock.mockResolvedValueOnce(kioskSnapshot());

    fireRestrictionsChanged();
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");

    // The superseded read now REJECTS: its outcome is irrelevant — the
    // event already invalidated the verdict and a fresh read is already
    // queued — so the epoch guard discards it SILENTLY.
    staleRead.rejectRead(new Error("native read failed"));
    await flushRefresh();
    await flushRefresh();

    // ZERO error-log records: the superseded rejection is not even logged
    // (a noise-free discard — a real current failure is still logged by the
    // rows above). And exactly two applies: the cold read's standard
    // snapshot and the queued re-run's post-change kiosk snapshot — the
    // guard did not swallow the recovery, readiness resolves with the NEW
    // policy.
    expect(readMock).toHaveBeenCalledTimes(3);
    const errors = logRecords.filter((record) => record.level === "error");
    expect(errors).toHaveLength(0);
    // RD5-03: a superseded rejection is discarded ENTIRELY — not logged, and
    // no readError either. The queued post-event re-run is the authoritative
    // retry; the superseded outcome must not surface anything.
    expect(useDevicePolicyStore.getState().readError).toBeNull();
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(1, standardSnapshot());
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(2, kioskSnapshot());
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("customer-kiosk");
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
  it("resolves readiness when module absence is EXPECTED on the platform (non-Android: web / jest / ios) — markModuleAbsent, never a startup hang", async () => {
    moduleAbsenceExpectedMock.mockReturnValue(true);
    readMock.mockResolvedValue(null);

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();
    expect(markModuleAbsentSpy).toHaveBeenCalledTimes(1);
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    // AC-04 (byte-identical web rows): expected module absence is the
    // platform verdict, NOT a failure — no error surface is ever set.
    expect(useDevicePolicyStore.getState().readError).toBeNull();
    // AC-04, pinned from the store state the hook produced: a resolved
    // standard verdict routes a ready preparation session exactly as today.
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("preparation");
  });

  it("HOLDS readiness pending when the module is UNEXPECTEDLY absent on ANDROID (RD5-01) — markModuleAbsent is NOT called and a ready+preparation auth renders the startup target", async () => {
    moduleAbsenceExpectedMock.mockReturnValue(false);
    readMock.mockResolvedValue(null);

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).not.toHaveBeenCalled();
    expect(markModuleAbsentSpy).not.toHaveBeenCalled();
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().policy).toEqual({
      role: "standard",
      maintenance: { code: null, timeoutSeconds: 90 },
    });
    // The amended AC-03 row, composed from the store state the hook leaves
    // behind: UNRESOLVED (module unexpectedly absent on Android) ⇒ startup
    // hold — Preparation can never mount on a broken Android build.
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("startup");
    // RD5-03: T21 held SILENTLY here; the hold now has a name — the surface
    // the startup gate renders (module-absent) while readiness stays pending.
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "module-absent" });

    // The hold is stable, not one-shot: a foreground return re-reads, the
    // module is STILL absent, and the device still must not resolve.
    fireAppStateChange("active");
    await flushRefresh();
    await flushRefresh();
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(markModuleAbsentSpy).not.toHaveBeenCalled();
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "module-absent" });
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("startup");
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
    // RD5-03 / R5-08: the silent hold now names itself — the failure is
    // recorded so the startup gate can surface a MANUAL retry (the only
    // retry there is: automatic retries would hammer disk I/O on a broken
    // device).
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });
    // The hold is fail-closed: error ≡ pending ⇒ startup, never preparation.
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("startup");
  });

  it("leaves readiness unchanged when an AppState-ACTIVE re-read fails after a snapshot resolved it — last-known-good includes the verdict (the NON-event trigger; RD5-02 split)", async () => {
    readMock
      .mockResolvedValueOnce(standardSnapshot())
      .mockRejectedValueOnce(new Error("native read failed"));

    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    // A foreground return re-reads, and this time the read fails: neither
    // the policy nor the readiness verdict may move (no evidence either
    // way). This is the AppState-triggered half of the RD5-02 split: only
    // the restrictions-change EVENT destroys a stale verdict — a plain
    // re-read failure never does.
    fireAppStateChange("active");
    await flushRefresh();
    await flushRefresh();

    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    const errors = logRecords.filter((record) => record.level === "error");
    expect(errors).toHaveLength(1);
    // RD5-03: no readError — a working device keeps last-known-good with no
    // error surface (the user is not held; only an actual hold gets one).
    expect(useDevicePolicyStore.getState().readError).toBeNull();
  });
});

describe("concurrent reads", () => {
  it("collapses a burst of events during a pending read into exactly one follow-up read, discarding the superseded pre-event apply (T21-R1)", async () => {
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
    // The restrictions event superseded the first read mid-flight, so its
    // pre-change kiosk snapshot is DISCARDED (T21-R1) — the ONLY apply is
    // the follow-up read's post-event standard snapshot. A dropped-last-event
    // bug would leave the stale kiosk policy in place; a stale-apply bug
    // would re-apply it here.
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(1);
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(1, standardSnapshot());
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");

    // The guard is released afterwards: a later event re-reads normally
    // (the third read falls back to the persistent kiosk mock value).
    fireAppStateChange("active");
    await flushRefresh();
    expect(readMock).toHaveBeenCalledTimes(3);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
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

describe("manual retry (RD5-03)", () => {
  it("requestDevicePolicyRead is wired only while the hook is mounted — false before mount and after unmount, and a live trigger really dispatches a read", async () => {
    expect(requestDevicePolicyRead()).toBe(false);

    const view = await renderHook(() => useDevicePolicySync());
    await flushRefresh();

    // The trigger is live: it reports true AND actually dispatched one
    // re-read beyond the cold start (the same refresh seam).
    expect(requestDevicePolicyRead()).toBe(true);
    expect(readMock).toHaveBeenCalledTimes(2);

    await view.unmount();
    expect(requestDevicePolicyRead()).toBe(false);
  });

  it("a retry re-dispatches the SAME refresh seam and clears readError AT DISPATCH — retry → loading, observable before the re-read resolves", async () => {
    readMock.mockRejectedValueOnce(new Error("native read failed"));
    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });

    // The re-read stays pending, so the dispatch-time transitions are
    // observable before any outcome lands.
    const retryRead = pendingRead();
    readMock.mockReturnValue(retryRead.promise);

    expect(requestDevicePolicyRead()).toBe(true);

    // Dispatch-time, synchronous with the trigger call: the read was
    // re-dispatched and the error surface is gone (the gate is back to its
    // loading face). readError is cleared at DISPATCH, not at outcome.
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().readError).toBeNull();

    // A successful re-read resolves the verdict — the retry CAN authorize,
    // only evidence does.
    retryRead.resolve(standardSnapshot());
    await flushRefresh();
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
    expect(useDevicePolicyStore.getState().readError).toBeNull();
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("preparation");
  });

  it("a retry whose re-read fails again re-sets readError and keeps the fail-closed startup hold — failure never authorizes Preparation", async () => {
    readMock.mockRejectedValue(new Error("native read failed"));
    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });

    expect(requestDevicePolicyRead()).toBe(true);
    await flushRefresh();
    await flushRefresh();

    // Retry → loading → error-again: the re-read rejected, so the surface is
    // back and the hold stands (error ≡ pending ⇒ startup).
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
    expect(
      resolveRootTarget(
        "ready",
        "preparation",
        useDevicePolicyStore.getState().policy.role,
        useDevicePolicyStore.getState().readiness,
      ),
    ).toBe("startup");
  });

  it("a retry pressed while a read is in flight collapses into the queued re-run — a double-tap cannot interleave reads", async () => {
    readMock.mockRejectedValueOnce(new Error("native read failed"));
    await renderHook(() => useDevicePolicySync());
    await flushRefresh();
    expect(useDevicePolicyStore.getState().readError).toEqual({ reason: "read-failed" });

    // A foreground return starts read #2 and holds it pending.
    const inFlightRead = pendingRead();
    readMock.mockReturnValue(inFlightRead.promise);
    fireAppStateChange("active");
    expect(readMock).toHaveBeenCalledTimes(2);

    // Retry pressed while read #2 is in flight: the error still clears at
    // dispatch (loading face), NO third read starts, and exactly one
    // re-run is queued behind the in-flight read.
    expect(requestDevicePolicyRead()).toBe(true);
    expect(readMock).toHaveBeenCalledTimes(2);
    expect(useDevicePolicyStore.getState().readError).toBeNull();

    // The in-flight read lands the PRE-retry snapshot (kiosk); the queued
    // re-run then lands the POST-retry state (standard) — proving the re-run
    // ran and its apply is the last word.
    readMock.mockResolvedValueOnce(standardSnapshot());
    inFlightRead.resolve(kioskSnapshot());
    await flushRefresh();
    await flushRefresh();

    expect(readMock).toHaveBeenCalledTimes(3);
    expect(applySnapshotSpy).toHaveBeenCalledTimes(2);
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(1, kioskSnapshot());
    expect(applySnapshotSpy).toHaveBeenNthCalledWith(2, standardSnapshot());
    expect(useDevicePolicyStore.getState().policy.role).toBe("standard");
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");
  });
});
