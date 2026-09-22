import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * This workflow runs in the `android-release` environment and spends the
 * same ManageEngine credentials the release workflow does. These are config
 * assertions, not behaviour — each pins a property whose silent loss would
 * fail no other test and would not be obvious in review.
 *
 * Read as TEXT, matching tools/release/release-workflow.test.ts: the repo
 * has no YAML parser in its own dependencies.
 */
const WORKFLOW_PATH = join(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "mdm-upload-diagnostic.yml",
);
const source = readFileSync(WORKFLOW_PATH, "utf8");

/** The workflow's trigger block: everything between `on:` and the next top-level key. */
function triggerBlock(): string {
  const start = source.indexOf("\non:\n");
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start + "\non:\n".length);
  const end = rest.search(/\n[a-z]/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the ManageEngine upload diagnostic workflow", () => {
  it("is MANUAL only — no push or pull_request trigger may ever reach it", () => {
    const triggers = [...triggerBlock().matchAll(/^ {2}([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);

    expect(triggers).toEqual(["workflow_dispatch"]);
  });

  it("offers exactly the two variants under test, defaulting to the untested one", () => {
    const block = triggerBlock();

    expect(block).toMatch(/options:\s*\n\s*- legacy_fileName\s*\n\s*- cloud_file/);
    expect(block).toContain("default: legacy_fileName");
  });

  it("takes a run_id input, so it never rebuilds Android to get an APK", () => {
    expect(triggerBlock()).toContain("run_id:");
    expect(source).not.toContain("gradlew assembleRelease");
    expect(source).not.toContain("expo prebuild");
  });

  it("runs in the android-release environment with least privilege", () => {
    expect(source).toMatch(/^\s{4}environment: android-release$/m);
    // Exactly one permissions block: a second one at job level would widen it.
    expect([...source.matchAll(/^[ \t]*permissions[ \t]*:/gm)]).toHaveLength(1);
    expect(source).toMatch(/^permissions:\n {2}contents: read\n {2}actions: read\n/m);
  });

  it("serializes runs and never cancels one mid-flight", () => {
    expect(source).toMatch(/^\s{2}cancel-in-progress: false$/m);
  });

  it("pins every third-party action to an immutable commit SHA", () => {
    const uses = [...source.matchAll(/^\s+- uses: (\S+)/gm)].map((m) => m[1]!);

    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/@[0-9a-f]{40}$/);
  });

  it("fails closed before spending anything when a credential is missing", () => {
    expect(source).toContain("Check every required secret is present (fail closed)");
    expect(source).toContain('exit "$missing"');
  });

  it("never echoes a secret value — only names", () => {
    expect(source).not.toMatch(/echo .*\$\{\{\s*secrets\./);
  });

  it("invokes the probe script, never the production publisher", () => {
    expect(source).toContain("tools/mdm/probe-upload.ts");
    expect(source).not.toContain("tools/mdm/publish-app.ts");
  });
});
