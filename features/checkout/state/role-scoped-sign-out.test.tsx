import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "react-native";

import { useAuth, useSignOutAction } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { storageKey } from "@/core/storage";
import {
  installMockAuth,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  type MockAuthOptions,
} from "@/core/testing";
import { UnauthorizedScreen } from "@/features/auth";

import { useAttemptStore } from "./attempt-store";
// Importing this module registers the real Checkout guard and cleanup.
import "./sign-out-cleanup";

jest.mock("lucide-react-native", () => {
  const icon = () => null;
  return new Proxy({}, { get: () => icon });
});

let mockClient: ReturnType<typeof installMockAuth> | null = null;
function installSession(options: MockAuthOptions = {}) {
  mockClient = installMockAuth(options);
  return mockClient;
}

function SignOutExperience() {
  const { status } = useAuth();
  const action = useSignOutAction();
  if (status === "unauthorized") return <UnauthorizedScreen />;
  if (status === "ready")
    return (
      <>
        <Text accessibilityRole="button" onPress={action.run}>
          Sign out
        </Text>
        {action.message ? <Text>{action.message}</Text> : null}
      </>
    );
  return <Text>{status}</Text>;
}

beforeEach(async () => {
  setLogSink(() => {});
  await AsyncStorage.clear();
  useAttemptStore.setState({
    record: null,
    recordLoaded: false,
    persistence: "unknown",
    phase: "idle",
    conflict: null,
    failure: null,
    unsafeHold: null,
  });
});

afterEach(async () => {
  resetLogging();
  mockClient?.restore();
  mockClient = null;
  await AsyncStorage.clear();
});

it("lets an unauthorized admin leave through the shared action while Checkout recovery is pending", async () => {
  const supabase = installSession({ role: "admin" });
  expect(useAttemptStore.getState().recordLoaded).toBe(false);

  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  expect(await screen.findByText("This account cannot use the tablet")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());
  expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
  expect(
    screen.queryByText("We're still checking this tablet for an unfinished order submission."),
  ).toBeNull();
  supabase.restore();
});

it("lets a preparation session sign out despite customer recovery being pending", async () => {
  const supabase = installSession({ role: "preparation" });
  expect(useAttemptStore.getState().recordLoaded).toBe(false);

  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());
  expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
});

it("lets an authenticated account without an active profile leave Unauthorized", async () => {
  const supabase = installSession({ profile: null, sessionUserId: "profile-less-user" });

  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  expect(await screen.findByText("This account cannot use the tablet")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Sign out" }));

  await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());
  expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
});

it("does not destroy Checkout or Cart keys when an admin signs out", async () => {
  const checkoutKey = storageKey("checkout", "attempt");
  const cartKey = storageKey("cart", "lines");
  await AsyncStorage.setItem(checkoutKey, "customer-attempt-evidence");
  await AsyncStorage.setItem(cartKey, "customer-cart-evidence");
  const supabase = installSession({ role: "admin" });

  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());

  await expect(AsyncStorage.getItem(checkoutKey)).resolves.toBe("customer-attempt-evidence");
  await expect(AsyncStorage.getItem(cartKey)).resolves.toBe("customer-cart-evidence");
  expect(supabase.signOutCalls).toHaveLength(1);
});

it("still blocks a customer until the first durable recovery read completes", async () => {
  const supabase = installSession();
  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));

  expect(
    await screen.findByText("We're still checking this tablet for an unfinished order submission."),
  ).toBeOnTheScreen();
  expect(supabase.signOutCalls).toEqual([]);
});

it.each([
  ["submitting", "An order submission is still unresolved."],
  ["held", "This tablet needs staff help before signing out."],
  ["unsafe-recovery", "This tablet needs staff help before signing out."],
] as const)("still blocks customer phase %s", async (phase, reason) => {
  useAttemptStore.setState({ recordLoaded: true, phase });
  const supabase = installSession();
  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));

  expect(await screen.findByText(reason)).toBeOnTheScreen();
  expect(supabase.signOutCalls).toEqual([]);
});

it("cleans customer Checkout and Cart after local auth removal with the handoff marker durable", async () => {
  useAttemptStore.setState({ recordLoaded: true, phase: "idle" });
  const cartKey = storageKey("cart", "lines");
  const checkoutKey = storageKey("checkout", "attempt");
  const markerKey = storageKey("auth", "handoff-pending");
  await AsyncStorage.setItem(cartKey, "customer-cart-evidence");
  let markerAtAuthRemoval: string | null = null;
  const supabase = installSession({
    signOut: async () => {
      markerAtAuthRemoval = await AsyncStorage.getItem(markerKey);
      return { error: null };
    },
  });

  await renderWithProviders(<SignOutExperience />, { withAuth: true });
  await userEvent.setup().press(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.getByText("signedOut")).toBeOnTheScreen());
  await waitFor(async () => expect(await AsyncStorage.getItem(markerKey)).toBeNull());

  expect(markerAtAuthRemoval).not.toBeNull();
  expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
  await expect(AsyncStorage.getItem(cartKey)).resolves.toBeNull();
  await expect(AsyncStorage.getItem(checkoutKey)).resolves.toBeNull();
  expect(useAttemptStore.getState().recordLoaded).toBe(false);
});
