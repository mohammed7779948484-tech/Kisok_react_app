import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The release workflow is the only thing in this repository that spends the
 * signing keystore and the ManageEngine credentials. These are config
 * assertions, not behaviour: each pins a property whose silent loss would fail
 * no other test and would not be obvious in review.
 *
 * Read as TEXT on purpose. The repo has no YAML parser in its own
 * dependencies — `yaml` resolves to a browser ESM build under jest and
 * `js-yaml` is only transitive — and adding one to assert a handful of lines
 * would be a dependency bought for a test.
 */
const WORKFLOW_PATH = join(__dirname, "..", "..", ".github", "workflows", "android-release.yml");
const source = readFileSync(WORKFLOW_PATH, "utf8");

/** The workflow's trigger block: everything between `on:` and the next top-level key. */
function triggerBlock(): string {
  const start = source.indexOf("\non:\n");
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start + "\non:\n".length);
  const end = rest.search(/\n[a-z]/);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Step headers, in file order: the `- name:` / `- uses:` lines inside `steps:`. */
function stepHeaders(): string[] {
  const steps = source.slice(source.indexOf("\n    steps:\n"));
  return [...steps.matchAll(/^ {6}- (?:name|uses): (.+)$/gm)].map((m) => m[1]!.trim());
}

describe("the Android release workflow", () => {
  it("is MANUAL only — no push or pull_request trigger may ever reach it", () => {
    const block = triggerBlock();

    expect(block).toContain("workflow_dispatch:");
    expect(block).not.toMatch(/^\s{2}push:/m);
    expect(block).not.toMatch(/^\s{2}pull_request:/m);
    expect(block).not.toMatch(/^\s{2}schedule:/m);
  });

  it("keeps its manual dry_run input", () => {
    expect(triggerBlock()).toContain("dry_run:");
  });

  it("refuses any ref but main, BEFORE any build, sign or publish step", () => {
    // workflow_dispatch takes a ref, so manual does not mean main. Without
    // this guard the workflow can be aimed at an unmerged branch and publish
    // unreviewed source to the tenant under the real package identity.
    const headers = stepHeaders();

    expect(headers[0]).toBe("Refuse to release from any ref but main (fail closed)");
    expect(source).toContain('if [ "$GITHUB_REF" != "refs/heads/main" ]; then');
  });

  it("fails the run rather than skipping silently on the wrong ref", () => {
    // A green skip on the wrong ref is indistinguishable from a release.
    const guard = source.slice(
      source.indexOf("Refuse to release from any ref but main"),
      source.indexOf("actions/checkout@"),
    );

    expect(guard).toContain("::error::");
    expect(guard).toContain("exit 1");
    expect(guard).not.toContain("if:");
  });

  it("runs in the android-release environment with least privilege", () => {
    expect(source).toMatch(/^\s{4}environment: android-release$/m);
    expect(source).toMatch(/^permissions:\n\s{2}contents: read$/m);
  });

  it("serializes runs and never cancels one mid-flight", () => {
    expect(source).toMatch(/^\s{2}cancel-in-progress: false$/m);
  });

  it("pins every third-party action to an immutable commit SHA", () => {
    // Each line is `- uses: owner/action@<sha> # vX.Y.Z`; capture the ref only.
    const uses = [...source.matchAll(/^\s+- uses: (\S+)/gm)].map((m) => m[1]!);

    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/@[0-9a-f]{40}$/);
  });

  it("runs the repo's own Expo CLI, never a registry fallback", () => {
    expect(source).not.toContain("npx --yes expo");
    expect(source).toContain("pnpm exec expo");
  });

  it("never echoes a secret value — only names", () => {
    expect(source).not.toMatch(/echo .*\$\{\{\s*secrets\./);
  });
});
