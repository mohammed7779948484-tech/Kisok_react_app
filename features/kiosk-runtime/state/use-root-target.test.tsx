import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppState } from "react-native";

import { AuthProvider, useAuth } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, createTestQueryClient, installMockAuth, renderHook, waitFor } from "@/core/testing";

import { readDevicePolicySnapshot, subscribeToRestrictionsChanges } from "../native/policy-source";
import { useDevicePolicySync } from "../native/use-device-policy-sync";
import { useDevicePolicyStore } from "./device-policy-store";
import { useRootTarget } from "./use-root-target";

/**
 * AC-03 — the hook the app consumes: `useRootTarget()`.
 *
 * The resolver's full mapping table lives in `model/root-guard.test.ts`;
 * what THIS suite pins is the wiring around it:
 * - the store's policy role AND the store-level readiness verdict are read
 *   through a LIVE subscription (a policy change re-derives the target
 *   without a remount — the runtime half of AC-03, since the MDM can flip a
 *   device's role under a signed-in preparation account); readiness is the
 *   IR-01 remediation: while the first native policy read has not produced a
 *   verdict, a standard policy must hold the target at "startup" — the
 *   cold-start ordering race (fast auth + slow native read) must never mount
 *   Preparation;
 * - the auth half comes from the REAL `AuthProvider`, driven by
 *   `installMockAuth` exactly the way production drives it (session event →
 *   profile RPC → status), not by mocking `useAuth`;
 * - snapshots are applied through the real `applySnapshot` with the T03/T06
 *   fixtures — no store internals are poked (the one exception: the race
 *   tests reset the singleton to its INITIAL state, which is exactly the
 *   state a cold start begins from);
 * - the COMPOSED cold-start race mounts `useDevicePolicySync` next to
 *   `useRootTarget` with the policy source's read held on a deferred
 *   promise — the two halves (hook seam, sync seam) in one scenario, the
 *   way `app/_layout.tsx` mounts them.
 *
 * `../native/policy-source` is mocked for the composed test (the sync hook's
 * only platform seam — the same boundary its own suite mocks); nothing else
 * in this file touches it, so the mock stays inert for the other tests.
 */
jest.mock("../native/policy-source", () => ({
  readDevicePolicySnapshot: jest.fn(),
  subscribeToRestrictionsChanges: jest.fn(),
}));

const readSnapshotMock = readDevicePolicySnapshot as unknown as jest.Mock;
const subscribeMock = subscribeToRestrictionsChanges as unknown as jest.Mock;
const KIOSK_CODE = "4481";
const TIMEOUT_SECONDS = 120;

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

/** Provisional bundle (KEY_RESTRICTIONS_PENDING) with no lock evidence — derives standard, readiness stays pending. */
function provisionalSnapshot() {
  return {
    restrictions: { kiosk_device_role: "customer_kiosk", restrictions_pending: true },
    lockTaskPermitted: true,
    lockTaskModeState: "none",
  };
}

/** Provisional bundle + live LOCKED corroboration — derives kiosk (RD-02), readiness stays pending. */
function provisionalLockedSnapshot() {
  return {
    restrictions: { kiosk_device_role: "customer_kiosk", restrictions_pending: true },
    lockTaskPermitted: true,
    lockTaskModeState: "locked",
  };
}

/**
 * A native read the composed race controls: it stays pending until the test
 * resolves it — the "read held pending" half of the plan's test strategy.
 */
function deferredRead() {
  let resolveRead!: (value: ReturnType<typeof standardSnapshot>) => void;
  const promise = new Promise<ReturnType<typeof standardSnapshot>>((res) => {
    resolveRead = res;
  });
  return { promise, resolveRead };
}

let auth: ReturnType<typeof installMockAuth> | null = null;

/** The providers the hook needs in production, shared by both render helpers. */
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * Mount the hook the way the app does: inside AuthProvider (which itself
 * requires QueryProvider — sign-out clears the query cache). Auth resolution
 * is asynchronous, so every assertion on a settled target waits for it.
 */
async function renderRootTarget() {
  return renderHook(() => useRootTarget(), { wrapper: Providers });
}

