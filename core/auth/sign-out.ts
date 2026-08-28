import { createLogger } from "@/core/logging";

const log = createLogger("auth.signOut");

/**
 * A task run before the session is torn down.
 *
 * Returning `blocked` ABORTS sign-out. This exists because of a hard KISOK
 * safety invariant: if a checkout attempt's outcome is still ambiguous, wiping
 * the cart and its idempotency metadata could cause a duplicate order. The
 * checkout feature registers a task that blocks until the attempt is resolved.
 */
export type SignOutTaskResult = { status: "ok" } | { status: "blocked"; reason: string };

export type SignOutTask = {
  /** Used in logs and in the message shown when sign-out is blocked. */
  name: string;
  run: () => Promise<SignOutTaskResult> | SignOutTaskResult;
};

const tasks = new Map<string, SignOutTask>();

/**
 * Register cleanup from inside a feature module. Deliberately a registry that
 * features WRITE TO rather than a central list they must EDIT — two feature
 * agents can add cleanup without ever touching the same file.
 *
 *   registerSignOutTask({ name: "cart", run: async () => { ... } });
 */
export function registerSignOutTask(task: SignOutTask) {
  tasks.set(task.name, task);
}

export function unregisterSignOutTask(name: string) {
  tasks.delete(name);
}

/** Test helper. */
export function clearSignOutTasks() {
  tasks.clear();
}

/**
 * Run every registered task. Stops at the first block so a blocked sign-out
 * leaves the remaining state untouched.
 */
export async function runSignOutTasks(): Promise<SignOutTaskResult> {
  for (const task of tasks.values()) {
    const result = await task.run();
    if (result.status === "blocked") {
      log.warn("Sign-out blocked", { task: task.name, reason: result.reason });
      return result;
    }
  }
  return { status: "ok" };
}
