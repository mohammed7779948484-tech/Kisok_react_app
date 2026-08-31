# Preparation — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID      | Severity | Finding                                                                                                                                                                                                                                          | Evidence                                                                                                        | Disposition       | Remediation                                                                                                                                                                                                                                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01-R01 | minor    | No rejection test pinning the required-UTC-offset invariant of `isoTimestamp`; an offset-accepting regression would pass silently                                                                                                                | order-status-update.schema.test.ts (missing case); verified against zod 4.2.1                                   | fix               | One test added: "rejects an ISO timestamp without a UTC offset" (implementer resumed; re-verified 10/10)                                                                                                                                                                                     |
| T01-R02 | minor    | Required-field non-nullability unpinned (only `cancellation_reason` had the null boundary test)                                                                                                                                                  | order-status-update.schema.test.ts:76-81                                                                        | fix               | One test added: "rejects null for a required field" covering all four required fields (implementer resumed; re-verified 10/10)                                                                                                                                                               |
| T02-R02 | major    | Status filter contents and ordering direction had no enforcement anywhere; the test header falsely claimed TypeScript covers them (`in()` checks enum membership only; `ascending` is a plain boolean; the `.from()` stub discards builder args) | fetch-active-orders.test.ts:12-17; postgrest-js index.d.cts:2324,1751,1163-1167; core/testing/supabase.ts:61-74 | fix               | Recording chain stub added inside the test file asserting select/`.in`/`.order` args deep-equal; mutation-verified (dropping "ready", flipping ascending, dropping the embed each fail); header comment corrected to claim only the embed typing (implementer resumed; Lead re-verified 4/4) |
| T02-R01 | minor    | Self-contradictory `.order()` comment ("Newest first, so the board shows the oldest unstarted work highest") — a live hazard for T11 board rendering and future maintainers                                                                      | fetch-active-orders.ts:46                                                                                       | fix               | Comment rewritten to state the actual effect (newest first, created_at desc, rides the index)                                                                                                                                                                                                |
| T02-R03 | minor    | Test fixture `variant_options` used `{option_type, option_value}` keys; the real snapshot shape is `{type, value}` (migration 07:282-292) — a copy-paste hazard for T09/T13 tests                                                                | fetch-active-orders.test.ts:45                                                                                  | fix               | Fixture corrected to `[{ type: "Grind", value: "Whole bean" }]`                                                                                                                                                                                                                              |
| T03-R01 | major    | No hook-level key-shape test for the feature's first parameterized read; a queryKey regression would cross-contaminate the shared TanStack cache (order A served for order B on a shared kiosk)                                                  | plan.md:301-304 test strategy; absence of queries/use-order-detail test                                         | fix               | NEW use-order-detail.test.tsx (Lead-approved scope): two ids, one shared client, distinct cache entries asserted; mutation-verified (dropping the id from the key fails)                                                                                                                     |
| T03-R02 | minor    | Recording stub blind to ADDED builder calls — an added `.in("status",…)` on the detail read would pass silently and break history→details (AC-07 requires terminal orders to resolve)                                                            | fetch-order-detail.test.ts:105-114                                                                              | fix               | Stub strengthened: every builder method records; exact sequence ["select","eq","maybeSingle"] pinned; mutation-verified                                                                                                                                                                      |
| T03-R03 | minor    | The "no enabled guard" decision rests on T13 mounting with a real id; a missing query-param would stringify to `id=eq.undefined` → retryable server error before unavailable state                                                               | use-order-detail.ts:19-22; postgrest-js index.cjs:1517-1519                                                     | accept (deferred) | REQUIRED constraint recorded for T13's task packet: the details screen branches on a missing route param and renders the unavailable state without fabricating an id                                                                                                                         |
| T03-R04 | minor    | `ActiveOrderRow \| null` misreads at the detail boundary (detail legitimately resolves terminal orders via history) — reuse was mandated; shape identical                                                                                        | fetch-order-detail.ts:4,29                                                                                      | accept            | Docblocks document it; revisit only if T13/T14 find it confusing (Lead decision)                                                                                                                                                                                                             |
| T04-R01 | minor    | Test header overstated TypeScript blindness: select-string projection IS typed for literals; the real blind spots are single-vs-maybeSingle and added chain calls                                                                                | fetch-store-settings.test.ts:17-23; postgrest-js index.d.mts:1143,971                                           | fix               | Comment reworded to credit projection typing and claim only the real blind spots (implementer resumed; re-verified 5/5)                                                                                                                                                                      |
| T04-R02 | minor    | Stale doc in shared core/testing/supabase.ts: "orders and order_items" — store_settings is also an allowed preparation direct read (migration 13:24-31,189-205)                                                                                  | core/testing/supabase.ts:11-15                                                                                  | accept            | Shared-file doc fix belongs to a Lead-owned foundation chore, not this feature PR; recorded so the next agent knows the list is incomplete                                                                                                                                                   |

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

### T03 review coverage statement (reviewer agent-850be56c, fresh context)

Examined and clean: contract fidelity (single embed read, eq by id,
maybeSingle null-vs-error, toAppError, type reuse with zero duplication),
authorization and the no-Zod decision (migration 13:148-164;
docs/data-and-supabase.md:91-98), boundaries and scope (api/-only Supabase
verified against eslint.config.mjs:137-160; exactly the allowed files),
generator conformity (hook extends key+queryFn per the template's own TODO),
test quality (all 5 walked; two-seam setup mirrors T02; fixture shapes match
generated Rows incl. the remediated {type,value} options), RED/GREEN
re-run independently (20 suites/157 tests at review time, zero console
output). Observations for the Lead: O-1 dead detail key factory in keys.ts
(ACCEPTED — template verbatim, feature invalidates .all); O-2 stale T02
board row (fixed by the Lead).

### T04 review coverage statement (reviewer agent-85c0f59b, fresh context)

Examined and clean: contract fidelity (singleton read, null-not-error on
zero rows per plan decision 8, toAppError verified against core/errors),
minimal-read justification (singleton constraint), schema/RLS docblock
claims (migrations 02/13), test quality (all 5 walked; every failure mode
traced; compile proof follows the rpc.test.ts precedent plus a drift
guard), hook semantics (null as cacheable success value — sound; generated
key shape), boundaries (api/-only verified against eslint.config.mjs;
keys.ts untouched), zero convention divergence, RED coherence
reconstructed. Observations for the Lead: transport-level throws are not
AppError at screens (→ T11/T13/T14 packets); unresolvable IANA zone must
degrade like an absent row in T06's model (→ T06 packet).

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