/**
 * The hook pair the pending-readiness tests need: the target AND the auth
 * status driving it. A plain `waitFor(() => expect(target).toBe("startup"))`
 * would pass trivially while auth is still "resolving" (which also maps to
 * startup); asserting the auth status first is what makes the assertion
 * meaningful: auth has settled on `ready`, and the target is STILL startup
 * because of policy readiness, not because of auth.
 */
async function renderRootTargetProbe() {
  return renderHook(() => ({ target: useRootTarget(), authStatus: useAuth().status }), {
    wrapper: Providers,
  });
}

beforeEach(() => {
  // Silent sink: AuthProvider logs the session events by design; this suite
  // runs with zero console output like the rest of the repo.
  setLogSink(() => {});
  // Fail-closed default between tests, applied (never injected) — the T06
  // overlay-suite pattern.
  useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
  // Inert defaults for the policy-source mock (only the composed race test
  // mounts the sync hook; re-primed here so no queued implementation can
  // leak between tests) and a deterministic AppState subscription for the
  // sync hook's foreground listener — the same spy shape its own suite uses.
  // The spy's call COUNT is deliberately never asserted here: RNTL's own
  // render infrastructure registers an AppState listener per render, so
  // AppState counts cannot prove anything about the sync hook — the
  // policy-source seam counts (subscribe/read) are the mount signal.
  readSnapshotMock.mockReset();
  readSnapshotMock.mockResolvedValue(null);
  subscribeMock.mockImplementation(() => () => {});
  jest.spyOn(AppState, "addEventListener").mockImplementation(() => ({
    remove: jest.fn(),
  }));
});

