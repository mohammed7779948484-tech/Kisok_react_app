/**
 * Conventional Commits, with the scopes this repository actually uses.
 *
 * Scope is optional — a change that genuinely spans the repo should not be
 * forced into a misleading one — but where a scope applies it must come from
 * this list, so history stays greppable.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "app",
        "auth",
        "ci",
        "components",
        "core",
        "deps",
        "docs",
        "foundation",
        "generator",
        "realtime",
        "skills",
        "supabase",
        "testing",
        "tooling",
      ],
    ],
    // Prose limits: the body often carries the reasoning, and hard-wrapping a
    // pasted command or URL to 100 characters makes it unusable.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
