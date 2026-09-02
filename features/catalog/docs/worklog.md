# Catalog — worklog

Evidence, by task ID. A checkmark with no command output is not evidence.

Append entries; do not rewrite history. If a gate failed and was then fixed,
both belong here — a task that failed twice is a signal worth keeping.

## Template

Record the scaffold before anything else: the command the Lead actually ran and
what it put on disk. That is what makes the chain checkable —
`plan command → command run → filesystem → task evidence`. Without it, nobody
can tell later whether a file was generated, hand-written, or left over.

The entry evidence depends on the task's declared mode, so record the mode
first. `behavior`, `bug` and `behavior-change` open with RED; `refactor` opens
with a named BASELINE shown green; `config` has no RED at all — run the thing
it configures and paste the result under VERIFICATION.

```
### T01 — <objective>
MODE: behavior | bug | behavior-change | refactor | config
ACCEPTANCE: AC-xx | Supporting AC-xx | N/A — <reason>

SCAFFOLD          (Lead, before delegating — omit only when genuinely N/A)
  $ <the exact generator command the Lead ran>
  created  : <paths>
  skipped  : <paths that already existed>
  replaced : <paths overwritten, and why that was safe>
  manual   : <planned artifacts no capability covers>

RED               (behavior | bug | behavior-change)
  $ <command>
  <the failure, and why it is the RIGHT failure — not a typo or bad import>

BASELINE          (refactor)
  $ <command naming the existing tests being preserved>
  <green, before any change>

IMPLEMENT
  <the smallest change that does it>

GREEN             (behavior | bug | behavior-change | refactor)
  $ <command>
  <pass>

VERIFICATION      (config)
  $ <the thing it configures, actually run>
  <output proving the configuration works — not that a file contains a string>

AFFECTED CHECKS
  $ <typecheck / lint / focused tests>
  <result>

DIFF
  <files touched, and anything surprising>

GATE: PASS | FAIL
```

Delete the lines that do not apply to the mode. An empty RED heading under a
`config` task is the fabricated evidence this shape exists to prevent.

## Entries

### Feature setup — branch and workspace

- `git fetch origin` completed on 2026-08-31.
- `BASE_MAIN_SHA`: `80b8ac3cc6cc4a569e165c2bc5bdb72ddc9df618`.
- `INITIAL_DEVELOP_SHA`: `80b8ac3cc6cc4a569e165c2bc5bdb72ddc9df618`.
- Created `feature/catalog` from exact `origin/main` at the base SHA above.
- `pnpm generate feature catalog --role=customer` created only `features/catalog/index.ts` and the five control documents under `features/catalog/docs/`.
- `pnpm generate --help` printed the current generator contract but exits non-zero because this CLI treats `--help` as an unknown option after printing usage; no files were written by that command.

### Research and Plan readiness

- Three independent evidence packets completed: current Supabase contract, legacy Flutter product behaviour, and current KISOK UI composition.
- Lead spot-checked `20260826050006_lean_customer_catalog.sql`, `20260826050003_lean_catalog_schema.sql`, `20260826050013_lean_rls_grants.sql`, `20260826050012_lean_realtime.sql`, `components/media/app-image.tsx`, and `core/responsive/index.ts`.
- Material decisions: one validated snapshot/query; pure local projections; no direct table read, mutation, Zustand, Realtime, pagination, price, exact stock, Cart, Checkout, or Tracking; eight flat generated Customer routes; root placeholder replacement is the only `--force`.
- Lead Planning Review re-read all five control documents against the original request and corrected variant-label fallback, task acceptance ownership, task dependencies, and brittle-style test language before readiness.
- `pnpm exec prettier --check "features/catalog/docs/*.md" features/catalog/index.ts` → PASS after formatting.
- `pnpm check:docs` → PASS (`63 files checked`).
- `features/catalog/docs/plan.md` set to `READY` on 2026-08-31. No implementation began while it was `DRAFT`.

### T01 — Snapshot schema and pure Catalog view

MODE: behavior
ACCEPTANCE: Supporting AC-01 through AC-07

SCAFFOLD (Lead)

- `$ pnpm generate schema catalog catalog-snapshot`
- Created: `features/catalog/model/catalog-snapshot.schema.ts`, `features/catalog/model/catalog-snapshot.schema.test.ts`.
- Skipped/replaced: none.
- Planned manual artifacts: `catalog-snapshot.fixture.ts`, `catalog-view.ts`, `catalog-view.test.ts`.
- Lead inspected both generated files and verified actual paths match the Plan. Scaffold status: `READY`.

RED

- `$ pnpm exec jest features/catalog/model/catalog-snapshot.schema.test.ts features/catalog/model/catalog-view.test.ts --runInBand`
- Initial result: 2 suites failed; 13 tests failed and 1 passed. The complete Lean V1 fixture was rejected by the generated placeholder and each view rule reached the explicit not-implemented failure, so RED was for the intended missing behavior rather than an import/typing mistake.

IMPLEMENT / GREEN

- Implemented the strict migration-derived schema, representative fixture, and pure Catalog view/projections in the five allowed files.
- Initial focused GREEN: 2 suites, 14 tests PASS.
- Lead found a cyclic category parent↔children graph before review. Same Implementer added a regression test; RED reproduced `TypeError: Converting circular structure to JSON`, then changed parent context to an acyclic raw category.
- Lead rerun after remediation: `$ pnpm exec jest features/catalog/model/catalog-snapshot.schema.test.ts features/catalog/model/catalog-view.test.ts --runInBand` → 2 suites, 15 tests PASS.

AFFECTED CHECKS / DIFF

- Lead `$ pnpm typecheck` → PASS.
- Lead scoped ESLint for all five T01 files → PASS.
- Lead `$ pnpm lint` → PASS.
- Lead scoped Prettier check for all five T01 files → PASS.
- Diff scope: only the five planned model files; no direct IO, route, store, mutation, shared/core, migration, or unplanned structural artifact.

FRESH TASK REVIEW

- R01 major confirmed: `catalog-view.ts` repeatedly scans full products/categories/variants/options/media collections. Fresh review measured approximately 117 ms at 500 products, 461 ms at 1,000, and 2,048 ms at 2,000 on desktop Node; a snapshot-only Android client cannot accept that main-thread growth.

GATE: FAIL — remain in T01 for indexed-projection remediation and fresh re-review.

REMEDIATION

- Same T01 Implementer classified the performance-only change as `refactor` and pinned the 15-test green baseline.
- `createCatalogView` now builds insertion-order-preserving indexes for variants/product, option links/media/variant, category hierarchy/memberships, brand counts, products/brand/category, and brands/category. Public API and behavior remain unchanged.
- Implementer ephemeral post-fix medians: ~6.24 ms / 13.15 ms / 26.48 ms for 500 / 1,000 / 2,000 products.
- Lead rerun: 2 suites, 15 tests PASS; typecheck PASS; scoped lint/format PASS; full lint PASS.

FRESH RE-REVIEW

- R01 resolved. Independent medians: ~6.94 ms / 12.01 ms / 23.53 ms at 500 / 1,000 / 2,000 products; no new blocking/major finding.
- R02 minor: no committed wall-clock regression. Lead accepted because timing thresholds are environment-sensitive; code structure, two independent scaling runs, and final runtime profiling provide the evidence without a brittle CI timer.

GATE: PASS

### T02 — Customer-safe Catalog query pipeline

MODE: behavior
ACCEPTANCE: AC-01

SCAFFOLD (Lead)

- `$ pnpm generate query catalog catalog`
- Created: `features/catalog/api/fetch-catalog.ts`, `features/catalog/queries/use-catalog.ts`, `features/catalog/queries/keys.ts`.
- Skipped/replaced: none.
- Planned manual artifacts: `api/fetch-catalog.test.ts`, `queries/use-catalog.test.tsx`.
- Lead inspected all three generated files and verified actual paths match the Plan. Scaffold status: `READY`.

RED

- `$ pnpm exec jest features/catalog/api/fetch-catalog.test.ts features/catalog/queries/use-catalog.test.tsx --runInBand`
- Corrected test setup after an initial mock-hoisting mistake, then captured valid RED: 2 suites/4 tests failed because `fetchCatalog` raised the generated `NOT_IMPLEMENTED` AppError and the hook returned raw data without `resolveProduct`.

IMPLEMENT / GREEN

- `fetchCatalog` now calls `callRpc("get_customer_catalog", catalogSnapshotSchema)` with no args object and returns `CatalogSnapshot`.
- `catalogKeys` owns only `all`; the unused generated detail key was removed.
- `useCatalog` uses that key/fetcher and stable `select: createCatalogView`; no retry override or client-state mirror.
- Lead focused rerun: T02 2 suites/4 tests PASS; T01 2 suites/15 tests PASS.

AFFECTED CHECKS / DIFF

- Lead typecheck PASS; scoped ESLint/Prettier PASS; full lint PASS.
- Scope: exactly the three generated query paths and two planned manual tests; no model/doc/index/route/shared/core/migration/config edit by Implementer.

FRESH TASK REVIEW

- No blocking, major, minor, or missing material T02 failure path found. Independent reviewer reran T02/T01 tests and relevant static checks successfully.

GATE: PASS

### Round 1 Gate — initial review

INTEGRATED CHECKS

- `$ pnpm exec jest features/catalog/model features/catalog/api features/catalog/queries --runInBand` → 4 suites, 19 tests PASS.
- `pnpm typecheck` → PASS; `pnpm lint` → PASS; `pnpm exec prettier --check features/catalog` → PASS after formatting the Lead-owned review record.
- Lead scope review found only planned workspace/model/api/query files and no direct table read, client store, Realtime, price, or Flavor implementation.

FRESH ROUND REVIEW

- First reviewer launch failed with an HTTP 429 before producing findings; no result was used.
- Fresh replacement reviewer found R03 blocking: valid PostgreSQL `text[]` null keyword elements are rejected by the client schema.
- R04 major: shape-only validation allows downstream-required invariants to break (including product without variant, dangling/mismatched relationships, partial media tuple).
- R05 minor: selected view aliases mutable nested transport values from the raw query cache.

ROUND GATE: FAIL — reopen T01 for bounded remediation, then fresh T01 and Round re-reviews.

T01 ROUND REMEDIATION — ATTEMPT 1

- RED: model suites 9 failed/15 passed, correctly proving null keyword rejection, missing semantic validation, and a settings alias.
- Fixed R03: product/variant keyword arrays accept null elements and normalize them out.
- Fixed R04 reported cases: root semantic validation now checks duplicate IDs/relationship keys, product variant presence, relationship/type resolution, category parent validity, and complete nullable media tuples.
- Fixed R05: view clones settings, keyword arrays, category summaries, and option entities.
- Lead rerun: model 2 suites/24 tests PASS; T02 2 suites/4 PASS; typecheck, scoped lint/format, full lint PASS.

FRESH T01 RE-REVIEW

- R03/R04/R05 confirmed resolved for reported cases.
- R06 blocking: `public_id` validation still uses JS trim/raw length rather than PostgreSQL default `btrim` semantics and can reject database-valid data.
- R07 minor: schema permits two primary media rows for one variant despite the migration's partial unique index.
- Because contract-fidelity gaps recurred after multiple meaningful attempts, Lead will use a fresh T01 Implementer for R06/R07 rather than resume the original worker.

T01 GATE: FAIL

T01 ROUND REMEDIATION — FRESH IMPLEMENTER ATTEMPTS

- R06/R07 initial RED: 3 schema failures proved ASCII-space btrim/raw-length mismatch, non-space whitespace over-trimming, and missing primary-media uniqueness.
- Fixed PostgreSQL default btrim semantics without transforming returned identifiers and fixed R07 primary-media uniqueness.
- First fresh re-review found R06 still blocking because JS UTF-16 `.length` is not PostgreSQL character length for supplementary Unicode.
- Follow-up RED proved 255 supplementary code points were rejected; changed to Unicode code-point counting. Lead rerun: model 30 tests PASS; T02 4 PASS; typecheck/lint/format PASS.
- Next fresh re-review confirmed R06/R07 resolved but found R08 blocking: `z.uuid()` rejects canonical PostgreSQL-valid UUID values based on version/variant nibbles.
- The fresh worker has now had two meaningful contract-fidelity attempts; Lead used another fresh T01 Implementer for R08.

T01 ROUND REMEDIATION — UUID CLOSURE

- Another fresh T01 Implementer captured RED with a relationship-consistent version-9 canonical UUID rejected only by `z.uuid()`.
- Replaced every snapshot UUID validator with one canonical PostgreSQL-output 8-4-4-4-12 hexadecimal schema without version/variant restrictions; malformed UUID rejection remains.
- Lead rerun: model 2 suites/31 tests PASS; T02 2 suites/4 PASS; typecheck, scoped lint/format and full lint PASS.
- One closure-review launch failed with HTTP 429 and produced no result; a fresh replacement review found 0 blocking/major issues.

FRESH ROUND 1 RE-REVIEW

- Independent Round reviewer reran all four suites: 35 tests PASS.
- Schema → `callRpc` → query `select` chain, authorization, ordering, indexed performance, cache/view cloning, tests and scope found clean.
- Unresolved blocking: 0. Unresolved major: 0. R02 remains an explicitly accepted minor.

T01 GATE: PASS
ROUND 1 GATE: PASS

### Draft PR lifecycle

