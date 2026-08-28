import { Text } from "react-native";

import { useAuth } from "@/core/auth";
import { registerSignOutTask, clearSignOutTasks } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { installMockAuth, renderWithProviders, screen, waitFor } from "@/core/testing";
import { setSupabaseClient } from "@/core/supabase";

import type { SignOutOutcome } from "../sign-out";

/**
 * These cover the kiosk safety properties of sign-out, not its happy path:
 *   - it must sign out THIS device only,
 *   - it must never report success while the session may still be usable,
 *   - and the safety gate must still be able to veto it.
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

beforeEach(() => {
  outcome = null;
  // Sign-out logs on the failure paths by design; keep the suite silent.
  setLogSink(() => {});
});

afterEach(() => {
  clearSignOutTasks();
  resetLogging();
  setSupabaseClient(null);
});

describe("signOut", () => {
  it("signs out only this device", async () => {
    const supabase = installMockAuth();

    await renderProbe();

    await waitFor(() => expect(outcome).toEqual({ status: "ok" }));
    // The supabase-js default is "global", which would revoke the refresh
    // tokens of every other tablet signed in to the same store account.
    expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
    supabase.restore();
  });

  it("reports failure when the session may still be usable", async () => {
    // Errors AND leaves the stored session in place — the supabase-js path that
    // fails while reading the session does exactly this.
    const supabase = installMockAuth({
      signOut: async () => ({ error: { message: "network down" } }),
      sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
    });

    await renderProbe();

    await waitFor(() => expect(outcome?.status).toBe("failed"));
    // Still signed in, because that is the truth.
    expect(screen.getByText("ready")).toBeOnTheScreen();
    supabase.restore();
  });

  it("reports success when only the server call failed", async () => {
    // Errored, but the local session is gone, so the next customer cannot
    // inherit it. That is a successful sign-out from the kiosk's point of view.
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
    registerSignOutTask({
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
    // The gate runs first: Supabase was never asked to sign out.
    expect(supabase.signOutCalls).toEqual([]);
    supabase.restore();
  });
});
