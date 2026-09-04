import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearSignOutTasks, registerSignOutGuard } from "@/core/auth";
import { resetLogging, setLogSink, type LogRecord } from "@/core/logging";
import {
  act,
  installMockAuth,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/core/testing";

import { MaintenanceSheet, type MaintenanceSheetProps } from "./maintenance-sheet";

/**
 * The unlock/panel sheet (AC-05, AC-06).
 *
 * The sheet is presentational about the SESSION — `unlocked` is handed down by
 * the overlay, and a submit reports the typed code upward and renders the
 * answer it gets back (false ⇒ retry state). The one thing it owns is the
 * panel's Switch customer account action, exercised here through the REAL
 * shared pipeline (useSignOutAction → guards → handoff → Supabase) — the same
 * seam the mismatch screen (T05) and `core/auth/__tests__/sign-out-semantics`
 * use. Mocking the hook would only prove a mock was wired to itself, and the
 * whole point of AC-06 is that there is no parallel sign-out here.
 *
 * Negative space, per AC-05: the typed code never reaches a log record or a
 * persisted value (captured log sink + the AsyncStorage mock's recorded
 * writes), and the retry state reveals nothing about whether a code exists.
 */

const TITLE = "Maintenance";
const CODE_LABEL = "Maintenance code";
const RETRY_MESSAGE = "That code didn't work.";
const UNLOCK = "Unlock";
const SWITCH_ACCOUNT = "Switch customer account";
const CLOSE = "Close";
const BLOCKED_REASON = "An order is still being confirmed.";
const FAILED_REASON = "We couldn't finish signing out. Please try again.";

const TYPED_CODE = "not-the-code-7741";

let auth: ReturnType<typeof installMockAuth> | null = null;
let logRecords: LogRecord[] = [];

const multiSetMock = AsyncStorage.multiSet as unknown as jest.Mock;

/** Every value written to durable storage, including ones later removed. */
function persistedPayloads(): string[] {
  return multiSetMock.mock.calls.flatMap((call) =>
    (call[0] as [string, string][]).map(([, value]) => value),
  );
}

function defaultProps(overrides: Partial<MaintenanceSheetProps>) {
  return {
    open: true,
    unlocked: false,
    onTryUnlock: jest.fn(() => false),
    onOpenChange: jest.fn(),
    ...overrides,
  };
}

async function renderSheet(props: Partial<MaintenanceSheetProps>) {
  const view = await renderWithProviders(<MaintenanceSheet {...defaultProps(props)} />, {
    withAuth: true,
  });
  return view;
}

/**
 * The sheet's scrim — the dialog primitive's Overlay. It is the only
 * non-accessible touch responder in the tree, so it can be located for a
 * faithful dismissal-path press: `userEvent.press` drives its Pressability
 * responder handlers, exactly the same mechanism as every other press, so
 * the tap travels the primitive's real scrim-dismissal route.
 */
function findScrim() {
  const root = screen.root;
  const scrim =
    root === null
      ? []
      : root.queryAll(
          (node) =>
            node.props.accessible === false &&
            typeof node.props.onStartShouldSetResponder === "function",
        );
  const first = scrim[0];
  if (first === undefined) {
    throw new Error("Sheet scrim not found in the rendered tree.");
  }
  return first;
}

beforeEach(async () => {
  logRecords = [];
  setLogSink((record) => logRecords.push(record));
  await AsyncStorage.clear();
  multiSetMock.mockClear();
  clearSignOutTasks();
  auth = installMockAuth();
});

afterEach(async () => {
  auth?.restore();
  auth = null;
  clearSignOutTasks();
  resetLogging();
  await AsyncStorage.clear();
});

describe("MaintenanceSheet — locked state", () => {
  it("renders no sheet content while closed", async () => {
    await renderSheet({ open: false });

    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("shows the code-entry form and a close affordance while open and locked", async () => {
    await renderSheet({});

    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: UNLOCK })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: CLOSE })).toBeOnTheScreen();
  });

  it("a rejected code shows the retry state, keeps the form and the sheet open, and leaks nothing", async () => {
    const user = userEvent.setup();
    await renderSheet({ onTryUnlock: jest.fn(() => false) });

    await user.type(screen.getByLabelText(CODE_LABEL), TYPED_CODE);
    await user.press(screen.getByRole("button", { name: UNLOCK }));

    // The retry state: same words for every failure — nothing about whether a
    // code exists, no attempt counting.
    expect(screen.getByText(RETRY_MESSAGE)).toBeOnTheScreen();
    // The form is still there and the sheet is still open.
    expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();
    expect(screen.getByText(TITLE)).toBeOnTheScreen();

    // The announcement rides the input's error slot: polite live region.
    expect(screen.getByText(RETRY_MESSAGE)).toHaveProp("accessibilityLiveRegion", "polite");

    // Negative space (AC-05): the typed code reaches no log record and no
    // persisted value, and the sheet itself logs nothing at all.
    expect(logRecords.filter((record) => record.scope.startsWith("kiosk-runtime"))).toEqual([]);
    expect(JSON.stringify(logRecords)).not.toContain(TYPED_CODE);
    expect(JSON.stringify(persistedPayloads())).not.toContain(TYPED_CODE);
  });

  it("reports the typed code upward on submit", async () => {
    const onTryUnlock = jest.fn(() => false);
    const user = userEvent.setup();
    await renderSheet({ onTryUnlock });

    await user.type(screen.getByLabelText(CODE_LABEL), TYPED_CODE);
    await user.press(screen.getByRole("button", { name: UNLOCK }));

    expect(onTryUnlock).toHaveBeenCalledWith(TYPED_CODE);
  });

  it("reports the sheet closed when Close is pressed", async () => {
    const onOpenChange = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ onOpenChange });

    await user.press(screen.getByRole("button", { name: CLOSE }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("MaintenanceSheet — unlocked panel", () => {
  async function unlockToPanel() {
    const onTryUnlock = jest.fn(() => true);
    const view = await renderSheet({ unlocked: false, onTryUnlock });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(CODE_LABEL), "4481");
    await user.press(screen.getByRole("button", { name: UNLOCK }));

    // The unlock landing is the overlay's decision: it flips `unlocked`, the
    // same way the real store does for the real overlay.
    await view.rerender(<MaintenanceSheet {...defaultProps({ unlocked: true, onTryUnlock })} />);

    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();
    return { user, view };
  }

  it("swaps the form for the panel when the unlock lands", async () => {
    await unlockToPanel();

    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();
    expect(screen.queryByLabelText(CODE_LABEL)).toBeNull();
    expect(screen.getByRole("button", { name: CLOSE })).toBeOnTheScreen();
  });

  it("runs the shared sign-out pipeline on press, reaching the Supabase sign-out path", async () => {
    const { user } = await unlockToPanel();

    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    // The shared pipeline's own contract, including `scope: "local"` — this
    // device only, never the whole store account. Reaching this call through
    // the real guards/handoff path is what proves the panel did not build a
    // parallel sign-out implementation (AC-06).
    await waitFor(() => expect(auth?.signOutCalls).toEqual([{ scope: "local" }]));
  });

  it("reports the completed account switch upward", async () => {
    const onAccountSwitched = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ unlocked: true, onAccountSwitched });

    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    await waitFor(() => expect(onAccountSwitched).toHaveBeenCalledTimes(1));
  });

  it("surfaces the pipeline's blocked outcome as an announced message, before the session is touched", async () => {
    registerSignOutGuard({
      name: "checkout",
      run: () => ({ status: "blocked", reason: BLOCKED_REASON }),
    });
    const { user } = await unlockToPanel();

    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    // The user reads the pipeline's own words — not a sheet-level rewrite.
    await waitFor(() => expect(screen.getByText(BLOCKED_REASON)).toBeOnTheScreen());
    // The message rides the design system's announced surface: `Alert` carries
    // role="alert" plus a polite live region. RNTL's getByRole only matches
    // accessibility elements (Text and `accessible` Views) and Alert is a plain
    // View, so the announcement contract is asserted on its props instead.
    const alert = screen.getByText(BLOCKED_REASON).parent;
    expect(alert).toHaveProp("accessibilityRole", "alert");
    expect(alert).toHaveProp("accessibilityLiveRegion", "polite");
    expect(auth?.signOutCalls).toEqual([]);
  });

  it("surfaces the pipeline's failed outcome as an announced message, after exactly one local attempt", async () => {
    // The server call errors AND the stored session is retained, so the
    // pipeline cannot call it safe: it reports `failed` — its own reason text,
    // which the sheet must pass through unchanged, not reinterpret.
    auth = installMockAuth({
      signOut: async () => ({ error: { message: "network down" } }),
      sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
    });
    const { user } = await unlockToPanel();

    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    await waitFor(() => expect(screen.getByText(FAILED_REASON)).toBeOnTheScreen());
    const alert = screen.getByText(FAILED_REASON).parent;
    expect(alert).toHaveProp("accessibilityRole", "alert");
    expect(alert).toHaveProp("accessibilityLiveRegion", "polite");
    // Unlike a block (zero calls), a failure happens AFTER the pipeline
    // attempted sign-out: exactly one call reached Supabase, local-only scope.
    expect(auth?.signOutCalls).toEqual([{ scope: "local" }]);
  });

  it("disables the switch-account control and Close while the pipeline is in flight, then re-enables both", async () => {
    let settleSignOut: (() => void) | undefined;
    auth = installMockAuth({
      signOut: () =>
        new Promise((resolve) => {
          settleSignOut = () => resolve({ error: null });
        }),
    });
    const { user } = await unlockToPanel();

    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeDisabled();
    // Closing mid-flight would hide a blocked/failed outcome — the exact
    // thing the shared pipeline exists to surface (review finding T06-R2).
    expect(screen.getByRole("button", { name: CLOSE })).toBeDisabled();

    await act(async () => {
      settleSignOut?.();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).not.toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: CLOSE })).not.toBeDisabled();
  });

  it("keeps the sheet open when the dialog's own dismissal path fires mid-flight, then closes normally after", async () => {
    let settleSignOut: (() => void) | undefined;
    auth = installMockAuth({
      signOut: () =>
        new Promise((resolve) => {
          settleSignOut = () => resolve({ error: null });
        }),
    });
    const onOpenChange = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ unlocked: true, onOpenChange });

    await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

    // In flight: a scrim tap is the dialog primitive's OWN dismissal path
    // (hardware back and accessibility escape funnel through the same
    // onOpenChange). Dismissing now would hide a blocked or failed outcome
    // — the exact thing the shared pipeline exists to surface (R2-1).
    await user.press(findScrim());

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText(TITLE)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).toBeOnTheScreen();

    await act(async () => {
      settleSignOut?.();
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: SWITCH_ACCOUNT })).not.toBeDisabled(),
    );

    // Settled: the same dismissal path closes the sheet normally again.
    await user.press(findScrim());

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  describe("when the maintenance session clears mid-flight", () => {
    // The ephemeral-clear variant of the hazard class T06-R2/R2-1 fixed for
    // the CLOSE paths: the maintenance session can clear while a switch
    // attempt is still in flight — the overlay's expiry timer, the sync
    // hook's AppState transition, or a snapshot application — and every one
    // of those paths flips `unlocked` to false, so the sheet swaps to the
    // LOCKED code-entry form before the pipeline settles. Whatever settles
    // after the flip must still surface its outcome: a blocked or failed
    // message is the failure surface the shared pipeline exists to deliver
    // (AC-06), and the locked form must not swallow it. At this seam the
    // sheet is presentational about the session, so the clear is exactly the
    // store-driven `unlocked` flip the overlay applies — the same rerender
    // `unlockToPanel` performs, in reverse.
    it("still surfaces the blocked outcome after the settle, on the locked form", async () => {
      // The guard hangs, so the attempt stays in flight across the flip.
      type BlockedResult = { status: "blocked"; reason: string };
      let settleGuard: ((result: BlockedResult) => void) | undefined;
      registerSignOutGuard({
        name: "checkout",
        run: () =>
          new Promise<BlockedResult>((resolve) => {
            settleGuard = resolve;
          }),
      });
      const { user, view } = await unlockToPanel();

      await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

      // Mid-flight: the session clears (expiry, backgrounding, and a snapshot
      // re-lock all look like this at the sheet's seam) and the locked
      // code-entry form takes over while the attempt is still pending.
      await view.rerender(<MaintenanceSheet {...defaultProps({ unlocked: false })} />);
      expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();
      // The attempt is genuinely in flight at the flip (the T06-R2 guard
      // holds in either branch).
      expect(screen.getByRole("button", { name: CLOSE })).toBeDisabled();

      await act(async () => {
        settleGuard?.({ status: "blocked", reason: BLOCKED_REASON });
      });

      // The settle lands while the locked form is showing: the pipeline's own
      // words must still reach the staff member.
      await waitFor(() => expect(screen.getByText(BLOCKED_REASON)).toBeOnTheScreen());
      const alert = screen.getByText(BLOCKED_REASON).parent;
      expect(alert).toHaveProp("accessibilityRole", "alert");
      expect(alert).toHaveProp("accessibilityLiveRegion", "polite");
      // A block aborts before auth is touched, whichever branch is showing.
      expect(auth?.signOutCalls).toEqual([]);
    });

    it("still surfaces the failed outcome after the settle, on the locked form", async () => {
      // The server call hangs, then errors while the stored session is
      // retained: the pipeline reports `failed` after the flip.
      let settleSignOut: (() => void) | undefined;
      auth = installMockAuth({
        signOut: () =>
          new Promise((resolve) => {
            settleSignOut = () => resolve({ error: { message: "network down" } });
          }),
        sessionAfterSignOut: { access_token: "still-here", user: { id: "u1" } },
      });
      const { user, view } = await unlockToPanel();

      await user.press(screen.getByRole("button", { name: SWITCH_ACCOUNT }));

      await view.rerender(<MaintenanceSheet {...defaultProps({ unlocked: false })} />);
      expect(screen.getByLabelText(CODE_LABEL)).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: CLOSE })).toBeDisabled();

      await act(async () => {
        settleSignOut?.();
      });

      await waitFor(() => expect(screen.getByText(FAILED_REASON)).toBeOnTheScreen());
      const alert = screen.getByText(FAILED_REASON).parent;
      expect(alert).toHaveProp("accessibilityRole", "alert");
      expect(alert).toHaveProp("accessibilityLiveRegion", "polite");
      // A failure happens after exactly one local-only attempt — the flip
      // changes what the sheet shows, not the pipeline's semantics.
      expect(auth?.signOutCalls).toEqual([{ scope: "local" }]);
    });
  });
});
