import { AppState, type AppStateStatus } from "react-native";

import { act, fireEvent, renderWithProviders, screen } from "@/core/testing";

import { SuccessCountdown } from "./success-countdown";

/**
 * T11 — the Order Success inactivity countdown, unit level (plan D10):
 * a DEADLINE held against the wall clock, never a tick counter.
 *
 * Fake timers (the products-screen precedent): modern fake timers fake BOTH
 * `setInterval` and `Date`, so advancing the clock moves the wall clock and
 * the interval together, and `jest.setSystemTime` moves the wall clock
 * WITHOUT firing timers — exactly the shape of a suspended process (Android
 * freezes the JS thread's timers while backgrounded; the wall clock keeps
 * going). That is the D10 resume scenario, made deterministic. Timer
 * advances use the repo's proven form — `await act(async () => { await
 * jest.advanceTimersByTimeAsync(ms) })` — a synchronous `advanceTimersByTime`
 * inside a synchronous `act` does not reach the interval in this environment
 * (probed directly while writing this suite).
 *
 * AppState is react-native's own jest mock (`react-native/jest/mocks/AppState`
 * — `addEventListener` is a `jest.fn` recording its arguments), so a test
 * captures the countdown's "change" listener from the recorded calls and
 * invokes it the way the OS would on background/resume.
 *
 * The countdown is deliberately driven through the public React surface only:
 * the label by `getByLabelText` (the Progress primitive's REQUIRED label — its
 * doc example "Order resets in 12 seconds" is the convention), the interaction
 * wrapper by its testID (the catalog-grid precedent for a non-interactive
 * layout element), expiry through the `onExpire` callback the screen owns.
 */
jest.useFakeTimers();

/** The countdown's interaction wrapper (a non-interactive layout element). */
const COUNTDOWN_TEST_ID = "success-countdown";

