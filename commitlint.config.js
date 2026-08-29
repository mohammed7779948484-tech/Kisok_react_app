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
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Lower-case, digits and hyphens: the same shape as a feature directory, so
    // `git log --grep "(catalog)"` finds the feature's history.
    "scope-case": [2, "always", "kebab-case"],

    /**
     * config-conventional forbids a sentence-case subject, which also rejects a
     * subject legitimately starting with a proper noun — "Android E2E …",
     * "Supabase session …", "Metro config …". That is a daily papercut with no
     * upside, and it teaches people to reach for --no-verify, which disables
     * the checks that matter. Only Upper-Case (SHOUTING) stays rejected.
     */
    "subject-case": [2, "never", ["upper-case"]],

    // The body carries reasoning, commands and URLs; hard-wrapping those to a
    // column makes them unusable.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
