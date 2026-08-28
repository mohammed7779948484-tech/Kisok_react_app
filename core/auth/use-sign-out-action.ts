import { useCallback, useRef, useState } from "react";

import { useAuth } from "./context";

type SignOutActionState = {
  /** Run the sign-out. Safe to wire straight to `onPress`. */
  run: () => void;
  /** True while it is in flight — disable the control. */
  pending: boolean;
  /**
   * Set when the sign-out did NOT happen: either a safety task blocked it, or it
   * failed and the session may still be usable. Show this to the user; a silent
   * failure here is what leaves the next kiosk customer inside someone else's
   * session. Null when idle or successful.
   */
  message: string | null;
};

/**
 * Sign out, and surface the outcome.
 *
 * Exists so that no screen has to remember that `signOut()` has three outcomes.
 * `void signOut()` compiles perfectly and silently discards both failure modes,
 * so the correct handling is packaged once here rather than left to every
 * feature agent to rediscover.
 *
 * On success nothing is rendered: the auth gate has already moved the user to
 * the sign-in screen.
 */
export function useSignOutAction(): SignOutActionState {
  const { signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Guards against a double tap starting a second sign-out while the first is
  // still running its safety tasks.
  const inFlight = useRef(false);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);

    void (async () => {
      try {
        const outcome = await signOut();
        if (outcome.status === "blocked" || outcome.status === "failed") {
          setMessage(outcome.reason);
        }
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    })();
  }, [signOut]);

  return { run, pending, message };
}
