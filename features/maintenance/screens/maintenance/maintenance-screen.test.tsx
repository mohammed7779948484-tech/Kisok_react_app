import { BackHandler } from "react-native";

import type { SignOutOutcome } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import { act, renderWithProviders, screen, userEvent } from "@/core/testing";

import { MaintenanceScreen } from "./maintenance-screen";

/*
 * The screen's seams are other modules' public APIs: `@/core/auth` for the
 * account and sign-out, `@/features/cart` for the cart summary and discard,
 * and `expo-router` for Back. Each is replaced at module level so the test
 * controls every outcome and can observe the order of the two side effects.
 */
const mockSignOut = jest.fn<Promise<SignOutOutcome>, []>();
jest.mock("@/core/auth", () => ({
  ...jest.requireActual<typeof import("@/core/auth")>("@/core/auth"),
  useAuth: () => ({ signOut: mockSignOut }),
  useActiveProfile: () => ({
    id: "customer-1",
    role: "customer",
    display_name: "Front Counter Tablet",
    is_active: true,
  }),
}));

const mockDiscardCart = jest.fn<Promise<{ saved: boolean }>, []>();
let mockTotalQuantity = 0;
jest.mock("@/features/cart", () => ({
  useCart: () => ({
    totalQuantity: mockTotalQuantity,
    distinctLineCount: mockTotalQuantity > 0 ? 1 : 0,
    hydrated: true,
  }),
  discardCart: () => mockDiscardCart(),
}));

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack,
  }),
}));

