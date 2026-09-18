import { installMockAuth, renderWithProviders, screen, fireEvent, waitFor } from "@/core/testing";

import { DeviceMismatchScreen } from "./device-mismatch-screen";

jest.mock("../../state/device-mode-context", () => ({ useDeviceMode: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useDeviceMode } = require("../../state/device-mode-context") as {
  useDeviceMode: jest.Mock;
};

beforeEach(() => {
  // The kiosk mismatch is the common case; the unreadable-device tests override it.
  useDeviceMode.mockReturnValue("customer-kiosk");
});

async function renderScreen() {
  return renderWithProviders(<DeviceMismatchScreen />, { withAuth: true });
}

it("explains that this tablet is the customer kiosk, without blaming the account", async () => {
  const auth = installMockAuth({ role: "preparation" });

  await renderScreen();

  expect(await screen.findByText(/customer kiosk/i)).toBeTruthy();
  auth.restore();
});

it("offers the shared sign-out so the tablet returns to the customer sign-in state", async () => {
  const auth = installMockAuth({ role: "preparation" });

  await renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: /sign out/i }));

  // `scope: "local"` signs out THIS tablet only — the shared pipeline's contract.
  await waitFor(() => expect(auth.signOutCalls).toEqual([{ scope: "local" }]));
  auth.restore();
});

it("surfaces a sign-out that could not complete safely, rather than swallowing it", async () => {
  const auth = installMockAuth({
    role: "preparation",
    signOut: async () => ({ error: { message: "network down" } }),
    sessionAfterSignOut: { access_token: "still-here", user: { id: "u" } },
  });

  await renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: /sign out/i }));

  expect(await screen.findByText(/couldn't finish signing out/i)).toBeTruthy();
  auth.restore();
});

it("explains an unreadable device honestly instead of blaming the kiosk", async () => {
  const auth = installMockAuth({ role: "preparation" });
  useDeviceMode.mockReturnValue("unavailable");

  await renderScreen();

  expect(await screen.findByText(/couldn't read this tablet's setup/i)).toBeTruthy();
  expect(screen.queryByText("This tablet is the customer kiosk")).toBeNull();
  auth.restore();
});

it("offers the same sign-out when the device could not be read", async () => {
  const auth = installMockAuth({ role: "preparation" });
  useDeviceMode.mockReturnValue("unavailable");

  await renderScreen();
  fireEvent.press(await screen.findByRole("button", { name: /sign out/i }));

  await waitFor(() => expect(auth.signOutCalls).toEqual([{ scope: "local" }]));
  auth.restore();
});
