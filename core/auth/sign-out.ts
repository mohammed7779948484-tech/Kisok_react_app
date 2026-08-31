import { toAppError } from "@/core/errors";
import { createLogger } from "@/core/logging";
import { clearKisokStorage, storage, storageKey } from "@/core/storage";

const log = createLogger("auth.signOut");
const HANDOFF_MARKER_KEY = storageKey("auth", "handoff-pending");
const HANDOFF_MARKER_VERSION = 1;
const HANDOFF_REASON =
  "This tablet couldn't finish clearing the previous session safely. Please retry before signing in again.";

/**
 * A GUARD run before anything about the session is touched.
 *
 * Side-effect-free by contract: a guard only DECIDES whether it is safe to
 * proceed, never destroys or mutates anything. Returning `blocked` ABORTS
 * sign-out before any cleanup task — from this feature or any other — runs.
 *
 * This exists because of a hard KISOK safety invariant: if a checkout
 * attempt's outcome is still ambiguous, wiping the cart and its idempotency
 * metadata could cause a duplicate order. The checkout feature registers a
 * guard that blocks until the attempt is resolved, and does its cleanup
 * (clearing the cart) as a separate `SignOutCleanupTask` instead — never in
 * this same function. A single task that both checked AND cleaned up would
 * make the safety property depend on registration order: if that task ran
 * before another feature's guard blocked, its cleanup would already have
 * happened by the time the block was discovered.
 */
export type SignOutGuardResult = { status: "ok" } | { status: "blocked"; reason: string };

export type SignOutGuard = {
  /** Used in logs and in the message shown when sign-out is blocked. */
  name: string;
  run: () => Promise<SignOutGuardResult> | SignOutGuardResult;
};

/**
 * Destructive teardown for a feature's own state — clearing a cart, resetting
 * search filters, wiping a draft. Runs ONLY after every guard has approved,
 * and never gets a say in whether sign-out proceeds: by the time this runs,
 * the actual Supabase session is already gone (or never existed), so there is
 * nothing left to protect by blocking here.
 */
export type SignOutCleanupTask = {
  /** Used in logs when this task's cleanup fails. */
  name: string;
  run: () => Promise<void> | void;
};

/**
 * What actually happened when the user asked to sign out.
 *
 * `failed` means the session may still be usable, so the current account must
 * remain in control of the tablet. `unsafe` means the auth session is gone but
 * local kiosk handoff could not be proven clean; a new sign-in is blocked until
 * the durable handoff recovery succeeds.
 */
export type SignOutOutcome =
  | { status: "ok" }
  | { status: "blocked"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "unsafe"; reason: string };

const guards = new Map<string, SignOutGuard>();
const cleanupTasks = new Map<string, SignOutCleanupTask>();

/**
 * Register a pre-sign-out guard from inside a feature module. Deliberately a
 * registry that features WRITE TO rather than a central list they must EDIT —
 * two feature agents can add a guard without ever touching the same file.
 */
export function registerSignOutGuard(guard: SignOutGuard) {
  guards.set(guard.name, guard);
}

export function unregisterSignOutGuard(name: string) {
  guards.delete(name);
}

/** Register destructive cleanup from inside a feature module. */
export function registerSignOutCleanup(task: SignOutCleanupTask) {
  cleanupTasks.set(task.name, task);
}

export function unregisterSignOutCleanup(name: string) {
  cleanupTasks.delete(name);
}

/** Test helper. Clears both registries. */
export function clearSignOutTasks() {
  guards.clear();
  cleanupTasks.clear();
}

/**
 * Phase 1 — run every registered guard, in registration order, stopping at
 * the first block so no LATER guard and no cleanup task ever runs.
 */
export async function runSignOutGuards(): Promise<SignOutGuardResult> {
  for (const guard of guards.values()) {
    let result: SignOutGuardResult;
    try {
      result = await guard.run();
    } catch (error) {
      log.error("Sign-out guard threw; treating sign-out as blocked", {
        guard: guard.name,
        error: toAppError(error).technicalMessage,
      });
      return {
        status: "blocked",
        reason: "We couldn't confirm it's safe to sign out. Please try again.",
      };
    }
    if (result.status === "blocked") {
      log.warn("Sign-out blocked", { guard: guard.name, reason: result.reason });
      return result;
    }
  }
  return { status: "ok" };
}

