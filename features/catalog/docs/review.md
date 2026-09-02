# Catalog — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID  | Severity | Finding                                                                                                                                                                                                   | Evidence                                                                                  | Disposition | Remediation                                                                                                                                                                                                                        |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | major    | T01 Catalog view rebuild repeatedly scanned whole products/categories/variants/options/media collections, causing quadratic growth and measured multi-second projection time at 2,000 synthetic products. | Original `features/catalog/model/catalog-view.ts:115-205`; fresh T01 review benchmark     | fix         | Resolved with insertion-order-preserving indexes; fresh re-review measured ~6.94/12.01/23.53 ms at 500/1,000/2,000 products and found no new blocking/major issue.                                                                 |
| R02 | minor    | The indexed performance fix is protected by code structure and independent benchmarks, not a committed high-cardinality timing regression.                                                                | `features/catalog/model/catalog-view.test.ts:152-204`; fresh T01 re-review                | accept      | A wall-clock CI threshold would be environment-sensitive and contradict the plan's non-brittle test policy. Keep the independently repeated scaling evidence and re-profile if real hosted/device data shows a named failure mode. |
| R03 | blocking | PostgreSQL `text[]` keyword columns permit null elements, but the snapshot schema rejected them, so one database-valid keyword array could fail the whole Catalog read.                                   | `20260826050003_lean_catalog_schema.sql:134,166`; original schema                         | fix         | Resolved: null elements are accepted and normalized out with product/variant coverage.                                                                                                                                             |
| R04 | major    | Shape-only validation allowed products without variants, dangling/mismatched relationships, and partial nullable media tuples to pass and degrade silently.                                               | Original schema; Round 1 reviewer probes                                                  | fix         | Resolved with root semantic validation for IDs/keys, relationships/types, product variants, category hierarchy, complete media tuples and primary-media uniqueness.                                                                |
| R05 | minor    | Some CatalogView fields alias mutable arrays/objects from the raw query cache, allowing accidental consumer mutation to alter both raw and selected data.                                                 | `features/catalog/model/catalog-view.ts:67,184-190,254-292`; Round 1 reviewer probe       | fix         | Resolved by cloning nested transport values; mutation regression confirms the parsed/raw snapshot remains unchanged.                                                                                                               |
| R06 | blocking | Media `public_id` validation used JS trim/UTF-16 length semantics, narrower than PostgreSQL default `btrim` and character length.                                                                         | `20260826050002_lean_identity_media_settings.sql:77-80`; original schema                  | fix         | Resolved with ASCII-space btrim, Unicode code-point length 1..255, raw-value preservation, and boundary coverage.                                                                                                                  |
| R07 | minor    | Semantic validation permits more than one primary media row per variant, while the migration enforces at most one; the view silently takes the first.                                                     | `20260826050003_lean_catalog_schema.sql:198-207`; schema/view media validation            | fix         | Resolved: a second primary row per variant is rejected with focused coverage.                                                                                                                                                      |
| R08 | blocking | `z.uuid()` imposed UUID version/variant rules that PostgreSQL `uuid` columns do not, so a canonical database-valid UUID could fail the snapshot.                                                          | Catalog UUID migrations; original schema; fresh T01 probe                                 | fix         | Resolved with one canonical 8-4-4-4-12 hex schema without version/variant restriction and relationship-consistent regression coverage.                                                                                             |
| R09 | major    | T03 card tests mocked `AppImage` without asserting URI/alt/fallback inputs, and the unavailable-product test did not prove absent optional copy stayed absent.                                            | Original `features/catalog/components/*-card.test.tsx`; fresh T03 review                  | fix         | Resolved with typed URI/alt/contentFit/null-media assertions and explicit absent brand/description checks.                                                                                                                         |
| R10 | minor    | `CatalogGridProps` inherited `horizontal`, allowing an invalid horizontal FlashList with 2–4 columns.                                                                                                     | Original `features/catalog/components/catalog-grid.tsx`; FlashList v2 types               | fix         | Resolved: `horizontal` is omitted from public props and controlled as `false`, with responsive coverage.                                                                                                                           |
| R11 | minor    | The shared multi-column grid had no row/column gutter, so intended bordered rounded cards would touch in both axes.                                                                                       | Original `features/catalog/components/catalog-grid.tsx`; fresh T03 review                 | fix         | Resolved with a token-based padded cell wrapper that preserves the FlashList render-item contract.                                                                                                                                 |
| R12 | minor    | T04 Home tests did not pin the 6/6/8 ordered section bounds or all three Browse All destinations.                                                                                                         | Original `features/catalog/screens/catalog-home/catalog-home-screen.test.tsx`; T04 review | fix         | Resolved with a schema-valid over-limit fixture and assertions for first/omitted entries plus `/brands`, `/categories`, and `/products`.                                                                                           |

Severity means: **blocking** — must not merge; **major** — fix in this feature;
**minor** — worth doing, safe to defer with a note.

## Re-review

After remediation, re-run the reviewer against the same scope.

- Result: T01/Round 1 closure found 0 blocking/major findings; T02 found none; T03/Round 2 found none after fixes; T04 fresh re-review found no findings.
- Findings resolved: R01, R03, R04, R05, R06, R07, R08, R09, R10, R11, R12.
- Still open: R02 minor accepted with Lead rationale; later Task/Round/Feature findings append here.

## Accepted risks

Anything deliberately not fixed, with the reason and who decided.

- **R02 (Lead):** no committed wall-clock performance threshold. The fix has two independent near-linear synthetic benchmark runs and a visibly indexed implementation; machine-dependent timing tests would be brittle. Runtime/device profiling remains part of the Feature Gate and will reopen this if a real pause is observed.

## Quality audit

A **different question** from the review above. Code review asks "is the
implementation correct?". The audit asks "was the promised delivery actually
completed, and is the evidence real?" — comparing `brief.md`, `plan.md`,
`todo.md`, `worklog.md`, this file, and the actual diff.

Run by `quality-auditor` with fresh context, after review findings are
dispositioned. It returns findings; the Lead records them here.

| Category                                                   | Finding | Evidence                                        | Resolution |
| ---------------------------------------------------------- | ------- | ----------------------------------------------- | ---------- |
| not delivered / not evidenced / not planned / stale record | TODO    | which document said what vs what the diff shows | TODO       |

- Acceptance criteria in `brief.md` all implemented: TODO
- Every task gate `PASS`, every round gate `PASS`: TODO
- Worklog carries real command output per task: TODO
- Shared files touched beyond this feature: TODO (expect none)
- Definition of Done (`AGENTS.md`) met: TODO

Audit result: `PENDING`
