import { Text } from "react-native";

import { useActiveProfile, useAuth } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { installMockAuth, renderWithProviders, screen, waitFor } from "@/core/testing";

/**
 * Proves the helper a feature agent will reach for actually works, so nobody has
 * to hand-roll an auth fake to test a screen behind the gate.
 */

// `AuthProvider`'s listener logs every auth event at debug level; keep the
// suite silent rather than let that be the one file where the "zero console
// output" rule quietly does not hold.
beforeEach(() => setLogSink(() => {}));
afterEach(resetLogging);

function Probe() {
  const { status } = useAuth();
  if (status !== "ready") return <Text>{status}</Text>;
  return <ProfileProbe />;
}

function ProfileProbe() {
  const profile = useActiveProfile();
  return <Text>{`${profile.role}:${profile.display_name}`}</Text>;
}

describe("installMockAuth", () => {
  it("renders a screen as an authenticated customer", async () => {
    const supabase = installMockAuth();

    await renderWithProviders(<Probe />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("customer:Test Kiosk")).toBeOnTheScreen());
    supabase.restore();
  });

  it("can sign in as another role", async () => {
    const supabase = installMockAuth({ role: "preparation" });

    await renderWithProviders(<Probe />, { withAuth: true });

    await waitFor(() => expect(screen.getByText(/^preparation:/)).toBeOnTheScreen());
    supabase.restore();
  });

  it("can start signed out", async () => {
    const supabase = installMockAuth({ profile: null });

    await renderWithProviders(<Probe />, { withAuth: true });

    await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());
    supabase.restore();
  });

  it("serves the feature's own RPCs alongside the profile lookup", async () => {
    const supabase = installMockAuth({
      rpc: { get_customer_catalog: () => ({ data: { schema_version: "x" }, error: null }) },
    });

    const result = await supabase.client.rpc("get_customer_catalog" as never, {} as never);

    expect(result).toEqual({ data: { schema_version: "x" }, error: null });
    expect(supabase.callsTo("get_customer_catalog")).toHaveLength(1);
    supabase.restore();
  });

  it("fails loudly for an RPC with no handler", async () => {
    const supabase = installMockAuth();

    await expect(supabase.client.rpc("create_order" as never, {} as never)).rejects.toThrow(
      /No mock handler registered for rpc "create_order"/,
    );
    supabase.restore();
  });
});
