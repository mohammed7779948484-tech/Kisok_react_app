import { Text } from "react-native";

import { resetLogging, setLogSink } from "@/core/logging";
import { renderWithProviders, screen, userEvent, waitFor } from "@/core/testing";

import { useSignOutAction } from "../use-sign-out-action";

/**
 * `useSignOutAction` is the LAST line of defence: `signOut()` in
 * `core/auth/context.tsx` already catches every failure point it knows about
 * (a guard throwing, the Supabase call throwing, a cleanup task throwing), but
 * this hook must still survive whatever is left — a bug nobody anticipated —
 * without ever leaving an unhandled rejected promise or a stuck `pending`.
 */
const mockSignOut = jest.fn();

jest.mock("../context", () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

function Probe() {
  const action = useSignOutAction();
  return (
    <Text accessibilityRole="button" onPress={action.run}>
      {action.pending ? "pending" : (action.message ?? "idle")}
    </Text>
  );
}

beforeEach(() => {
  mockSignOut.mockReset();
  setLogSink(() => {});
});

afterEach(resetLogging);

describe("useSignOutAction", () => {
  it("surfaces a safe message instead of an unhandled rejection when signOut() throws", async () => {
    mockSignOut.mockRejectedValue(new Error("nobody anticipated this"));
    const user = userEvent.setup();
    await renderWithProviders(<Probe />);

    await user.press(screen.getByRole("button"));

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't finish signing out. Please try again."),
      ).toBeOnTheScreen(),
    );
  });

  it("clears `pending` even when signOut() throws", async () => {
    mockSignOut.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    await renderWithProviders(<Probe />);

    await user.press(screen.getByRole("button"));

    await waitFor(() => expect(screen.queryByText("pending")).not.toBeOnTheScreen());
  });

  it("reports the block reason on the happy path, unaffected by the backstop", async () => {
    mockSignOut.mockResolvedValue({ status: "blocked", reason: "An order is still confirming." });
    const user = userEvent.setup();
    await renderWithProviders(<Probe />);

    await user.press(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByText("An order is still confirming.")).toBeOnTheScreen(),
    );
  });
});