afterEach(async () => {
  auth?.restore();
  auth = null;
  resetLogging();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe("useRootTarget", () => {
  it("kiosk policy + preparation account → 'kiosk-mismatch' (AC-03: preparation never mounts on a kiosk)", async () => {
    auth = installMockAuth({ role: "preparation" });
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());

    const { result } = await renderRootTarget();

    await waitFor(() => expect(result.current).toBe("kiosk-mismatch"));
  });

  it("THE cold-start ordering race (IR-01): auth ready + preparation while the first native read is pending → 'startup', then 'preparation' once a valid standard snapshot resolves", async () => {
    auth = installMockAuth({ role: "preparation" });

    // Cold start exactly as the app mounts it: the store is at its INITIAL
    // state — fail-closed standard policy, readiness "pending" (the first
    // native read is in flight; Android documents it may take several
    // seconds, with no ordering guarantee against auth). The beforeEach may
    // have resolved the singleton, so restore the true initial state.
    useDevicePolicyStore.setState(useDevicePolicyStore.getInitialState());

    const { result } = await renderRootTargetProbe();

    // Auth resolves fast (ready + preparation) — the exact race. While the
    // policy read is pending, Preparation must NOT be the target.
    await waitFor(() => expect(result.current.authStatus).toBe("ready"));
    expect(result.current.target).toBe("startup");

    // The native read completes with a valid standard snapshot: readiness
    // resolves and today's standard-device routing appears — unchanged.
    await act(() => {
      useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
    });

    await waitFor(() => expect(result.current.target).toBe("preparation"));
  });

  it("THE composed cold-start race (IR-01): sync hook + root target mounted together, native read held deferred → 'startup', then 'preparation'", async () => {
    auth = installMockAuth({ role: "preparation" });

    // Cold start exactly as the app root mounts it (app/_layout.tsx: the
    // sync hook first, then the root target): the store at its INITIAL
    // state — fail-closed standard policy, readiness "pending" — and the
    // first native read still in flight (Android documents it as disk I/O
    // that "may take several seconds", with no ordering guarantee against
    // auth resolution).
    useDevicePolicyStore.setState(useDevicePolicyStore.getInitialState());
    const { promise: pendingRead, resolveRead } = deferredRead();
    readSnapshotMock.mockReturnValue(pendingRead);

    // One probe calling BOTH hooks, the way RootNavigator does — the two
    // halves of the promised scenario in a single mounted pipeline.
    const { result } = await renderHook(
      () => {
        useDevicePolicySync();
        return { target: useRootTarget(), authStatus: useAuth().status };
      },
      { wrapper: Providers },
    );

    // The sync hook really mounted: its effect subscribed to restrictions
    // changes through the policy-source seam (only it does that — AppState
    // counts would also see the Supabase auto-refresh listener).
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(readSnapshotMock).toHaveBeenCalledTimes(1);
    expect(readSnapshotMock).toHaveReturnedWith(pendingRead);

    // 1. Auth resolves ready + preparation while the read is still
    //    deferred: the target must hold at "startup" — never preparation.
    await waitFor(() => expect(result.current.authStatus).toBe("ready"));
    expect(result.current.target).toBe("startup");

    // 2. The deferred read lands a valid standard snapshot: the sync hook
    //    applies it through the REAL store, readiness resolves, and today's
    //    standard-device routing appears — unchanged (AC-04).
    await act(async () => {
      resolveRead(standardSnapshot());
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.target).toBe("preparation"));
    expect(useDevicePolicyStore.getState().readiness).toBe("resolved");

    // "The (preparation) route never mounts" is transitively pinned: the
    // layout guard for that route is exactly `target === "preparation"`
    // (Stack.Protected in app/_layout.tsx; no router-level harness exists
    // in this repo — see the T14 gate notes).
  });

  it("holds at 'startup' on a provisional snapshot with no lock evidence (standard role, readiness pending — AC-03)", async () => {
    auth = installMockAuth({ role: "preparation" });
    useDevicePolicyStore.getState().applySnapshot(provisionalSnapshot());

    const { result } = await renderRootTargetProbe();

    await waitFor(() => expect(result.current.authStatus).toBe("ready"));
    expect(result.current.target).toBe("startup");
  });

  it("routes a provisional+LOCKED snapshot to 'kiosk-mismatch' while readiness is still pending — a kiosk verdict is affirmative (RD-02)", async () => {
    auth = installMockAuth({ role: "preparation" });
    useDevicePolicyStore.getState().applySnapshot(provisionalLockedSnapshot());

    const { result } = await renderRootTargetProbe();

    await waitFor(() =>
      expect(result.current).toEqual({ target: "kiosk-mismatch", authStatus: "ready" }),
    );
    // The store is still pending — the mismatch comes from the kiosk verdict,
    // not from a resolved readiness.
    expect(useDevicePolicyStore.getState().readiness).toBe("pending");
  });

  it("standard policy + preparation account → 'preparation' (today's routing, unchanged)", async () => {
    auth = installMockAuth({ role: "preparation" });

    const { result } = await renderRootTarget();

    await waitFor(() => expect(result.current).toBe("preparation"));
  });

  it("kiosk policy + customer account → 'customer' — a customer kiosk runs the customer experience", async () => {
    auth = installMockAuth({ role: "customer" });
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());

    const { result } = await renderRootTarget();

    await waitFor(() => expect(result.current).toBe("customer"));
  });

  it("standard policy + signed out → 'sign-in' (today's routing, unchanged)", async () => {
    auth = installMockAuth({ profile: null });

    const { result } = await renderRootTarget();

    await waitFor(() => expect(result.current).toBe("sign-in"));
  });

  it("kiosk policy + signed out → 'sign-in' — device policy never blocks sign-in", async () => {
    auth = installMockAuth({ profile: null });
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());

    const { result } = await renderRootTarget();

    await waitFor(() => expect(result.current).toBe("sign-in"));
  });

  it("re-derives in place when the policy role changes under a mounted hook — the subscription is live", async () => {
    auth = installMockAuth({ role: "preparation" });
    useDevicePolicyStore.getState().applySnapshot(standardSnapshot());

    const { result } = await renderRootTarget();
    await waitFor(() => expect(result.current).toBe("preparation"));

    // The MDM flips the device to a customer kiosk mid-session (the native
    // restrictions-change event lands through the sync hook and ends here).
    await act(() => {
      useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());
    });

    await waitFor(() => expect(result.current).toBe("kiosk-mismatch"));
  });
});