// Alert renders a lucide icon; stub the icon set so it renders without SVG.
jest.mock("lucide-react-native", () => {
  const createMockIcon = (name: string) => {
    const MockIcon = () => null;
    MockIcon.displayName = name;
    return MockIcon;
  };
  return new Proxy(
    { __esModule: true },
    {
      get: (target: any, prop: string | symbol) => {
        if (prop in target) return target[prop];
        if (typeof prop === "string") {
          target[prop] = createMockIcon(prop);
          return target[prop];
        }
        return undefined;
      },
    },
  );
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const CART_FAILURE =
  "We couldn't clear this tablet's cart, so it is still signed in. Please try again.";

function signOutButton() {
  return screen.getByTestId("maintenance-sign-out");
}
function backButton() {
  return screen.getByTestId("maintenance-back");
}

beforeEach(() => {
  setLogSink(() => {});
  mockSignOut.mockReset();
  mockDiscardCart.mockReset();
  mockBack.mockReset();
  mockReplace.mockReset();
  mockTotalQuantity = 0;
  mockCanGoBack = true;
});

afterEach(() => resetLogging());

describe("MaintenanceScreen", () => {
  it("names the signed-in account and offers Back and Sign out, with no cart sentence when empty", async () => {
    await renderWithProviders(<MaintenanceScreen />);

    expect(screen.getByText("Staff")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Sign out of this tablet" })).toBeOnTheScreen();
    expect(screen.getByText("Signed in as Front Counter Tablet")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Signing out ends this tablet's customer session. A staff member will need to sign in again before customers can order.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/is in progress/)).not.toBeOnTheScreen();
    expect(backButton()).toHaveTextContent("Back to the catalog");
    expect(signOutButton()).toHaveTextContent("Sign out");
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it.each([
    [1, "A cart with 1 item is in progress. Signing out clears it."],
    [3, "A cart with 3 items is in progress. Signing out clears it."],
  ])("says a cart with %i unit(s) is in progress", async (quantity, sentence) => {
    mockTotalQuantity = quantity;
    await renderWithProviders(<MaintenanceScreen />);

    expect(screen.getByText(sentence)).toBeOnTheScreen();
  });

  it("goes back to the catalog, replacing to / when there is no history", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<MaintenanceScreen />);

    await user.press(backButton());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    mockCanGoBack = false;
    await user.press(backButton());
    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("discards the cart before signing out, and shows pending while it runs", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const discard = deferred<{ saved: boolean }>();
    const signOut = deferred<SignOutOutcome>();
    mockDiscardCart.mockImplementation(() => {
      calls.push("discardCart");
      return discard.promise;
    });
    mockSignOut.mockImplementation(() => {
      calls.push("signOut");
      return signOut.promise;
    });
    await renderWithProviders(<MaintenanceScreen />);

    await user.press(signOutButton());

    expect(signOutButton()).toHaveTextContent("Signing out…");
    expect(signOutButton()).toBeDisabled();
    expect(backButton()).toBeDisabled();
    expect(calls).toEqual(["discardCart"]);

    await act(async () => discard.resolve({ saved: true }));
    expect(calls).toEqual(["discardCart", "signOut"]);
    expect(signOutButton()).toBeDisabled();

    await act(async () => signOut.resolve({ status: "ok" }));
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it("does not sign out when the cart discard cannot be saved, and can retry", async () => {
    const user = userEvent.setup();
    mockDiscardCart.mockResolvedValueOnce({ saved: false });
    await renderWithProviders(<MaintenanceScreen />);

    await user.press(signOutButton());

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(CART_FAILURE);
    expect(signOutButton()).toBeEnabled();
    expect(signOutButton()).toHaveTextContent("Sign out");
    expect(backButton()).toBeEnabled();

    mockDiscardCart.mockResolvedValueOnce({ saved: true });
    mockSignOut.mockResolvedValueOnce({ status: "ok" });
    await user.press(signOutButton());

    expect(mockDiscardCart).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it("shows the sign-out failure reason and lets staff retry", async () => {
    const user = userEvent.setup();
    mockDiscardCart.mockResolvedValue({ saved: true });
    mockSignOut.mockResolvedValueOnce({
      status: "failed",
      reason: "We couldn't reach the store server. Please try again.",
    });
    await renderWithProviders(<MaintenanceScreen />);

    await user.press(signOutButton());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't reach the store server. Please try again.",
    );
    expect(signOutButton()).toBeEnabled();
    expect(signOutButton()).toHaveTextContent("Sign out");
    expect(backButton()).toBeEnabled();

    mockSignOut.mockResolvedValueOnce({ status: "ok" });
    await user.press(signOutButton());

    expect(mockSignOut).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeOnTheScreen();
  });

  it("shows a generic message if sign-out throws unexpectedly", async () => {
    const user = userEvent.setup();
    mockDiscardCart.mockResolvedValue({ saved: true });
    mockSignOut.mockRejectedValueOnce(new Error("boom"));
    await renderWithProviders(<MaintenanceScreen />);

    await user.press(signOutButton());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't finish signing out. Please try again.",
    );
    expect(signOutButton()).toBeEnabled();
  });

  it("ignores a second press while signing out", async () => {
    const discard = deferred<{ saved: boolean }>();
    const signOut = deferred<SignOutOutcome>();
    mockDiscardCart.mockReturnValue(discard.promise);
    mockSignOut.mockReturnValue(signOut.promise);
    const user = userEvent.setup();
    await renderWithProviders(<MaintenanceScreen />);

    await user.press(signOutButton());
    await user.press(signOutButton());
    expect(mockDiscardCart).toHaveBeenCalledTimes(1);

    await act(async () => discard.resolve({ saved: true }));
    await user.press(signOutButton());
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    await act(async () => signOut.resolve({ status: "ok" }));
    expect(mockDiscardCart).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("keeps staff on the page while signing out: Back is held and success never re-enables", async () => {
    const handlers: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      handlers.push(handler);
      return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
    }) as never);
    const user = userEvent.setup();
    const discard = deferred<{ saved: boolean }>();
    mockDiscardCart.mockReturnValue(discard.promise);
    mockSignOut.mockResolvedValue({ status: "ok" });
    await renderWithProviders(<MaintenanceScreen />);
    expect(handlers).toHaveLength(0);

    await user.press(signOutButton());

    // Android Back would unmount the page and lose a later failure message.
    expect(handlers.at(-1)?.()).toBe(true);

    await act(async () => discard.resolve({ saved: true }));
    // Signed out: the route guard is about to leave; the action stays spent.
    expect(signOutButton()).toBeDisabled();
    expect(signOutButton()).toHaveTextContent("Signing out…");
    spy.mockRestore();
  });
});
