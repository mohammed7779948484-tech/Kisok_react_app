import { AuthApiError } from "@supabase/supabase-js";
import { useState } from "react";
import { Text } from "react-native";

import { AuthProvider, useAuth } from "@/core/auth";
import { toAppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { setSupabaseClient, type KisokSupabaseClient } from "@/core/supabase";
import { act, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

type AuthCallback = (event: string, session: unknown | null) => void;

const PROFILE = {
  id: "8f1b0a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
  display_name: "Kiosk",
  role: "customer",
  is_active: true,
};

function sessionFor(userId: string, accessToken = "token-1") {
  return { access_token: accessToken, user: { id: userId } };
}

/**
 * A client that records the ORDER of interactions, so a test can prove the auth
 * callback did not call back into Supabase while it was running — the condition
 * that deadlocks the real client.
 */
function installAuthClient({
  initialSession = null,
  profileRows = [PROFILE],
  onProfileFetch,
  failProfile = false,
  signInError = null,
}: {
  initialSession?: unknown | null;
  profileRows?: unknown[];
  onProfileFetch?: () => void;
  failProfile?: boolean;
  /** What `signInWithPassword` reports as its `error`. Defaults to none. */
  signInError?: unknown;
} = {}) {
  const calls: string[] = [];
  let callback: AuthCallback | null = null;
  let insideCallback = false;
  const violations: string[] = [];

  const guard = (name: string) => {
    calls.push(name);
    if (insideCallback) violations.push(name);
  };

  const client = {
    auth: {
      getSession: async () => {
        guard("getSession");
        return { data: { session: initialSession }, error: null };
      },
      onAuthStateChange: (fn: AuthCallback) => {
        callback = fn;
        return { data: { subscription: { unsubscribe: () => calls.push("unsubscribe") } } };
      },
      signInWithPassword: async () => {
        guard("signInWithPassword");
        return { data: {}, error: signInError };
      },
      signOut: async () => {
        guard("signOut");
        return { error: null };
      },
    },
    realtime: {
      setAuth: async () => {
        guard("realtime.setAuth");
      },
    },
    rpc: async (name: string) => {
      guard(`rpc:${name}`);
      onProfileFetch?.();
      if (failProfile) {
        return {
          data: null,
          error: { code: "XX000", message: "boom", details: "", hint: "", name: "PostgrestError" },
        };
      }
      return { data: profileRows, error: null };
    },
  } as unknown as KisokSupabaseClient;

  setSupabaseClient(client);

  return {
    calls,
    violations,
    /**
     * Drive an auth event the way supabase-js does: synchronously, with the
     * lock conceptually held for the duration of the callback.
     */
    async emit(event: string, session: unknown | null) {
      await act(async () => {
        insideCallback = true;
        try {
          callback?.(event, session);
        } finally {
          insideCallback = false;
        }
      });
    },
    restore: () => setSupabaseClient(null),
  };
}

function Probe() {
  const { status, profile } = useAuth();
  return <Text>{`${status}:${profile?.display_name ?? "-"}`}</Text>;
}

/** Surfaces the session token, to prove it does not go stale. */
function TokenProbe() {
  const { session } = useAuth();
  return (
    <Text>{`token:${(session as { access_token?: string } | null)?.access_token ?? "-"}`}</Text>
  );
}

function renderAuth() {
  return renderWithProviders(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

/** Drives `signIn()` and surfaces the SAME message a screen would render. */
function SignInProbe() {
  const { signIn } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Text
      accessibilityRole="button"
      onPress={() => {
        void signIn("shopper@example.com", "wrong-password").catch((error: unknown) => {
          setMessage(toAppError(error).userMessage);
        });
      }}
    >
      {message ?? "idle"}
    </Text>
  );
}

beforeEach(() => setLogSink(() => {}));
afterEach(() => {
  resetLogging();
  setSupabaseClient(null);
});

describe("AuthProvider lifecycle", () => {
  it("does NOT call Supabase from inside the auth callback", async () => {
    // Supabase runs onAuthStateChange while holding an internal lock; calling
    // back into the client from there can deadlock the app on startup.
    const supabase = installAuthClient();
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1"));

    await waitFor(() => expect(screen.getByText("ready:Kiosk")).toBeOnTheScreen());
    expect(supabase.violations).toEqual([]);
    // The profile lookup still happened — just afterwards, not inside.
    expect(supabase.calls).toContain("rpc:current_active_profile");
    supabase.restore();
  });

  it("reports signedOut when there is no session", async () => {
    const supabase = installAuthClient();
    await renderAuth();

    await supabase.emit("INITIAL_SESSION", null);

    await waitFor(() => expect(screen.getByText("signedOut:-")).toBeOnTheScreen());
    supabase.restore();
  });

  it("does not re-fetch the profile when only the token refreshes", async () => {
    let fetches = 0;
    const supabase = installAuthClient({ onProfileFetch: () => (fetches += 1) });
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1", "token-1"));
    await waitFor(() => expect(screen.getByText("ready:Kiosk")).toBeOnTheScreen());

    // Same user, new token — the profile has not changed.
    await supabase.emit("TOKEN_REFRESHED", sessionFor("user-1", "token-2"));
    await supabase.emit("SIGNED_IN", sessionFor("user-1", "token-3"));

    await waitFor(() => expect(screen.getByText("ready:Kiosk")).toBeOnTheScreen());
    expect(fetches).toBe(1);
    supabase.restore();
  });

  it("keeps the exposed session current across a token refresh", async () => {
    // The profile is deliberately not re-resolved on refresh, so the session must
    // come from the listener rather than being copied into derived state — or a
    // consumer would read an expired access token.
    let fetches = 0;
    const supabase = installAuthClient({ onProfileFetch: () => (fetches += 1) });
    await renderWithProviders(
      <AuthProvider>
        <TokenProbe />
      </AuthProvider>,
    );

    await supabase.emit("SIGNED_IN", sessionFor("user-1", "token-1"));
    await waitFor(() => expect(screen.getByText("token:token-1")).toBeOnTheScreen());

    await supabase.emit("TOKEN_REFRESHED", sessionFor("user-1", "token-2"));

    await waitFor(() => expect(screen.getByText("token:token-2")).toBeOnTheScreen());
    expect(fetches).toBe(1);
    supabase.restore();
  });

  it("re-resolves when a different user signs in", async () => {
    let fetches = 0;
    const supabase = installAuthClient({ onProfileFetch: () => (fetches += 1) });
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1"));
    await waitFor(() => expect(screen.getByText("ready:Kiosk")).toBeOnTheScreen());

    await supabase.emit("SIGNED_IN", sessionFor("user-2"));
    await waitFor(() => expect(fetches).toBe(2));
    supabase.restore();
  });

  it("keeps Realtime's token in step with the session", async () => {
    const supabase = installAuthClient();
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1", "token-1"));
    await waitFor(() => expect(supabase.calls).toContain("realtime.setAuth"));
    supabase.restore();
  });

  it("treats an account with no active profile as unauthorized, not signed out", async () => {
    const supabase = installAuthClient({ profileRows: [] });
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1"));

    await waitFor(() => expect(screen.getByText("unauthorized:-")).toBeOnTheScreen());
    supabase.restore();
  });

  it("treats an admin as unauthorized — admin is a web experience", async () => {
    const supabase = installAuthClient({
      profileRows: [{ ...PROFILE, role: "admin", display_name: "Owner" }],
    });
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1"));

    await waitFor(() => expect(screen.getByText("unauthorized:Owner")).toBeOnTheScreen());
    supabase.restore();
  });

  it("surfaces a failed profile lookup as an error the user can retry", async () => {
    const supabase = installAuthClient({ failProfile: true });
    await renderAuth();

    await supabase.emit("SIGNED_IN", sessionFor("user-1"));

    await waitFor(() => expect(screen.getByText(/^error:/)).toBeOnTheScreen());
    supabase.restore();
  });
});

describe("signIn", () => {
  it("reports a generic credential failure, never 'session expired', for wrong credentials", async () => {
    // This is exactly the shape `supabase.auth.signInWithPassword` returns for a
    // wrong password: an AuthApiError, which `isAuthError` also matches. Before
    // this was fixed, EVERY such rejection — including a plain typo, on a tablet
    // that was never signed in — was reported as "Your session expired. Please
    // sign in again.", which is both false and reveals nothing useful to the
    // user about what actually went wrong.
    const supabase = installAuthClient({
      signInError: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const user = userEvent.setup();
    await renderWithProviders(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );

    await user.press(screen.getByRole("button"));

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't sign you in. Check the email and password."),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText(/session expired/i)).not.toBeOnTheScreen();
    supabase.restore();
  });

  it("still reports 'session expired' for an actually-invalid session/token", async () => {
    // A DIFFERENT auth-js error family — the refresh token itself is gone, not
    // the credentials. This must keep the "expired" wording; it is the case the
    // message exists for.
    const supabase = installAuthClient({
      signInError: new AuthApiError("Refresh token not found", 401, "refresh_token_not_found"),
    });
    const user = userEvent.setup();
    await renderWithProviders(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );

    await user.press(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("Your session expired. Please sign in again.")).toBeOnTheScreen(),
    );
    supabase.restore();
  });
});
