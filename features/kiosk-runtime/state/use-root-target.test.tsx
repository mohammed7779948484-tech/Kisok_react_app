import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, createTestQueryClient, installMockAuth, renderHook, waitFor } from "@/core/testing";

import { useDevicePolicyStore } from "./device-policy-store";
import { useRootTarget } from "./use-root-target";

/**
 * AC-03 — the hook the app consumes: `useRootTarget()`.
 *
 * The resolver's full mapping table lives in `model/root-guard.test.ts`;
 * what THIS suite pins is the wiring around it:
 * - the store's policy role is read through a LIVE subscription (a policy
 *   change re-derives the target without a remount — the runtime half of
 *   AC-03, since the MDM can flip a device's role under a signed-in
 *   preparation account);
 * - the auth half comes from the REAL `AuthProvider`, driven by
 *   `installMockAuth` exactly the way production drives it (session event →
 *   profile RPC → status), not by mocking `useAuth`;
 * - snapshots are applied through the real `applySnapshot` with the T03/T06
 *   fixtures — no store internals are poked.
 */
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

let auth: ReturnType<typeof installMockAuth> | null = null;

/**
 * Mount the hook the way the app does: inside AuthProvider (which itself
 * requires QueryProvider — sign-out clears the query cache). Auth resolution
 * is asynchronous, so every assertion on a settled target waits for it.
 */
async function renderRootTarget() {
  return renderHook(() => useRootTarget(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  // Silent sink: AuthProvider logs the session events by design; this suite
  // runs with zero console output like the rest of the repo.
  setLogSink(() => {});
  // Fail-closed default between tests, applied (never injected) — the T06
  // overlay-suite pattern.
  useDevicePolicyStore.getState().applySnapshot(standardSnapshot());
});

afterEach(async () => {
  auth?.restore();
  auth = null;
  resetLogging();
  await AsyncStorage.clear();
});

describe("useRootTarget", () => {
  it("kiosk policy + preparation account → 'kiosk-mismatch' (AC-03: preparation never mounts on a kiosk)", async () => {
    auth = installMockAuth({ role: "preparation" });
    useDevicePolicyStore.getState().applySnapshot(kioskSnapshot());

    const { result } = await renderRootTarget();

    await waitFor(() => expect(result.current).toBe("kiosk-mismatch"));
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
