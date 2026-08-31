import { useCallback, useRef, useState } from "react";

import { toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";

import { useAuth } from "./context";

const log = createLogger("auth.signOutAction");

type SignOutActionState = {
  /** Run the sign-out. Safe to wire straight to `onPress`. */
  run: () => void;
  /** True while it is in flight — disable the control. */
  pending: boolean;
  /**
   * Set when sign-out cannot complete safely: a guard blocked it, the auth
   * session may still be usable, or auth is gone but kiosk handoff cleanup is
   * still unsafe. Null when idle or fully successful.
   */
  message: string | null;
};

/**
 * Sign out and surface every non-success outcome.
 *
 * Exists so a screen cannot accidentally discard sign-out safety with
 * `void signOut()`. On full success nothing is rendered: the auth gate has
 * already moved the user to the sign-in screen.
 */
export function useSignOutAction(): SignOutActionState {
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);

    void (async () => {
      try {
        const outcome = await signOut();
        if (outcome.status !== "ok") setMessage(outcome.reason);
      } catch (error) {
        // Fail CLOSED. Known sign-out failures are represented as outcomes, but
        // this remains the backstop for an unexpected runtime exception.
        log.error("signOut() threw unexpectedly", { message: toAppError(error).technicalMessage });
        setMessage("We couldn't finish signing out. Please try again.");
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    })();
  }, [signOut]);

  return { run, pending, message };
}