- Committed Round 1 as `da6b6c8773c00dda36ab9ad02584d9ee4c5ca759` (`feat(catalog): establish validated data foundation`).
- Pushed `feature/catalog` to origin.
- Opened Draft PR [#7](https://github.com/mohammed7779948484-tech/Kisok_react_app/pull/7) with head `feature/catalog` and base `develop`, using the project PR template with pending Feature Gate evidence.
- The PR remains Draft; subsequent passed Tasks/Rounds will be committed and pushed to the same PR.

### T03 — Shared navigation, virtualized grid and entity cards

MODE: behavior
ACCEPTANCE: Supporting AC-02 through AC-08

SCAFFOLD (Lead)

- `$ pnpm generate component catalog catalog-navigation`
- `$ pnpm generate component catalog catalog-grid`
- `$ pnpm generate component catalog availability-badge`
- `$ pnpm generate component catalog product-card`
- `$ pnpm generate component catalog brand-card`
- `$ pnpm generate component catalog category-card`
- Created: `features/catalog/components/catalog-navigation.tsx`,
  `catalog-grid.tsx`, `availability-badge.tsx`, `product-card.tsx`,
  `brand-card.tsx`, `category-card.tsx` — all six exactly as planned.
- Skipped/replaced: none; `git status` after the six commands shows only the new
  untracked `features/catalog/components/` directory.
- Planned manual artifacts: colocated `*.test.tsx` files beside the six
  components.
- Lead inspected the generated placeholders: presentational-only contract
  (props in, callbacks up), TODO markers, no fetch/store/Supabase imports.
  Scaffold status: `READY`.

RED (Implementer)

- `$ pnpm exec jest features/catalog/components/availability-badge.test.tsx features/catalog/components/product-card.test.tsx features/catalog/components/brand-card.test.tsx features/catalog/components/category-card.test.tsx features/catalog/components/catalog-navigation.test.tsx features/catalog/components/catalog-grid.test.tsx --runInBand`
- 6 suites / 29 tests failed, 0 passed. Every failure was "Unable to find an
  element with text/role/button …" against the placeholders' `TODO: build X.`
  render — the intended missing behavior, not an import or typing failure.
- Six colocated test files written first: whole-card accessible names and
  press routing for product/brand/category cards, textual availability,
  selected-state navigation callbacks, and grid columns at mocked
  compact/medium/expanded window widths (480/800/1280).

IMPLEMENT (Implementer)

- Six components implemented in place: `CatalogNavigation` (five Button
  destinations, `h-touch` targets, `accessibilityState={{ selected }}`, single
  `onNavigate(destination)` callback, no expo-router import), `CatalogGrid`
  (real `@shopify/flash-list` FlashList, `useResponsiveValue` columns
  2/3/4, `key={columns}` remount, memoized row renderer/press
  handler/contentContainerStyle), `AvailabilityBadge` ("Available" /
  "Out of stock" on Badge success/destructive), and memoized
  `ProductCard`/`BrandCard`/`CategoryCard` whole-card Pressables composing
  `Card`/`Text`/`AppImage` with accessible names carrying name + status.
- Deviation from the task packet: FlashList v2.0.2 (installed) removed the
  `estimatedItemSize` prop (verified against
  `node_modules/@shopify/flash-list/dist/FlashListProps.d.ts`; v2 measures rows
  itself), so `CatalogGrid` does not accept or forward it. Flagged for Lead
  review against the plan's "memoized estimatedItemSize" wording.
- Two test-side corrections during GREEN, both strengthening tests: (1)
  `rerender` was initially passed the identical element reference, so React
  bailed out and the width-change test failed for a test-setup reason — fixed
  by creating a fresh element per render with the same stable props; (2) the
  estimatedItemSize assertions were removed together with the dropped prop.

GREEN (Implementer)

- `$ pnpm exec jest features/catalog/components --runInBand`
- 6 suites, 29 tests PASS, zero console output (verified by scanning the full
  run log for `console.*`).

AFFECTED CHECKS (Implementer)

- T01/T02 regression: `$ pnpm exec jest features/catalog/model features/catalog/api features/catalog/queries --runInBand` → 4 suites, 35 tests PASS.
- Whole feature: `$ pnpm exec jest features/catalog --runInBand` → 10 suites, 64 tests PASS.
- `pnpm typecheck` → PASS.
- Scoped ESLint: `$ pnpm exec eslint features/catalog/components --max-warnings=0` → PASS (after removing an unused import and fixing one array-type annotation).
- Full `pnpm lint` (expo lint) → PASS.
- Scoped Prettier: `$ pnpm exec prettier --check "features/catalog/components/*.tsx"` → PASS after `--write` on 4 files.

DIFF (Implementer)

- Change set is exactly the untracked `features/catalog/components/`
  directory: six edited-in-place generated components plus six new colocated
  test files. No shared/core additions, no `features/catalog/index.ts` edit,
  no route/screen/model file touched. Five exploratory `zz-*.test.tsx` scratch
  files from a prior interrupted probe session (inside the allowed scope,
  never committed) were deleted.

LEAD VERIFICATION (T03)

- Lead read all six component implementations and all six test files; imports
  audited: no Supabase/Zustand/TanStack/expo-router imports; semantic tokens
  throughout; the single numeric style value is FlashList's
  `contentContainerStyle` paddingBottom with a token-scale comment (NativeWind
  classes cannot reach the FlashList content container).
- Lead reruns: components 6 suites/29 tests PASS; whole feature 10 suites/64
  tests PASS; `pnpm typecheck` PASS; full `pnpm lint` PASS; scoped Prettier
  PASS; `pnpm check:docs` PASS after the Lead reworded its own todo.md
  pipeline line (the implementer's only check:docs finding, correctly
  attributed to the Lead's uncommitted text, not to T03 work).
- Scope check via `git status`: exactly `features/catalog/components/**` (new)
  plus Catalog docs edits. No shared/core file, no `index.ts`, no
  route/screen/model/config file touched.
- Deviation disposition: FlashList v2.0.2 removed `estimatedItemSize` (v2
  measures rows itself; verified against installed
  `FlashListProps.d.ts`). The Plan never pinned that prop — only the task
  packet's guidance mentioned it — so no Plan change is required;
  `renderItem`/`contentContainerStyle` memoization and the shared row handler
  are implemented as required.
- Five `zz-*.test.tsx` scratch probe files (untracked, created by an earlier
  interrupted subagent launch inside the allowed scope) were deleted by the
  implementer; nothing tracked was destroyed.

FRESH TASK REVIEW (T03)

- Fresh code-reviewer (independent context, read-only) loaded
  `kisok-code-review`, `kisok-design-system`, `kisok-react-native-rules`.
- Findings: 0 blocking, 0 major, 2 minor. T03-R01: todo checkpoint lagged the
  worklog (Lead fixed while recording this review). T03-R02: label-helper
  duplication across sibling components (Lead accepted with rationale —
  test-pinned agreement, no shared promotion; recorded in review.md).
- Reviewer independently reproduced: components 6 suites/29 tests PASS; whole
  feature 10 suites/64 tests PASS; typecheck/lint/format/check:docs PASS.
  RED not re-executable read-only; claim accepted as internally consistent
  recorded evidence (failure mode matches placeholder render).
- Verified clean: scope, KISOK boundaries, design-system composition,
  accessibility, RN performance/virtualization, test quality, failure paths,
  known dispositions.

GATE: PASS

### Round 2 Gate

INTEGRATED CHECKS

- `$ pnpm exec jest features/catalog --runInBand` → 10 suites, 64 tests PASS.
- `pnpm typecheck` → PASS. `pnpm lint` → PASS. Scoped Prettier on
  components/docs → PASS. `pnpm check:docs` → PASS (63 files).
- Accumulated Round 2 diff: exactly the 12 new files under
  `features/catalog/components/` plus Catalog control-document records.

FRESH ROUND REVIEW

- Fresh round reviewer (independent context, read-only) loaded
  `kisok-code-review`, `kisok-design-system`, `kisok-react-native-rules`.
- Findings: 0 blocking, 0 major, 0 minor.
- All three plan assertions verified: composes from existing primitives; real
  FlashList virtualization without pagination (responsive 2/3/4 columns,
  stable row props, key-remount trade-off); no shared design-system file
  added (git status confirms feature-only scope).
- Cross-task coherence and T04–T09 consumability explicitly checked:
  `CATALOG_DESTINATIONS` maps 1:1 onto planned flat routes; grid row contract
  `({item, onPress})` matches every card's `onPress` signature; entity `id`
  fields feed planned query-parameter routes; `AvailabilityBadge` consumable
  by T09.
- Reviewer independently reproduced: 10 suites/64 tests, zero console output,
  typecheck/lint/format/check:docs, FlashList v2.0.2 type surface.

ROUND 2 GATE: PASS

### Round 2 commit and push

- Committed Round 2 as `442f23c` (`feat(catalog): add shared discovery UI
components`); `pnpm check:commits` PASS.
- Push to `origin/feature/catalog` is DEFERRED: this Super Z session has no
  GitHub credentials in the environment (the prior session that pushed Round 1
  had them). The commit is intact locally; the Lead will push Round 2+ as soon
  as credentials are available. Draft PR #7 remains open with HEAD efda0f6
  until then; PR evidence stays synchronized through the Catalog worklog.

### T04 — Catalog Home and Customer root route

MODE: behavior
ACCEPTANCE: Supporting AC-02, AC-08

SCAFFOLD (Lead)

- `$ pnpm generate screen catalog catalog-home`
- `$ pnpm generate route catalog index --role=customer --screen=catalog-home --force`
- Created: `features/catalog/screens/catalog-home/catalog-home-screen.tsx`,
  `features/catalog/screens/catalog-home/catalog-home-screen.test.tsx`
  (baseline mount test), and the Catalog public export
  `export { CatalogHomeScreen }` appended to `features/catalog/index.ts`.
- Replaced (planned, `--force`, one time only):
  `app/(customer)/index.tsx` — the Foundation placeholder route now renders
  `CatalogHomeScreen` through the thin generated route file.
- Skipped: none.
- Lead inspected all four outputs: route is thin (imports only
  `@/features/catalog`), screen placeholder uses the standard `Screen` shell,
  baseline test asserts mount only. Scaffold status: `READY`.

RED (Implementer)

- `$ pnpm exec jest features/catalog/screens --runInBand`
- 1 suite / 11 tests failed, 0 passed. Every failure was "Unable to find an
  element with role/text …" (header `KISOK Test Store`, nav buttons, section
  headers, cards, `Loading the catalog…`, error title, `The catalog is
empty`) against the placeholder's `CatalogHome`/`TODO: build this screen`
  render — the intended missing behavior; no import/mock/typing failures.
- The generated baseline mount test was rewritten in place into the
  behavioral suite (11 tests): populated mount, bounded sections from
  `view.home`, root REPLACE semantics (incl. re-selecting Home →
  `router.replace("/")`), detail PUSH with exact `pathname` + query params,
  Browse-all REPLACE actions, neutral `Catalog` heading for `settings: {}`,
  omitted optional sections, announced loading, retryable error + retry
  refetch, non-retryable error without retry affordance, whole-catalog empty
  state (with brands/categories still present in the snapshot) + retry.
- Mock mechanisms: feature API seam `jest.mock("../../api/fetch-catalog")`
  (same pattern as `queries/use-catalog.test.tsx`) — the screen test never
  knows Supabase exists; minimal `jest.mock("expo-router")` returning
  `{ useRouter: () => ({ push, replace }) }` spies (first screen test in the
  repository to pin router destinations and push-vs-replace semantics);
  `lucide-react-native` stubbed to `ImageOff: () => null` for AppImage
  fallbacks, matching the T03 card-test pattern.

IMPLEMENT (Implementer)

- `catalog-home-screen.tsx` implemented in place: `useCatalog()` consumed
  (never Supabase directly); capability-aware states rendered through
  `LoadingState` (cold pending only — background refetch does not flash it),
  `ErrorState` (error object passed through, `onRetry = refetch`, so
  ErrorState hides retry for non-retryable AppErrors), whole-catalog
  `EmptyState` on `products: []` (action = refetch), otherwise store identity
  heading (`store_name`, neutral `Catalog` via an `isFullSettings` type guard
  — text identity only, no logo rendering) + `CatalogNavigation current="home"`
  - three bounded sections from `view.home`.
- Root destinations REPLACE (`/products`, `/brands`, `/categories`, `/search`,
  `/` for home) via a `useRouter()` exhaustive-switch handler; cards PUSH
  `{ pathname: "/brand-detail" | "/category-detail" | "/product-detail",
params: { brandId | categoryId | productId } }` via `useCallback` handlers
  (stable props for the memoized T03 cards).
- Sections are ScrollView/View compositions, NOT virtualized (bounded 6/6/8
  from the model, not re-bounded): local `HomeSection` (heading with
  `accessibilityRole="header"`, ghost 48dp `h-touch` Browse-all button) and
  local `HomeCards` (equal-width card rows at `useResponsiveValue`
  2/3/4 columns with trailing empty slot padding). No new files.
- Two corrections during GREEN: (1) a real implementation bug caught by the
  tests — the Browse-all label was derived from the section title, yielding
  "Browse all featured products"; fixed with explicit destination-named
  labels ("Browse all brands/categories/products"); (2) the error-state
  assertion was changed from `getByRole("alert")` to the visible ErrorState
  title + `error.userMessage` + retry-button role, because RNTL role queries
  match only `accessible` elements and the shared `ErrorState` View is not
  `accessible` (shared component, out of T04 scope to change). Neither
  weakened an assertion.

GREEN (Implementer)

- `$ pnpm exec jest features/catalog/screens --runInBand`
- 1 suite, 11 tests PASS, zero console output.

AFFECTED CHECKS (Implementer)

- Whole feature: `$ pnpm exec jest features/catalog --runInBand` → 11 suites,
  75 tests PASS (T01 model, T02 api/queries, T03 components, T04 screen).
- Full repository suite: `$ pnpm exec jest --silent` → 28 suites, 213 tests
  PASS.
- `pnpm typecheck` → PASS (re-run after export:web as well).
- `pnpm lint` (expo lint) → PASS.
- Prettier: `--write` then `--check` on the two screen files → PASS;
  repo-wide `pnpm exec prettier --check .` → PASS.
- `pnpm check:docs` → PASS (63 files).
- `pnpm export:web` → PASS; tail verbatim:
  `› web bundles (2): … entry-…js (4.99 MB)` / `› Static routes (9):` incl.
  `/ (index)` and `/(customer)` / `Exported: dist`. Route/export verification:
  `app/(customer)/index.tsx` is thin (imports only `@/features/catalog`),
  renders `CatalogHomeScreen`, Foundation placeholder import gone;
  `features/catalog/index.ts` exports exactly `CatalogHomeScreen`. Neither
  file needed changes from the implementer.
- Note: `app.config.ts` has `experiments.typedRoutes: true`, but no
  `.expo/types` route union is generated in this environment (verified after
  export:web), so `Href` falls back to `string | {pathname, params}` and the
  not-yet-existing detail paths typecheck. When typed routes ARE generated
  (T07–T09 add those routes), the calls already match the planned paths.

DIFF (Implementer)

- Change set: `features/catalog/screens/catalog-home/catalog-home-screen.tsx`
  (implemented in place), `…/catalog-home-screen.test.tsx` (baseline rewritten
  in place), this worklog entry, and the T04 todo.md stage/checklist update.
  No shared/core file touched; `app/(customer)/index.tsx`,
  `features/catalog/index.ts` verified correct as scaffolded (their diffs are
  the Lead's uncommitted scaffold, untouched by the implementer).
- Design decisions not pinned by the plan, all stated in the task report:
  heading copy (`store_name` / neutral `Catalog`), section titles
  (Brands/Categories/Featured products), Browse-all copy
  ("Browse all brands|categories|products"), empty-state copy + retry action,
  loading label "Loading the catalog…", home re-selection →
  `router.replace("/")`, empty-catalog state renders EmptyState only (no
  navigation chrome — the retry action is the way forward), no logo image in
  the heading (text identity only).

RE-VERIFICATION (T04, second implementer invocation — recorded because the
first invocation's final report never reached the Lead)

- Found on entry: HEAD at fb0a637 with the T04 work above already present and
  uncommitted (screen + test untracked; todo/worklog updated), i.e. the tree
  was NOT the "clean tree + placeholder scaffold" state the task packet
  described. The work was verified rather than discarded or redone; the
  discovery is reported prominently to the Lead.
- RED re-verified first-hand: the implemented screen was temporarily swapped
  for a minimal placeholder render (Screen + "TODO: build this screen") and
  the suite re-run — `$ pnpm exec jest features/catalog/screens --runInBand`
  → 11/11 tests failed, every failure an "Unable to find an element with
  role/text/label …" query failure (identity heading, nav buttons, cards,
  loading label, error surface, empty state) — missing behavior, not import/
  mock/typing errors. The implementation was then restored byte-identically
  (sha256 match before/after: 926ef17d…) and the placeholder stand-in was
  deleted. No other file was touched for this check.
- GREEN re-verified: same command → 1 suite, 11 tests PASS, zero console
  output.
- Affected checks re-run: `pnpm exec jest features/catalog --runInBand` →
  11 suites, 75 tests PASS; `pnpm exec jest --silent` → 28 suites, 213 tests
  PASS; `pnpm typecheck` PASS; `pnpm lint` PASS; scoped + repo-wide
  `prettier --check` PASS; `pnpm check:docs` PASS (63 files);
  `pnpm export:web` PASS (`/ (index)` + `/(customer)` in the 9 static routes,
  `Exported: dist`).
- Route/barrel re-verified as thin scaffolded: no changes needed.
- No commit, no generator run, no gate set.

### T04 remediation — fresh-review findings T04-R01/R02/R03 (Round 3, same task)

MODE: behavior-change (T04-R03 changes the error-surface rule and owns the
RED; T04-R01 is a flex-structure fix RNTL cannot assert and T04-R02 is a
compile-time-only guard — the remediation packet assigns both no failing
test)
ACCEPTANCE: Supporting AC-02, AC-08 — same task, no new AC

FINDINGS (recorded by the Lead in `review.md`; this entry is the fix)

- T04-R01 (major) — `flex-1` was passed to the T03 cards' inner `Card` while
  the row's direct child was each card's root `Pressable` (no flex), so cards
  rendered at ragged content width and the trailing empty-slot `flex-1` Views
  absorbed the row.
- T04-R02 (minor) — `handleRootNavigate`'s switch over `CatalogDestination`
  had no `default`; with a void return a future union member would silently
  no-op.
- T04-R03 (minor, dispositioned FIX) — `if (catalog.isError)` unconditionally
  rendered the full-screen `ErrorState`, but TanStack keeps `data` on a failed
  background refetch (shared QueryClient refetches on focus/reconnect), so a
  network blip during a long-lived kiosk session blanked still-valid content.

RED (T04-R03, new test written FIRST)

- `$ pnpm exec jest features/catalog/screens --runInBand`
- 1 failed, 11 passed. Failing test: "keeps the populated Home visible when a
  background refetch fails while a snapshot is present" →
  `Unable to find an element with role: header, name: KISOK Test Store`, with
  the dumped tree showing the full-screen ErrorState (`Something went wrong`
  / `We couldn't load the catalog. Please try again.` / `Try again`) — the
  exact behavior the finding describes: a failed background refetch (snapshot
  still cached) discarded the populated Home. Missing behavior, not an
  import/mock/typing failure; the other 11 tests stayed green.
- Test mechanics note: the first run of the new test passed trivially —
  TanStack's batched observer notification lands on a macrotask, so the
  re-render to the error state had not happened when the assertions ran (an
  `act(...)` warning exposed it). The test now flushes one macrotask inside
  `act(...)` after `refetchQueries`, so the post-refetch render is asserted
  rather than raced.

IMPLEMENT (remediation implementer)

- R01 — `HomeCards` now constrains `ItemT extends { id: string }` and wraps
  each rendered card in a `View className="flex-1"` (keyed by `item.id`) that
  IS the row's direct child; `renderItem` no longer carries the key or the
  flex, and `className="flex-1"` was removed from all three card call sites.
  The trailing empty-slot `flex-1` Views are unchanged (already direct
  children). T03 card components untouched (their `className` contract stays
  as-is; the fix belongs to the screen).
- R02 — `default` branch assigns `destination` to a `never`-typed local and
  returns it, so a new `CatalogDestination` member fails typecheck instead of
  silently no-oping. Out-of-tree proof (no repo file touched): the 5-member
  union compiles; adding a 6th member without extending the switch gives
  `error TS2322: Type '"orders"' is not assignable to type 'never'`.
- R03 — the full-screen error guard is now `catalog.isError &&
!catalog.data`: the populated Home stays on screen through a failed
  background refetch; `isPending` stays cold-loading-only. TanStack's
  `UseQueryResult` discriminated union narrows honestly after the guard —
  no unsafe `!` assertions, no unreachable defensive branches (`tsc --noEmit`
  PASS).

GREEN

- `$ pnpm exec jest features/catalog/screens --runInBand`
- 1 suite, 12 tests PASS (11 existing unchanged + 1 new), zero console
  output.

AFFECTED CHECKS (remediation implementer)

- `$ pnpm exec jest features/catalog --runInBand` → 11 suites, 76 tests PASS.
- `$ pnpm exec jest --silent` → 28 suites, 214 tests PASS.
- `pnpm typecheck` → PASS.
- `pnpm lint` → PASS.
- Prettier: `pnpm exec prettier --check` on the screen, its test and this
  worklog → PASS. Repo-wide `pnpm exec prettier --check .` flags
  `features/catalog/docs/review.md` — that is the Lead's own uncommitted
  fresh-review edit (the HEAD version of the file checks clean); the file is
  out of this remediation's scope and was left untouched for the Lead.
- `pnpm check:docs` → PASS (63 files).
- Browser check for R01 not run here — the remediation packet assigns the
  real-browser equal-width verification to the Lead before the gate (RNTL
  does no layout). Structural evidence from the diff: every direct child of
  a `flex-row gap-3` row is now a `flex-1` View (card wrapper or empty slot),
  which is the flex contract React Native equalizes.

DIFF (remediation implementer)

- `features/catalog/screens/catalog-home/catalog-home-screen.tsx` — R01
  wrapper + `ItemT` constraint + three call sites; R02 `default` branch; R03
  guard; doc comments updated to state the background-refetch rule.
- `features/catalog/screens/catalog-home/catalog-home-screen.test.tsx` — one
  new test (failed background refetch keeps the populated Home); imports
  `act` from `@/core/testing` and `catalogKeys` from `../../queries/keys`.
- `features/catalog/docs/worklog.md` — this entry. No other file touched; no
  commit, no generator run, no todo.md/review.md edit (Lead owns those).

FRESH TASK REVIEW + REMEDIATION + GATE (T04, Lead)

- Fresh code-reviewer (read-only, skills: kisok-code-review, kisok-design-system,
  kisok-react-native-rules, expo-router) reviewed the T04 packet and re-ran every
  check first-hand. 3 findings, recorded in review.md: T04-R01 major — Home card
  rows not equal-width (`flex-1` reached the inner `Card`, not the row's direct
  child; browser-proven ragged widths [104,140,260,260]/[29,257,29,30] at 800px);
  T04-R02 minor — destination switch exhaustive by convention only; T04-R03
  minor — failed background refetch blanks a populated Home (TanStack keeps
  `data` on refetch error; shared QueryClient enables focus/reconnect refetch).
- Lead disposition: all three `fix`. R03 rationale: the design-system state table
  is capability-aware ("use the example only when those branches are possible")
  and the error-with-data state IS reachable; the full-screen branch is kept only
  for the no-snapshot case, and the rule is stated once for T05–T09.
- Bounded same-task remediation (implementer): `HomeCards` wraps each card in a
  `flex-1` View as the row's direct child (`ItemT extends { id: string }`);
  inline `never`-typed exhaustiveness `default`; guard `isError && !data` with a
  new 12th test written RED-first (honest failing output recorded above; the
  implementer also disclosed and fixed a real test-timing race — TanStack batches
  observer notifications onto a macrotask, so the test flushes one inside `act`).
- Lead re-verification: 11 suites/76 tests, typecheck, lint, prettier (repo-wide),
  check:docs PASS. Live browser verification on the exported web build
  (deterministic mock chain: sign-in token + `current_active_profile` +
  `get_customer_catalog` with the model fixture): populated Home renders
  (heading, navigation, all three sections from `view.home`); Brands row direct
  children measure [299,299,299,299] at 1280px (4 cols), [243,243,243] at 800px
  (3 cols), [210,210] at 480px (2 cols) — equal widths, trailing empty slots
  included; a real offline/online cycle then fired 3 refetch POSTs that were
  aborted at the network layer and the populated Home stayed on screen (R03
  behavior live). Zero console output.
- Fresh re-review (same reviewer, read-only): all three findings RESOLVED, no new
  blocking/major, no scope drift (route/barrel diffs byte-identical to the Lead
  scaffold; T03 components untouched). Findings/dispositions recorded in
  review.md.
- GATE: PASS — T04 complete. Working tree committed by the Lead.

SCAFFOLD (T05, Lead — JIT, immediately before delegation)

- `pnpm generate screen catalog products` → created
  `features/catalog/screens/products/products-screen.tsx` (placeholder TODO on the
  standard `Screen` shell) and `…/products-screen.test.tsx` (baseline
  mount-without-throwing test, to be rewritten RED-first in place).
- `pnpm generate route catalog products --role=customer --screen=products` →
  created thin `app/(customer)/products.tsx` rendering `ProductsScreen` from
  `@/features/catalog` (route-only, no data/state/logic; params pattern documented
  in the generated docblock) and appended
  `export { ProductsScreen } from "./screens/products/products-screen"` to
  `features/catalog/index.ts`.
- Lead inspection: placeholder screen content is exactly the generated TODO;
  baseline test mounts inside real providers and asserts only the title; route
  file is the standard thin route; barrel gains exactly one export. No skips, no
  replacements beyond the planned ones. Tree before delegation: acf44ad + the
  T05 scaffold (screen/route untracked, index.ts modified).

### T05 — All Products and route (implementer)

MODE: behavior
ACCEPTANCE: Supporting AC-03

RED (Implementer)

- `$ pnpm exec jest features/catalog/screens/products --runInBand`
- 1 suite / 10 tests failed, 0 passed. Every failure was "Unable to find an
  element with role/text …" (header `All products`, `7 products`, card
  buttons `Café Crème, Available` / `Everyday Tote, Out of stock`, nav
  buttons, `Loading the catalog…`, `Something went wrong`, `The catalog is
empty`) against the placeholder's `Products` / `TODO: build this screen`
  render — the intended missing behavior; no import/mock/typing failures.
- The generated baseline mount test was rewritten in place into the
  behavioral suite (10 tests): populated mount (header + count + every
  identity in the grid + nav with Products selected), identity/image
  fallback/textual availability from the card, all-unavailable
  discoverability, card PUSH to `/product-detail` with exact params
  (available, unavailable, and an appended-fixture product), root REPLACE
  semantics for all five destinations incl. re-selecting Products,
  announced cold loading, retryable error + retry refetch, non-retryable
  error without retry affordance, background-refetch failure keeps the
  populated grid, whole-catalog empty state (brands/categories still in the
  snapshot) + retry. The baseline's mount-without-throwing intent survives
  as the first test.
- Mock mechanisms: feature API seam `jest.mock("../../api/fetch-catalog")`
  (screen test never knows Supabase exists), minimal
  `jest.mock("expo-router")` `{ useRouter: () => ({ push, replace }) }`
  spies (T04 pattern), `lucide-react-native` stub for AppImage fallbacks
  (T03 card-test pattern), and `jest.useFakeTimers()` following the
  CatalogGrid test — this screen renders FlashList, whose deferred layout
  work fires real timers that escape `act` and print warnings under real
  timers (probed: warnings appear without fake timers, none with them).
  Consequently the Home test's macrotask flush for TanStack's batched
  observer notification becomes `jest.advanceTimersByTimeAsync(0)` inside
  `act`, and presses use
  `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`.
- Fixtures built past the base 3-product snapshot (task requirement): a
  7-product snapshot (4 appended products with mixed availability, no cover
  media, so the shared image fallback renders alongside the base cover
  image), an all-7-unavailable variant (every variant `is_available: false`
  — every product must stay discoverable with `Out of stock`), and a
  whole-catalog empty variant.

IMPLEMENT (Implementer)

- `features/catalog/screens/products/products-screen.tsx` implemented in
  place: `useCatalog()` consumed (never Supabase directly); capability-aware
  states per the T04 Lead disposition — cold `isPending` → `LoadingState`,
  full-screen `ErrorState` only when `isError && !data` (error object passed
  through; retry = refetch), `products: []` → whole-catalog `EmptyState`
  (same semantic and copy as Home, action = refetch), otherwise the complete
  `view.products` collection in `CatalogGrid` (the T03 virtualized
  responsive grid — no ScrollView for the products) with one `ProductCard`
  per product, `keyExtractor` on product id, and
  `onItemPress` → `router.push({ pathname: "/product-detail", params: {
productId } })` (object form, PUSH — plan Design decision 5). Root
  navigation: `CatalogNavigation current="products"` wired to REPLACE
  semantics for all five destinations via the same exhaustive-switch handler
  as T04, including the `never`-typed exhaustiveness `default`.
- Stable references into the grid: `renderProductCard` in `useCallback`,
  `handleProductPress` in `useCallback`, `keyExtractor` at module scope.
- Unavailable products are never filtered (plan Design decision 10); the
  grid renders whatever `view.products` holds.
- Copy choices (not pinned by the Plan): heading `All products` (h1 header),
  muted summary line `N products` / `1 product`, loading label
  `Loading the catalog…` (same as Home), whole-catalog empty copy mirroring
  Home. Heading/count/root-nav stay mounted above the grid so root
  destinations remain reachable while the grid scrolls; grid gets
  `className="px-4"` so the inter-card gutter (2 × the T03 row `p-1.5`) matches
  Home's `gap-3`; the card inset (16 + 6 = 22px) sits 2px inside the `px-6`
  (24px) header margin — an accepted imperceptible visual deviation
  (T05-R01, review.md), confirm visually at the Round 3 gate browser check.
- Route/export verification: `app/(customer)/products.tsx` is the generated
  thin route rendering `ProductsScreen` from `@/features/catalog` — correct
  as scaffolded, NOT modified; `features/catalog/index.ts` already exports
  exactly `ProductsScreen` — NOT modified.

GREEN (Implementer)

- `$ pnpm exec jest features/catalog/screens/products --runInBand`
- 1 suite, 10 tests PASS, zero console output.

AFFECTED CHECKS (Implementer)

- Whole feature: `$ pnpm exec jest features/catalog --runInBand` → 12 suites,
  86 tests PASS (T01 model, T02 api/queries, T03 components, T04 Home,
  T05 screen), zero console output.
- Full repository suite: `$ pnpm exec jest --silent --runInBand` → 29 suites,
  224 tests PASS.
- `pnpm typecheck` → PASS.
- `pnpm lint` (expo lint) → PASS (no warnings).
- Prettier: `--write` then `--check` on the screen files → PASS; repo-wide
  `pnpm exec prettier --check .` → PASS.
- `pnpm check:docs` → PASS (63 files).
- `pnpm export:web` → PASS; `› Static routes (11):` includes both `/products`
  and `/(customer)/products`; `Exported: dist`. (Detail routes
  `/product-detail`, `/brands`, `/categories`, `/search` are not exported
  yet — they are T06–T09, as planned; the screen navigates to the planned
  paths and tests assert router calls, not actual navigation.)

DIFF REVIEW (Implementer)

- Changed exactly two files, both in `features/catalog/screens/products/`
  (screen + its test, the latter rewritten in place as instructed).
  `app/(customer)/products.tsx`, `features/catalog/index.ts`,
  `features/catalog/docs/todo.md` and the SCAFFOLD worklog entry above are
  byte-identical to the Lead's scaffold (verified via git diff). No shared
  file, no T03 component, no route table, no generator run, no commit.
- No structural artifact was needed beyond the planned scaffold; nothing
  missing was created.

FRESH TASK REVIEW + GATE (T05, Lead)

- Fresh code-reviewer (read-only; skills: kisok-code-review, kisok-design-system,
  kisok-react-native-rules, expo-router) re-ran every check first-hand (products
  suite 10/10, feature 12/86, repo 29/224, typecheck, lint, prettier,
  check:docs, export:web with /products + /(customer)/products in the static
  routes). Verdict: 0 blocking / 0 major; 2 minors recorded in review.md.
- T05-R01 (accept): the card inset (grid `px-4` + T03 row `p-1.5` = 22px) sits
  2px inside the 24px header margin — imperceptible; gutter matches Home. The
  worklog's original alignment claim was wrong and has been corrected above;
  visual confirmation assigned to the Round 3 gate browser check. The shared
  T03 grid is deliberately NOT edited for this (scope; changes other grids).
- T05-R02 (fix): todo.md checkpoint lagged the finished work — fixed by the Lead
  while recording this review (T03-R01 precedent).
- T04-R03 stated rule verified in T05: full-screen error only without data, and
  a dedicated test pins the background-refetch-failure-keeps-grid behavior.
- GATE: PASS — T05 complete. Working tree committed by the Lead.

SCAFFOLD (T06, Lead — JIT, immediately before delegation)

- `pnpm generate screen catalog search` → created
  `features/catalog/screens/search/search-screen.tsx` (placeholder TODO on the
  standard `Screen` shell) and `…/search-screen.test.tsx` (baseline
  mount-without-throwing test, to be rewritten RED-first in place).
- `pnpm generate route catalog search --role=customer --screen=search` →
  created thin `app/(customer)/search.tsx` rendering `SearchScreen` from
  `@/features/catalog` and appended
  `export { SearchScreen } from "./screens/search/search-screen"` to
  `features/catalog/index.ts`.
- Lead inspection: placeholder content is the generated TODO; baseline test
  asserts only the title; route file is the standard thin route; barrel gains
  exactly one export. Tree before delegation: b7f7db7 + the T06 scaffold.

RED (T06, Implementer)

- Rewrote `features/catalog/screens/search/search-screen.test.tsx` in place
  (as instructed) into the behavioral suite: 15 tests covering the four
  DISTINCT search states (idle prompt, too-short hint, no-match message,
  results count + grid), product-name and associated-field (category)
  matching, case/diacritic-insensitive matching through the screen
  ("ALPINÉ" → plain "Alpine …" names), SKU/barcode exclusion, result-card
  push params, root replace semantics, snapshot-layer states (cold loading,
  error-without-data + retry, non-retryable, whole-catalog empty), and the
  T04-R03 background-refetch rule.
- `$ pnpm exec jest features/catalog/screens/search --runInBand`
  → **15/15 failed** against the placeholder screen. Failure cause verified
  as missing behaviour, not a broken test: every failure renders the
  placeholder tree (`Search` title + `TODO: build this screen. See
features/catalog/docs/todo.md.`) — no accessible header, no labelled
  search input ("Unable to find an element with accessibility label: Search
  products"), no state copy, no loading/error/empty surface. No import or
  setup errors.

IMPLEMENT (T06, Implementer)

- `search-screen.tsx`: snapshot layer exactly per the T04/T05 pattern and the
  T04-R03 stated rule (`isPending` → cold `LoadingState` only; `isError &&
!data` → full-screen `ErrorState` with retry; `products: []` →
  whole-catalog `EmptyState` with refetch action, same copy as Home/Products
  — the search surface does not render in those states). Search layer: shared
  `Input` primitive (visible `label="Search products"` doubles as the
  accessible name; `autoFocus`, `autoCapitalize="none"`, `autoCorrect={false}`,
  `returnKeyType="search"`), query held ONLY in component state, `view.search(
query)` computed per keystroke (no debounce, no re-implemented matching), and
  one persistent status `Text` with `accessibilityLiveRegion="polite"` whose
  exhaustive-switch copy renders the idle prompt / too-short hint / no-match
  message / result count — one live element so screen readers hear state
  changes, and the input is never unmounted or blurred between states.
  Results render through the T03 `CatalogGrid` (FlashList, 2/3/4 columns) —
  a two-character query can match the whole catalog, so the result set is
  unbounded and virtualizes per the RN list rules; same stable-prop contract
  as Products (module-scope keyExtractor, `useCallback` renderItem/press).
  `CatalogNavigation current="search"` with the exhaustive REPLACE switch +
  `never` default; result cards PUSH `/product-detail` with
  `{ productId }` (object form).
- Route/export verification: `app/(customer)/search.tsx` is the generated
  thin route rendering `SearchScreen` from `@/features/catalog` — correct as
  scaffolded, NOT modified; `features/catalog/index.ts` already exports
  exactly `SearchScreen` — NOT modified.

GREEN (T06, Implementer)

- `$ pnpm exec jest features/catalog/screens/search --runInBand`
- 1 suite, 15 tests PASS, zero console output. (Initial run 12/15: three
  tests typed before awaiting the snapshot resolve — fixed by adding the same
  `waitFor(IDLE_PROMPT)` sequencing the other typing tests already had; no
  assertion weakened.)

AFFECTED CHECKS (T06, Implementer)

- Whole feature: `$ pnpm exec jest features/catalog --runInBand` → 13 suites,
  101 tests PASS (T01 model, T02 api/queries, T03 components, T04 Home, T05
  Products, T06 Search), zero console output.
- Full repository suite: `$ pnpm exec jest --silent --runInBand` → 30 suites,
  239 tests PASS (Lead's T05 baseline was 29/224: +1 suite, +15 tests).
- `pnpm typecheck` → PASS.
- `pnpm lint` (expo lint) → PASS (no warnings).
- Prettier: `--write` then `--check` on the two screen files → PASS; focused
  tests re-run after the format pass → 15/15 PASS; repo-wide
  `pnpm exec prettier --check .` → PASS.
- `pnpm check:docs` → PASS (63 files).
- `pnpm export:web` → PASS; `› Static routes (13):` now includes `/search`
  and `/(customer)/search` (11 → 13 since T05); `Exported: dist`. (Detail
  routes `/brands`, `/categories`, `/brand-detail`, `/category-detail`,
  `/product-detail` are T07–T09 as planned; tests assert router calls, not
  actual navigation.)

DIFF REVIEW (T06, Implementer)

- Changed exactly two files, both in `features/catalog/screens/search/`
  (screen + its test, the latter rewritten in place as instructed). The
  Lead's scaffold edits to `app/(customer)/search.tsx`,
  `features/catalog/index.ts`, `features/catalog/docs/todo.md` and the
  SCAFFOLD worklog entry above are untouched (verified via git diff). No
  shared file, no T03 component, no route table, no generator run, no commit.
- No structural artifact was needed beyond the planned scaffold; nothing
  missing was created.

FRESH TASK REVIEW + GATE (T06, Lead)

- Fresh code-reviewer (read-only; skills: kisok-code-review, kisok-design-system,
  kisok-react-native-rules, expo-router) re-ran every check first-hand
  (search suite 15/15, feature 13/101, repo 30/239, typecheck, lint, prettier,
  check:docs, export:web with /search + /(customer)/search among 13 static
  routes) and verified the implementation claim-by-claim: the four distinct
  search states with distinct assertions; the T04-R03 rule; the pure local
  projection (no network/RPC/SKU/barcode/ranking/debounce); the associated-field
  search claim (the "top" query genuinely matches through the `Tóp Picks`
  category path); backend order; object-form push; input a11y (live-region
  choice judged correct); stable grid props; exhaustive switches; RED
  credibility against the real generator template; the disclosed GREEN
  sequencing fix (no weakening); scope and boundaries clean.
- Verdict: 0 blocking / 0 major; 1 minor (T06-R01, checkpoint lag — fixed by the
  Lead while recording this review, T05-R02 precedent; convention adopted for
  T07–T09 prompts). Recorded in review.md.
- GATE: PASS — T06 complete. Working tree committed by the Lead.

ROUND 3 GATE (Lead)

- Lead integrated verification on HEAD b039dc7: whole feature 13 suites/101
  tests, repo 30/239, typecheck/lint/format/check:docs PASS; export:web with 13
  static routes; `pnpm verify`-class checks green.
- Browser journey on the exported build (deterministic mock chain; zero console
  output): sign-in → Home (identity heading, navigation, three bounded
  sections); Home → Products via Browse-all (REPLACE; URL /products; heading,
  "3 products" count, three equal-width 300px cards in one row, 12px gutter
  matching Home, the accepted 2px card inset of T05-R01 visually confirmed);
  Products → Search via root nav; the four search states live (idle prompt,
  too-short "Keep typing…", results "1 matching product" singular, no-match with
  the named query); diacritic query "CAFÉ" matched Café Crème through the real
  normalization path; result card press landed on the exact target
  `/product-detail?productId=55555555-5555-4555-8555-8555-555555555555`
  (not-found fallback expected — the route lands in T09; the route TARGET is
  what Round 3 verifies).
- Fresh Round reviewer (read-only): all five round-level integration assertions
  verified clean (same T03 components and single query pipeline; identical
  state-rule/copy across surfaces; AC-08 replace-only roots with byte-identical
  exhaustive switches and object-form detail pushes; virtualized unbounded grids
  vs bounded Home; stable-prop contract). Verdict PASS — 0 blocking/0 major;
  1 minor R3-R01 (root-nav switch duplicated 3×, byte-identical; accepted with
  a revisit note folded into T07/T08 planning). Recorded in review.md.
- Round 3 gate: PASS. Push to origin remains deferred (no credentials in this
  environment); Draft PR #7 stays open on GitHub.

SCAFFOLD (T07, Lead — JIT, immediately before delegation)

- `pnpm generate screen catalog brands` → `features/catalog/screens/brands/`
  (placeholder screen + baseline mount test).
- `pnpm generate screen catalog brand-detail` →
  `features/catalog/screens/brand-detail/` (placeholder screen + baseline test).
- `pnpm generate route catalog brands --role=customer --screen=brands` → thin
  `app/(customer)/brands.tsx` rendering `BrandsScreen`.
- `pnpm generate route catalog brand-detail --role=customer --screen=brand-detail`
  → thin `app/(customer)/brand-detail.tsx` rendering `BrandDetailScreen`; the
  generated docblock documents the intended params pattern (read
  `useLocalSearchParams` here and pass to the screen as props) — this route file
  is the one the T07 packet sanctions editing to pass `brandId`.
- `features/catalog/index.ts` gained exactly two exports (`BrandsScreen`,
  `BrandDetailScreen`).
- Lead inspection: both placeholders are the generated TODO; baseline tests
  assert only titles; both routes are the standard thin shape; barrel gains
  exactly two exports. Tree before delegation: 6dd13ed + the T07 scaffold.

RED (T07, Implementer)

MODE: behavior — ACCEPTANCE: AC-04

- Rewrote BOTH generated baseline tests in place (as instructed) into the
  behavioral suites: 10 tests for Brands (mount + every identity + "4 brands"
  count; per-card derived counts incl. "0 products"; whole-card presses →
  exact `/brand-detail` `brandId` params incl. a zero-product brand; root
  REPLACE semantics ×5; empty brand collection → "No brands yet" +
  "Browse all products" → `replace("/products")`; cold loading;
  error-without-data with retry + non-retryable; T04-R03 background-refetch
  rule; whole-catalog empty ≠ local no-brands) and 12 tests for Brand Detail
  (mount + identity; scope: only the requested brand's products in backend
  order, other-brand and unbranded absent; product presses → exact
  `/product-detail` params; no-image brand via shared fallback; zero-products
  brand → local empty with `back()` way back + `replace("/products")` onward;
  stale ID → local "Brand not found" NOT the snapshot ErrorState; route param
  passing via the real `app/(customer)/brand-detail` route against the mocked
  `useLocalSearchParams`; cold loading; error-without-data + retry +
  non-retryable; whole-catalog-empty wins over not-found; T04-R03 rule).
- Fixture: 4 brands with DISTINCT product sets (Élite 2, Basics 1,
  Atelier Céramique 3, Alpine Works 0 — a zero-product brand) + the unbranded
  Everyday Tote that must never leak into a brand, and the stale id
  `65656565-…`. `useRouter` mocked with push/replace/back spies and
  `useLocalSearchParams` with a settable params object (the route seam);
  API seam mocked at `../../api/fetch-catalog`; fake timers (FlashList);
  lucide stubbed; zero console output.
- `$ pnpm exec jest features/catalog/screens/brands
features/catalog/screens/brand-detail --runInBand`
  → **22/22 failed** (2 suites) against the placeholder screens. Failure
  cause verified as missing behaviour, not broken tests: every failure
  renders the placeholder tree (`Brands`/`BrandDetail` title + `TODO: build
this screen. See features/catalog/docs/todo.md.`) — no header, no grid, no
  counts, no state copy, and the route test fails on the unresolved brand
  (the route does not pass `brandId` yet). No import or setup errors; the
  relative route import from the test resolved.

IMPLEMENT (T07, Implementer)

- `brands-screen.tsx`: snapshot layer exactly per the T04/T05/T06 pattern and
  the T04-R03 stated rule (`isPending` → cold `LoadingState` only;
  `isError && !data` → full-screen `ErrorState` with retry; `products: []` →
  whole-catalog `EmptyState` with refetch action, same copy as the other
  surfaces, checked BEFORE the brand-collection check so a productless
  catalog never "directs to Products" it does not have). All `view.brands`
  render through the T03 `CatalogGrid` (FlashList, 2/3/4 columns) as
  `BrandCard`s — the brands collection is unbounded in principle, so the
  feature's scalable composition is the honest choice (no stated size
  ceiling exists for a bounded one); heading "All brands" + "N brands" count
  - `CatalogNavigation current="brands"` with the byte-identical exhaustive
    REPLACE switch + `never` default (R3-R01 accepted disposition); card
    presses PUSH `/brand-detail` with `{ brandId }` (object form). Empty brand
    collection (products exist): local `EmptyState` "No brands yet" whose
    action REPLACEs to `/products` — a root change with replace semantics, and
    the empty surface has nothing to come back to.
- `brand-detail-screen.tsx`: takes `brandId` as a prop (view state). Snapshot
  layer identical (incl. whole-catalog empty winning over brand resolution).
  `view.resolveBrand(brandId)` returning undefined renders the LOCAL
  not-found state — `EmptyState` "Brand not found" + "Go back" →
  `router.back()` — NOT `ErrorState`, no retry, no crash. Valid brand: header
  `Go back` (ghost Button, `router.back()` — the brief's "obvious way back to
  the discovery surface that opened them"; back can never duplicate root
  history) + `BrandIdentity` (AppImage via the card's media contract with its
  fallback, name as h1, derived "N products") then
  `view.productsForBrand(brandId)` as `ProductCard`s in `CatalogGrid`
  (backend order), each press → PUSH `/product-detail` with `{ productId }`.
  Zero products under a valid brand: identity stays, distinct local
  `EmptyState` "No products yet" with "Browse all products" →
  `replace("/products")` (onward) alongside the header back control (way
  back). Root `CatalogNavigation` deliberately NOT rendered on the detail
  screen: replace-to-root from a pushed detail would duplicate the root entry
  directly below it ([/brands, /brand-detail] → [/brands, /brands]), the
  duplicate-root stacking AC-08 forbids — documented in the screen docblock.
- Route edit (sanctioned): `app/(customer)/brand-detail.tsx` now reads
  `useLocalSearchParams<{ brandId: string }>()` and passes `brandId` to
  `BrandDetailScreen` as a prop; still thin (no data loading/state/logic).
  `app/(customer)/brands.tsx`, `features/catalog/index.ts` untouched —
  correct as scaffolded.

GREEN (T07, Implementer)

- `$ pnpm exec jest features/catalog/screens/brands
features/catalog/screens/brand-detail --runInBand`
- 2 suites, 22 tests PASS, zero console output (checked for
  warn/console/act noise), first run after implementation.

AFFECTED CHECKS (T07, Implementer)

- Whole feature: `$ pnpm exec jest features/catalog --runInBand` → 15 suites,
  123 tests PASS (T06 baseline 13/101: +2 suites, +22 tests), zero console
  output.
- Full repository suite: `$ pnpm exec jest --silent --runInBand` → 32 suites,
  261 tests PASS (Lead's T06 baseline 30/239: +2 suites, +22 tests).
- `pnpm typecheck` → PASS.
- `pnpm lint` (expo lint) → PASS (no warnings).
- Prettier: `--write` then re-run of the focused suites (22/22 PASS again),
  repo-wide `pnpm exec prettier --check .` → PASS.
- `pnpm check:docs` → PASS (63 files).
- `pnpm export:web` → PASS; `› Static routes (17):` now includes `/brands`,
  `/brand-detail`, `/(customer)/brands` and `/(customer)/brand-detail`
  (13 → 17 since T06); `Exported: dist`. (Remaining detail routes
  `/categories`, `/category-detail`, `/product-detail` are T08–T09 as
  planned; tests assert router calls, not actual navigation.)

DIFF REVIEW (T07, Implementer)

- Changed/created by the implementer: the two screen files and their two
  in-place-rewritten tests (all inside `features/catalog/screens/brands/`
  and `features/catalog/screens/brand-detail/`), the sanctioned
  `app/(customer)/brand-detail.tsx` param edit, plus the T07 checklist ticks
  in the feature's `docs/todo.md` and this worklog entry.
  `app/(customer)/brands.tsx` and
  `features/catalog/index.ts` verified untouched (Lead scaffold shape
  intact); no shared file, no T03 component, no route table, no generator
  run, no commit. Nothing unrelated to T07 found in the diff.
- No structural artifact was needed beyond the planned scaffold; nothing
  missing was created. (The test-only relative import of the route module is
  not a structural artifact — the route file is the Lead's scaffold, imported
  read-only.)

REMEDIATION (T07, Implementer — same task, T07-R01 major)

- **Finding (T07-R01, major):** the zero-product Brand Detail state was
  unreachable under the real data contract and the plan prohibits covering
  unreachable states. Contract evidence:
  `supabase/migrations/20260826050006_lean_customer_catalog.sql:57-64` —
  `used_brands` returns only brands with `exists (select 1 from valid_products
p where p.brand_id = b.id)`, so every snapshot brand carries ≥1 valid
  product; `resolveBrand(id)` succeeding implies
  `productsForBrand(id).length >= 1`. A brand that loses all its products
  disappears from `brands`, so `resolveBrand` returns undefined — the
  not-found state, which was built correctly and stays. Root cause was the
  Lead's composed task packet (it required the state); the original T07
  checklist criterion "no impossible zero-product detail" was the correct
  rule and is enforced again.
- **Lead decision, option (a) — REMOVE.** Changes, all inside the same T07
  allowed scope:
  - `features/catalog/screens/brand-detail/brand-detail-screen.tsx`: removed
    the `products.length === 0` branch (the "No products yet" `EmptyState`
    with its "Browse all products" onward action) — a resolved brand now
    renders its `CatalogGrid` directly. Docblock updated: the
    stale/invalid-id paragraph now states the `used_brands` contract and that
    no reachable zero-products state exists; the back-affordance paragraph no
    longer mentions "not-found/empty states". No dead copy or helpers remain
    (`productCountLabel` and `BrandIdentity` are still used by the resolved
    path).
  - `features/catalog/screens/brands/brands-screen.test.tsx`: the fixture
    brand "Alpine Works" gained two products ("Alpine Flask" available,
    "Alpine Torch" unavailable, display order 70/80) so every fixture brand
    has ≥1 product. Its derived-count assertion became
    "Alpine Works, 2 products" (the singular "1 product" form is still pinned
    via KISOK Basics) and its whole-card press case still asserts the exact
    `brandId` param. File-header and fixture docblocks updated; press/comment
    copy updated. Test count unchanged (10).
  - `features/catalog/screens/brand-detail/brand-detail-screen.test.tsx`:
    removed the zero-products state test (the former "shows a local empty
    state with a way back for a brand with zero products") and the
    `noBrandProductsDescription` copy helper. "Alpine Works" also gained the
    two products in this suite's fixture (shared shape) so the fixture stays
    contract-possible; header/fixture docblocks updated. 12 → 11 tests.
  - **Kept unchanged (reachable, per the remediation instruction):** the
    stale/invalid-ID not-found state + its tests; the empty brand collection
    state + its tests; the guard-ordering test (`products: []` →
    whole-catalog empty wins over resolution); all scope, snapshot-state,
    route-param and background-refetch tests. The guard-ordering fixture's
    brands-without-products remains an acknowledged mechanism to pin ordering,
    tolerable per the review.
- **GREEN (remediation):** `$ pnpm exec jest features/catalog/screens/brands
features/catalog/screens/brand-detail --runInBand` → 2 suites, **21 tests
  PASS** (was 22; one zero-product test removed), zero console output
  (warn/console/act noise grep clean).
- **AFFECTED CHECKS (remediation):** whole feature
  `pnpm exec jest features/catalog --runInBand` → 15 suites, **122 tests PASS**
  (was 123); full repository `pnpm exec jest --silent` → 32 suites, **260
  tests PASS** (was 261); `pnpm typecheck` PASS; `pnpm lint` PASS; scoped
  `prettier --write` (all four touched files already unchanged) and repo-wide
  `prettier --check .` PASS; `pnpm check:docs` PASS (63 files).
- **Diff:** remediation touched only the three files above (all inside the
  T07 screen directories). No route, barrel, component, shared or core file
  changed in remediation; no generator run; no commit.

FRESH TASK REVIEW + REMEDIATION + RE-REVIEW + GATE (T07, Lead)

- Fresh code-reviewer (read-only; skills: kisok-code-review, kisok-design-system,
  kisok-react-native-rules, expo-router) reviewed the T07 packet and found
  **T07-R01 major**: the composed task packet required Brand Detail to cover a
  resolved brand with zero products, but `used_brands`
  (`supabase/migrations/20260826050006_lean_customer_catalog.sql:57-64`)
  only returns brands with ≥1 valid product, so the state is unreachable and
  the plan's cover-only-reachable-states policy forbids covering it. Root
  cause: the Lead's composed task packet (the implementer followed the
  instruction); the original checklist criterion was correct and is enforced
  again. Recorded in review.md.
- Lead disposition: fix, option (a) REMOVE — executed by a fresh implementer
  (REMEDIATION section above; all inside the T07 allowed scope).
- Lead re-verification in a fresh session before gating: feature 15 suites/122
  tests PASS (zero console output), `pnpm typecheck` PASS.
- Fresh re-reviewer (read-only): T07-R01 **RESOLVED** — zero-products branch
  fully gone with no dead code/copy; docblock honestly documents the
  `used_brands` contract (verified in the migration first-hand: brands payload
  built from `used_brands`, products from `valid_products`, so resolution
  implies ≥1 product); fixtures now contract-possible with every brand ≥1
  product, derived counts and exact-param presses still pinned, singular form
  still pinned; kept states intact (not-found, empty brand collection,
  guard-ordering, real route-module param test); scoped 2 suites/21 tests and
  feature 15/122 re-run PASS zero console output; T04-R03 rule enforced in
  both screens; R3-R01 root-nav switch is a 4th byte-identical copy; eslint
  clean, no suppressions; remediation scope exactly three files. 0 new
  blocking/major. Recorded in review.md.
- GATE: PASS — T07 complete.
- Super Z session note (2026-09-02): the Super Z operator has directed that
  remaining session work be delivered on a NEW branch `catalog-v2-super`
  (created from this branch's HEAD, carrying ALL catalog feature work) with a
  NEW PR opened from it; `feature/catalog` and Draft PR #7 receive no further
  pushes from this session. The T07 commit (next entry) lands on
  `catalog-v2-super`; the feature branch history T01–T06 is included by
  branch ancestry.

CATALOG-V2-SUPER DELIVERY BRANCH AND PR #10 (Lead)

- Operator directive (Super Z session, 2026-09-02): remaining session work is
  delivered on a NEW branch `catalog-v2-super` (created from this feature's
  local HEAD 6dd13ed, so it carries the complete catalog lineage T01–T07 by
  ancestry) with a NEW PR opened from it; `feature/catalog` and Draft PR #7
  receive no further pushes from this session.
- Remote state at the time: `origin/feature/catalog` had advanced to 305399d
  with a PARALLEL lineage (4fa581e "shared discovery components" + 305399d
  "deliver Catalog Home" — a T03/T04-only reimplementation that diverged from
  efda0f6). That lineage is NOT part of this delivery: `catalog-v2-super` is
  a clean descendant of `develop` (80b8ac3) through this feature's own
  history, avoiding duplicate/conflicting implementations of the same tasks.
- T07 committed on `catalog-v2-super` as 8c6c50d
  "feat(catalog): add brand discovery and detail screens and routes" and
  pushed with the operator-provided token (one-off URL auth; no credentials
  persisted in the repository).
- New Draft PR #10 opened: `catalog-v2-super` -> `develop`, title
  "feat(catalog): customer catalog discovery (v2 delivery)". Mergeable with
  `develop` (no conflicts): 9 commits, 43 files, +8602/-16. GitHub CI
  triggered on 8c6c50d. The PR stays Draft until the Feature Gate and human
  handoff; the delivery never merges.

SCAFFOLD (T08, Lead — JIT, immediately before delegation)

- Commands run in order (2026-09-02, on `catalog-v2-super` at 1ae9988):
  1. `pnpm generate screen catalog categories`
  2. `pnpm generate screen catalog category-detail`
  3. `pnpm generate component catalog category-brand-filter --screen=category-detail`
  4. `pnpm generate route catalog categories --role=customer --screen=categories`
  5. `pnpm generate route catalog category-detail --role=customer --screen=category-detail`
- Generated exactly the planned file set: `screens/categories/`
  (screen placeholder + baseline mount test), `screens/category-detail/`
  (screen placeholder + baseline mount test), screen-local
  `screens/category-detail/components/category-brand-filter.tsx`
  (presentational placeholder, no test yet — the test is T08's allowed manual
  file), thin routes `app/(customer)/categories.tsx` and
  `app/(customer)/category-detail.tsx`, and exactly two new barrel exports in
  `features/catalog/index.ts` (`CategoriesScreen`, `CategoryDetailScreen`).
  No skips, no replacements, no extra files.
- Route inspection: both routes thin (no data/state/logic) and import only
  `@/features/catalog`. `app/(customer)/category-detail.tsx` is the one the
  T08 packet sanctions editing to pass `categoryId` — left scaffold-thin at
  this stage; the implementer applies the sanctioned edit (T07 precedent: the
  RED route-param test fails because the route does not pass the param yet).
- Scaffold coherence verified: `pnpm typecheck` PASS; the two baseline tests
  pass (2 suites/2 tests — mount-only assertions against the placeholders).
- Tree before delegation: 1ae9988 + the T08 scaffold (uncommitted).

T08 IMPLEMENTATION (feature-implementer, 2026-09-02)

MODE: behavior — ACCEPTANCE: AC-02 (completion), AC-05 (the Lead gates)

RED (T08, Implementer) — all three suites written first, run against the Lead's placeholders:

- Command: `pnpm exec jest features/catalog/screens --runInBand`
- Output: `Test Suites: 3 failed, 5 passed, 8 total` / `Tests: 32 failed,
58 passed, 90 total` — exactly the three new suites failing (Categories 10,
  Category Detail 15, Category Brand Filter 7), the five pre-existing screen
  suites still green.
- Failure reasons verified as the intended MISSING BEHAVIOR, not typos or
  unresolved imports: every failure is an "Unable to find an element…"
  assertion (e.g. role header "Drínks", text "Filter by brand", the
  hierarchy/count/chip elements) while the placeholders render only their
  TODO copy; the route-param test fails because `app/(customer)/category-detail`
  does not yet pass `categoryId` (T07 precedent).

IMPLEMENT (smallest change, inside the T08 allowed scope only):

- `features/catalog/screens/category-detail/components/category-brand-filter.tsx`
  — the presentational brand filter: "All Brands" default chip plus one chip
  per option, mutually exclusive, `accessibilityState.selected` + primary/ghost
  variants (the CatalogNavigation chip pattern), callback reports the brand id
  or `null` (reset-to-all).
- `features/catalog/screens/category-detail/category-detail-screen.tsx` —
  Category Detail: snapshot layer (cold loading / error-without-data / whole-
  catalog empty — T04-R03 rule), stale-id LOCAL not-found with `Go back`,
  `CategoryIdentity` (AppImage + derived aggregated count, the same number the
  cards show), horizontal child-card strip for roots, `view.productsForCategory
(categoryId, selectedBrand?.brandId ?? null)` in `CatalogGrid`, and the
  inline no-match state with the "Show all brands" reset.
- `features/catalog/screens/categories/categories-screen.tsx` — All Categories:
  flat ordered hierarchy projection (each root followed by its direct
  children) in `CatalogGrid`, root-nav REPLACE switch byte-identical to the
  other screens (4th copy, R3-R01), local empty-collection way-onward to
  Products, whole-catalog empty same copy family.
- `app/(customer)/category-detail.tsx` — the sanctioned edit: reads
  `useLocalSearchParams<{ categoryId: string }>()` and passes `categoryId` to
  the screen as a prop; the route stays otherwise thin (T07 pattern).
- `features/catalog/screens/category-detail/components/category-brand-filter.test.tsx`
  — the allowed manual test file (7 tests: options, selected representation,
  id/null callback contract, empty options, controlled re-render purity).
- Both generated baseline screen tests REWRITTEN in place as behavioral suites
  (the mount-without-throwing intent survives as the first test of each).
- `app/(customer)/categories.tsx`, `features/catalog/index.ts`: untouched —
  the Lead scaffold versions were already correct/thin.

One implementation bug was caught by the RED tests during GREEN and fixed
in-scope: the screen read `selectedBrand.id` instead of `selectedBrand.brandId`
(the option type's field), which produced a duplicate Élite chip and an
unfiltered grid; fixed in `category-detail-screen.tsx` (3 occurrences) and the
suites went green with zero console output (the duplicate-key warning that led
to the fix no longer appears).

GREEN:

- Command: `pnpm exec jest features/catalog/screens --runInBand`
- Output: `Test Suites: 8 passed, 8 total` / `Tests: 90 passed, 90 total`,
  zero console output.

AFFECTED CHECKS:

- Whole feature: `pnpm exec jest features/catalog --runInBand` →
  `Test Suites: 18 passed, 18 total` / `Tests: 154 passed, 154 total`, zero
  console output (was 15/122 before T08; +3 suites/+32 tests, all T08).
- Full repo: `pnpm test:ci` → `Test Suites: 35 passed, 35 total` /
  `Tests: 292 passed, 292 total` (was 32/260 after T07).
- `pnpm typecheck` → PASS (clean).
- `pnpm lint` → PASS (exit 0, no findings).
- Formatting: `prettier --write` fixed 2 new test files (line wrapping only),
  then `pnpm format:check` → PASS for the whole repo.
- `pnpm check:docs` → PASS (`Documentation matches the current workflow
(63 files checked).`).
- `pnpm export:web` → PASS; 21 static routes including `/categories`,
  `/category-detail`, `/(customer)/categories`, `/(customer)/category-detail`.

TASK DIFF REVIEW (implementer's own read):

- Scope exactly the T08 packet: the two screen directories (screens + rewritten
  tests + the one allowed brand-filter test), the sanctioned
  `app/(customer)/category-detail.tsx` param edit, and Catalog docs. No shared
  files, no `components/`, no model/query/api changes, no route table edits,
  no Supabase/Zustand/TanStack imports anywhere in the new files (verified by
  grep). Root-nav switch verified byte-identical to `brands-screen.tsx` by
  diff. Every fixture category satisfies `used_categories` (each carries ≥1
  valid product direct or via children); no unreachable unfiltered
  zero-products state was built or tested (T07-R01 lesson).

REMEDIATION (T08, Implementer — 4 minor findings, Lead dispositioned FIX)

- T08-R01 (minor, docblock overstatement): `categories-screen.tsx` docblock
  claimed Category Detail makes "the two-level context (parent, own children,
  scoped products) explicit" — but nothing on Category Detail renders a
  child's parent. Corrected: the detail makes the card's own context explicit
  (its direct children strip and its scoped products); the parent of a child
  is NOT rendered there, and the way back to it is the detail's `Go back`
  control. Docblock only, no behaviour change.
- T08-R02 (minor, unpinned order): the flat adjacency projection (each root
  immediately followed by its direct children) was asserted by presence only.
  Added one order-pinning assertion to the hierarchy-projection test in
  `categories-screen.test.tsx` (the `getAllByRole("button")` +
  `accessibilityLabel` map pattern): exact order
  `["Drínks, 4 products", "Tóp Picks, 2 products", "Gear, 1 product"]`.
  These are pinning assertions for existing correct behaviour — run and PASS
  against the current implementation (no behaviour change, no RED required).
- T08-R03 (minor, unpinned identity count under filter):
  `category-detail-screen.test.tsx` — in the selected-brand test, the header
  now asserts the DERIVED AGGREGATED count "4 products" while the grid shows
  only the filtered subset; in the no-match test, the header asserts "4
  products" while the grid is empty. Both pin that the identity count
  describes the category (same number the Categories cards show), never the
  filter. Pass against the current implementation — pinning, not RED.
- T08-R04 (minor, unpinned root-nav absence): the mount/valid-category test
  in `category-detail-screen.test.tsx` now asserts the documented AC-08
  decision — none of the five root destinations (Home/Products/Brands/
  Categories/Search) renders on this detail screen (replace-from-pushed-detail
  would duplicate root history). Pass against the current implementation.

Evidence after remediation (same commands, all zero console output):

- `pnpm exec jest features/catalog/screens --runInBand` → 8 suites / 90 tests
  PASS (the assertion additions live inside existing tests, so the count is
  unchanged; all four fixes are pins/corrections, not new behaviour).
- `pnpm exec jest features/catalog --runInBand` → 18 suites / 154 tests PASS.
- `pnpm typecheck` → PASS (exit 0). `pnpm lint` → PASS (exit 0).
- Scoped `prettier --write` on the touched screen files → all "(unchanged)";
  `prettier --check` PASS.
- Scope: exactly the two T08 screen directories + Catalog docs; nothing else
  changed (FRESH TASK REVIEW box intentionally left unticked for the re-review).

FRESH TASK REVIEW + REMEDIATION + RE-REVIEW + GATE (T08, Lead)

- Fresh code-reviewer (read-only; skills: kisok-code-review, kisok-design-system,
  kisok-react-native-rules, expo-router) reviewed the T08 packet: **0 blocking /
  0 major / 4 minors** — T08-R01 (docblock overstatement: "parent" claimed as
  explicit on detail), T08-R02 (flat-adjacency hierarchy order unpinned),
  T08-R03 (identity-count-under-filter unpinned), T08-R04 (root-nav absence on
  detail unpinned). The reviewer verified all evidence first-hand (feature
  18/154, repo 35/292, typecheck/lint/format/check:docs, export:web 21 static
  routes; R3-R01 5th switch copy hash-identical; contract accuracy of the
  no-match reachability reasoning; todo ticks honest). Recorded in review.md.
- Lead disposition: all four FIX (all cheap, all inside the T08 allowed scope;
  pins strengthen the hierarchy-projection and AC-08 criteria).
- Remediation executed by the resumed T08 implementer: docblock corrected
  (T08-R01); exact flat-adjacency order pinned via regex-exclusive
  `getAllByRole` + accessibilityLabel map (T08-R02); header aggregated-count
  asserted beside the filtered grid and beside the empty no-match grid
  (T08-R03); five root-destination absence assertions (T08-R04). Pins added
  INSIDE existing tests — feature count stays 18 suites/154 tests. All pins
  verified passing against the current (correct) implementation — they are
  regression pins, not behavior changes.
- Re-review (resumed same reviewer): all four RESOLVED; 0 new
  blocking/major/minor; remediation footprint verified as exactly the four
  claimed files (mtime + line-shift analysis); R3-R01 hash re-verified across
  all five screens post-remediation. Recorded in review.md.
- Lead re-verification: feature 18/154 PASS (zero console output), typecheck
  PASS, export:web 21 static routes incl. `/categories` and `/category-detail`,
  check:docs PASS, diff scope exactly the T08 packet.
- GATE: PASS — T08 complete.

REMEDIATION (Round 4, Implementer — 2 minor round findings, Lead dispositioned FIX;
round-level scope extension authorized for R4-R01)

- R4-R01 (minor, selected chips not queryable on web): RN-web ignores the
  legacy `accessibilityState` on Pressable, so the selected chip state was
  invisible to assistive tech and role queries on web. Replaced with the
  platform-safe `aria-selected` prop in exactly two files (no test changes):
  `features/catalog/components/catalog-navigation.tsx:53` (the one T03-origin
  edit of this remediation — the chip pattern's origin) and both chips in
  `features/catalog/screens/category-detail/components/category-brand-filter.tsx`
  ("All Brands" line 67, per-option chip line 80), plus the matching docblock
  word in the filter. RN 0.81 supports `aria-selected` natively
  (`accessibilityState` is deprecated), RN-web 0.21 maps it to the DOM
  attribute, and RNTL v14 matches `aria-selected ?? accessibilityState?.selected`
  identically — verified live: every existing selected-state pin stays green
  with ZERO test churn (see the chip-suite run below).
- R4-R02 (minor, Brand Detail root-nav absence unpinned — T08-R04 pinned only
  Category Detail): mirrored the five root-destination absence assertions
  (Home/Products/Brands/Categories/Search → `toBeNull()`) into
  `features/catalog/screens/brand-detail/brand-detail-screen.test.tsx`'s
  mount/valid-brand test, with the same AC-08 duplicate-root-history rationale
  comment. Regression pin against current correct behaviour — run and PASS as
  written.

Evidence after remediation (all zero console output):

- Chip-asserting suites with the new spelling:
  `pnpm exec jest features/catalog/components features/catalog/screens/category-detail --runInBand`
  → 8 suites / 51 tests PASS (catalog-navigation + brand-filter selected pins
  included) — proving the zero-test-churn claim.
- Whole feature: `pnpm exec jest features/catalog --runInBand` →
  18 suites / 154 tests PASS (count unchanged; R4-R02's assertions live
  inside an existing test).
- `pnpm typecheck` → PASS (exit 0). `pnpm lint` → PASS (exit 0).
- Scoped `prettier --write` on the three files → all "(unchanged)";
  `prettier --check` PASS; suites re-run after with no diffs.
- Scope: exactly the three authorized files + this worklog entry; no todo.md
  box changes (the Round 4 gate box stays for the Lead).

ROUND 4 GATE (Lead)

- Lead integrated verification on `catalog-v2-super` (T07 8c6c50d + T08
  36c8f62): whole feature 18 suites/154 tests PASS (zero console output,
  re-run twice), typecheck, lint, prettier, check:docs PASS; export:web with
  21 static routes incl. both brand and both category routes.
- Browser journey on the exported web build (deterministic mock chain:
  `.env.local` local-origin Supabase URL; SPA-fallback static server on 8932;
  network route mocks for `auth/v1/token`, `auth/v1/user`,
  `rest/v1/rpc/current_active_profile`, `rest/v1/rpc/get_customer_catalog`;
  test-image host aborted; Metro --clear to re-inline env): sign-in → Home
  (identity "KISOK Test Store", navigation, bounded brand/category/featured
  sections); Home → Brands via root nav (REPLACE; URL /brands; 3 brand cards
  with derived counts matching Home); whole-card press → /brand-detail?brandId=
  1111…1111 exact (Maison Élite identity; ONLY its 2 products; Go back);
  root nav → /categories (REPLACE; hierarchy adjacency Drínks 4 / Tóp Picks 2
  / Gear 2 in exact flat order); whole-card press → /category-detail?
  categoryId=3333…3333 exact (identity "Drínks, 4 products"; Subcategories
  strip "Tóp Picks, 2 products"; 4 deduplicated products in backend order;
  filter chips All Brands + 3 brands); select Maison Élite → grid narrowed to
  its 2 products while the identity count stayed "4 products" (aggregated,
  T08-R03 pin confirmed live; selected chip primary background); reset All
  Brands → all 4 back; child press → /category-detail?categoryId=4444…4444
  exact (Tóp Picks; direct-membership 2 products; correct 3 brand options —
  Atelier absent); stale categoryId and stale brandId → local "Category not
  found" / "Brand not found" states with honest removal copy + Go back (never
  ErrorState); zero console output and zero page errors; network log shows
  ONLY current_active_profile + get_customer_catalog RPCs (no direct table
  reads).
- Lead finding from the live DOM introspection: the selected chips exposed no
  `aria-selected` in the web DOM (RN-web 0.21 does not map the legacy
  `accessibilityState` object prop for Pressable; only the individual
  `aria-selected` prop is mapped). Visual primary/ghost and native
  announcement unaffected. Confirmed at RN-web source level by the fresh
  Round reviewer → recorded as R4-R01 (minor).
- Fresh Round reviewer (read-only; skills: kisok-code-review,
  kisok-design-system, kisok-react-native-rules, expo-router): PASS verdict —
  all nine round-level assertions verified clean (cross-screen count
  consistency via the single view derivation; filtering local (api/queries
  untouched since da6b6c8); AC-08 navigation incl. the R3-R01 switch hash ×5;
  local not-found states; real-route-module param identity; single RPC
  pipeline; T07-R01/T08 contract continuity; integrated evidence re-run
  18/154 + typecheck + 21-route export; documentation coherent). 0 blocking /
  0 major / 2 minors: R4-R01 (the a11y web-DOM gap, independently confirmed)
  and R4-R02 (Brand Detail root-nav absence unpinned). Recorded in review.md.
- Lead disposition: both FIX (round-level remediation, scope extension
  explicitly authorized for `catalog-navigation.tsx` — the T03 origin of the
  pattern): R4-R01 → `aria-selected` spelling swap in the two chip components
  with ZERO test churn (RNTL v14 matches both spellings; 18/154 re-run PASS);
  R4-R02 → five absence assertions mirrored into Brand Detail's mount test.
  Remediation executed by the resumed T08 implementer (REMEDIATION (Round 4)
  section above). The Lead additionally amended `docs/design-system.md`'s
  "Announce state" bullet to prescribe the `aria-*` spelling (Lead-owned
  repo-doc edit; justification: the doc prescribed the pattern, and the
  platform-safe spelling prevents recurrence — R4-R01's root cause).
- Lead live re-verification of the fix on a fresh export: the filter chips
  expose `aria-selected=true` for the selected brand (others false) and the
  root-nav chips expose `Categories=true` on /categories; console clean.
- Re-review (resumed same Round reviewer): both R4-R01/R4-R02 RESOLVED; 0 new
  findings; remediation footprint verified as exactly the authorized file set
  - the Lead's doc edit; final recommendation PASS.
- Round 4 gate: PASS. Working tree committed by the Lead on `catalog-v2-super`
  and pushed (PR #10). Delivery continues with Round 5 / T09.

SCAFFOLD (T09, Lead — JIT, immediately before delegation)

- Commands run in order (2026-09-02, on `catalog-v2-super` at 64c9bb0):
  1. `pnpm generate screen catalog product-detail`
  2. `pnpm generate component catalog product-media-gallery --screen=product-detail`
  3. `pnpm generate component catalog variant-choice-list --screen=product-detail`
  4. `pnpm generate route catalog product-detail --role=customer --screen=product-detail`
- Generated exactly the planned file set: `screens/product-detail/`
  (screen placeholder + baseline mount test), screen-local
  `screens/product-detail/components/product-media-gallery.tsx` and
  `screens/product-detail/components/variant-choice-list.tsx`
  (presentational placeholders, no tests yet — the two colocated tests are
  T09's allowed manual files), thin route `app/(customer)/product-detail.tsx`,
  and one new barrel export in `features/catalog/index.ts`
  (`ProductDetailScreen`). No skips, no replacements, no extra files.
- Route inspection: thin (no data/state/logic), imports only
  `@/features/catalog`. `app/(customer)/product-detail.tsx` is the one the
  T09 packet sanctions editing to pass `productId` — left scaffold-thin at
  this stage; the implementer applies the sanctioned edit (T07/T08
  precedent: the RED route-param test fails because the route does not pass
  the param yet).
- Scaffold coherence verified: `pnpm typecheck` PASS; the baseline test
  passes (1 suite/1 test — mount-only assertion against the placeholder).
- Tree before delegation: 64c9bb0 + the T09 scaffold (uncommitted).

T09 IMPLEMENTATION (feature-implementer, 2026-09-02)

MODE: behavior — ACCEPTANCE: AC-07 primary; AC-03/AC-06 result targets and
AC-08 journey closure (the Lead gates)

RED (T09, Implementer) — all three suites written first, run against the Lead's
placeholders:

- Command: `pnpm exec jest features/catalog/screens/product-detail --runInBand`
- Output: `Test Suites: 3 failed, 3 total` / `Tests: 26 failed, 26 total,`
  `Snapshots: 0` — exactly the three new suites failing (Product Detail 14,
  Variant Choice List 6, Product Media Gallery 6).
- Failure reasons verified as the intended MISSING BEHAVIOR, not typos or
  unresolved imports: every failure is an "Unable to find an element…"
  assertion (header "Café Crème"/"Studio Kettle", variant chips, gallery image
  labels, not-found/empty/error copy, forbidden-copy absence pins) while the
  screen placeholder renders only its TODO copy and the component placeholders
  render theirs; the route-param test fails because
  `app/(customer)/product-detail` does not yet pass `productId` (T07/T08
  precedent). Test-infrastructure fixes made during RED/GREEN (not behaviour
  changes): the gallery test needed the same `lucide-react-native` stub every
  other image-rendering suite uses (parse failure of the un-stubbed ESM icon
  module); fixtures typed `as const satisfies readonly CatalogMedia[]` so
  `noUncheckedIndexedAccess` indexing type-checks; the secure-URL assertion
  helper types the rendered element structurally (`ReactTestInstance` is not
  re-exported by `@/core/testing`). One test assertion was corrected for
  exactness, NOT weakened: the "no duplicated option detail line" check used an
  over-broad `/Color: Rouge/` regex that also matched the options-variant's
  legitimate LABEL; it now targets the exact "·"-joined detail line, which is
  the actual intent.

IMPLEMENT (smallest change, inside the T09 allowed scope only):

- `features/catalog/screens/product-detail/components/variant-choice-list.tsx`
  — presentational generic variant selector: full-width primary/ghost Button
  entries, one per returned variant, labelled by the model's DERIVED `label`
  (consumed as-is, never re-derived), with the ordered "Type: value" pairs as
  a detail line ONLY on a `title_override` variant (the one case where the
  label hides them), words-only availability, `aria-selected` + primary/ghost
  (R4-R01 platform-safe spelling), accessible name "`label`, availability"
  (ProductCard pattern), unavailable entries never disabled — inspection only.
- `features/catalog/screens/product-detail/components/product-media-gallery.tsx`
  — presentational media surface: one large AppImage REMOUNTED BY RESOLVED URI
  (Design decision 12, `key={secureUrl}`) plus, only when there is more than
  one, a bounded horizontal strip of 64dp thumbnail Pressables (`aria-selected`
  - primary/border mirror); empty media degrades to AppImage's shared fallback
    through the same single path; default active media is the first of the set
    when the given id matches none.
- `features/catalog/screens/product-detail/product-detail-screen.tsx` —
  Product Detail: snapshot layer identical to the other detail screens (cold
  loading / error-without-data only — T04-R03 rule pinned by the background-
  refetch test / whole-catalog empty), stale `productId` → LOCAL "Product not
  found" not-found state with `Go back` (never `ErrorState`), identity
  composition = name header + T03 `AvailabilityBadge` (derived any-variant
  availability, Design decision 10, consumed as-is) + optional description,
  with the product COVER image composed through the gallery (the model's
  variant media already falls back to `coverMedia`; a second header thumbnail
  would duplicate the same secure URL on screen), brand + category context as
  navigable ghost chips that PUSH `/brand-detail` / `/category-detail`
  (object form, exact ids), screen-local variant/image selection (Design
  decision 3) with the first backend variant as default and the image pick
  reset to the new variant's primary on variant switch, and the header
  `Go back` ghost Button → `router.back()` with the AC-08 duplicate-root
  rationale docblock-documented. Zero-variant resolved product: unreachable
  under `valid_products` — not built, not tested; the `variants[0]` fallback
  fails LOUDLY (throw) if the contract ever breaks instead of rendering a fake
  empty state (T07-R01 lesson).
- `app/(customer)/product-detail.tsx` — the sanctioned edit only: reads
  `useLocalSearchParams<{ productId: string }>()` and passes `productId` to the
  screen as a prop; the route stays otherwise thin (T07/T08 pattern).
- `features/catalog/screens/product-detail/product-detail-screen.test.tsx` —
  the generated baseline test REWRITTEN in place as the behavioral suite (14
  tests; the mount-without-throwing intent survives as the first test).
- `features/catalog/screens/product-detail/components/variant-choice-list.test.tsx`
  and `…/product-media-gallery.test.tsx` — the two allowed manual colocated
  test files (6 + 6 tests), built on the REAL projection
  (`createCatalogView` over fixture snapshots) rather than hand-built literals.
- `features/catalog/index.ts`: untouched — the Lead's scaffold export was
  already correct.

Fixtures: an appended "Studio Kettle" product whose THREE variants cover all
three model label forms in ONE product (trimmed `title_override` with TWO
variant images / ordered option pairs with one variant image / neutral
"Option 3" with NO variant media → product-cover fallback), unbranded and
uncategorized so the optional-context absence is observable; the base Café
Crème carries the brand/category context; the base Everyday Tote covers the
single-variant "Standard option" neutral label, the unavailable-only product
badge, and the empty-media AppImage fallback. A well-formed stale UUID covers
the not-found path. Every fixture product carries ≥1 variant (contract).

GREEN:

- Command: `pnpm exec jest features/catalog/screens/product-detail --runInBand`
- Output: `PASS …/product-detail-screen.test.tsx`, `PASS …/variant-choice-list.test.tsx`,
  `PASS …/product-media-gallery.test.tsx` — `Test Suites: 3 passed, 3 total` /
  `Tests: 26 passed, 26 total`, zero console output.

AFFECTED CHECKS:

- Focused screens: `pnpm exec jest features/catalog/screens --runInBand` →
  `Test Suites: 11 passed, 11 total` / `Tests: 116 passed, 116 total`.
- Whole feature: `pnpm exec jest features/catalog --runInBand` →
  `Test Suites: 21 passed, 21 total` / `Tests: 180 passed, 180 total`, zero
  console output (was 18/154 before T09; +3 suites/+26 tests, all T09).
- Full repo: `pnpm test` → `Test Suites: 38 passed, 38 total` / `Tests: 318
passed, 318 total` (was 35/292 after T08).
- `pnpm typecheck` → PASS (clean, `tsc --noEmit`).
- `pnpm lint` → PASS (exit 0, no findings).
- Formatting: `prettier --write` re-wrapped the five new/rewritten T09 files
  (line wrapping only), then `pnpm format:check` → PASS for the whole repo.
- `pnpm check:docs` → PASS (`Documentation matches the current workflow
(63 files checked).`).
- `pnpm export:web` → PASS; 23 static routes including `/product-detail` and
  `/(customer)/product-detail`.

TASK DIFF REVIEW (implementer's own read):

- Scope exactly the T09 packet: `features/catalog/screens/product-detail/**`
  (screen + rewritten test + the two components + their two colocated tests),
  the sanctioned `app/(customer)/product-detail.tsx` param edit, and Catalog
  docs (todo ticks + this entry). `features/catalog/index.ts` untouched (Lead's
  scaffold export). No shared files, no `components/`, no model/query/api
  changes, no route table edits, no Supabase/Zustand/TanStack imports anywhere
  in the new files (the screen consumes only `useCatalog`; verified by grep).
- Forbidden affordances absent, by pinned tests AND direct read: no quantity
  control, no Add-to-Cart, no Checkout, no price/total, no stock count or
  low-stock copy, no SKU/barcode display (the fixture carries SECRET SKUs and
  a barcode — asserted absent), no mutation of any kind (screen renders
  `variant.id`/`label`/`options`/`is_available`/`media` only).
- No unreachable state built or tested: no zero-variant resolved-product
  branch (contract-impossible; fails loudly if the contract breaks), and
  product-level availability is the model's derived signal, never re-derived.
- Fake timers intentionally NOT used (no FlashList on this screen — bounded
  ScrollView sections; the Home-screen real-timer macrotask flush pattern
  covers the background-refetch test instead).

REMEDIATION (T09, Implementer — 4 minor findings, Lead dispositioned ALL FIX)

- T09-R01 (minor, checkpoint currency): Lead-owned fix in `todo.md`'s
  checkpoint block — NOT touched by the implementer per the remediation
  instruction.
- T09-R02 (minor, variant accessible name omitted the ordered-option detail on
  title_override variants): fixed RED-first in
  `features/catalog/screens/product-detail/components/variant-choice-list.tsx`
  — the entry's `accessibilityLabel` now mirrors the VISIBLE composition:
  `` `${variant.label}, ${optionPairs}, ${availability}` `` when the ordered
  pairs render (title_override variants only, the same " · " separator as the
  detail line) and `` `${variant.label}, ${availability}` `` otherwise (the
  options-only entries already announce their pairs as the label — not
  doubled). Docblock updated to state the name-matches-visible-text rule.
  RED evidence: the suite's queries were updated to the new honest names
  FIRST — `pnpm exec jest …/variant-choice-list --runInBand` → `Tests: 4
failed, 2 passed, 6 total` (every failure "Unable to find an element with
  role: button, name: Gift Set Edition, Color: Rouge · Size: Lárge,
  Available…" — exactly the missing new name, not an import/typo error), then
  the component change → GREEN 6/6. Screen-test fallout checked: NONE — no
  screen fixture variant carries BOTH a `title_override` and option links
  (matte = override-only, rouge = options-only, coffee signature = override
  -only, configurable = options-only), so all screen-test names were already
  correct and untouched.
- T09-R03 (minor, Design-12 remount-by-URI key unpinned): added ONE focused
  test to
  `features/catalog/screens/product-detail/components/product-media-gallery.test.tsx`
  — "resets a latched image failure when the active media changes — the
  remount-by-URI guarantee": renders the 3-media set, invokes the rendered
  expo-image host's real `onError` inside `act` with the native-event shape
  expo-image unwraps (`{ nativeEvent: { error } }` — the host's handler is
  expo-image's own `onError`, which then calls AppImage's latching handler),
  asserts the latch took effect (the slot renders the shared fallback — no
  `source`), rerenders with the second media active, and asserts the second
  image's secure URI now displays. Passes against the current implementation
  (gallery suite 6 → 7 tests). Why it MUST FAIL without
  `key={active?.secureUrl ?? …}`: AppImage latches `failed` in `useState` and
  nothing ever resets it on a `uri` prop change — without the key, React
  reconciles the SAME AppImage instance across the active-media change, the
  latched `failed` state persists, `showFallback = !uri || failed` stays true,
  and the fallback View (which has the new alt label but NO `source` prop)
  keeps rendering, so `displayedImageUri(…image 2 of 3)` returns `undefined`
  and the `toBe(mediaSet[1].secureUrl)` assertion fails. With the key, the URI
  change unmounts the failed instance and mounts a fresh one (`failed=false`)
  — which is exactly what the test observes. The key was NOT removed to prove
  this (per the remediation instruction); the mechanism is reasoned through
  above.
- T09-R04 (minor, "no duplicate header cover thumbnail" absence unpinned):
  added ONE assertion INSIDE the existing cover-fallback test of
  `product-detail-screen.test.tsx` (the kettle inspection test, right after
  the cover-URL assertion): `countImagesDisplayingUri(root,
kettleImageUrls.cover)` over the WHOLE rendered tree — implemented with the
  test renderer root's `queryAll` over expo-image `source` props — must be
  exactly 1. Any second image surface carrying the cover URL (e.g. a future
  header identity thumbnail like BrandDetail's `BrandIdentity`) would double
  the count and fail the pin. Passes against the current implementation. No
  new test case (assertion only), so the count math below stays consistent.

Evidence after remediation:

- Focused T09: `pnpm exec jest features/catalog/screens/product-detail
--runInBand` → `Test Suites: 3 passed, 3 total` / `Tests: 27 passed, 27
total` (was 26; +1 = the R03 pin test; R02 changed names only, R04 added an
  assertion inside an existing test), zero console output.
- Whole feature: `pnpm exec jest features/catalog --runInBand` →
  `Test Suites: 21 passed, 21 total` / `Tests: 181 passed, 181 total` (was
  180; the R03 new case), zero console output.
- `pnpm typecheck` → PASS (clean, `tsc --noEmit`).
- `pnpm lint` → PASS (exit 0, no findings).
- Scoped `prettier --write features/catalog/screens/product-detail` re-wrapped
  `product-detail-screen.test.tsx` only (line wrapping); the other five T09
  files unchanged; `pnpm format:check` → PASS for the whole repo.

FRESH TASK REVIEW + REMEDIATION + RE-REVIEW + GATE (T09, Lead)

- Fresh code-reviewer (read-only; skills: kisok-code-review, kisok-design-system,
  kisok-react-native-rules, expo-router) reviewed the T09 packet: **0 blocking /
  0 major / 4 minors** — T09-R01 (checkpoint lag, third recurrence of the
  T05-R02/T06-R01 class), T09-R02 (variant accessible name omitted the
  " · "-joined option pairs on title_override variants — screen readers never
  heard the pairs the detail line exists to surface), T09-R03 (the Design-12
  remount-by-URI key unpinned against the plan's named image-failure-leak
  risk), T09-R04 (the no-duplicate-header-cover absence unpinned). The
  reviewer verified all evidence first-hand (focused 3/26, feature 21/180,
  repo 38/318, typecheck/lint/format/check:docs, export:web 23 static routes;
  contract accuracy — no zero-variant state, ≥1-variant fixtures; forbidden
  affordances pinned non-tautologically incl. SECRET-SKU/barcode absence;
  T04-R03 real-refetch survival without fake timers; model consumed as-is;
  R4-R01 aria-selected spelling followed; route-param test on the REAL route
  module). Recorded in review.md.
- Lead disposition: all four FIX.
- Remediation executed by the resumed T09 implementer: accessible name now
  carries the pairs (RED-first: 4 failed/2 passed; no screen-test fallout —
  no fixture variant carries both an override and option links); the
  remount-by-URI pin (latch asserted BEFORE recovery — non-vacuous; new 27th
  test); the exact-one cover-count pin (inside the existing kettle
  cover-fallback test). T09-R01 (checkpoint) fixed by the Lead while
  recording this review.
- Re-review (resumed same reviewer): all four RESOLVED; 0 new
  blocking/major/minor; focused 3/27, feature 21/181, repo 38/319 re-run
  PASS, zero console output; remediation footprint verified as exactly the
  three claimed code files (+ worklog); gate recommended PASS conditional
  only on the Lead's recording actions — completed by this entry and the
  todo.md checkpoint/board updates.
- Lead re-verification: feature 21 suites/181 tests PASS, typecheck PASS,
  export:web 23 static routes incl. `/product-detail`, check:docs PASS, diff
  scope exactly the T09 packet.
- GATE: PASS — T09 complete. Round 5 integrated verification + fresh Round
  review next (the Round 5 gate validates the complete discovery journey and
  confirms Catalog owns no cart/quantity/checkout/price/mutation/store or
  Realtime behavior).

REMEDIATION (Round 5 / R5-R01, Implementer — 1 minor finding, Lead dispositioned FIX)

- R5-R01 (minor, screen-level stale-selection degradation across a snapshot
  refresh was unpinned): added ONE focused test to
  `features/catalog/screens/product-detail/product-detail-screen.test.tsx` —
  "degrades a stale variant selection to the first variant when a refresh
  removes the picked variant" — plus its REPLACEMENT-snapshot builder
  `snapshotWithOption3Removed()` (the kettle fixture with the "Option 3"
  variant filtered out; the product keeps its matte and rouge variants, so
  ≥1 remains — contract-honest under `valid_products`; "Option 3" has no
  option links or media, so the variants array alone is filtered, and every
  key is spread explicitly so the builder's defaults cannot bleed in).
  The test follows the established `queryClient.refetchQueries` +
  macrotask-flush-in-act pattern (the background-refetch test / the T08
  category-detail no-match test): resolve the kettle snapshot, select the
  NON-FIRST "Option 3" variant, deliver the replacement snapshot via the
  shared QueryClient's focus/reconnect refetch, then assert the FIRST
  variant ("Matte Black Edition") now renders selected, the removed variant
  is gone from the list while the remaining ones stay inspectable, the
  gallery follows the degraded selection's own media (the matte primary
  image — the stale media pick degrades to the resolved variant's primary
  the same way), and exactly 2 fetches happened. Nothing throws — the test
  passing IS the pin. Without the `?? product.variants[0]` fallback the
  screen's `variant === undefined` guard would throw on this reachable
  path and the new "Matte Black Edition … selected: true" assertion would
  fail (the render crashes before it). The degradation mechanism is
  genuinely working, not just unpinned: the test passes as written.
- Regression pin only — no production code changed, no new test case beyond
  the one, no todo.md box ticked (the Round 5 gate box stays Lead-owned).

Evidence after remediation:

- Focused T09: `pnpm exec jest features/catalog/screens/product-detail
--runInBand` → `Test Suites: 3 passed, 3 total` / `Tests: 28 passed, 28
total` (was 27; +1 = the R5-R01 pin), zero console output.
- Whole feature: `pnpm exec jest features/catalog --runInBand` →
  `Test Suites: 21 passed, 21 total` / `Tests: 182 passed, 182 total`
  (was 181), zero console output.
- `pnpm typecheck` → PASS (clean, `tsc --noEmit`).
- `pnpm lint` → PASS (exit 0, no findings).
- Scoped `prettier --write` on the touched test file → unchanged (already
  formatted); `pnpm format:check` → PASS for the whole repo.

ROUND 5 GATE (Lead)

- Lead integrated verification on `catalog-v2-super` (T09 5f6154d + the
  R5-R01 pin): whole feature 21 suites/182 tests PASS (zero console output),
  typecheck, lint, prettier, check:docs PASS; export:web with 23 static
  routes incl. `/product-detail`.
- Browser journey on the exported web build (deterministic mock chain; the
  network route mocks had to be re-established after the session restart —
  noted for future sessions): sign-in → Home → root nav Products → Café
  Crème press → `/product-detail?productId=55555555-…` exact; identity h1 +
  textual "Available" + description; navigable brand chip (Maison Élite) and
  category chips (Drínks/Tóp Picks — chip press landed on
  `/category-detail?categoryId=3333…3333` exact); gallery image alt
  "Café Crème — Signature Roast" (default first variant); variant list
  "Signature Roast, Out of stock" + "Size: Medium, Available" (honest model
  labels + textual availability); `aria-selected=true` on the selected
  variant chip (R4-R01 spelling in T09 code); selecting "Size: Medium"
  flipped the gallery alt to "Café Crème — Size: Medium" and the
  aria-selected states (the unavailable variant stays selectable —
  inspection); FORBIDDEN affordances absent (body-text scan: cart/quantity/
  checkout/price/add-to-cart/buy/qty/stock — zero matches); stale product
  ID → "Product not found" local state with honest copy + Go back; Home →
  Search → "CAFÉ" diacritic query → result press → Product Detail exact
  (the discovery loop CLOSED — Round 3 verified the route TARGET; the real
  screen now lands); zero console output; zero page errors; only
  `current_active_profile` + `get_customer_catalog` RPCs in the network log.
- Fresh Round reviewer (read-only; skills: kisok-code-review,
  kisok-design-system, kisok-react-native-rules, expo-router): PASS verdict
  — all five round-level assertions verified clean (journey coherence: the
  byte-identical object-form `/product-detail` push from ALL FIVE discovery
  surfaces + exact-id context chips; ZERO cart/quantity/checkout/price/
  mutation/store/Realtime behavior in the whole feature tree — Supabase only
  at the sanctioned RPC boundary; the three detail screens share the pinned
  family pattern; integrated evidence 21/181 + repo 38/319 + typecheck +
  23-route export re-run; documentation coherent; the Lead's browser claims
  corroborated against the server log + deterministic snapshot). 0 blocking
  / 0 major / 1 minor R5-R01 (the stale-selection degradation across a
  snapshot refresh unpinned at screen level). Recorded in review.md.
- Lead disposition: FIX — one additive regression pin (select the non-first
  variant, deliver a replacement snapshot with that variant removed via the
  established refetchQueries pattern, assert the first variant renders
  selected; genuinely fails if the `?? product.variants[0]` fallback is
  removed). Executed by the resumed T09 implementer (REMEDIATION (Round 5 /
  R5-R01) section above; feature 21/182).
- Re-review (resumed same Round reviewer): R5-R01 RESOLVED with 0 new
  findings; non-vacuity, fixture honesty, and the zero-production-code
  delta verified; final recommendation PASS.
- Round 5 gate: PASS. Working tree committed by the Lead on
  `catalog-v2-super` and pushed (PR #10). ALL ROUNDS COMPLETE — the feature
  proceeds to Feature-level verification (develop-integration check, full
  verify, CI, final review, Quality Audit, Feature Gate, HUMAN_HANDOFF).

FEATURE-LEVEL VERIFICATION (Lead)

- Develop-integration check: `git fetch origin --prune`, then
  `git merge-base --is-ancestor origin/develop catalog-v2-super` → PASS
  (develop 80b8ac3 is an ancestor; the branch is 14 commits ahead, 0 behind;
  no divergence, no conflicts possible; PR #10 mergeable with develop).
- Full `pnpm verify` (Feature Gate requirement: PASS after the final local
  change): FIRST RUN FAILED at `generate:smoke` — the check "replaces the
  customer index.tsx placeholder deliberately" read the TRACKED
  `app/(customer)/index.tsx` and asserted it still contained
  `FoundationPlaceholder`. That assumption was legitimately invalidated by
  this feature's sanctioned T04 root-route step (`pnpm generate route
catalog index --role=customer --screen=catalog-home --force`): the first
  customer feature is DESIGNED to consume the placeholder (the check's own
  comment documents the deliberate replacement). Root cause: the check's
  implicit repo-state assumption, not the catalog feature.
- Lead fix (shared-tool change, justification recorded per the Feature Gate
  "shared/core changes justified" criterion):
  `tools/generator/smoke-test.mjs` now seeds the scratch route with a
  VERBATIM pre-feature placeholder fixture (customer + preparation, from the
  pre-feature tracked content) instead of reading the tracked file, and the
  moot "the repository was written to" assert (which read the tracked file)
  was removed — every behavioral assertion is preserved (guarded skip
  without --force, forced replacement, the route/export one-operation
  coupling, temp-root isolation), and the check becomes state-independent
  for every future first-feature. Minimal diff; the fixture is the exact
  content the check previously copied.
- Full `pnpm verify` re-run: **PASS** (exit 0) — typecheck, lint,
  format:check, test:ci 38 suites/320 tests (the R5-R01 pin included),
  check:docs, check:commits, check:e2e-appid, check:ci-scripts, db:verify,
  generate:smoke ALL green.

- GitHub CI on the final HEAD `37a7133`: **success** — Verify
  (typecheck, lint, format, tests, guards, db, generator) PASS, Web bundle
  PASS, Expo doctor PASS; Android build / Android E2E jobs skipped by the
  workflow's own conditions (native tier recorded as explicitly unverified
  at the Feature Gate). Historical note: the two prior branch runs
  (5f6154d, f4da5ac) failed ONLY at the Generator smoke test step — the
  same state-dependent check fixed above; every other job was green, and
  the fix turned the final run green.

REMEDIATION (F-R01, final review — Implementer, Lead-authorized feature-gate remediation)

- F-R01 (minor, the "1 product / N products" count-label helper existed in
  5 places — the T03-R02 acceptance's documented fifth-consumer revisit
  threshold was reached without the revisit): consolidated into ONE
  feature-internal helper, per the T03-R02 acceptance's constraint (nothing
  promoted to shared `components/`).
- Created `features/catalog/model/labels.ts` — a tiny pure module exporting
  `productCountLabel(count: number): string` returning
  `count === 1 ? "1 product" : "${count} products"` — with a docblock that
  documents the consolidation decision: T03-R02 accepted the duplication
  until a fifth consumer appeared; the final review's F-R01 triggered the
  documented revisit; the helper stays feature-internal because the phrasing
  is Catalog-specific product-count copy pinned by this feature's tests, not
  a reusable design-system primitive (a second feature needing the same
  sentence is the promotion signal, and it would be a breaking-copy
  decision, not a mechanical one).
- Replaced the five local helpers with imports of the shared one, keeping
  the string behavior BYTE-IDENTICAL (same expression, same words); the dead
  local helpers and nothing else were removed:
  - `features/catalog/components/brand-card.tsx` — `brandProductCountLabel`
    deleted, import + `productCountLabel(brand.productCount)` at the same
    call site;
  - `features/catalog/components/category-card.tsx` —
    `categoryProductCountLabel` deleted, import +
    `productCountLabel(category.productCount)`;
  - `features/catalog/screens/products/products-screen.tsx` — local
    `productCountLabel` deleted, import + unchanged call site
    (`products.length`);
  - `features/catalog/screens/brand-detail/brand-detail-screen.tsx` — local
    `productCountLabel` deleted, import + unchanged call site;
  - `features/catalog/screens/category-detail/category-detail-screen.tsx`
    — `categoryProductCountLabel` deleted, import +
    `productCountLabel(category.productCount)`.
- ZERO test churn, exactly as required: no test file was touched, and every
  consumer's tests already pin the exact output — the byte-identical
  consolidation is proven by the unchanged 182-test feature suite passing
  with zero console output (a behavior change would have failed the pinned
  "1 product"/"N products" assertions).

Evidence after remediation:

- Whole feature: `pnpm exec jest features/catalog --runInBand` →
  `Test Suites: 21 passed, 21 total` / `Tests: 182 passed, 182 total`,
  zero console output (unchanged counts — pure refactor).
- `pnpm typecheck` → PASS (clean, `tsc --noEmit`).
- `pnpm lint` → PASS (exit 0, no findings).
- Scoped `prettier --write` on the six touched files → all six unchanged
  (already formatted); `pnpm format:check` → PASS for the whole repo.
- Diff scope: 5 modified files + 1 new file, all inside the authorized
  F-R01 scope; `+12/−25` across the modified files plus the new 38-line
  `model/labels.ts`; no test, shared, core, route, or barrel changes.

QUALITY AUDIT AND FINDING RESOLUTIONS (Lead)

- Fresh quality-auditor (read-only; skill: kisok-quality-audit) audited the
  delivery against the five control documents + the actual diff/commits:
  result FINDINGS — 4 record/evidence gaps, **zero** "not delivered"/"not
  planned" findings. The five checklist conclusions: ACs MET (all 8 verified
  in shipped code); gates MET (T01–T09 + all five rounds, every PASS
  evidence-backed, incl. the honest Round-1 FAIL→remediation cycle); worklog
  evidence REAL and matching TODAY's tree (the auditor re-ran 21/182,
  38/320, full `pnpm verify` exit 0); shared files EXACTLY the two justified
  edits (61-file diff: 52 feature files + 8 routes + smoke-test fixture +
  design-system bullet; no suppressions anywhere); Definition of Done MET
  except the runtime-evidence items below. Strongest evidence: the
  re-runnable chain + green CI on the exact final code HEAD.
- **Audit finding 1 (hosted TEST Supabase live read — not evidenced):**
  RESOLVED as explicitly UNVERIFIED with reason: this session environment
  has no hosted TEST Supabase credentials; the plan's hosted-read
  verification mode was substituted by the deterministic local mock chain
  (recorded per round); the hosted read remains a HUMAN HANDOFF item (the
  plan's honesty rule — never silently marked PASS — is satisfied by this
  record).
- **Audit finding 2 (keyboard / 200% text scaling / 3 named sizes — not
  evidenced):** RESOLVED by a final runtime-evidence session on the FINAL
  tree's fresh export (`--clear`), recorded here:
  - Products grid equal-width responsive columns at the three named sizes:
    **1280×800 → 300px** (4-up), **800×1180 → 244px** (3-up),
    **480×900 → 212px** (2-up); one distinct card width per size; 6/6 cards
    at every size; "All products" heading + "6 products" count (the
    consolidated F-R01 label) render.
  - Keyboard: Tab traverses interactive elements in logical order (root-nav
    chips Home→Products→Brands→Categories→Search, then product cards);
    focus lands on real buttons with a visible outline indicator; zero
    console output.
  - 200% text scaling: NOT verifiable on the web export — the typography is
    fixed-px (NativeWind), and the OS font-scale path belongs to the native
    tier, which is explicitly UNVERIFIED (CI Android jobs skipped by the
    workflow's own conditions; recorded at the Feature Gate).
- **Audit finding 3 (stale "final HEAD" CI record):** RESOLVED — the
  auditor independently verified CI green on the true final code HEAD
  `04a3889` (run 33615482805, event pull_request, Verify / Web bundle /
  Expo doctor success; Android jobs skipped); this entry records it. The
  earlier "final HEAD 37a7133" wording referred to the last code commit at
  the time of writing; the two subsequent commits are docs + the pure
  F-R01 refactor.
- **Audit finding 4 (todo.md checkpoint lag, 5th recurrence):** RESOLVED —
  the checkpoint is updated with this Feature-Gate recording.
- Also noted by the re-review of F-R01 and applied: the worklog's module
  line count corrected (27, not 38).

FEATURE GATE (Lead — final recording)

- [x] Every Task Gate PASS — T01–T09 (todo.md board; evidence per task in
      this worklog)
- [x] Every Round Gate PASS — Rounds 1–5 (incl. remediations + re-reviews)
- [x] Every AC verified — AC-01…AC-08 walked against code+tests by the
      final review; audit concurs
- [x] `pnpm verify` PASS after the final local change — exit 0 re-run by
      the Lead AND the Quality Auditor (38/320, generate:smoke green after
      the state-independent fixture fix)
- [x] required fast GitHub CI PASS on the final HEAD — CI success on final
      code HEAD 04a3889 (auditor-verified run 33615482805; the remaining
      commits are docs-only and CI re-triggers on the true final HEAD at
      handoff)
- [x] required runtime evidence recorded — browser journeys per round
      (exact params, states, filter, variant/media selection, aria-selected
      DOM, forbidden-affordance scans, network logs) + the final 3-size /
      keyboard session above
- [x] required native tier(s) — Android explicitly UNVERIFIED (CI jobs
      skipped by workflow conditions; OS font-scale/native FlashList/
      AppImage behavior device-unverified; hosted TEST Supabase read
      UNVERIFIED — no credentials in this environment) — both are HUMAN
      HANDOFF items
- [x] Reviewer findings dispositioned — 26 findings through F-R01; 24 fixed + re-reviewed; R02 and T03-R02 accepted with rationale (T03-R02's
      duplication was subsequently RESOLVED by F-R01's consolidation)
- [x] blocking/major fixes re-reviewed — every one (T04 set, T07-R01, and
      the final review's zero blocking/major)
- [x] Quality Audit clean — 4 findings, all resolved by this recording
      (runtime evidence captured; hosted/native explicitly unverified; CI
      record corrected; checkpoint refreshed)
- [x] anything not verified explicitly recorded — native tier, hosted
      Supabase read, 200% text scaling (web-fixed-px), PR-description
      completeness (updated below)
- [x] shared/core changes justified — `tools/generator/smoke-test.mjs`
      (state-independent fixture; the check's own assumption was
      legitimately invalidated by T04's sanctioned root-route replacement)
      and `docs/design-system.md` (R4-R01 aria-spelling bullet); NO other
      shared/core changes (61-file diff audit-verified)
- [x] PR evidence matches the worklog — PR #10 (catalog-v2-super →
      develop, Draft) body updated to the final state at handoff

FEATURE GATE: **PASS** — the feature is delivered to HUMAN HANDOFF. The
delivery agent never merges; the human decides.

---

## Post-handoff final verification session (2026-09-02, Lead)

Environment restored from scratch after a sandbox reset: repository re-cloned,
`catalog-v2-super` checked out at `e35e7e3f0a5ee926d1025c28c825e90eaf0868a2`
(GitHub API confirms it is the current PR #10 head; PR open/draft → develop),
pnpm@9.12.0 with frozen lockfile. Control documents + migration re-read before
any action.

Deterministic baseline BEFORE remediation (re-executed, not cited):

- `pnpm exec jest features/catalog` → 21 suites / 182 tests PASS
- `pnpm exec jest --ci --silent` → 38 suites / 320 tests PASS
- `pnpm verify` → exit 0
- `git status` clean

### Adversarial Finding A — used_brands/used_categories runtime validation

Lead triage against the migration and the shipped code: **VALID (major)**.
Evidence: `20260826050006_lean_customer_catalog.sql:57-64` (used_brands =
active brand with ≥1 valid product) and `:65-81` (used_categories = direct
product membership OR a direct child with one) are backward invariants the
runtime schema did not enforce — `catalog-snapshot.schema.ts` validated only
the forward direction, while `brand-detail-screen.tsx` (post-T07-R01) and
`category-detail-screen.tsx` explicitly document relying on the invariants.
A contract-violating payload would silently render a resolved-but-empty
Brand/Category Detail instead of the retryable `ErrorState`.

Remediation (bug mode, RED first, fresh implementer A-REMEDIATE-1):

- RED: 2 regression tests (`rejects a brand with no returned product`,
  `rejects a category with no direct or child-direct product membership`)
  failed exactly as intended (payload accepted pre-fix), plus 1 positive
  control (`accepts a category whose only products come through a direct
child`) pinning the child branch against over-strictness.
- IMPLEMENT: two additive backward checks inside the existing `superRefine`
  (brand ids referenced by products; category ids with direct memberships ∪
  parent ids of returned categories with direct memberships). +80/-0 across
  `model/catalog-snapshot.schema.ts` and its test; nothing else touched.
- GREEN: schema file 26/26; whole feature **21 suites / 185 tests PASS**;
  `pnpm typecheck` exit 0; scoped eslint + prettier clean.
- Fresh re-review (A-REVIEW-1, read-only): contract fidelity verified
  clause-by-clause against the migration (used_brands exact; used_categories
  exact incl. the child-not-returned impossibility proof; no false rejections
  on backend-reachable payloads; no weakening — 0 deletions; mechanical RED +
  over-strict experiments reproduced in /tmp; consumers now fail closed
  through `callRpc` → `RPC_SCHEMA_MISMATCH`). Verdict: 0 blocking / 0 major /
  0 minor. T01 gate reopened honestly and restored.

### Adversarial Finding B — Home whole-catalog empty state (Lead disposition)

**INVALID as a defect — intentional, contract-compliant.** Evidence:
`plan.md` Design decision 6 ("only `products: []` produces a whole-catalog
empty state"), the deliberately-worded pinned T04 test ("shows a
whole-catalog empty state instead of sections when no products are
returned" — sections hidden, retry offered), and the state-family symmetry in
the brief's State requirements (loading/error/empty are the full-screen
terminal states of the single snapshot read). Under the real backend contract
`products: []` forces `brands: []` and `categories: []` (both used\_\* CTEs are
product-derived), so a preserved shell would only link to equally-empty
discovery screens; the honest single empty state with "Try again" is the
minimal correct behavior. AC-08's journey guarantees concern the populated
discovery journey; in the empty state the one meaningful action (refetch) is
provided. No code change; rationale recorded here and in review.md (F-R03).

### Adversarial Finding C — cold/direct detail-route back behavior (Lead disposition)

**INVALID as a defect — no dead-end exists.** Live browser evidence (fresh
tabs, `history.length === 1`, authenticated session):

- `/product-detail?productId=c7f02e6d-…` (Float 3k) → "Go back" → `/`
  (Catalog Home, "Demo Store" identity + sections)
- `/brand-detail?brandId=7d9138bf-…` (Zyn) → "Go back" → `/` (Catalog Home)
- `/category-detail?categoryId=4a395b38-…` (Vape Products) → "Go back" → `/`
  (Catalog Home)
- Stale brand id on a cold route (`…00000000-0000-4000-8000-000000000000`)
  → the local "Brand not found" state, whose "Go back" also lands on Home.

Expo Router's `goBack()` with an empty history falls back to the initial route
(`/` — the Customer Catalog root), i.e. the router contract itself provides
the safe way out; `router.canGoBack()` is not used (it throws on web DOM),
and no feature-local fallback was needed. No code change; disposition
recorded here and in review.md (F-R04).

### Hosted TEST live end-to-end verification (the prior session's gap — now closed)

Session: Expo web dev server (`pnpm web`, CI mode, port 8081) with the
committed `.env` (hosted TEST project `akxigjsifwyolkadofnj.supabase.co`,
`EXPO_PUBLIC_ENVIRONMENT=test`), real Chromium via agent-browser, Customer
account `Customer@gmail.com` from `docs/environment.md`. The full hosted
chain was exercised: Customer auth → protected Customer route → hosted TEST
Supabase → real `get_customer_catalog()` → runtime Zod validation →
TanStack Query → CatalogView → actual UI. The deterministic mocks were NOT
used for this session.

**Network evidence (browser request log):** exactly three hosted calls —
`POST /auth/v1/token?grant_type=password` (200), `POST /rest/v1/rpc/
current_active_profile` (200), `POST /rest/v1/rpc/get_customer_catalog`
(200). No raw-table REST reads, no other RPC, no mutation endpoints. A
direct anonymous RPC probe returned `42501 permission denied` (the
active-Customer authorization holds outside the app too).

**Payload + validation:** hosted snapshot `schema_version` is exactly
`kiosk.catalog.lean.v1`; store settings carry `Demo Store`; 7 brands /
15 products / 299 variants (58 unavailable) / 7 categories (4 roots + 3
children) / 8 option types / 262 option values / 393 variant-option links /
299 variant media / 15 product-category memberships. Runtime Zod accepted
the real payload (every screen rendered; a parse failure would have shown
`ErrorState`), including after the Finding-A hardening — the backward
invariants hold on the real data (all brand counts ≥1: dozo 1, Zyn 3,
Shots Hydroxy 1, Flum 4, 7-Hydro 1, Geekbar 3, UT bar 2).

**Auth and route gating:** unauthenticated `/` → `/sign-in`; sign-in as the
documented Customer → real Catalog Home (placeholder absent); `(preparation)`
routes are excluded from the navigator for a customer role (`Stack.Protected`
in `app/_layout.tsx`) — direct `/preparation` and `/orders` URLs land on the
safe not-found screen; auth-layer sign-out (session teardown) → reload →
sign-in gate → successful re-sign-in.

**Catalog Home:** store identity ("Demo Store"); root navigation; bounded
Brands (6) / root Categories (6) / Featured (8) sections; Browse-all
actions; 11/11 real images loaded; textual availability; equal-width rows
(4×299px at 1280; 2×210px at 480).

**All Products:** "All products" + "15 products"; 15 cards; FlashList grid
4-up/3-up/2-up at 1280/800/480 (300/244/212px, virtualizing 12 of 15 at
480); opened the last product from a scrolled position; back returns to the
list with context retained (push semantics kept the list mounted).

**Search (real data):** product name ("UTBAR" → 1), brand name ("Flum" →
4), category name ("Pouches" → 3), variant title ("Cool mint"), option
value ("Watermelon"), case normalization ("fLuM" ≡ "Flum"); one-character
too-short prompt; two-character start; no-match state ("xyzzy"); result
count announced through `aria-live=polite` ("4 matching products"); result
opens the exact Product Detail; SKU probe "KSK-000159" returns NO match
(SKU/barcode are not customer search fields).

**Brands:** 7 whole-card navigations with correct count labels; Zyn Brand
Detail shows exactly its 3 products; no resolved brand was empty (the
`used_brands` contract holds live); stale id → local "Brand not found".

**Categories:** two-level hierarchy (Botanical Supplements 2 = children 7-
Hydroxy 1 + Tablets & Chews 1; Vape Products 9 = child Disposable Vapes 9);
root detail renders the Subcategories strip; child detail shows only its
direct products and no subcategory strip; brand filter derives from the
category's products (All Brands / Flum / Geekbar / UT bar), narrows to UT
bar's 2 products, `aria-selected` exposed on filter + variants, All Brands
reset restores 9.

**Product Detail (UTBAR PRO 25k, 8 variants):** identity; brand chip →
Brand Detail; category chip → Category Detail (exact ids); 7 available + 1
"Out of stock" variant (unavailable selectable for inspection, state
announced); title_override labels ("Blue Razz Icy"…) and ordered option
labels ("Flavor: BLUE RAZZ ICY"…); selecting a variant switches the main
image ("UTBAR PRO 25k — White gummy"); product-level availability in words;
description verified on 7- Hydroxy ("21+"); ZERO cart/quantity/checkout/
price/SKU/barcode strings in the DOM; zero nested interactive controls.

**Navigation/history:** root switches kept `history.length` constant
(replace semantics — no duplicate roots); back chains pop correctly
(Category → Product → Products; Brand → Product); no redirect loops.

**Background-refetch resilience (live):** after the successful snapshot,
the RPC URL was blocked and two focus refetches were attempted — the
populated Home remained on screen with zero `ErrorState` surfaces
(T04-R03 rule holds against the real hosted backend).

**Responsive:** 1280×800 / 800×1180 / 480×900 all clean (equal-width
grids, no horizontal overflow, 48px variant/filter touch targets); resize
between breakpoints remounts the grid stably. 200% browser zoom
approximated at 640×400 CSS (products 2-up, product detail 0 clipped
texts, no overflow, long text wraps) — this is browser magnification, NOT
native Android OS font scaling, which remains device-unverified.

**Keyboard/DOM:** Tab order follows root chips → cards; visible focus
outline; `aria-selected` on selected root nav, brand filter, variants;
`aria-live` search status; accessible names on all cards/buttons/inputs.

**Console (entire session):** zero React warnings, zero invalid DOM
nesting warnings, zero uncaught exceptions, zero unhandled rejections,
zero TanStack/Supabase errors on successful journeys, zero image errors,
zero Expo Router warnings. Expected noise classified: Metro/React
dev-mode boot messages and `[auth]` state-change logs.

**Honest live-data limitations (deterministic coverage exists for each):**
the hosted TEST dataset contains no multi-media variants (gallery
thumbnail switching), no unbranded/uncategorized products, no
all-unavailable products, no one-variant products, and no diacritic-bearing
names — those shapes are pinned by the feature's 185 deterministic tests,
not live-exercised. The brand-filter no-match state is likewise
deterministic-only (live data has no natural no-match). No hosted data was
created, mutated, or deleted at any point.

**Performance:** no pauses or jank observed with the populated catalog
(15 products / 299 variants) — scrolling, filtering, variant selection and
navigation were instantaneous on the dev-server build; note this is a
development-mode Metro bundle, not a production-export performance
measurement.
