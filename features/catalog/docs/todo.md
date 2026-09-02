# Catalog — execution state

**This file is the working memory.** Reasoning lives in `plan.md`; evidence lives
in `worklog.md`. Keep this checkpoint and gate board current.

## Current checkpoint

```
Current round     : Round 3 — Home, all products and search
Current task      : T05 — All Products and route
Current stage     : not started (Lead scaffold next)
Last gate         : T04 PASS (2026-09-02, after remediation + re-review + browser verification); Round 2 PASS
Next legal action : Lead runs T05 scaffolds (Products screen, then Products route), records SCAFFOLD evidence, delegates implementer
Blocked by        : —
```

## Rules

- A task is **DONE only at `GATE: PASS`**.
- Task N+1 does not start until every dependency is `PASS`.
- A failed gate is fixed in that task, not compensated later.
- Every task follows its declared verification mode from
  `test-driven-development`.
- No implementation task starts while `plan.md` is `DRAFT`.
- The Lead runs every scaffold immediately before delegation; Implementers never
  run the generator.

## Status board

| Task | Mode     | Acceptance                                          | Objective                                                            | Deps          | Stage       | Gate    |
| ---- | -------- | --------------------------------------------------- | -------------------------------------------------------------------- | ------------- | ----------- | ------- |
| T01  | behavior | Supporting AC-01–AC-07                              | Snapshot schema and pure Catalog view                                | —             | done        | PASS    |
| T02  | behavior | AC-01                                               | Customer-safe Catalog query pipeline                                 | T01           | done        | PASS    |
| T03  | behavior | Supporting AC-02–AC-08                              | Shared discovery navigation/grid/cards                               | T01           | done        | PASS    |
| T04  | behavior | Supporting AC-02, AC-08                             | Catalog Home and Customer root route                                 | T02, T03      | done        | PASS    |
| T05  | behavior | Supporting AC-03                                    | All Products and route                                               | T02, T03      | not started | PENDING |
| T06  | behavior | Supporting AC-06                                    | Local Search and route                                               | T02, T03      | not started | PENDING |
| T07  | behavior | AC-04                                               | Brand discovery/detail and routes                                    | T02, T03      | not started | PENDING |
| T08  | behavior | AC-02, AC-05                                        | Category discovery/detail/filter, routes, complete root destinations | T02, T03, T07 | not started | PENDING |
| T09  | behavior | AC-03, AC-06, AC-07, AC-08; Supporting AC-04, AC-05 | Product Detail and route                                             | T02–T08       | not started | PENDING |

Stage: `not started` · `scaffolding` · `red/baseline` · `implementing` ·
`green` · `checks` · `diff review` · `done`.

## Round 1 — Validated data foundation

### T01 — Snapshot schema and pure Catalog view

- **Mode**: behavior
- **Acceptance**: Supporting: `AC-01` through `AC-07`
- **Depends on**: —
- **Skills**: test-driven-development; supabase; supabase-postgres-best-practices
- **Lead scaffold**: `pnpm generate schema catalog catalog-snapshot`
- **Expected generated files**: `model/catalog-snapshot.schema.ts`,
  `model/catalog-snapshot.schema.test.ts`
- **Allowed manual files**: `model/catalog-snapshot.fixture.ts`,
  `model/catalog-view.ts`, `model/catalog-view.test.ts`
- **Scaffold status**: `READY`
- **Allowed file scope**: paths above plus Catalog docs

```
[x] SCAFFOLD — schema command created the two expected model files; no skips/replacements
[x] RED — 13 intended failures/1 pass before implementation; cycle regression also failed correctly
[x] IMPLEMENT — exact schema/view delivered; cyclic category graph remediated
[x] GREEN — Lead rerun: 2 suites, 15 tests PASS
[x] AFFECTED CHECKS — typecheck, scoped lint/format and full lint PASS
[x] TASK DIFF REVIEW — five allowed model files only; behavior correct
[x] FRESH TASK REVIEW — R01/R03–R08 fixed and closure review found 0 blocking/major; R02 minor accepted
GATE: PASS
```

### T02 — Customer-safe Catalog query pipeline

- **Mode**: behavior
- **Acceptance**: Acceptance: `AC-01`
- **Depends on**: T01 PASS
- **Skills**: test-driven-development; supabase; supabase-postgres-best-practices
- **Lead scaffold**: `pnpm generate query catalog catalog`
- **Expected generated files**: `api/fetch-catalog.ts`,
  `queries/use-catalog.ts`, `queries/keys.ts`
- **Allowed manual files**: `api/fetch-catalog.test.ts`,
  `queries/use-catalog.test.tsx`
- **Scaffold status**: `READY`
- **Allowed file scope**: paths above plus Catalog docs

```
[x] SCAFFOLD — query command created API, hook and local keys exactly as planned
[x] RED — 2 suites/4 intended failures against placeholder/raw query after correcting mock setup
[x] IMPLEMENT — zero-arg callRpc boundary, one key/hook, stable CatalogView select
[x] GREEN — Lead rerun: T02 2 suites/4 tests PASS
[x] AFFECTED CHECKS — T01 15 tests, typecheck, scoped lint/format, full lint PASS
[x] TASK DIFF REVIEW — five allowed files; one RPC; no direct reads/store/retry override
[x] FRESH TASK REVIEW — no findings
GATE: PASS
```

