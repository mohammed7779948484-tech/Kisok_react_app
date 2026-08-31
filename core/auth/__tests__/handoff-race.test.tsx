import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import { AuthProvider, clearSignOutTasks, registerSignOutCleanup, useAuth } from "@/core/auth";
import { AppError } from "@/core/errors";
import { resetLogging, setLogSink } from "@/core/logging";
import { setSupabaseClient } from "@/core/supabase";
import { act, installMockAuth, renderWithProviders, screen, waitFor } from "@/core/testing";

let actions: Pick<ReturnType<typeof useAuth>, "signIn" | "signOut"> | null = null;

function HandoffRaceProbe() {
  const { signIn, signOut, status } = useAuth();
  actions = { signIn, signOut };
  return <Text>{status}</Text>;
}

beforeEach(async () => {
  actions = null;
  await AsyncStorage.clear();
  clearSignOutTasks();
  setLogSink(() => {});
});

afterEach(async () => {
  actions = null;
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

    await renderWithProviders(
      <AuthProvider>
        <HandoffRaceProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("ready")).toBeOnTheScreen());

    if (!actions) throw new Error("Auth actions were not captured");
    const signOutPromise = actions.signOut();
    await cleanupStarted;

    await expect(actions.signIn("next@example.com", "password")).rejects.toBeInstanceOf(AppError);
    expect(signInSpy).not.toHaveBeenCalled();

    await act(async () => {
      releaseCleanup?.();
    });
    await expect(signOutPromise).resolves.toEqual({ status: "ok" });
    await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());

    await expect(actions.signIn("next@example.com", "password")).resolves.toBeUndefined();
    expect(signInSpy).toHaveBeenCalledTimes(1);
    supabase.restore();
  });
});
