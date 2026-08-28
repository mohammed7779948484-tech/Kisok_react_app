# 0010 — The generator writes everything or nothing

**Status:** accepted

## Context

The generator formatted each planned file with Prettier before writing it. When
Prettier could not parse a file — a template bug producing invalid TypeScript —
it logged a warning and wrote the file anyway.

That is the worst available outcome. The result is a feature directory that is
partly correct and partly broken, with no record of which is which, in a
repository where the next step is usually `pnpm verify`. The author then has to
decide whether to fix the generated code or delete the feature and re-run, and
neither is obviously right.

## Decision

Generation is a pipeline with a single commit point:

```
PLAN → RENDER ALL → FORMAT/PARSE ALL → VALIDATE PLAN → WRITE ATOMICALLY
```

- A file that cannot be parsed aborts the whole request, reporting every failure
  at once so a broken template is fixed in one pass.
- `validatePlan` rejects a plan that would write outside the feature (the single
  exception being one Expo Router file), plan the same path twice, or emit an
  empty file.
- `writeFiles` tracks what it created and rolls back files **and directories** if
  a write fails part-way.

The smoke test corrupts a real template and asserts that no feature directory
appears.

## Consequences

- A failed generation leaves the working tree exactly as it was, so the recovery
  action is always "fix the template and re-run".
- Template bugs surface as one clear error rather than as a confusing
  `pnpm verify` failure later.
- `validatePlan` also enforces the no-shared-registry invariant mechanically,
  rather than relying on template review to notice a front-matter typo.
