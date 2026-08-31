import { AppState, Platform } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { getSupabaseClient, setSupabaseClient } from "@/core/supabase";

// The lifecycle under test needs a REAL client, and `createSupabaseClient`
// validates the environment. `EXPO_PUBLIC_*` reads are inlined at transform
// time, so setting process.env at runtime would do nothing — mock the seam.
jest.mock("@/core/env", () => ({
  getEnv: () => ({
    supabaseUrl: "https://client-lifecycle-test.supabase.co",
    supabasePublishableKey: "sb_publishable_client_lifecycle_test",
    environment: "local",
  }),
}));

describe("supabase client lifecycle", () => {
  // Binding auto-refresh logs by design; the suite runs with no console output.
  beforeEach(() => setLogSink(() => {}));
  afterEach(() => {
    setSupabaseClient(null);
    resetLogging();
  });

  it("never accumulates AppState listeners across client resets", () => {
    const added: { remove: () => void }[] = [];
    const removed: { remove: () => void }[] = [];

    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation(() => {
      const subscription = { remove: () => removed.push(subscription) };
      added.push(subscription);
      return subscription as ReturnType<typeof AppState.addEventListener>;
    });

    try {
      // Three real clients in a row — what a test file does between cases, and
      // what a dev-time reload does. Before the fix each one added a listener
      // bound to a client nobody would use again, and removed none of them.
      for (let index = 0; index < 3; index += 1) {
        setSupabaseClient(null);
        getSupabaseClient();
      }
      setSupabaseClient(null);

      expect(removed.length).toBe(added.length);
      if (Platform.OS !== "web") {
        // Binding really happened, so the equality above is not vacuous.
        // (On web the AppState workaround is deliberately not installed.)
        expect(added.length).toBe(3);
      }
    } finally {
      spy.mockRestore();
    }
  });
});
