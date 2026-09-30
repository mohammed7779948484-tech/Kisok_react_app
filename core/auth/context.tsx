import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { toAppError, type AppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { clearQueryCache } from "@/core/query";
import { getSupabaseClient } from "@/core/supabase";

import { fetchActiveProfile } from "./profile";
import { isTabletRole, type ActiveProfile, type AuthStatus } from "./types";

const log = createLogger("auth");
const SIGN_OUT_FAILED = "We couldn't finish signing out. Please try again.";

/** `failed` means the session may still be usable, so the current account stays in control. */
export type SignOutOutcome = { status: "ok" } | { status: "failed"; reason: string };

type AuthState = {
  status: AuthStatus;
  profile: ActiveProfile | null;
  error: AppError | null;
};

type AuthContextValue = AuthState & {
  /** Always the current session, read straight from the auth listener. */
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign out this device. `failed` means the session may still be usable. */
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

/**
 * Owns session restoration and identity resolution for the whole app.
 *
 * Deliberately NOT a feature: routing, sign-out and role gating are
 * cross-cutting, and every feature agent would otherwise reinvent them. An
 * `auth` feature may still own the sign-in SCREEN; it consumes `useAuth()`.
 *
 * Must be rendered inside `QueryProvider` — sign-out clears the query cache.
 *
 * Supabase runs `onAuthStateChange` callbacks while it holds an internal auth
 * lock. The callback therefore records the session synchronously and returns;
 * profile work happens in effects outside that callback.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({ session: null, known: false });
  const [state, setState] = useState<AuthState>({
    status: "resolving",
    profile: null,
    error: null,
  });
  const [retryToken, setRetryToken] = useState(0);
  const signingOut = useRef(false);
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

  // ── Stage 2: resolve the profile, outside the auth callback ───────────────
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
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
    if (error) throw toAppError(error, "We couldn't sign you in. Check the email and password.");
    // The listener drives the resulting state transition.
  }, []);

  const signOut = useCallback(async (): Promise<SignOutOutcome> => {
    if (signingOut.current) return { status: "failed", reason: SIGN_OUT_FAILED };
    signingOut.current = true;
    try {
      const supabase = getSupabaseClient();
      // `scope: "local"` signs out THIS device only. The default is global and
      // would revoke the same store account on every tablet.
      let error: { message: string } | null;
      try {
        ({ error } = await supabase.auth.signOut({ scope: "local" }));
      } catch (caught) {
        log.error("Supabase sign-out threw", { message: toAppError(caught).technicalMessage });
        return { status: "failed", reason: SIGN_OUT_FAILED };
      }

      if (error) {
        const remaining = await supabase.auth
          .getSession()
          .then(({ data }) => data.session)
          .catch(() => undefined);
        if (remaining !== null) {
          log.error("Sign-out failed and the stored session may still be valid", {
            message: error.message,
          });
          return { status: "failed", reason: SIGN_OUT_FAILED };
        }
        log.warn("Sign-out reported an error but the local session was cleared", {
          message: error.message,
        });
      }

      // Nothing one account read may be shown to the next.
      clearQueryCache(queryClient);
      setSnapshot({ session: null, known: true });
      return { status: "ok" };
    } finally {
      signingOut.current = false;
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
