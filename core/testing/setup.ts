/**
 * Jest setup shared by every test.
 * Keep this minimal — a mock added here affects the whole suite.
 *
 * @testing-library/react-native v12.4+ registers its Jest matchers
 * (`toBeOnTheScreen`, `toBeDisabled`, …) on import and manages React's act
 * environment itself. The separate `@testing-library/jest-native` package is
 * deprecated — do not add it.
 *
 * The suite is expected to run with NO console output. If you see act warnings,
 * the usual cause is a `renderWithProviders(...)` that was not awaited — RNTL
 * v14's `render` is async. If you see a logger line, the test is exercising a
 * failure path and should install a silent sink with `setLogSink(() => {})`.
 */
import "@testing-library/react-native";

// AsyncStorage is a native module. This is the mock the package ships for Jest.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// NetInfo has no JS-only implementation, and QueryProvider registers a listener
// at module scope, so every test that reaches it needs this.
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  },
}));
