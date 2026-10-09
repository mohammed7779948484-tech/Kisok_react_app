import { renderWithProviders, screen } from "@/core/testing";

import type { AppRole, AuthStatus } from "@/core/auth";
import type { DeviceMode } from "@/features/device-mode";

import IndexRoute from "../index";

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: RNText } = jest.requireActual("react-native");
    return <RNText>{`redirect:${href}`}</RNText>;
  },
}));

jest.mock("@/core/auth", () => ({ useAuth: jest.fn() }));
jest.mock("@/features/auth", () => ({
  StartupScreen: () => {
    const { Text: RNText } = jest.requireActual("react-native");
    return <RNText>startup</RNText>;
  },
}));
jest.mock("@/features/device-mode", () => ({
  useDeviceMode: jest.fn(),
  deviceRoleAccess: jest.requireActual("@/features/device-mode/model/device-mode.schema")
    .deviceRoleAccess,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuth } = require("@/core/auth") as { useAuth: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useDeviceMode } = require("@/features/device-mode") as { useDeviceMode: jest.Mock };

const deviceModes = ["standard", "customer-kiosk", "unknown", "unavailable"] as const;

async function renderRoute(status: AuthStatus, role: AppRole | null, mode: DeviceMode) {
  useAuth.mockReturnValue({
    status,
    profile: role ? { id: "p", display_name: "P", role, is_active: status === "ready" } : null,
  });
  useDeviceMode.mockReturnValue(mode);
  return renderWithProviders(<IndexRoute />);
}

describe.each(["customer", "preparation"] as const)("ready %s account", (role) => {
  it.each(deviceModes)(
    "redirects immediately to its experience when device mode is %s",
    async (mode) => {
      await renderRoute("ready", role, mode);

      expect(screen.getByText(`redirect:/(${role})`)).toBeOnTheScreen();
      expect(screen.queryByText("redirect:/device-mismatch")).toBeNull();
      expect(screen.queryByText("startup")).toBeNull();
    },
  );
});

describe("accounts without tablet access", () => {
  it.each(deviceModes)(
    "keeps a drifted ready admin out of both experiences in %s mode",
    async (mode) => {
      await renderRoute("ready", "admin", mode);

      expect(screen.getByText("redirect:/device-mismatch")).toBeOnTheScreen();
      expect(screen.queryByText("redirect:/(customer)")).toBeNull();
      expect(screen.queryByText("redirect:/(preparation)")).toBeNull();
    },
  );

  it.each([
    ["signedOut", "redirect:/sign-in"],
    ["unauthorized", "redirect:/unauthorized"],
    ["resolving", "startup"],
    ["error", "startup"],
  ] as const)(
    "retains the %s session route even with a preparation profile",
    async (status, expected) => {
      await renderRoute(status, "preparation", "unknown");

      expect(screen.getByText(expected)).toBeOnTheScreen();
      expect(screen.queryByText("redirect:/(customer)")).toBeNull();
      expect(screen.queryByText("redirect:/(preparation)")).toBeNull();
      expect(screen.queryByText("redirect:/device-mismatch")).toBeNull();
    },
  );

  it("holds a ready session without a profile until identity is available", async () => {
    await renderRoute("ready", null, "standard");

    expect(screen.getByText("startup")).toBeOnTheScreen();
    expect(screen.queryByText("redirect:/(customer)")).toBeNull();
    expect(screen.queryByText("redirect:/(preparation)")).toBeNull();
  });
});
