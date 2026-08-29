#!/usr/bin/env node
import lint from "@commitlint/lint";
import load from "@commitlint/load";

/**
 * Prove the commit convention accepts what feature agents actually write.
 *
 *     pnpm check:commits
 *
 * The scope used to be a fixed enum, which made this config a shared file every
 * new feature had to edit before its first commit — the merge-conflict hotspot
 * the rest of the repository is built to avoid. It is now shape-constrained
 * rather than registry-constrained, and these cases are what that means in
 * practice. Without them, someone "tidying up" the config by reintroducing a
 * scope-enum would break every future feature and nothing would notice.
 */
const CASES = [
  // A new feature must be able to commit on day one with no shared edit.
  { message: "feat(catalog): add product list", valid: true },
  { message: "fix(checkout): reuse client_request_id on retry", valid: true },
  { message: "feat(preparation): show the order board", valid: true },
  { message: "feat(order-status): surface the ready state", valid: true },
  // A scope must be able to be a feature directory name verbatim, and the
  // generator permits digits. commitlint's built-in kebab-case does not.
  { message: "feat(order-v2): surface the ready state", valid: true },
  { message: "feat(catalog2): add product list", valid: true },
  // Infrastructure scopes keep working.
  { message: "fix(ci): make the android e2e job boot the app", valid: true },
  { message: "chore(deps): bump expo", valid: true },
  { message: "feat: a scope is optional", valid: true },
  // A subject may start with a proper noun. config-conventional's default
  // rejects sentence-case, which made "Android ..." or "Supabase ..." fail and
  // pushed people toward --no-verify.
  { message: "fix(ci): Android E2E now boots the app", valid: true },
  { message: "fix(auth): Supabase sign-out uses local scope", valid: true },
  // Shape is still enforced, so history stays greppable.
  { message: "feat(Catalog Screen): add list", valid: false },
  { message: "feat(CATALOG): add list", valid: false },
  { message: "feat(cat_alog): add list", valid: false },
  // With a type and scope present, this can only fail on subject-case — so the
  // guard actually pins that rule. Bare "SHOUTING SUBJECT" fails on
  // type-empty/subject-empty instead and would pass even with subject-case off.
  { message: "feat: SHOUTING SUBJECT", valid: false },
  { message: "made some changes", valid: false },
];

const { rules, parserPreset, plugins } = await load({}, { cwd: process.cwd() });
// `plugins` carries the inline scope-shape rule. Without it commitlint throws
// "Found rules without implementation", so this also proves the rule is really
// wired up rather than silently ignored.
const options = {
  ...(parserPreset?.parserOpts ? { parserOpts: parserPreset.parserOpts } : {}),
  ...(plugins ? { plugins } : {}),
};

const failures = [];
for (const { message, valid } of CASES) {
  const report = await lint(message, rules, options);
  if (report.valid !== valid) {
    const detail = report.errors.map((error) => error.message).join("; ") || "(accepted)";
    failures.push(
      `${valid ? "should be ACCEPTED" : "should be REJECTED"}: ${JSON.stringify(message)}\n      ${detail}`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\nThe commit convention does not behave as intended:\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    `\nIf you added a scope-enum, remove it: a central list of feature names is a\n` +
      `shared file every feature would have to edit before its first commit.\n`,
  );
  process.exit(1);
}

console.log(`Commit convention behaves as intended (${CASES.length} cases checked).`);
