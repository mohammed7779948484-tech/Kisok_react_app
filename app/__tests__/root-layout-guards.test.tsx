import { render, screen } from "@testing-library/react-native";

import type { DeviceMode } from "@/features/device-mode";

// `app/_layout.tsx` imports the Tailwind entry stylesheet for its side effect;
// jest has no CSS transformer and does not need one to test routing.
jest.mock("@/global.css", () => ({}));

/**
 * Which route groups the root navigator actually contains.
 *
 * `Stack.Protected` removes a screen from the navigator when its guard is
 * false, so "is this screen present?" IS the guard's observable behaviour.
 * The mock renders a marker per mounted screen and drops the subtree of a
 * false guard, exactly as Expo Router does.
 */
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  function Stack({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function StackScreen({ name }: { name: string }) {
    return <Text>{`screen:${name}`}</Text>;
  }
  function StackProtected({ guard, children }: { guard: boolean; children: React.ReactNode }) {
    return guard ? <>{children}</> : null;
  }
  Stack.Screen = StackScreen;
  Stack.Protected = StackProtected;
  return { Stack };
});

jest.mock("@/core/auth", () => ({
  useAuth: jest.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/auth", () => ({
  StartupScreen: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>startup</Text>;
  },
}));
jest.mock("@/features/device-mode", () => ({
  useDeviceMode: jest.fn(),
  DeviceModeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  deviceRoleAccess: jest.requireActual("@/features/device-mode/model/device-mode.schema")
    .deviceRoleAccess,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuth } = require("@/core/auth") as { useAuth: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useDeviceMode } = require("@/features/device-mode") as { useDeviceMode: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RootNavigator } = require("../_layout") as { RootNavigator: () => React.ReactElement };

async function renderNavigator(role: "customer" | "preparation", mode: DeviceMode) {
  useAuth.mockReturnValue({
    status: "ready",
    profile: { id: "p", display_name: "P", role, is_active: true },
  });
  useDeviceMode.mockReturnValue(mode);
  return render(<RootNavigator />);
}

it("keeps the preparation group on an ordinary tablet — today's navigator is unchanged", async () => {
  await renderNavigator("preparation", "standard");

  expect(screen.getByText("screen:(preparation)")).toBeTruthy();
  expect(screen.queryByText("screen:device-mismatch")).toBeNull();
});

it("removes the preparation group entirely on a customer kiosk tablet", async () => {
  await renderNavigator("preparation", "customer-kiosk");

  expect(screen.queryByText("screen:(preparation)")).toBeNull();
  expect(screen.getByText("screen:device-mismatch")).toBeTruthy();
});

it("removes the preparation group while the device mode is not known yet", async () => {
  await renderNavigator("preparation", "unknown");

  expect(screen.queryByText("screen:(preparation)")).toBeNull();
  // Not a mismatch either — nothing has been decided against this account yet.
  expect(screen.queryByText("screen:device-mismatch")).toBeNull();
});

it("keeps the customer group on both device kinds", async () => {
  await renderNavigator("customer", "standard");
  expect(screen.getByText("screen:(customer)")).toBeTruthy();

  await renderNavigator("customer", "customer-kiosk");
  expect(screen.getByText("screen:(customer)")).toBeTruthy();
  expect(screen.queryByText("screen:device-mismatch")).toBeNull();
});