Round 1 gate: `PASS` — 4 suites/35 tests, typecheck/lint/format, fresh Round review clean

## Round 2 — Shared discovery UI

### T03 — Shared navigation, virtualized grid and entity cards

- **Mode**: behavior
- **Acceptance**: Supporting: `AC-02` through `AC-08`
- **Depends on**: T01 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules
- **Lead scaffolds**: component commands for `catalog-navigation`,
  `catalog-grid`, `availability-badge`, `product-card`, `brand-card`,
  `category-card`
- **Expected generated files**: six files under `components/` with those names
- **Allowed manual files**: colocated component `*.test.tsx` files
- **Scaffold status**: `READY` (six components generated 2026-09-02; evidence in worklog)
- **Allowed file scope**: `features/catalog/components/**` plus Catalog docs

```
[x] SCAFFOLD — six components generated exactly as planned; evidence in worklog
[x] RED — 6 suites/29 tests failed against TODO placeholders (intended missing behavior)
[x] IMPLEMENT — six presentational components + colocated tests in scope
[x] GREEN — Lead rerun: 6 suites/29 tests PASS, zero console output
[x] AFFECTED CHECKS — whole feature 10 suites/64 tests, typecheck, lint, format, check:docs PASS
[x] TASK DIFF REVIEW — design system only; scalable lists; no shared additions
[x] FRESH TASK REVIEW — 0 blocking/major; T03-R01 fixed (checkpoint currency), T03-R02 minor accepted
GATE: PASS
```

Round 2 gate: `PASS` — 10 suites/64 tests, typecheck/lint/format/check:docs, fresh Round review clean (0 findings); all three round assertions verified

## Round 3 — Home, all products and search

### T04 — Catalog Home and Customer root route

- **Mode**: behavior
- **Acceptance**: Supporting: `AC-02`, `AC-08`
- **Depends on**: T02 PASS, T03 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules; expo-router
- **Lead scaffolds**: `pnpm generate screen catalog catalog-home`; then
  `pnpm generate route catalog index --role=customer --screen=catalog-home --force`
- **Expected generated/replaced files**: Catalog Home screen/test,
  `app/(customer)/index.tsx`, and Catalog public export
- **Allowed manual files**: —
- **Scaffold status**: `READY` (Lead ran both commands; evidence in worklog)
- **Allowed file scope**: Home screen directory, Customer root route,
  `features/catalog/index.ts`, Catalog docs

```
[x] SCAFFOLD — screen + forced root route + public export, inspected by the Lead (worklog)
[x] RED — 11/11 intended failures against the placeholder (worklog)
[x] IMPLEMENT — states + identity + navigation + bounded sections in place
[x] GREEN — 11 tests PASS, zero console output
[x] AFFECTED CHECKS — whole feature 11 suites/75 tests, full repo 213 tests,
    typecheck, lint, format, check:docs, export:web PASS (worklog)
[x] TASK DIFF REVIEW — screen directory + docs only; route/barrel verified as scaffolded
[x] FRESH TASK REVIEW — 1 major + 2 minors found (T04-R01/R02/R03, review.md);
    same-task remediation applied (12th RED-first test for R03); re-review
    confirmed all three RESOLVED, no new blocking/major; Lead browser-verified
    R01 equal widths at 480/800/1280 and R03 live against 3 aborted refetches
GATE: PASS
```

**T04 remediation record (same task):** the fresh review's three findings were
fixed in `catalog-home-screen.tsx` + its test only — (1) row children became
`flex-1` wrappers (T04-R01), (2) `never`-typed exhaustiveness assertion
(T04-R02), (3) full-screen `ErrorState` only when no snapshot exists (T04-R03,
Lead disposition and stated rule for T05–T09). Evidence in review.md and
worklog.md.

### T05 — All Products and route

- **Mode**: behavior
- **Acceptance**: Supporting: `AC-03`
- **Depends on**: T02 PASS, T03 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules; expo-router
- **Lead scaffolds**: Products screen, then Products route
- **Expected generated files**: Products screen/test,
  `app/(customer)/products.tsx`, Catalog public export
- **Allowed manual files**: —
- **Scaffold status**: `PENDING`
- **Allowed file scope**: Products screen directory, route, Catalog index/docs

```
[ ] SCAFFOLD
[ ] RED — count/status/navigation behavior fails as intended
[ ] IMPLEMENT
[ ] GREEN — Products tests
[ ] AFFECTED CHECKS — route/export and dependency tests/checks
[ ] TASK DIFF REVIEW — scalable grid; unavailable products discoverable
[ ] FRESH TASK REVIEW — no unresolved blocking/major finding
GATE: PENDING
```

### T06 — Local Search and route

- **Mode**: behavior
- **Acceptance**: Supporting: `AC-06`
- **Depends on**: T02 PASS, T03 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules; expo-router
- **Lead scaffolds**: Search screen, then Search route
- **Expected generated files**: Search screen/test,
  `app/(customer)/search.tsx`, Catalog public export
