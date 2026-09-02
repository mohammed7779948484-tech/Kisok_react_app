import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

/**
 * AC-04 static safety pin — NO app-owned lock-task calls, ever.
 *
 * Kiosk enforcement is MDM/DPC-owned (plan Design decision 1): the app only
 * READS lock-task state as corroboration; it never calls
 * `startLockTask`/`stopLockTask`. This test is a permanent regression pin, not
 * a RED case: it passes trivially today, and that is the point — the day
 * someone "helpfully" pins the screen from JS, this suite goes red.
 *
 * Scope (deliberate):
 * - app-owned trees only: `app/`, `core/`, `components/`, `features/`.
 * - NOT `modules/` — that is the native module's own home, and its Kotlin
 *   only READS lock-task state; NOT `node_modules`, NOT the generated
 *   `android/`/`ios/` trees, NOT root config like `app.config.ts` (which only
 *   documents the policy in comments and declares `lockTaskMode` for the OS).
 * - Only source files: the feature's `docs/*.md` legitimately SAY
 *   "startLockTask" (the rule itself), so prose is not scanned.
 *
 * The pattern requires a CALL shape (`name(`), so a comment mentioning the
 * API by name would not trip it — but none exists in the scanned trees today,
 * and any future mention that includes a call shape is exactly the ambiguity
 * this pin should force a human to resolve.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

/** The trees whose code the app itself owns. */
const APP_OWNED_TREES = ["app", "core", "components", "features"] as const;

/** Source extensions that can contain executable code. */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

/** A call site of either lock-task API: the identifier immediately followed
 *  by an argument list. Written here as a constructed string so this file
 *  cannot match its own guard — the test has to NAME the APIs to pin them. */
const LOCK_TASK_CALL = new RegExp(`\\b(?:${"start"}LockTask|${"stop"}LockTask)\\s*\\(`);

function listSourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(entryPath, collected);
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      collected.push(entryPath);
    }
  }
  return collected;
}

describe("static lock-task guard (AC-04)", () => {
  it("app-owned code contains no startLockTask/stopLockTask call sites", () => {
    const offenders: string[] = [];

    for (const tree of APP_OWNED_TREES) {
      for (const file of listSourceFiles(join(REPO_ROOT, tree))) {
        if (LOCK_TASK_CALL.test(readFileSync(file, "utf8"))) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
