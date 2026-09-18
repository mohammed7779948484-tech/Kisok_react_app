import { render, screen } from "@testing-library/react-native";

import type { AuthStatus } from "@/core/auth";
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

async function renderRoute(
  status: AuthStatus,
  role: "customer" | "preparation" | null,
  mode: DeviceMode,
) {
  useAuth.mockReturnValue({
    status,
    profile: role ? { id: "p", display_name: "P", role, is_active: true } : null,
  });
  useDeviceMode.mockReturnValue(mode);
  return render(<IndexRoute />);
}

describe("ordinary tablet — existing routing is unchanged", () => {
  it("sends a customer profile to the customer experience", async () => {
    await renderRoute("ready", "customer", "standard");
    expect(screen.getByText("redirect:/(customer)")).toBeTruthy();
  });

  it("sends a preparation profile to the preparation experience", async () => {
    await renderRoute("ready", "preparation", "standard");
    expect(screen.getByText("redirect:/(preparation)")).toBeTruthy();
  });

  it("still sends a signed-out session to sign-in", async () => {
    await renderRoute("signedOut", null, "standard");
    expect(screen.getByText("redirect:/sign-in")).toBeTruthy();
  });

  it("still sends an unauthorized session to the unauthorized screen", async () => {
    await renderRoute("unauthorized", null, "standard");
    expect(screen.getByText("redirect:/unauthorized")).toBeTruthy();
  });
});

describe("customer kiosk tablet", () => {
  it("lets a customer profile through to the customer experience", async () => {
    await renderRoute("ready", "customer", "customer-kiosk");
    expect(screen.getByText("redirect:/(customer)")).toBeTruthy();
  });

  it("never sends a preparation profile to the preparation experience", async () => {
    await renderRoute("ready", "preparation", "customer-kiosk");
    expect(screen.queryByText("redirect:/(preparation)")).toBeNull();
    expect(screen.getByText("redirect:/device-mismatch")).toBeTruthy();
  });

  it("does not block sign-in on a kiosk tablet", async () => {
    await renderRoute("signedOut", null, "customer-kiosk");
    expect(screen.getByText("redirect:/sign-in")).toBeTruthy();
  });
});

describe("before the device mode is known", () => {
  it("holds a preparation session on the startup screen rather than guessing", async () => {
    await renderRoute("ready", "preparation", "unknown");
    expect(screen.getByText("startup")).toBeTruthy();
    expect(screen.queryByText("redirect:/(preparation)")).toBeNull();
  });

  it("never delays the customer experience", async () => {
    await renderRoute("ready", "customer", "unknown");
    expect(screen.getByText("redirect:/(customer)")).toBeTruthy();
  });
});
