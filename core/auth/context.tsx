import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppError, toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { clearQueryCache } from "@/core/query";
import { getSupabaseClient } from "@/core/supabase";

import { fetchActiveProfile } from "./profile";
import { runSignOutTasks, type SignOutTaskResult } from "./sign-out";
import { isTabletRole, type ActiveProfile, type AuthStatus } from "./types";

const log = createLogger("auth");

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  profile: ActiveProfile | null;
  error: AppError | null;
};

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves to `blocked` when a registered task vetoes the sign-out. */
  signOut: () => Promise<SignOutTaskResult>;
  /** Re-runs session + profile resolution after a failure. */
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL_STATE: AuthState = {
  status: "resolving",
  session: null,
  profile: null,
  error: null,
};

/**
 * Owns session restoration and identity resolution for the whole app.
 *
 * Deliberately NOT a feature: routing, sign-out safety, and role gating are
 * cross-cutting, and every feature agent would otherwise reinvent them. An
 * `auth` feature may still own the sign-in SCREEN and its form; it consumes
 * `useAuth()` rather than re-implementing this.
 *
 * Must be rendered inside `QueryProvider` — sign-out clears the query cache.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const [resolveToken, setResolveToken] = useState(0);
  const queryClient = useQueryClient();
  // Guards against a slow profile lookup landing after the user signed out.
  const generation = useRef(0);

  const resolveProfile = useCallback(async (session: Session | null) => {
    const current = ++generation.current;

    if (!session) {
      setState({ status: "signedOut", session: null, profile: null, error: null });
      return;
    }

    setState((previous) => ({ ...previous, status: "resolving", session, error: null }));

    try {
      const profile = await fetchActiveProfile();
      if (current !== generation.current) return;

      if (!profile) {
        // Authenticated, but no active profile row. Client routing is UX only —
        // the database would refuse the work anyway.
        log.warn("Signed-in account has no active profile");
        setState({ status: "unauthorized", session, profile: null, error: null });
        return;
      }

      if (!isTabletRole(profile.role)) {
        // Admin is a web application, not a tablet experience.
        log.warn("Signed-in role has no tablet experience", { role: profile.role });
        setState({ status: "unauthorized", session, profile, error: null });
        return;
      }

      setState({ status: "ready", session, profile, error: null });
    } catch (caught) {
      if (current !== generation.current) return;
      const error = toAppError(caught, "We couldn't finish preparing the app.");
      log.error("Failed to resolve profile", error.toLogContext());
      // A network blip at startup must offer a retry, not strand the tablet on
      // a blank screen.
      setState({ status: "error", session, profile: null, error });
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) void resolveProfile(data.session);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        const error = toAppError(caught, "We couldn't restore the session.");
        setState({ status: "error", session: null, profile: null, error });
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      log.debug("auth state change", { event });
      // Keep Realtime's authorization in step with the refreshed token,
      // otherwise subscriptions silently stop delivering after a refresh.
      void supabase.realtime.setAuth(session?.access_token ?? null);
      void resolveProfile(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [resolveProfile, resolveToken]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAppError(error, "We couldn't sign you in. Check the email and password.");
    // `onAuthStateChange` drives the resulting state transition.
  }, []);

  const signOut = useCallback(async (): Promise<SignOutTaskResult> => {
    const gate = await runSignOutTasks();
    if (gate.status === "blocked") return gate;

    generation.current += 1;
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) log.warn("Supabase sign-out reported an error", { message: error.message });

    // Drop cached server data so the next account cannot read it.
    clearQueryCache(queryClient);
    setState({ status: "signedOut", session: null, profile: null, error: null });
    return { status: "ok" };
  }, [queryClient]);

  const retry = useCallback(() => {
    setState(INITIAL_STATE);
    setResolveToken((value) => value + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, retry }),
    [state, signIn, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

/**
 * Convenience for feature code that only runs once a profile exists.
 * Throws rather than returning null so a screen behind the auth gate can rely
 * on the profile without null-checking it everywhere.
 */
export function useActiveProfile(): ActiveProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error("useActiveProfile called outside an authenticated experience.");
  return profile;
}
