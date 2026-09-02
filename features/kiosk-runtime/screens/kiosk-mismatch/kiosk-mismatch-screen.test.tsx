import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearSignOutTasks, registerSignOutGuard } from "@/core/auth";
import { resetLogging, setLogSink } from "@/core/logging";
import {
  act,
  installMockAuth,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/core/testing";

import { KioskMismatchScreen } from "./kiosk-mismatch-screen";

/**
 * The mismatch screen has exactly one reachable situation — a preparation
 * account signed in on a customer-kiosk tablet (the T07 root guard decides
 * WHEN it shows; this screen only renders its state) — and one action.
 *
 * Its full state list is therefore: ready, sign-out pending, and the shared
 * sign-out pipeline's blocked/failed message. It is NOT data-backed: there are
 * no loading, empty, or error-retry data states to test, and none are invented.
 *
 * The action is exercised through the REAL shared pipeline
 * (useSignOutAction → useAuth().signOut → guards → handoff → Supabase), the
 * same seam `core/auth/__tests__/sign-out-semantics.test.tsx` uses. Mocking the
 * hook would only prove that a mock was wired to itself.
 */

const TITLE = "This is a customer tablet";
const SIGN_OUT = "Sign out and return to customer sign-in";
const BLOCKED_REASON = "An order is still being confirmed.";
const FAILED_REASON = "We couldn't finish signing out. Please try again.";

let auth: ReturnType<typeof installMockAuth> | null = null;

/** A preparation session on the tablet — the only situation this screen renders. */
function signInPreparationAccount() {
  auth = installMockAuth({ role: "preparation" });
  return auth;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  clearSignOutTasks();
  setLogSink(() => {});
});

afterEach(async () => {
  auth?.restore();
  auth = null;
  clearSignOutTasks();
  resetLogging();
  await AsyncStorage.clear();
});

describe("KioskMismatchScreen", () => {
  it("renders the mismatch message and the sign-out action, with no data states in between", async () => {
    signInPreparationAccount();

    // Synchronous queries straight after render: this content is not behind
    // any data fetch, so nothing — no loading state — may sit between mount
    // and the message. That is the state-honesty assertion for a local-only
    // screen; waitFor here would hide a loading state we must not have.
    await renderWithProviders(<KioskMismatchScreen />, { withAuth: true });

    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByText(/preparation experience/i)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: SIGN_OUT })).toBeOnTheScreen();
  });

  it("runs the shared sign-out pipeline on press, reaching the Supabase sign-out path", async () => {
    const supabase = signInPreparationAccount();
    const user = userEvent.setup();

    await renderWithProviders(<KioskMismatchScreen />, { withAuth: true });

    await user.press(screen.getByRole("button", { name: SIGN_OUT }));

    // The shared pipeline's own contract, including `scope: "local"` — this
    // device only, never the whole store account. Reaching this call through
    // the real guards/handoff path is what proves the screen did not build a
    // parallel sign-out implementation (AC-06).
    await waitFor(() => expect(supabase.signOutCalls).toEqual([{ scope: "local" }]));
  });

  it("surfaces the pipeline's blocked outcome as an announced message, before the session is touched", async () => {
    registerSignOutGuard({
      name: "checkout",
      run: () => ({ status: "blocked", reason: BLOCKED_REASON }),
    });
    const supabase = signInPreparationAccount();
    const user = userEvent.setup();

    await renderWithProviders(<KioskMismatchScreen />, { withAuth: true });

    await user.press(screen.getByRole("button", { name: SIGN_OUT }));

    // The pipeline's own ordering: a guard blocks BEFORE Supabase is called.
    // The user reads the pipeline's own words — not a screen-level rewrite.
    await waitFor(() => expect(screen.getByText(BLOCKED_REASON)).toBeOnTheScreen());
    // The message rides the design system's announced surface: `Alert` carries
    // role="alert" plus a polite live region. RNTL's getByRole only matches
    // accessibility elements (Text and `accessible` Views) and Alert is a plain
    // View, so the announcement contract is asserted on its props instead.
    const alert = screen.getByText(BLOCKED_REASON).parent;
    expect(alert).toHaveProp("accessibilityRole", "alert");
    expect(alert).toHaveProp("accessibilityLiveRegion", "polite");
    expect(supabase.signOutCalls).toEqual([]);
  });

  it("surfaces the pipeline's failed outcome as an announced message, after exactly one attempt", async () => {
    // The server call errors AND the stored session is retained, so the
    // pipeline cannot call it safe: it reports `failed` — its own reason text,
    // which the screen must pass through unchanged, not reinterpret.
    const supabase = installMockAuth({
      role: "preparation",
      signOut: async () => ({ error: { message: "network down" } }),
      sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
    });
    auth = supabase;
    const user = userEvent.setup();

    await renderWithProviders(<KioskMismatchScreen />, { withAuth: true });

    await user.press(screen.getByRole("button", { name: SIGN_OUT }));

    await waitFor(() => expect(screen.getByText(FAILED_REASON)).toBeOnTheScreen());
    // Same announced surface as the blocked outcome — one unconditional
    // branch in the screen renders every pipeline message.
    const alert = screen.getByText(FAILED_REASON).parent;
    expect(alert).toHaveProp("accessibilityRole", "alert");
    expect(alert).toHaveProp("accessibilityLiveRegion", "polite");
    // Unlike a block (zero calls), a failure happens AFTER the pipeline
    // attempted sign-out: exactly one call reached Supabase, and it was the
    // local-only scope.
    expect(supabase.signOutCalls).toEqual([{ scope: "local" }]);
  });

  it("disables the sign-out action while the pipeline is in flight, then re-enables it", async () => {
    let settleSignOut: (() => void) | undefined;
    const supabase = installMockAuth({
      role: "preparation",
      signOut: () =>
        new Promise((resolve) => {
          settleSignOut = () => resolve({ error: null });
        }),
    });
    auth = supabase;
    const user = userEvent.setup();

    await renderWithProviders(<KioskMismatchScreen />, { withAuth: true });

    await user.press(screen.getByRole("button", { name: SIGN_OUT }));

    expect(screen.getByRole("button", { name: SIGN_OUT })).toBeDisabled();

    await act(async () => {
      settleSignOut?.();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: SIGN_OUT })).not.toBeDisabled());
  });
});
