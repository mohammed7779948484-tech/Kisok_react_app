import { createLogger } from "@/core/logging";

const log = createLogger("auth.signOut");

function messageOf(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

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
 * `failed` exists because the alternative is dishonest. Supabase can return an
 * error from a path that leaves the persisted session in storage, and a screen
 * that says "signed out" while the tablet can still silently restore the
 * previous account is precisely the bug that matters on a shared kiosk. Callers
 * must handle `failed` by keeping the user signed in and offering a retry.
 */
export type SignOutOutcome =
  | { status: "ok" }
  | { status: "blocked"; reason: string }
  | { status: "failed"; reason: string };

const guards = new Map<string, SignOutGuard>();
const cleanupTasks = new Map<string, SignOutCleanupTask>();

/**
 * Register a pre-sign-out guard from inside a feature module. Deliberately a
 * registry that features WRITE TO rather than a central list they must EDIT —
 * two feature agents can add a guard without ever touching the same file.
 *
 *   registerSignOutGuard({
 *     name: "checkout",
 *     run: () =>
 *       hasUnresolvedAttempt()
 *         ? { status: "blocked", reason: "An order submission is still unresolved." }
 *         : { status: "ok" },
 *   });
 */
export function registerSignOutGuard(guard: SignOutGuard) {
  guards.set(guard.name, guard);
}

export function unregisterSignOutGuard(name: string) {
  guards.delete(name);
}

/**
 * Register destructive cleanup from inside a feature module. Runs only once
 * every guard — from every feature — has approved the sign-out.
 *
 *   registerSignOutCleanup({ name: "cart", run: () => clearCart() });
 */
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
 *
 * A guard that THROWS is exactly as uncertain as one that returns `blocked`:
 * there is no way to tell whether it is safe to destroy checkout recovery
 * state, and KISOK's answer to "we don't know" is "assume it is not safe" —
 * never "assume it is fine and proceed to tear the session down".
 */
export async function runSignOutGuards(): Promise<SignOutGuardResult> {
  for (const guard of guards.values()) {
    let result: SignOutGuardResult;
    try {
      result = await guard.run();
    } catch (error) {
      log.error("Sign-out guard threw; treating sign-out as blocked", {
        guard: guard.name,
        error: messageOf(error),
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
 * Phase 2 — run every registered cleanup task. Call this ONLY after
 * `runSignOutGuards()` has returned `ok` and the session itself is already
 * gone: cleanup never gets to veto sign-out, so calling it earlier would let
 * a feature destroy its own state ahead of a sibling's guard blocking.
 *
 * One task's failure does not stop the others — a customer's stale cart
 * matters as much as a search feature's stale filters, and by this point the
 * account really is signed out either way, so every task gets its chance
 * rather than the first failure leaving the rest untouched.
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
        error: messageOf(error),
      });
    }
  }
  return { failures };
}
