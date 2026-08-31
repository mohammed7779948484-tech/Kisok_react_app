import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import { Text, View } from "react-native";

import {
  AuthProvider,
  clearSignOutTasks,
  registerSignOutCleanup,
  useAuth,
} from "@/core/auth";
import { toAppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { setSupabaseClient } from "@/core/supabase";
import { act, installMockAuth, renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

function HandoffRaceProbe() {
  const { signIn, signOut, status } = useAuth();
  const [message, setMessage] = useState("idle");

  return (
    <View>
      <Text>{status}</Text>
      <Text
        accessibilityRole="button"
        accessibilityLabel="Start sign out"
        onPress={() => {
          void signOut().then((outcome) => setMessage(`sign-out:${outcome.status}`));
        }}
      >
        Sign out
      </Text>
      <Text
        accessibilityRole="button"
        accessibilityLabel="Attempt sign in"
        onPress={() => {
          void signIn("next@example.com", "password").catch((error: unknown) => {
            setMessage(toAppError(error).userMessage);
          });
        }}
      >
        Sign in
      </Text>
      <Text>{message}</Text>
    </View>
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  clearSignOutTasks();
  setLogSink(() => {});
});

afterEach(async () => {
  clearSignOutTasks();
  resetLogging();
  setSupabaseClient(null);
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe("kiosk handoff concurrency", () => {
  it("blocks a new account while the previous sign-out cleanup is still in flight", async () => {
    let releaseCleanup: (() => void) | null = null;
    let markCleanupStarted: (() => void) | null = null;
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve;
    });

    registerSignOutCleanup({
      name: "slow-cart",
      run: () =>
        new Promise<void>((resolve) => {
          releaseCleanup = resolve;
          markCleanupStarted?.();
        }),
    });

    const supabase = installMockAuth();
    const signInSpy = jest.spyOn(supabase.client.auth, "signInWithPassword");
    const user = userEvent.setup();

    await renderWithProviders(
      <AuthProvider>
        <HandoffRaceProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeOnTheScreen());

    await user.press(screen.getByLabelText("Start sign out"));
    await cleanupStarted;
    await user.press(screen.getByLabelText("Attempt sign in"));

    await waitFor(() =>
      expect(screen.getByText(/still finishing the previous sign-out/i)).toBeOnTheScreen(),
    );
    expect(signInSpy).not.toHaveBeenCalled();

    await act(async () => {
      releaseCleanup?.();
    });
    await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());

    await user.press(screen.getByLabelText("Attempt sign in"));
    await waitFor(() => expect(signInSpy).toHaveBeenCalledTimes(1));
    supabase.restore();
  });
});
