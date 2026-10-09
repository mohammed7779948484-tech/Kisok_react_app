import { useEffect, useState } from "react";
import { Text } from "react-native";

import { act, renderWithProviders, screen } from "@/core/testing";
import { DeviceModeProvider, useDeviceMode, type DeviceMode } from "@/features/device-mode";

import { RootNavigator } from "../_layout";
import IndexRoute from "../index";

// Keep the provider and shared access decision real; fake only its platform source.
jest.mock("../../features/device-mode/native/managed-configuration", () => ({
  readDeviceMode: jest.fn(),
  subscribeToManagedConfigurationChanges: jest.fn(),
}));
jest.mock("@/features/device-mode", () => ({
  ...jest.requireActual("@/features/device-mode/state/device-mode-context"),
  ...jest.requireActual("@/features/device-mode/model/device-mode.schema"),
}));
jest.mock("@/design-system/theme/global.css", () => ({}));
jest.mock("@/core/auth", () => ({
  useAuth: () => ({
    status: "ready",
    profile: { id: "p", display_name: "Preparation", role: "preparation", is_active: true },
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/features/auth", () => ({
  StartupScreen: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>startup</Text>;
  },
}));

let mockPreparationMounts = 0;
let mockPreparationUnmounts = 0;

function MockPreparationWorkspace() {
  const [mount] = useState(() => (mockPreparationMounts += 1));
  useEffect(
    () => () => {
      mockPreparationUnmounts += 1;
    },
    [],
  );
  return <Text>{`preparation-workspace:${mount}`}</Text>;
}

// A false Protected guard removes the subtree, as Expo Router does. The mount
// marker detects a workspace removed and then remounted during an MDM update.
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  function Stack({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function StackScreen({ name }: { name: string }) {
    return name === "(preparation)" ? (
      <MockPreparationWorkspace />
    ) : (
      <Text>{`screen:${name}`}</Text>
    );
  }
  function StackProtected({ guard, children }: { guard: boolean; children: React.ReactNode }) {
    return guard ? <>{children}</> : null;
  }
  Stack.Screen = StackScreen;
  Stack.Protected = StackProtected;
  return {
    Stack,
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nativeSource = require("../../features/device-mode/native/managed-configuration") as {
  readDeviceMode: jest.Mock<Promise<DeviceMode>, []>;
  subscribeToManagedConfigurationChanges: jest.Mock;
};

let notifyConfigurationChange: () => void;

function ModeProbe() {
  return <Text>{`device-mode:${useDeviceMode()}`}</Text>;
}

async function renderPreparation() {
  return renderWithProviders(
    <DeviceModeProvider>
      <RootNavigator />
      <IndexRoute />
      <ModeProbe />
    </DeviceModeProvider>,
  );
}

function expectPreparationAvailable() {
  expect(screen.getByText("preparation-workspace:1")).toBeOnTheScreen();
  expect(screen.getByText("redirect:/(preparation)")).toBeOnTheScreen();
  expect(screen.queryByText("screen:device-mismatch")).toBeNull();
  expect(screen.queryByText("redirect:/device-mismatch")).toBeNull();
  expect(screen.queryByText("startup")).toBeNull();
  expect(mockPreparationMounts).toBe(1);
  expect(mockPreparationUnmounts).toBe(0);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  mockPreparationMounts = 0;
  mockPreparationUnmounts = 0;
  nativeSource.subscribeToManagedConfigurationChanges.mockImplementation((notify: () => void) => {
    notifyConfigurationChange = notify;
    return jest.fn();
  });
});

afterEach(() => {
  jest.useRealTimers();
});

it("opens Preparation immediately even when the initial MDM read never resolves", async () => {
  nativeSource.readDeviceMode.mockReturnValue(new Promise(() => {}));

  await renderPreparation();

  expect(screen.getByText("device-mode:unknown")).toBeOnTheScreen();
  expectPreparationAvailable();
  await act(async () => {
    jest.advanceTimersByTime(10_000);
  });
  expectPreparationAvailable();
});

it("keeps Preparation available through unknown retries and terminal unavailable", async () => {
  nativeSource.readDeviceMode.mockResolvedValue("unknown");

  await renderPreparation();

  expect(screen.getByText("device-mode:unknown")).toBeOnTheScreen();
  expectPreparationAvailable();
  for (const delay of [500, 1000, 2000]) {
    await act(async () => {
      jest.advanceTimersByTime(delay);
    });
    expectPreparationAvailable();
  }
  expect(screen.getByText("device-mode:unavailable")).toBeOnTheScreen();
});

it("never unmounts Preparation when MDM broadcasts change classification or reads fail", async () => {
  nativeSource.readDeviceMode.mockResolvedValue("standard");
  await renderPreparation();
  expect(screen.getByText("device-mode:standard")).toBeOnTheScreen();
  expectPreparationAvailable();

  for (const mode of ["customer-kiosk", "unknown"] as const) {
    nativeSource.readDeviceMode.mockResolvedValue(mode);
    await act(async () => {
      notifyConfigurationChange();
    });
    expect(
      screen.getByText(`device-mode:${mode === "unknown" ? "customer-kiosk" : mode}`),
    ).toBeOnTheScreen();
    expectPreparationAvailable();
  }
  // The provider retains its kiosk classification while retrying, then gives up.
  for (const delay of [500, 1000, 2000]) {
    await act(async () => {
      jest.advanceTimersByTime(delay);
    });
    expectPreparationAvailable();
  }
  expect(screen.getByText("device-mode:unavailable")).toBeOnTheScreen();

  nativeSource.readDeviceMode.mockResolvedValue("standard");
  await act(async () => {
    notifyConfigurationChange();
  });
  expect(screen.getByText("device-mode:standard")).toBeOnTheScreen();
  expectPreparationAvailable();
});
