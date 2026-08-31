import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AppError, toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { clearQueryCache } from "@/core/query";
import { getSupabaseClient } from "@/core/supabase";

import { fetchActiveProfile } from "./profile";
import { runSignOutCleanup, runSignOutGuards, type SignOutOutcome } from "./sign-out";
import { isTabletRole, type ActiveProfile, type AuthStatus } from "./types";

const log = createLogger("auth");

/**
 * Derived state. The session itself is NOT stored here — it lives in the
 * snapshot below and is exposed from there, so there is exactly one copy. A
 * second copy would go stale on token refresh, which deliberately does not
 * re-resolve the profile.
 */
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
   * Resolves to `blocked` when a registered task vetoes the sign-out, and to
   * `failed` when the session may still be usable. Only `ok` means signed out.
   */
  signOut: () => Promise<SignOutOutcome>;
  /** Re-runs profile resolution after a failure. */
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** What the auth listener knows, kept separate from what we derive from it. */
type SessionSnapshot = {
  session: Session | null;
  /** False until the first auth event or the initial getSession lands. */
  known: boolean;
};

/**
 * Owns session restoration and identity resolution for the whole app.
 *
 * Deliberately NOT a feature: routing, sign-out safety, and role gating are
 * cross-cutting, and every feature agent would otherwise reinvent them. An
 * `auth` feature may still own the sign-in SCREEN; it consumes `useAuth()`.
 *
 * Must be rendered inside `QueryProvider` — sign-out clears the query cache.
 *
 * ── Lifecycle, in three separate stages ────────────────────────────────────
 *
 * The stages are split on purpose. Supabase runs `onAuthStateChange` callbacks
 * while it holds an internal auth lock, and calling back into the Supabase
 * client from inside one can deadlock — the client waits on a lock the callback
 * is holding, and the app hangs on the startup screen with no error. So:
 *
 *   1. LISTEN   — the callback does nothing but record the session in state.
 *                 No awaits, no Supabase calls, no async work of any kind.
 *   2. RESOLVE  — a separate effect, running outside the callback, fetches the
 *                 active profile whenever the signed-in USER changes.
 *   3. REALTIME — another effect keeps Realtime's token current.
 *
 * Stage 2 keys on the user id rather than the session object: a token refresh
 * produces a new session for the same user, and re-fetching the profile on every
 * refresh would be pointless load and would flicker the UI.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>({ session: null, known: false });
  const [state, setState] = useState<AuthState>({
    status: "resolving",
    profile: null,
    error: null,
  });
  const [retryToken, setRetryToken] = useState(0);
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

    // Belt and braces alongside the listener's INITIAL_SESSION event. If that
    // event ever fails to arrive the app would sit on the startup screen
    // forever, and stage 2 de-duplicates by user id so this costs nothing.
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
    // `retryToken` re-runs this stage too: if `getSession` failed, retrying only
    // stage 2 would do nothing, because `known` never became true.
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

    // Cleanup flips this, so a slow lookup that lands after the user changed —
    // or after sign-out — cannot overwrite newer state.
    let cancelled = false;
    setState((previous) => ({ ...previous, status: "resolving", error: null }));

    void (async () => {
      try {
        const profile = await fetchActiveProfile();
        if (cancelled) return;

        if (!profile) {
          // Authenticated, but no active profile row. Client routing is UX only —
          // the database would refuse the work anyway.
          log.warn("Signed-in account has no active profile");
          setState({ status: "unauthorized", profile: null, error: null });
          return;
        }

        if (!isTabletRole(profile.role)) {
          // Admin is a web application, not a tablet experience.
          log.warn("Signed-in role has no tablet experience", { role: profile.role });
          setState({ status: "unauthorized", profile, error: null });
          return;
        }

        setState({ status: "ready", profile, error: null });
      } catch (caught) {
        if (cancelled) return;
        const error = toAppError(caught, "We couldn't finish preparing the app.");
        log.error("Failed to resolve profile", error.toLogContext());
        // A network blip at startup must offer a retry, not strand the tablet on
        // a blank screen.
        setState({ status: "error", profile: null, error });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Keyed on the user, not the session: a token refresh produces a new session
    // for the same user and must not re-fetch an unchanged profile. The session
    // is read from the snapshot, so nothing goes stale by leaving it out.
  }, [userId, known, retryToken]);

  // ── Stage 3: keep Realtime's token current ────────────────────────────────
  const accessToken = snapshot.session?.access_token ?? null;

  useEffect(() => {
    if (!known) return;
    // Also outside the auth callback: `setAuth` goes through the same client.
    // Without this, subscriptions silently stop delivering after a token refresh.
    void getSupabaseClient().realtime.setAuth(accessToken);
  }, [accessToken, known]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAppError(error, "We couldn't sign you in. Check the email and password.");
    // The listener drives the resulting state transition.
  }, []);

  const signOut = useCallback(async (): Promise<SignOutOutcome> => {
    // Phase 1 — GUARDS. Side-effect-free by contract, run to completion before
    // anything below is touched. Nothing below this line is reversible: an
    // unresolved checkout must never have its recovery state destroyed, and a
    // guard that throws is treated exactly like one that blocks (see
    // `runSignOutGuards`) — "uncertain" is never treated as "safe to proceed".
    const gate = await runSignOutGuards();
    if (gate.status === "blocked") return gate;

    const supabase = getSupabaseClient();

    // `scope: "local"` signs out THIS device only. The supabase-js default is
    // "global", which revokes every refresh token for the account — and KISOK
    // tablets share store-provisioned accounts, so one tablet signing out would
    // knock out every other tablet in the shop. Revoking everywhere is a
    // deliberate admin action, not what a customer finishing an order means.
    let error: { message: string } | null;
    try {
      ({ error } = await supabase.auth.signOut({ scope: "local" }));
    } catch (caught) {
      // An unexpected THROW is exactly as uncertain as a returned error: we
      // cannot tell whether the stored session survived it, so fail closed the
      // same way the "may still be usable" branch below does, rather than
      // letting this escape as a rejected promise.
      log.error("Supabase sign-out threw instead of returning a result", {
        message: toAppError(caught).technicalMessage,
      });
      return {
        status: "failed",
        reason: "We couldn't finish signing out. Please try again.",
      };
    }

    if (error) {
      // Ambiguous: most supabase-js error paths still clear the stored session,
      // but the one that fails while READING the session returns early and
      // leaves it in place. From out here the two are indistinguishable, so ask
      // rather than assume — the next customer must not inherit this session.
      const remaining = await supabase.auth
        .getSession()
        .then(({ data }) => data.session)
        .catch(() => undefined);

      if (remaining !== null) {
        // Either a session is still stored, or we could not even determine that.
        // Both mean: do not tell anyone they are signed out.
        log.error("Sign-out failed and the stored session may still be valid", {
          message: error.message,
          sessionState: remaining === undefined ? "unknown" : "still-present",
        });
        return {
          status: "failed",
          reason: "We couldn't finish signing out. Please try again.",
        };
      }

      // The local session is genuinely gone; only the server call failed.
      log.warn("Supabase sign-out reported an error but the local session was cleared", {
        message: error.message,
      });
    }

    // Phase 2 — CLEANUP. Reached only now that we are COMMITTED to reporting
    // success: the actual session is gone, so there is nothing left to protect
    // by holding off. A cleanup task's own failure is logged inside
    // `runSignOutCleanup`, never re-thrown — the account really is signed out
    // at this point; only a feature's own stale local state is at stake.
    await runSignOutCleanup();
    clearQueryCache(queryClient);
    setSnapshot({ session: null, known: true });
    return { status: "ok" };
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

/**
 * Convenience for feature code that only runs once a profile exists.
 * Throws rather than returning null so a screen behind the auth gate can rely on
 * the profile without null-checking it everywhere.
 */
export function useActiveProfile(): ActiveProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error("useActiveProfile called outside an authenticated experience.");
  return profile;
}
