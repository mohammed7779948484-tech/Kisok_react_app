/**
 * Conventional Commits, without a central registry of feature names.
 *
 * The scope list used to be a fixed enum. That made `commitlint.config.js` a
 * shared file every new feature had to edit before its first commit — exactly
 * the merge-conflict hotspot the rest of this repository is designed to avoid.
 * Two agents starting Catalog and Checkout on the same day would both touch
 * this file, for no benefit: the value of a scope is that it is greppable, not
 * that someone pre-registered it.
 *
 * So the scope is unconstrained in content and constrained in SHAPE. A feature
 * agent writes `feat(catalog):` on day one with no shared edit, while
 * `feat(Catalog Screen):` is still rejected, so history stays greppable.
 */

/**
 * The shape a generated feature directory has, character for character —
 * `tools/generator/render.mjs` validates names against this same expression.
 *
 * commitlint's built-in `kebab-case` is NOT this: it rejects digits, so a
 * feature legitimately generated as `order-v2` could not use its own directory
 * name as its commit scope. A scope you cannot derive from the directory
 * defeats the point of having one.
 */
const FEATURE_NAME_SHAPE = /^[a-z0-9][a-z0-9-]*$/;

module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "scope-feature-shape": ({ scope }) => [
          scope === null || scope === undefined || FEATURE_NAME_SHAPE.test(scope),
          `scope must look like a feature directory: lowercase letters, digits and hyphens, ` +
            `starting with a letter or digit (e.g. catalog, order-status, order-v2)`,
        ],
      },
    },
  ],
  rules: {
    // Replaces `scope-case`, which cannot express "digits are allowed".
    "scope-case": [0],
    "scope-feature-shape": [2, "always"],

    /**
     * config-conventional forbids a sentence-case subject, which also rejects a
     * subject legitimately starting with a proper noun — "Android E2E …",
     * "Supabase session …", "Metro config …". That is a daily papercut with no
     * upside, and it teaches people to reach for --no-verify, which disables
     * the checks that matter. Only Upper-Case (SHOUTING) stays rejected;
     * Start Case is permitted as a consequence, which is an acceptable trade.
     */
    "subject-case": [2, "never", ["upper-case"]],

    /**
     * config-conventional's default type-enum has no room for a deliberate,
     * reviewed, history-preserving two-parent merge (e.g. integrating a long-
     * lived branch into develop) — the commit that IS the integration, not a
     * change described by build/chore/feat/fix/etc. CI lints every real commit
     * in a PR's range (`commitlint --from base --to head`), so a legitimate
     * merge commit already in history would otherwise permanently fail that
     * check with no fix available that does not rewrite it — which this
     * project's workflow explicitly forbids (no rebase/squash/force-push of a
     * preserved merge). `merge` is added, not substituted, so every other type
     * still means what config-conventional says it means.
     */
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "merge",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],

    // The body carries reasoning, commands and URLs; hard-wrapping those to a
    // column makes them unusable.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
