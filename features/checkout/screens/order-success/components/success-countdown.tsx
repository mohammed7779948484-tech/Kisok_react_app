import { useCallback, useEffect, useRef, useState } from "react";

import { AppState, View, type AppStateStatus } from "react-native";

import { Progress, Text } from "@/components/ui";

/**
 * The Order Success inactivity countdown (T11, plan D10 — deadline-based).
 *
 * The countdown holds an absolute DEADLINE (`Date.now() + seconds`) and
 * recomputes the remaining time from the wall clock on every tick. It never
 * counts accumulated ticks: a tick counter drifts the moment the process is
 * suspended (Android freezes the JS thread's timers while backgrounded while
 * the wall clock keeps running), which is exactly the situation this screen
 * must survive on a shared store tablet. Three things recompute the deadline
 * against the clock:
 *
 * - a 1s interval while the screen is in the FOREGROUND (the visible
 *   progress), cleared in the effect teardown — a tablet runs all day and a
 *   leaked interval per navigation is the long-lived-session failure mode;
 * - any AppState `active` transition (resume): an expired deadline fires
 *   IMMEDIATELY on resume instead of waiting for the next (drifted) tick;
 * - any user interaction: within this block the wrapper CLAIMS the
 *   responder (`onStartShouldSetResponder` → true) and restarts on
 *   `onResponderGrant` — safe because the block's children are plain
 *   display (a Text and a Progress, nothing pressable) and the screen's
 *   action buttons are siblings of this wrapper. For interaction on the
 *   REST of the success surface (scrolling/reading the submitted items),
 *   the screen mounts a pass-through touch listener on its content root —
 *   a plain `onTouchStart`, which never enters responder negotiation — and
 *   calls the `reArmRef` this component publishes (F-T11-01: "any user
 *   interaction" means the reading customer, not just the footer block).
 *
 * `onExpire` fires ONCE (the ref guard); the display clamps at zero and can
 * never show a negative remaining time.
 *
 * Display: the `Progress` primitive's REQUIRED `accessibilityLabel` follows
 * its own documented convention — "Order resets in 12 seconds" — and the
 * visible `Text` carries the same words so the accessible name and the
 * screen agree (a per-second live region would be noise on a kiosk; the
 * label still updates every tick for assistive technology that reads it).
 * Scope: private to the order-success screen — one consumer, so it lives in
 * this screen's `components/` next door. It receives data and reports
 * upward; no store, no navigation, no fetching, and no Supabase anywhere.
 */
export type SuccessCountdownProps = {
  /**
   * The configured inactivity window, in whole seconds — the screen derives
   * it from `customer_success_reset_seconds` (D6's settings seam) with its
   * own documented fallback.
   */
  seconds: number;
  /** Fired ONCE when the deadline passes. The screen's gated reset. */
  onExpire: () => void;
  /**
   * Optional mailbox for the screen-level interaction re-arm (F-T11-01).
   * The countdown keeps its `restart` function here so the screen's
   * content-root touch listener can re-arm the window for touches OUTSIDE
   * this block. A plain mutable ref object, not forwardRef — simplest to
   * consume from the screen and to test. Cleared on unmount.
   */
  reArmRef?: { current: (() => void) | null };
};

export function SuccessCountdown({ seconds, onExpire, reArmRef }: SuccessCountdownProps) {
  // The absolute deadline (epoch ms). A ref, not state: the deadline is what
  // the countdown IS, and the interval/resume readers must always see the
  // latest value without re-subscribing on every re-arm.
  const deadlineRef = useRef(Date.now() + seconds * 1000);
  // The DISPLAYED remaining seconds — derived from the deadline on every
  // recompute, never accumulated.
  const [remaining, setRemaining] = useState(seconds);
  // The single-expiry guard: `onExpire` fires once per armed countdown.
  const expiredRef = useRef(false);
  // The parent's callback held in a ref so the effects below stay keyed on
  // stable identities (an inline `onExpire` from the screen would otherwise
  // tear down and re-create the interval on every render).
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  /**
   * Recompute the remaining time from the wall clock — the ONE deadline
   * reader the interval and the resume path share. Clamps at zero and fires
   * the expiry exactly once when the deadline has passed.
   */
  const recomputeFromClock = useCallback(() => {
    const remainingMs = deadlineRef.current - Date.now();
    if (remainingMs <= 0) {
      setRemaining(0);
      if (!expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
      return;
    }
    setRemaining(Math.ceil(remainingMs / 1000));
  }, []);

  // (Re)arm whenever the configured window changes: the deadline is always
  // now + seconds, never a leftover from a previous duration.
  useEffect(() => {
    deadlineRef.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
  }, [seconds]);

  // The 1s foreground tick. Keyed on the stable recompute callback only, and
  // cleared in teardown — the interval is legitimate here precisely because
  // it is removed on unmount.
  useEffect(() => {
    const interval = setInterval(recomputeFromClock, 1_000);
    return () => clearInterval(interval);
  }, [recomputeFromClock]);

  // App resume: an active transition re-checks the deadline against the wall
  // clock immediately — a deadline that expired while the process was
  // suspended fires NOW, never on the next drifted tick.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      if (status === "active") {
        recomputeFromClock();
      }
    });
    return () => subscription.remove();
  }, [recomputeFromClock]);

  /** Re-arm the deadline after user interaction — the window restarts. */
  const restart = useCallback(() => {
    // After expiry the countdown is finished; a late touch must not resurrect
    // a window the screen has already acted on.
    if (expiredRef.current) return;
    deadlineRef.current = Date.now() + seconds * 1000;
    setRemaining(seconds);
  }, [seconds]);

  // Publish the re-arm to the screen (F-T11-01): the content-root touch
  // listener calls this for interaction anywhere on the success surface.
  // Cleared on unmount so a stale ref never re-arms an unmounted countdown.
  useEffect(() => {
    if (!reArmRef) return;
    reArmRef.current = restart;
    return () => {
      reArmRef.current = null;
    };
  }, [reArmRef, restart]);

  const label = `Order resets in ${remaining} ${remaining === 1 ? "second" : "seconds"}`;
  const percent = seconds > 0 ? (remaining / seconds) * 100 : 0;

  return (
    // The interaction wrapper: any touch in this block restarts the window.
    // The wrapper CLAIMS the responder (`onStartShouldSetResponder` → true)
    // and restarts on `onResponderGrant` — the touch START is the
    // interaction, not the release. The block's children are plain display
    // (a Text and a Progress — nothing pressable), so claiming costs
    // nothing, and the footer's Next Customer button is a SIBLING of this
    // wrapper, so its gestures are unaffected.
    <View
      testID="success-countdown"
      className="gap-2"
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => {
        restart();
      }}
    >
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Progress value={percent} accessibilityLabel={label} />
    </View>
  );
}
