import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { AppError, toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { clearQueryCache } from "@/core/query";
import { getSupabaseClient } from "@/core/supabase";

import { fetchActiveProfile } from "./profile";
import {
  finishSignOutHandoff,
  prepareSignOutHandoff,
  recoverPendingHandoff,
  runSignOutCleanup,
  runSignOutGuards,
  type SignOutOutcome,
} from "./sign-out";
import { isTabletRole, type ActiveProfile, type AuthStatus } from "./types";

const log = createLogger("auth");
const HANDOFF_IN_FLIGHT_REASON =
  "This tablet is still finishing the previous sign-out safely. Please try again.";

type AuthState = {
  status: AuthStatus;
  profile: ActiveProfile | null;
  error: AppError | null;
};

type AuthContextValue = AuthState & {
  /** Always the current session, read straight from the auth listener. */
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * `blocked` means a guard vetoed before sign-out. `failed` means the auth
   * session may still be usable. `unsafe` means auth is gone but durable kiosk
   * cleanup could not be proven; a later sign-in/startup is blocked until recovery.
   */
  signOut: () => Promise<SignOutOutcome>;
  /** Re-runs session/profile resolution after a failure. */
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type SessionSnapshot = {
  session: Session | null;
  /** False until the first auth event or the initial getSession lands. */
  known: boolean;
};

function handoffRecoveryError(reason: string) {
  return new AppError({
    kind: "unknown",
    userMessage: reason,
    technicalMessage: "Kiosk handoff recovery did not complete",
    retryable: true,
  });
}

/**
 * Owns session restoration and identity resolution for the whole app.
 *
 * Deliberately NOT a feature: routing, sign-out safety, and role gating are
 * cross-cutting, and every feature agent would otherwise reinvent them. An
 * `auth` feature may still own the sign-in SCREEN; it consumes `useAuth()`.
 *
 * Must be rendered inside `QueryProvider` — sign-out clears the query cache.
 *
 * Supabase runs `onAuthStateChange` callbacks while it holds an internal auth
 * lock. The callback therefore records the session synchronously and returns;
 * profile/handoff work happens in effects outside that callback.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({ session: null, known: false });
  const [state, setState] = useState<AuthState>({
    status: "resolving",
    profile: null,
    error: null,
  });
  const [retryToken, setRetryToken] = useState(0);
  const handoffInFlight = useRef(false);
  const queryClient = useQueryClient();

  // ── Stage 1: listen ───────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // MUST stay synchronous. Anything async here — including another Supabase
      // call — risks deadlocking the auth client. Record and return.
      log.debug("auth state change", { event });
      if (active) setSnapshot({ session, known: true });
    });

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active)
          setSnapshot((current) =>
            current.known ? current : { session: data.session, known: true },
          );
      })
      .catch((caught: unknown) => {
        if (!active) return;
        const error = toAppError(caught, "We couldn't restore the session.");
        log.error("Failed to restore session", error.toLogContext());
        setState({ status: "error", profile: null, error });
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [retryToken]);

  // ── Stage 2: recover handoff + resolve profile, outside auth callback ─────
  const userId = snapshot.session?.user.id ?? null;
  const { known } = snapshot;

  useEffect(() => {
    if (!known) return;

    if (!userId) {
      setState({ status: "signedOut", profile: null, error: null });
      return;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, status: "resolving", error: null }));

    void (async () => {
      try {
        // A failed/uncertain sign-out may leave BOTH a valid store-account
        // session and a durable handoff marker. Recover before making the app
        // ready, otherwise a cold restart could expose the previous customer's
        // cart/draft even though sign-out had already entered handoff mode.
        const handoff = await recoverPendingHandoff();
        if (cancelled) return;
        if (handoff.status === "blocked") {
          const error = handoffRecoveryError(handoff.reason);
          log.error("Pending kiosk handoff blocked authenticated startup", error.toLogContext());
          setState({ status: "error", profile: null, error });
          return;
        }

        const profile = await fetchActiveProfile();
        if (cancelled) return;

        if (!profile) {
          log.warn("Signed-in account has no active profile");
          setState({ status: "unauthorized", profile: null, error: null });
          return;
        }

        if (!isTabletRole(profile.role)) {
          log.warn("Signed-in role has no tablet experience", { role: profile.role });
          setState({ status: "unauthorized", profile, error: null });
          return;
        }

        setState({ status: "ready", profile, error: null });
      } catch (caught) {
        if (cancelled) return;
        const error = toAppError(caught, "We couldn't finish preparing the app.");
        log.error("Failed to resolve profile", error.toLogContext());
        setState({ status: "error", profile: null, error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, known, retryToken]);

  // ── Stage 3: keep Realtime's token current ────────────────────────────────
  const accessToken = snapshot.session?.access_token ?? null;

  useEffect(() => {
    if (!known) return;
    void getSupabaseClient().realtime.setAuth(accessToken);
  }, [accessToken, known]);

  const signIn = useCallback(async (email: string, password: string) => {
    // Supabase may publish SIGNED_OUT before the feature cleanup that follows
    // has finished. Never let the next account authenticate into that same
    // process while the previous account's cleanup is still able to mutate
    // local state. The durable marker covers cold restarts; this ref covers the
    // same-process concurrency window.
    if (handoffInFlight.current) throw handoffRecoveryError(HANDOFF_IN_FLIGHT_REASON);

    // Signed-out startup does not resolve a profile, so recover here too before
    // a new account may authenticate onto the shared tablet.
    const handoff = await recoverPendingHandoff();
    if (handoff.status === "blocked") throw handoffRecoveryError(handoff.reason);

    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAppError(error, "We couldn't sign you in. Check the email and password.");
    // The listener drives the resulting state transition.
  }, []);

  const signOut = useCallback(async (): Promise<SignOutOutcome> => {
    // Phase 1 — all side-effect-free guards approve before anything is changed.
    const gate = await runSignOutGuards();
    if (gate.status === "blocked") return gate;

    // This lock spans the whole prepared handoff. A SIGNED_OUT auth event may
    // make the sign-in route visible before cleanup resolves, but signIn() above
    // remains fail-closed until this finally block runs.
    if (handoffInFlight.current) {
      return { status: "failed", reason: HANDOFF_IN_FLIGHT_REASON };
    }
    handoffInFlight.current = true;

    try {
      // Persist a fail-closed marker BEFORE auth is touched. If this cannot be
      // durable, refuse sign-out so a cold restart cannot forget an incomplete
      // customer handoff.
      const prepared = await prepareSignOutHandoff();
      if (prepared.status === "failed") return prepared;

      const supabase = getSupabaseClient();

      // `scope: "local"` signs out THIS device only. The default is global and
      // would revoke the same store account on every tablet.
      let error: { message: string } | null;
      try {
        ({ error } = await supabase.auth.signOut({ scope: "local" }));
      } catch (caught) {
        log.error("Supabase sign-out threw instead of returning a result", {
          message: toAppError(caught).technicalMessage,
        });
        return {
          status: "failed",
          reason: "We couldn't finish signing out. Please try again.",
        };
      }

      if (error) {
        const remaining = await supabase.auth
          .getSession()
          .then(({ data }) => data.session)
          .catch(() => undefined);

        if (remaining !== null) {
          log.error("Sign-out failed and the stored session may still be valid", {
            message: error.message,
            sessionState: remaining === undefined ? "unknown" : "still-present",
          });
          return {
            status: "failed",
            reason: "We couldn't finish signing out. Please try again.",
          };
        }

        log.warn("Supabase sign-out reported an error but the local session was cleared", {
          message: error.message,
        });
      }

      // Phase 2 — feature cleanup after the local auth session is gone.
      const cleanup = await runSignOutCleanup();
      clearQueryCache(queryClient);
      setSnapshot({ session: null, known: true });

      // Phase 3 — prove the tablet is safe to hand to another person. Any failed
      // feature cleanup triggers a namespace-wide KISOK reset. If that reset also
      // fails, the durable marker remains and future sign-in/startup is fail-closed.
      const handoff = await finishSignOutHandoff(cleanup.failures);
      if (handoff.status === "unsafe") return handoff;

      return { status: "ok" };
    } finally {
      handoffInFlight.current = false;
    }
  }, [queryClient]);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, session: snapshot.session, signIn, signOut, retry }),
    [state, snapshot.session, signIn, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

export function useActiveProfile(): ActiveProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error("useActiveProfile called outside an authenticated experience.");
  return profile;
}