- **Allowed manual files**: —
- **Scaffold status**: `PENDING`
- **Allowed file scope**: Search screen directory, route, Catalog index/docs

```
[ ] SCAFFOLD
[ ] RED — idle/too-short/no-match/results fail as intended
[ ] IMPLEMENT
[ ] GREEN — Search tests
[ ] AFFECTED CHECKS — route/export and dependency tests/checks
[ ] TASK DIFF REVIEW — local generic search; no SKU/barcode/network search
[ ] FRESH TASK REVIEW — no unresolved blocking/major finding
GATE: PENDING
```

Round 3 gate: `PENDING`

## Round 4 — Brand and category discovery

### T07 — Brand discovery/detail and routes

- **Mode**: behavior
- **Acceptance**: Acceptance: `AC-04`
- **Depends on**: T02 PASS, T03 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules; expo-router
- **Lead scaffolds**: Brands and Brand Detail screens; Brands and Brand Detail
  routes
- **Expected generated files**: two screen/test pairs, two routes, two Catalog
  public exports
- **Allowed manual files**: —; generated detail route is edited to pass `brandId`
- **Scaffold status**: `PENDING`
- **Allowed file scope**: Brand screen directories/routes, Catalog index/docs

```
[ ] SCAFFOLD
[ ] RED — counts/scope/empty/stale-ID behavior fails as intended
[ ] IMPLEMENT
[ ] GREEN — Brand tests
[ ] AFFECTED CHECKS — route params, export:web, dependency tests/checks
[ ] TASK DIFF REVIEW — exact brand scope; no impossible zero-product detail
[ ] FRESH TASK REVIEW — no unresolved blocking/major finding
GATE: PENDING
```

### T08 — Category discovery/detail/filter and routes

- **Mode**: behavior
- **Acceptance**: Acceptance: `AC-02`, `AC-05`
- **Depends on**: T02 PASS, T03 PASS, T07 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules; expo-router
- **Lead scaffolds**: Categories and Category Detail screens; screen-local
  Category Brand Filter; Categories and Category Detail routes
- **Expected generated files**: two screen/test pairs,
  `screens/category-detail/components/category-brand-filter.tsx`, two routes,
  two Catalog public exports
- **Allowed manual files**: Category Brand Filter test; generated detail route is
  edited to pass `categoryId`
- **Scaffold status**: `PENDING`
- **Allowed file scope**: Category screen directories/routes, Catalog index/docs

```
[ ] SCAFFOLD
[ ] RED — hierarchy/default filter/selected/no-match-reset behavior fails
[ ] IMPLEMENT
[ ] GREEN — Category tests
[ ] AFFECTED CHECKS — route params, export:web, dependency tests/checks
[ ] TASK DIFF REVIEW — direct-child aggregation and many-to-many rules hold
[ ] FRESH TASK REVIEW — no unresolved blocking/major finding
GATE: PENDING
```

Round 4 gate: `PENDING`

## Round 5 — Product Detail discovery

### T09 — Product Detail, generic variants/media and route

- **Mode**: behavior
- **Acceptance**: Acceptance: `AC-03`, `AC-06`, `AC-07`, `AC-08`; Supporting:
  `AC-04`, `AC-05`
- **Depends on**: T02–T08 PASS
- **Skills**: test-driven-development; kisok-design-system;
  kisok-react-native-rules; expo-router
- **Lead scaffolds**: Product Detail screen; screen-local Product Media Gallery
  and Variant Choice List; Product Detail route
- **Expected generated files**: Product Detail screen/test, two screen-local
  components, Product Detail route, Catalog public export
- **Allowed manual files**: colocated tests for the two screen-local components;
  generated route is edited to pass `productId`
- **Scaffold status**: `PENDING`
- **Allowed file scope**: Product Detail screen directory/route, Catalog index/docs

```
[ ] SCAFFOLD
[ ] RED — stale ID/generic labels/media/availability/forbidden actions fail
[ ] IMPLEMENT
[ ] GREEN — Product Detail and component tests
[ ] AFFECTED CHECKS — route params, export:web, complete feature checks
[ ] TASK DIFF REVIEW — no Cart/quantity/price/Checkout; generic model honest
[ ] FRESH TASK REVIEW — no unresolved blocking/major finding
GATE: PENDING
```

Round 5 gate: `PENDING`

## Feature gate

- [ ] Every Task Gate PASS
- [ ] Every Round Gate PASS
- [ ] Every AC verified
- [ ] `pnpm verify` PASS after the final local change
- [ ] required fast GitHub CI PASS on the final HEAD
- [ ] required runtime evidence recorded
- [ ] required native tier(s) PASS, N/A, or explicitly unverified
- [ ] Reviewer findings dispositioned
- [ ] blocking/major fixes re-reviewed
- [ ] Quality Audit clean
- [ ] anything not verified explicitly recorded
- [ ] shared/core changes justified
- [ ] PR evidence matches the worklog

FEATURE GATE: PENDING

## Blocked

- —