/**
 * Phase 2 — run every registered cleanup task after the session is gone.
 * Every task gets a chance even if an earlier cleanup fails.
 */
export async function runSignOutCleanup(): Promise<{ failures: string[] }> {
  const failures: string[] = [];
  for (const task of cleanupTasks.values()) {
    try {
      await task.run();
    } catch (error) {
      failures.push(task.name);
      log.error("Sign-out cleanup task failed; the session is already gone", {
        task: task.name,
        error: toAppError(error).technicalMessage,
      });
    }
  }
  return { failures };
}

function parseHandoffMarker(raw: unknown): true {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    "pending" in raw &&
    (raw as { version?: unknown }).version === HANDOFF_MARKER_VERSION &&
    (raw as { pending?: unknown }).pending === true
  ) {
    return true;
  }
  throw new Error("Invalid kiosk handoff marker");
}

/**
 * Persist a fail-closed marker BEFORE the local auth session is removed. If
 * this write cannot be made durable, sign-out must not proceed: otherwise a
 * later cleanup failure followed by a cold restart could forget that the
 * tablet was unsafe and expose stale customer state to the next person.
 */
export async function prepareSignOutHandoff(): Promise<
  { status: "ok" } | { status: "failed"; reason: string }
> {
  const result = await storage.write(HANDOFF_MARKER_KEY, {
    version: HANDOFF_MARKER_VERSION,
    pending: true,
  });
  if (result.status === "persisted") return { status: "ok" };

  log.error("Could not persist kiosk handoff marker; refusing to sign out", {
    error: result.error.message,
  });
  return {
    status: "failed",
    reason: "We couldn't prepare this tablet to sign out safely. Please try again.",
  };
}

/**
 * Complete a sign-out handoff. Normal cleanup success removes only the marker.
 * If any feature cleanup failed, wipe the whole KISOK-owned storage namespace
 * as an emergency fallback so no stale cart/draft can survive for the next
 * customer. If even that cannot be proven, return `unsafe` and leave the
 * durable marker in place.
 */
export async function finishSignOutHandoff(
  cleanupFailures: readonly string[],
): Promise<{ status: "ok" } | { status: "unsafe"; reason: string }> {
  if (cleanupFailures.length === 0) {
    const removed = await storage.remove(HANDOFF_MARKER_KEY);
    if (removed.status === "persisted") return { status: "ok" };
    log.error("Could not remove kiosk handoff marker after clean sign-out", {
      error: removed.error.message,
    });
  } else {
    log.error("Feature cleanup failed; using emergency KISOK storage reset", {
      failures: cleanupFailures,
    });
  }

  const reset = await clearKisokStorage();
  if (reset.status === "persisted") return { status: "ok" };

  log.error("Emergency KISOK storage reset failed; handoff remains unsafe", {
    error: reset.error.message,
  });
  return { status: "unsafe", reason: HANDOFF_REASON };
}

/**
 * Called before every sign-in. A marker means a prior sign-out reached the
 * point where the previous session may have left durable feature state behind.
 * Recover by clearing ONLY KISOK-owned storage. A corrupt/unreadable marker is
 * treated the same as a present one: uncertainty is not permission to hand the
 * kiosk to another customer.
 */
export async function recoverPendingHandoff(): Promise<
  { status: "ok" } | { status: "blocked"; reason: string }
> {
  const marker = await storage.read(HANDOFF_MARKER_KEY, parseHandoffMarker);
  if (marker.status === "miss") return { status: "ok" };

  if (marker.status === "rejected") {
    log.error("Kiosk handoff marker could not be read; attempting emergency reset", {
      error: marker.error.message,
    });
  } else {
    log.warn("Pending kiosk handoff detected before sign-in; attempting emergency reset");
  }

  const reset = await clearKisokStorage();
  if (reset.status === "rejected") {
    log.error("Pending kiosk handoff recovery failed", { error: reset.error.message });
    return { status: "blocked", reason: HANDOFF_REASON };
  }

  const confirmation = await storage.read(HANDOFF_MARKER_KEY, parseHandoffMarker);
  if (confirmation.status === "miss") return { status: "ok" };

  log.error("Kiosk handoff marker still present after emergency reset");
  return { status: "blocked", reason: HANDOFF_REASON };
}
