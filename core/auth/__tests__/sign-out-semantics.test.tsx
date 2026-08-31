import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import {
  useAuth,
  registerSignOutCleanup,
  registerSignOutGuard,
  clearSignOutTasks,
} from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storageKey } from "@/core/storage";
import { installMockAuth, renderWithProviders, screen, waitFor } from "@/core/testing";
import { setSupabaseClient } from "@/core/supabase";

import type { SignOutOutcome } from "../sign-out";

/**
 * These cover the kiosk safety properties of sign-out, not its happy path:
 *   - it must sign out THIS device only,
 *   - it must never report success while the session may still be usable,
 *   - every guard must run before destructive cleanup,
 *   - and a signed-out tablet must never hand stale durable state to the next customer.
 */

let outcome: SignOutOutcome | null = null;

function SignOutProbe() {
  const { signOut, status } = useAuth();
  return (
    <Text
      accessibilityRole="button"
      onPress={() => {
        void signOut().then((result) => {
          outcome = result;
        });
      }}
    >
      {status}
    </Text>
  );
}

async function renderProbe() {
  await renderWithProviders(<SignOutProbe />, { withAuth: true });
  await waitFor(() => expect(screen.getByText("ready")).toBeOnTheScreen());
  screen.getByRole("button").props.onPress();
}

beforeEach(async () => {
  outcome = null;
  await AsyncStorage.clear();
  setLogSink(() => {});
});

afterEach(async () => {
  clearSignOutTasks();
  resetLogging();
  setSupabaseClient(null);
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe("signOut", () => {
  it("signs out only this device", async () => {
    const supabase = installMockAuth();

    await renderProbe();

    await waitFor(() => expect(outcome).toEqual({ status: "ok" }));
    expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
    supabase.restore();
  });

  it("reports failure when the session may still be usable", async () => {
    const supabase = installMockAuth({
      signOut: async () => ({ error: { message: "network down" } }),
      sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
    });

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("failed"));
    expect(screen.getByText("ready")).toBeOnTheScreen();
    supabase.restore();
  });

  it("reports success when only the server call failed", async () => {
    const supabase = installMockAuth({
      signOut: async () => ({ error: { message: "504" } }),
      sessionAfterSignOut: null,
    });

    await renderProbe();

    await waitFor(() => expect(outcome).toEqual({ status: "ok" }));
    supabase.restore();
  });

  it("lets a safety task veto it before anything is torn down", async () => {
    const supabase = installMockAuth();
    registerSignOutGuard({
      name: "checkout",
      run: () => ({ status: "blocked", reason: "An order is still being confirmed." }),
    });

    await renderProbe();

    await waitFor(() =>
      expect(outcome).toEqual({
        status: "blocked",
        reason: "An order is still being confirmed.",
      }),
    );
    expect(supabase.signOutCalls).toEqual([]);
    supabase.restore();
  });

  it("never runs cleanup when a guard blocks", async () => {
    const supabase = installMockAuth();
    const cleaned: string[] = [];
    registerSignOutGuard({
      name: "checkout",
      run: () => ({ status: "blocked", reason: "An order is still being confirmed." }),
    });
    registerSignOutCleanup({ name: "cart", run: () => void cleaned.push("cart") });

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("blocked"));
    expect(cleaned).toEqual([]);
    supabase.restore();
  });

  it("runs cleanup only after the session is actually gone", async () => {
    const supabase = installMockAuth();
    const cleaned: string[] = [];
    registerSignOutCleanup({ name: "cart", run: () => void cleaned.push("cart") });

    await renderProbe();

    await waitFor(() => expect(outcome).toEqual({ status: "ok" }));
    expect(cleaned).toEqual(["cart"]);
    supabase.restore();
  });

  it("falls back to a KISOK-wide durable reset when a cleanup task throws", async () => {
    const supabase = installMockAuth();
    const staleCartKey = storageKey("cart", "lines");
    await AsyncStorage.setItem(staleCartKey, JSON.stringify([{ variantId: "old" }]));
    registerSignOutCleanup({
      name: "cart",
      run: () => {
        throw new Error("storage full");
      },
    });

    await renderProbe();

    await waitFor(() => expect(outcome).toEqual({ status: "ok" }));
    await expect(AsyncStorage.getItem(staleCartKey)).resolves.toBeNull();
    supabase.restore();
  });

  it("reports unsafe when both feature cleanup and the emergency durable reset fail", async () => {
    const supabase = installMockAuth();
    registerSignOutCleanup({
      name: "cart",
      run: () => {
        throw new Error("storage full");
      },
    });
    jest.spyOn(AsyncStorage, "multiRemove").mockRejectedValueOnce(new Error("disk unavailable"));

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("unsafe"));
    // The auth session really is gone, but the durable marker remains to block
    // the next sign-in (including after a cold restart) until recovery succeeds.
    await expect(
      AsyncStorage.getItem(storageKey("auth", "handoff-pending")),
    ).resolves.not.toBeNull();
    supabase.restore();
  });

  it("fails before touching Supabase when the durable handoff marker cannot be written", async () => {
    const supabase = installMockAuth();
    jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk unavailable"));

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("failed"));
    expect(supabase.signOutCalls).toEqual([]);
    expect(screen.getByText("ready")).toBeOnTheScreen();
    supabase.restore();
  });

  it("fails CLOSED — reports 'failed', never throws — when the Supabase call itself throws", async () => {
    const supabase = installMockAuth({
      signOut: () => {
        throw new Error("native module crashed");
      },
    });

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("failed"));
    expect(screen.getByText("ready")).toBeOnTheScreen();
    supabase.restore();
  });

  it("fails CLOSED — blocks, never proceeds — when a guard itself throws", async () => {
    const supabase = installMockAuth();
    registerSignOutGuard({
      name: "checkout",
      run: () => {
        throw new Error("boom");
      },
    });

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("blocked"));
    expect(supabase.signOutCalls).toEqual([]);
    supabase.restore();
  });
});
