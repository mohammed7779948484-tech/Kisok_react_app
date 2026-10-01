import { Text } from "react-native";

import { useAuth, type SignOutOutcome } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { setSupabaseClient } from "@/core/supabase";
import { installMockAuth, renderWithProviders, screen, waitFor } from "@/core/testing";

/**
 * These cover the kiosk safety properties of sign-out, not its happy path:
 *   - it must sign out THIS device only,
 *   - it must never report success while the session may still be usable,
 *   - nothing one account read may survive into the next account's cache,
 *   - and a second press while one sign-out is in flight must not start another.
 */

let outcomes: SignOutOutcome[] = [];

function SignOutProbe() {
  const { signOut, status } = useAuth();
  return (
    <Text
      accessibilityRole="button"
      onPress={() => {
        void signOut().then((result) => {
          outcomes.push(result);
        });
      }}
    >
      {status}
    </Text>
  );
}

async function renderReadyProbe() {
  const rendered = await renderWithProviders(<SignOutProbe />, { withAuth: true });
  await waitFor(() => expect(screen.getByText("ready")).toBeOnTheScreen());
  return rendered;
}

function pressSignOut() {
  screen.getByRole("button").props.onPress();
}

beforeEach(() => {
  outcomes = [];
  setLogSink(() => {});
});

afterEach(() => {
  resetLogging();
  setSupabaseClient(null);
});

describe("signOut", () => {
  it("signs out only this device", async () => {
    const supabase = installMockAuth();

    await renderReadyProbe();
    pressSignOut();

    await waitFor(() => expect(outcomes).toEqual([{ status: "ok" }]));
    expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
    expect(await screen.findByText("signedOut")).toBeOnTheScreen();
    supabase.restore();
  });

  it("reports failure, and keeps the account in control, when the session may still be usable", async () => {
    const supabase = installMockAuth({
      signOut: async () => ({ error: { message: "network down" } }),
      sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
    });

    await renderReadyProbe();
    pressSignOut();

    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(outcomes[0]?.status).toBe("failed");
    expect(screen.getByText("ready")).toBeOnTheScreen();
    supabase.restore();
  });

  it("reports success when only the server call failed but the local session is gone", async () => {
    const supabase = installMockAuth({
      signOut: async () => ({ error: { message: "504" } }),
      sessionAfterSignOut: null,
    });

    await renderReadyProbe();
    pressSignOut();

    await waitFor(() => expect(outcomes).toEqual([{ status: "ok" }]));
    expect(await screen.findByText("signedOut")).toBeOnTheScreen();
    supabase.restore();
  });

  it("fails CLOSED — reports 'failed', never throws — when the Supabase call itself throws", async () => {
    const supabase = installMockAuth({
      signOut: () => {
        throw new Error("native module crashed");
      },
    });

    await renderReadyProbe();
    pressSignOut();

    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(outcomes[0]?.status).toBe("failed");
    expect(screen.getByText("ready")).toBeOnTheScreen();
    supabase.restore();
  });

  it("clears every cached server read once the session is gone", async () => {
    const supabase = installMockAuth();
    const { queryClient } = await renderReadyProbe();
    queryClient.setQueryData(["previous-account", "orders"], [{ id: "order-1" }]);

    pressSignOut();

    await waitFor(() => expect(outcomes).toEqual([{ status: "ok" }]));
    expect(queryClient.getQueryData(["previous-account", "orders"])).toBeUndefined();
    supabase.restore();
  });

  it("keeps the cache when sign-out failed, because the same account stays in control", async () => {
    const supabase = installMockAuth({
      signOut: async () => ({ error: { message: "network down" } }),
      sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
    });
    const { queryClient } = await renderReadyProbe();
    queryClient.setQueryData(["current-account", "orders"], [{ id: "order-1" }]);

    pressSignOut();

    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(outcomes[0]?.status).toBe("failed");
    expect(queryClient.getQueryData(["current-account", "orders"])).toEqual([{ id: "order-1" }]);
    supabase.restore();
  });

  it("refuses a second sign-out while the first is still in flight", async () => {
    let finish: (result: { error: null }) => void = () => {};
    const supabase = installMockAuth({
      signOut: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });

    await renderReadyProbe();
    pressSignOut();
    pressSignOut();

    // The second press settles immediately as failed, without a second call.
    await waitFor(() => expect(outcomes).toHaveLength(1));
    expect(outcomes[0]?.status).toBe("failed");
    expect(supabase.signOutCalls).toHaveLength(1);

    finish({ error: null });

    await waitFor(() => expect(outcomes).toHaveLength(2));
    expect(outcomes[1]).toEqual({ status: "ok" });
    expect(supabase.signOutCalls).toHaveLength(1);
    expect(await screen.findByText("signedOut")).toBeOnTheScreen();
    supabase.restore();
  });
});