/** Advance the faked clock (wall clock + timers) inside a proper act window. */
async function advanceClock(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/**
 * The most recently registered AppState "change" listener — the countdown's
 * own subscription (nothing else in this suite registers one). RN's jest mock
 * records every `addEventListener` call, so the last "change" registration is
 * the currently mounted countdown's.
 */
function latestAppStateChangeHandler(): (status: AppStateStatus) => void {
  const addEventListener = AppState.addEventListener as unknown as jest.Mock;
  const changeCalls = addEventListener.mock.calls.filter((call) => call[0] === "change");
  const latest = changeCalls[changeCalls.length - 1];
  if (latest === undefined) {
    throw new Error("no AppState change listener was registered by the countdown");
  }
  return latest[1];
}

/** Simulate an OS app-state transition reaching the countdown's subscription. */
async function emitAppState(status: AppStateStatus) {
  await act(async () => {
    latestAppStateChangeHandler()(status);
  });
}

describe("SuccessCountdown", () => {
  it("renders the label from the deadline and recomputes it from the wall clock each tick — never accumulating ticks", async () => {
    const onExpire = jest.fn();
    await renderWithProviders(<SuccessCountdown seconds={3} onExpire={onExpire} />);

    // Armed at now + 3s: the label announces the full window.
    expect(screen.getByLabelText("Order resets in 3 seconds")).toBeOnTheScreen();

    // One second of wall clock: the deadline math says 2s left (NOT 3 − a
    // tick counter that drifted, and not a stale first-render frame).
    await advanceClock(1_000);
    expect(screen.getByLabelText("Order resets in 2 seconds")).toBeOnTheScreen();

    await advanceClock(1_000);
    // Singular copy at one second.
    expect(screen.getByLabelText("Order resets in 1 second")).toBeOnTheScreen();

    await advanceClock(1_000);
    // Clamped at zero at the deadline, with the expiry fired.
    expect(screen.getByLabelText("Order resets in 0 seconds")).toBeOnTheScreen();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("fires onExpire exactly once at the deadline and clamps the display at zero — never a negative countdown", async () => {
    const onExpire = jest.fn();
    await renderWithProviders(<SuccessCountdown seconds={2} onExpire={onExpire} />);

    // Ten seconds past a 2s window: one expiry, the label still 0.
    await advanceClock(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Order resets in 0 seconds")).toBeOnTheScreen();

    // Ten more: still one expiry, still clamped.
    await advanceClock(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Order resets in 0 seconds")).toBeOnTheScreen();
  });

  it("restarts the deadline on user interaction — the label goes back up, expiry follows the NEW deadline", async () => {
    const onExpire = jest.fn();
    await renderWithProviders(<SuccessCountdown seconds={5} onExpire={onExpire} />);

    await advanceClock(3_000);
    expect(screen.getByLabelText("Order resets in 2 seconds")).toBeOnTheScreen();

    // Any touch in the countdown's wrapper (the responder grant IS the touch
    // landing): the deadline resets to now + 5s and the label recomputes
    // immediately.
    await fireEvent(screen.getByTestId(COUNTDOWN_TEST_ID), "responderGrant");
    expect(screen.getByLabelText("Order resets in 5 seconds")).toBeOnTheScreen();

    // The OLD deadline (2s away) passes without expiring anything…
    await advanceClock(1_000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Order resets in 4 seconds")).toBeOnTheScreen();

    // …and the NEW deadline still owns the expiry.
    await advanceClock(4_000);
    expect(screen.getByLabelText("Order resets in 0 seconds")).toBeOnTheScreen();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("recomputes on app resume: a deadline that expired while the process was suspended fires immediately, never negative", async () => {
    const onExpire = jest.fn();
    await renderWithProviders(<SuccessCountdown seconds={5} onExpire={onExpire} />);

    // Background the app, then let the WALL clock run past the deadline while
    // the JS thread is frozen (setSystemTime advances the faked clock without
    // firing the frozen interval — the suspended-process shape). The display
    // is the last rendered frame; nothing has expired yet.
    await emitAppState("background");
    jest.setSystemTime(Date.now() + 10_000);
    expect(onExpire).not.toHaveBeenCalled();

    // Resume: the active transition re-checks the deadline and fires NOW —
    // not on the next (drifted) tick — and the label is clamped at zero.
    await emitAppState("active");
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Order resets in 0 seconds")).toBeOnTheScreen();

    // Still zero, still one expiry, after further ticks.
    await advanceClock(3_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Order resets in 0 seconds")).toBeOnTheScreen();
  });

  it("clears its interval on unmount — no further ticks fire after the countdown is gone", async () => {
    const onExpire = jest.fn();
    const { unmount } = await renderWithProviders(
      <SuccessCountdown seconds={2} onExpire={onExpire} />,
    );

    // Unmount inside a proper act window: a bare `unmount()` leaves React
    // 19's internal scheduler jobs unflushed, and the big timer advance
    // below would run them outside any act scope (console noise, and
    // assertions about "no further ticks" that could race those jobs).
    await act(async () => {
      unmount();
    });

    // A whole window's worth of time (and more) with nothing mounted: no
    // expiry, no leak — the interval must have been cleared in the effect
    // teardown (a tablet runs all day; a leaked interval per navigation is
    // exactly the long-lived-session failure mode).
    await advanceClock(30_000);
    expect(onExpire).not.toHaveBeenCalled();
  });
});

it("publishes its re-arm to the screen's reArmRef — a content-root touch restarts the window from OUTSIDE the countdown block (F-T11-01)", async () => {
  const onExpire = jest.fn();
  // The screen's mailbox: the countdown keeps its restart function here.
  const reArmRef: { current: (() => void) | null } = { current: null };
  await renderWithProviders(
    <SuccessCountdown seconds={5} onExpire={onExpire} reArmRef={reArmRef} />,
  );
  expect(typeof reArmRef.current).toBe("function");

  await advanceClock(3_000);
  expect(screen.getByLabelText("Order resets in 2 seconds")).toBeOnTheScreen();

  // The screen-level interaction: the content root's onTouchStart calls the
  // published re-arm — the same restart as a touch inside the block.
  await act(async () => {
    reArmRef.current?.();
  });
  expect(screen.getByLabelText("Order resets in 5 seconds")).toBeOnTheScreen();

  // The old deadline passes; the re-armed deadline owns the expiry.
  await advanceClock(1_000);
  expect(onExpire).not.toHaveBeenCalled();
  await advanceClock(4_000);
  expect(onExpire).toHaveBeenCalledTimes(1);

  // A LATE re-arm after expiry must not resurrect the window.
  await act(async () => {
    reArmRef.current?.();
  });
  await advanceClock(6_000);
  expect(onExpire).toHaveBeenCalledTimes(1);
});

it("clears the reArmRef mailbox on unmount — a stale ref never re-arms a gone countdown (F-T11-01)", async () => {
  const reArmRef: { current: (() => void) | null } = { current: null };
  const { unmount } = await renderWithProviders(
    <SuccessCountdown seconds={5} onExpire={jest.fn()} reArmRef={reArmRef} />,
  );
  expect(typeof reArmRef.current).toBe("function");
  await act(async () => {
    await unmount();
  });
  expect(reArmRef.current).toBeNull();
});
