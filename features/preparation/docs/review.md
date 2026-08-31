# Preparation — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID      | Severity | Finding                                                                                                                                                                                                                                          | Evidence                                                                                                        | Disposition | Remediation                                                                                                                                                                                                                                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01-R01 | minor    | No rejection test pinning the required-UTC-offset invariant of `isoTimestamp`; an offset-accepting regression would pass silently                                                                                                                | order-status-update.schema.test.ts (missing case); verified against zod 4.2.1                                   | fix         | One test added: "rejects an ISO timestamp without a UTC offset" (implementer resumed; re-verified 10/10)                                                                                                                                                                                     |
| T01-R02 | minor    | Required-field non-nullability unpinned (only `cancellation_reason` had the null boundary test)                                                                                                                                                  | order-status-update.schema.test.ts:76-81                                                                        | fix         | One test added: "rejects null for a required field" covering all four required fields (implementer resumed; re-verified 10/10)                                                                                                                                                               |
| T02-R02 | major    | Status filter contents and ordering direction had no enforcement anywhere; the test header falsely claimed TypeScript covers them (`in()` checks enum membership only; `ascending` is a plain boolean; the `.from()` stub discards builder args) | fetch-active-orders.test.ts:12-17; postgrest-js index.d.cts:2324,1751,1163-1167; core/testing/supabase.ts:61-74 | fix         | Recording chain stub added inside the test file asserting select/`.in`/`.order` args deep-equal; mutation-verified (dropping "ready", flipping ascending, dropping the embed each fail); header comment corrected to claim only the embed typing (implementer resumed; Lead re-verified 4/4) |
| T02-R01 | minor    | Self-contradictory `.order()` comment ("Newest first, so the board shows the oldest unstarted work highest") — a live hazard for T11 board rendering and future maintainers                                                                      | fetch-active-orders.ts:46                                                                                       | fix         | Comment rewritten to state the actual effect (newest first, created_at desc, rides the index)                                                                                                                                                                                                |
| T02-R03 | minor    | Test fixture `variant_options` used `{option_type, option_value}` keys; the real snapshot shape is `{type, value}` (migration 07:282-292) — a copy-paste hazard for T09/T13 tests                                                                | fetch-active-orders.test.ts:45                                                                                  | fix         | Fixture corrected to `[{ type: "Grind", value: "Whole bean" }]`                                                                                                                                                                                                                              |

Severity means: **blocking** — must not merge; **major** — fix in this feature;
**minor** — worth doing, safe to defer with a note.

### T01 review coverage statement (reviewer agent-3b9ee103, fresh context)

Examined and clean: contract fidelity vs migration 08 (all 8 fields,
nullability, enum values, display_number regex), zod v4 timestamp handling
(verified against installed zod 4.2.1 source), model purity and boundaries
(no Supabase imports, colocated test, generator-compatible naming),
scope (only the two scaffolded files), verification re-run (8/8, typecheck,
lint, prettier), RED consistency by reconstruction. Not applicable: auth,
state ownership, Realtime, design system, RN performance (pure model file).

### T02 review coverage statement (reviewer agent-2c94e2fe, fresh context)

Examined and clean: contract fidelity (three active statuses, created_at desc,
single embed read, error → toAppError with the 42501 mapping verified against
core/errors), RLS/grant claims in the module comment (migration 13:148-164,
189-205), typing honesty (no casts; embed genuinely pinned by the postgrest-js
select-string parser; Equals assertion follows the rpc.test.ts precedent),
KISOK boundaries (api/-only Supabase, hook matches the generator template,
keys.ts verbatim, no retry override, no Zod revalidation of a direct read),
scope (exactly four files), test quality of the AppError and one-read
assertions, RED coherence. Verification re-run: 3/3, typecheck, lint clean.

## Re-review

After remediation, re-run the reviewer against the same scope.

- Result: TODO
- Findings resolved: TODO
- Still open: TODO

## Accepted risks

Anything deliberately not fixed, with the reason and who decided.

- —

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
