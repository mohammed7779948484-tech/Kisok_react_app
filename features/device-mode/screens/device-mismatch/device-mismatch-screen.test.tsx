import { installMockAuth, renderWithProviders, screen, fireEvent, waitFor } from "@/core/testing";

import { DeviceMismatchScreen } from "./device-mismatch-screen";

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
