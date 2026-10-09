import { renderWithProviders, screen } from "@/core/testing";
import type { AppRole, AuthStatus } from "@/core/auth";

import type { DeviceMode } from "@/features/device-mode";

// `app/_layout.tsx` imports the Tailwind entry stylesheet for its side effect;
// jest has no CSS transformer and does not need one to test routing.
jest.mock("@/design-system/theme/global.css", () => ({}));

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

const deviceModes = ["standard", "customer-kiosk", "unknown", "unavailable"] as const;

async function renderNavigator(status: AuthStatus, role: AppRole | null, mode: DeviceMode) {
  useAuth.mockReturnValue({
    status,
    profile: role ? { id: "p", display_name: "P", role, is_active: status === "ready" } : null,
  });
  useDeviceMode.mockReturnValue(mode);
  return renderWithProviders(<RootNavigator />);
}

describe.each(["customer", "preparation"] as const)("ready %s account", (role) => {
  it.each(deviceModes)(
    "keeps only its experience reachable when device mode is %s",
    async (mode) => {
      await renderNavigator("ready", role, mode);

      expect(screen.getByText(`screen:(${role})`)).toBeOnTheScreen();
      const otherRole = role === "customer" ? "preparation" : "customer";
      expect(screen.queryByText(`screen:(${otherRole})`)).toBeNull();
      expect(screen.queryByText("screen:device-mismatch")).toBeNull();
    },
  );
});

describe("accounts without tablet access", () => {
  it.each(deviceModes)(
    "keeps a drifted ready admin out of both experiences in %s mode",
    async (mode) => {
      await renderNavigator("ready", "admin", mode);

      expect(screen.queryByText("screen:(customer)")).toBeNull();
      expect(screen.queryByText("screen:(preparation)")).toBeNull();
    },
  );

  it.each(["signedOut", "unauthorized", "resolving", "error"] as const)(
    "retains the %s session guard even with a preparation profile",
    async (status) => {
      await renderNavigator(status, "preparation", "unknown");

      expect(screen.queryByText("screen:(customer)")).toBeNull();
      expect(screen.queryByText("screen:(preparation)")).toBeNull();
      expect(screen.queryByText("screen:device-mismatch")).toBeNull();
      if (status === "resolving" || status === "error") {
        expect(screen.getByText("startup")).toBeOnTheScreen();
      } else {
        const route = status === "signedOut" ? "sign-in" : "unauthorized";
        expect(screen.getByText(`screen:${route}`)).toBeOnTheScreen();
      }
    },
  );

  it("keeps a ready session without a profile out of both experiences", async () => {
    await renderNavigator("ready", null, "standard");

    expect(screen.queryByText("screen:(customer)")).toBeNull();
    expect(screen.queryByText("screen:(preparation)")).toBeNull();
    expect(screen.queryByText("screen:device-mismatch")).toBeNull();
  });
});
