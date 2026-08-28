# Code standards

Most of this is automated. Run `pnpm verify`; if it passes, style is not a
review topic.

## Naming

| Thing                       | Convention             | Example                             |
| --------------------------- | ---------------------- | ----------------------------------- |
| Files and directories       | `kebab-case`           | `product-detail-screen.tsx`         |
| React components and types  | `PascalCase`           | `ProductDetailScreen`               |
| Functions, variables, hooks | `camelCase`            | `fetchCatalog`, `useCartStore`      |
| Routes                      | `kebab-case`           | `app/(customer)/product-detail.tsx` |
| Constants                   | `SCREAMING_SNAKE_CASE` | `CONTENT_MAX_WIDTH`                 |
| Query key factories         | `<feature>Keys`        | `catalogKeys`                       |
| Zod schemas                 | `<thing>Schema`        | `catalogSnapshotSchema`             |
| Test files                  | `<subject>.test.ts(x)` | `cart-store.test.ts`                |

The generator encodes all of this — a generated feature is the reference.

## File conventions

- One component per file, named after the file.
- Named exports everywhere **except** Expo Router route files, which must
  `export default`.
- A feature's `index.ts` is its public API and should stay small. Everything else
  is private.
- Colocate tests in `__tests__/` next to the code they cover.

## TypeScript

`strict`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, and
`noFallthroughCasesInSwitch`.

- **No `any`.** Use `unknown` and narrow.
- No non-null assertion (`!`) to silence `noUncheckedIndexedAccess` — handle the
  `undefined` case.
- Prefer `type` over `interface` unless you need declaration merging.
- Let inference work; annotate exported function signatures and public types.
- Validate at the boundary with Zod, then rely on the inferred type inside.

## Async and errors

- `async`/`await`, not `.then()` chains.
- Convert to `AppError` at the `api/` boundary; do not catch-and-rethrow raw
  Postgres errors.
- Mark deliberately unawaited promises with `void`: `void refetch();`.
- Never swallow an error silently. Either handle it, surface it, or log it with
  the scoped logger.

## Imports

Ordering is not enforced, but this reads best and matches the existing files:

```ts
import { useState } from "react"; // external
import { View } from "react-native";

import { Button } from "@/components/ui"; // internal absolute
import { toAppError } from "@/core/errors";

import { fetchCatalog } from "../api/catalog-api"; // relative (same feature)
```

Use the `@/` alias across boundaries; relative paths inside a feature.

## Comments

Explain **why**, not what. A comment that restates the code is noise that will
drift out of date.

Worth writing:

- why a non-obvious approach was chosen over the obvious one
- a constraint that is not visible locally (an RLS rule, a server guarantee)
- a warning about a mistake that is easy to make here

Not worth writing:

- `// set the loading state`
- a comment repeating the function name
- commented-out code — delete it, git remembers

## Formatting

Prettier, with `prettier-plugin-tailwindcss` sorting class names. Do not fight
it; run `pnpm format`.

Line width 100, double quotes, semicolons, trailing commas.
