---
paths:
  - "ignite/**"
---

# The Ignite generator

`pnpm ignite feature <name>` scaffolds a feature vertical slice. It exists to
stop agents from re-inventing (or hallucinating) the architecture.

## How it works

- Templates: `ignite/templates/feature/*.ejs`, EJS with YAML front matter.
- Front-matter keys: `destinationDir` (required), `filename`, `skip`. All three
  are rendered through EJS first, so they can depend on the options.
- Props available in a template: `pascalCaseName`, `camelCaseName`,
  `kebabCaseName`, `snakeCaseName`, `name`, `originalName`, plus the generator
  options `role`, `layers`, `realtime`, `route`, `routeDir`, `featureDir`.
- Output is formatted with the project's Prettier config before it is written —
  templates do not need to guess at line lengths.
- Existing files are never overwritten without `--force`.

## Rules for changing templates

- **Run `pnpm ignite:smoke` after every change.** It generates a real feature and
  proves the output typechecks, lints, formats, and passes its own tests, then
  cleans up. A template that merely looks right is worthless — agents inherit
  whatever it emits.
- Generated code must **encode the architecture**: no Supabase in screens, query
  keys local, public API in `index.ts`, TODO.md always present.
- Comments in templates should be **precise and few**. They exist to stop a
  specific mistake, not to narrate. Delete a comment that no longer prevents
  anything.
- **Never make the generator edit a shared file.** The moment a feature has to
  register itself somewhere central, parallel agents start conflicting — which is
  the problem this generator exists to avoid.

See `IGNITE.md` for the user-facing reference and
`docs/adr/0005-generator.md` for why this is a local generator rather than the
`ignite-cli` package.
