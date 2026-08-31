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
| T05-R01 | minor    | Api test pinned only K1004 → state-conflict; AC-10 names both branches and AC-05's assignee-only path is the RPC's 42501                                                                                                                         | update-order-status.test.ts:92-121; migration 08:158-162                                                        | fix               | 42501 assignee-only rejection test added (kind forbidden, code 42501); both AC-10 branches pinned at the feature seam (implementer resumed; 6/6)                                                                                                                                             |
| T05-R02 | minor    | Hook invalidates on success only (per plan) — AC-10's "refresh on rejected transition" must be screen-owned; stale cache until realtime/refresh after a K1004                                                                                    | use-update-order-status-mutation.ts:23-30; plan.md:306-309                                                      | accept (deferred) | REQUIRED constraint carried into T10/T11/T13 packets: screens implement onError → invalidate/refetch                                                                                                                                                                                         |
| T06-R01 | major    | The 24h created_at lookback silently excludes orders that became terminal >24h after creation (weekend-stale order cancelled Monday never reaches Monday's history) — a plan-level defect faithfully implemented                                 | model/store-day.ts:185-187; api:61; plan.md decision 2 (pre-revision)                                           | fix               | Prefilter changed to the terminal timestamps themselves: in(status terminal) + or(completed_at.gte.start, cancelled_at.gte.start) — exact decision-2 semantics; plan decision 2 + data contract reconciled by the Lead first; historyLookbackStart removed; mutation-verified                |
| T06-R02 | major    | endUtc = start+24h drops the final local hour of DST fall-back days (25h days) — an order terminal at local 23:15 lands in NO window                                                                                                             | model/store-day.ts:163-177; test pin at :84-88; live repro by reviewer                                          | fix               | endUtc = the next LOCAL date's midnight via zonedTimeToUtc (23h spring / 25h fall / 24h normal); DST pins + the reviewer's 04:15Z repro added; mutation-verified (revert fails 3 tests)                                                                                                      |
| T06-R03 | minor    | The two-pass round-trip does not converge for 00:00 spring-forward zones (Havana/Beirut/Cairo) — the window start lands on the previous local date                                                                                               | model/store-day.ts:145-161; live repro (Havana 2026-03-08)                                                      | fix               | Existence check added (local-date comparison, bounded 1h steps); Havana 2026-03-08 pin added; docblock convergence claim corrected; mutation-verified                                                                                                                                        |
| T06-R04 | minor    | Merged status forced error while cached history data present — a later settings refetch failure would drop good data on a standard screen ladder                                                                                                 | use-store-day-history.ts:83-97                                                                                  | fix               | Gated: settingsErrorDominates = settingsQuery.isError && historyQuery.data === undefined; cached-data case tested; docblock corrected; mutation-verified                                                                                                                                     |
| T06-R05 | minor    | Spread-through refetch() bypasses enabled (query-core manual refetch never consults enabled) — settings-error retry would throw a raw Error under the placeholder key                                                                            | use-store-day-history.ts:59-68; query-core queryObserver.ts:336-348                                             | fix               | Composed refetch: settings first, then history; retry test asserts the settings query is re-called; docblock claim removed; mutation-verified                                                                                                                                                |
| T06-R06 | minor    | Two unpinned failure paths: history read's own error; wire-format timestamps (microseconds + offset) never fed through the model                                                                                                                 | use-store-day-history.test.tsx (absence); model/store-day.ts:196-204                                            | fix               | Both tests added: history AppError identity preserved; wire-format strings through orderTerminalInstant/isTerminalInDay                                                                                                                                                                      |
| T07-R01 | minor    | The model's "every Tables<"orders"> row satisfies it" claim is unpinned (status drift IS caught transitively via the shared OrderStatus, but an assignment-column rename would surface only at T09/T11 compile time)                             | status-actions.ts:50-52; contrast the T06 pin convention                                                        | accept (deferred) | Carried as a REQUIRED item into T09's packet: one-line Equals<Tables<"orders"> extends OrderActionOrder…> pin in fetch-active-orders.test.ts (the model cannot import generated types — ESLint)                                                                                              |
| T07-R02 | minor    | Test comment said "both of its rows" for cancelled's matrix rows — there are three (all reachable)                                                                                                                                               | status-actions.test.ts:105-107                                                                                  | fix               | Comment corrected to "all three of its rows" (implementer resumed; 17/17)                                                                                                                                                                                                                    |
| R1-01   | minor    | Carried constraints for Rounds 2/3 were scattered across review/worklog prose; todo.md (the declared working memory) carried none                                                                                                                | todo.md T08-T14 sections; review.md:19,24,31                                                                    | fix               | Lead added a "Carried constraints" block to todo.md (five REQUIRED items + three shared-file notes) and populated review.md's Accepted-risks section                                                                                                                                         |
| R1-02   | minor    | Worklog cited a nonexistent commit hash (5ab7a01) for the T06 plan reconciliation — the real commit is 1d78e8f                                                                                                                                   | worklog.md:477; git show 5ab7a01 fails                                                                          | fix               | One-line append-only correction added to the worklog                                                                                                                                                                                                                                         |
| R1-03   | minor    | T02's recording stub was the weak variant (3 methods, no exact-sequence pin) — an added builder call on the board read would pass silently, changing which orders get action affordances                                                         | fetch-active-orders.test.ts:58,84-87                                                                            | fix               | Stub strengthened to the every-method convention + exact sequence ["select","in","order"] pinned; mutation-verified (.limit(10) now fails); implementer resumed                                                                                                                              |
| R1-04   | minor    | Mutation hook's .all comment overclaimed ("every query reads the same rows" — store-settings does not)                                                                                                                                           | use-update-order-status-mutation.ts:23-29                                                                       | fix               | Comment reworded to justify by key topology; the harmless extra singleton read named; implementer resumed                                                                                                                                                                                    |
| R1-05   | minor    | History dayKey rollover is re-render-driven, not refetch-driven; the docblock overclaimed                                                                                                                                                        | use-store-day-history.ts:40-46,49-57; queryObserver.js:84-108                                                   | fix               | Docblock states the actual render-driven semantics; the rollover policy decision carried to T14's packet; implementer resumed                                                                                                                                                                |

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

### T05 review coverage statement (reviewer agent-0ca47f51, fresh context)

Examined and clean: RPC fidelity (exact argument names/types vs migration
08:5-9 and generated Args; schema validated at the boundary; correct
RpcInvocation form; zero client-side transition re-implementation), input
union honesty (Equals compile proof; nothing widens it), reason semantics
verified end-to-end through postgrest-js serialization (undefined key
dropped → RPC default null; mock pin accurate), hook (.all invalidation
genuinely narrow — every feature key nests under ["preparation"]; no
retry override verified against core/query/client.ts; hook exposes what
T10/T11/T13 need), test quality (every test names a contract; negative
controls verified; RED coherent), the gcTime workaround verified against
query-core source (scheduleGc skips Infinity), boundaries and scope
(exactly four files; api/-only; no suppressions). Full-repo test:ci
re-run: 24 suites / 171 tests, zero console output.

### T06 review coverage statement (reviewer agent-0101f749, fresh context)

Examined and clean: decision-2 mechanics (terminal keying by status,
[start,end) boundary pins, totality against anomalies), the api read shape
(exact builder sequence, no embed, toAppError, RLS docblock re-verified),
structural model types (ESLint exclusion verified at eslint.config.mjs
143-163; compile-time proofs real under tsc), garbage-zone degradation
implemented and pinned, hook composition (settings states, null-settings
fallback, dayKey cache assertion, filter correctness), model purity (zero
imports), boundaries (six files, git diff empty), test quality (all 32
pre-remediation tests walked; RED coherent). Full-repo test:ci re-run:
27 suites / 204 tests zero console at review time. The reviewer also
verified the TanStack enabled-bypass premise against query-core source
and reproduced both DST repros live.

### T07 review coverage statement (reviewer agent-91c3f6b5, fresh context)

Examined and clean: matrix fidelity all 15 cells (terminal guard, cancel
status-only, claim K1004 guard, mark-ready IS DISTINCT FROM semantics with
NULL distinct from any actor, ready display-only), totality (incoherent rows
match the RPC's own defensive answers), purity and boundaries (single type
import from ./store-day; ESLint-verified), non-duplication (OrderStatus
identical to the generated enum; ActiveOrderRow feeds OrderActionOrder
directly so T09 passes board rows unmodified), test quality (equivalence
classes genuinely exhaustive; foreign-status pin has real mutation value;
the as unknown as cast is the right tool; allowedOrderActions equality per
row), consumer-readiness for T09/T10/T11 (actor id semantics, docblock
authority statement). Evidence independently reproduced (17/17; 11 suites /
88 tests; typecheck/lint/prettier clean).

### Round 1 gate review coverage statement (reviewer agent-7120f845, fresh context)

Examined and clean: cross-task contract coherence (one orders contract
across reads/mutation/models; the board/history filters partition the enum
exactly; assignee semantics coherent; T05's input union honest), key
topology / invalidation / realtime readiness (all keys nest under
["preparation"]; CRITICALLY verified against installed query-core that
invalidateQueries skips disabled queries — the .all invalidation cannot
re-expose the T06-R05 raw-Error path), T06-T04 composition (public-surface
only, no internals leak), architecture/boundaries (zero files outside the
feature; Supabase confined to api/\*\* verified file-by-file; no store; no
suppressions), test-suite coherence (11/88 and 28/226 re-run green, exactly
the Lead's numbers; no test contradicts another), control docs vs reality
(plan post-reconciliation matches the implementation; board matches the
gates; worklog complete). Verdict: Round 1 is coherent as one system; all
five findings minor, none blocking.

### T08 review coverage statement (reviewer agent-c91f425f, fresh context)

Examined and clean: mapping fidelity (ui-lab demo + plan + brief words),
composition honesty (Badge/Text/badgeVariants from the barrel only;
TextClassContext propagation exactly as ui-lab), variant drift-proofing
(both directions pinned), totality (compile-time Record; no fallback dead
code), scope/boundaries (two files; no suppressions; no raw colours;
presentational-only), design system compliance (words never colour-only;
no role needed for a display element), verification re-run (5/5,
typecheck, prettier; scoped eslint 0 errors/1 warning → fixed), RED
evidence accepted as recorded, consumer-readiness for T09/T13/T14,
RN performance (pure leaf; list concerns belong to T09/T11).

## Re-review

After remediation, re-run the reviewer against the same scope.

- Result: TODO
- Findings resolved: TODO
- Still open: TODO

## Accepted risks

Anything deliberately not fixed, with the reason and who decided.

- **T03-R03** (Lead): no `enabled` guard on useOrderDetail — the details
  screen (T13) branches on a missing route param instead; carried as a
  REQUIRED constraint in T13's packet.
- **T03-R04** (Lead): `ActiveOrderRow` name at the detail boundary —
  shape identical, reuse mandated; docblocks document it.
- **T04-R02** (Lead): stale two-table doc in shared core/testing/supabase.ts
  — a shared-file fix is a Lead-owned foundation chore, not this feature's
  PR; recorded in todo.md's shared-file notes.
- **T05-R02** (Lead): the mutation hook invalidates on success only (per
  plan) — the rejected-transition refresh is screen-owned; carried as a
  REQUIRED constraint in T10/T11/T13 packets.
- **T06 shared-mock gap** (Lead): core/testing's mock chain has no `or`
  method — the feature's api test uses an in-file recording stub;
  adding `or` to the shared mock is a Lead-owned foundation chore.
- **R1-05** (Lead): store-day rollover is render-driven — the history
  rollover policy (accept vs refetchInterval) is T14's decision; the
  docblock now states the actual semantics.

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
| T08-R01 | minor | ReadonlyArray<T> spelling trips the repo's --max-warnings=0 lint-staged hook (file would be silently rewritten at commit) | order-status-badge.test.tsx:20; package.json:103 | fix | Changed to `readonly {…}[]`; scoped eslint zero warnings (implementer resumed; 5/5) |
| T08-R02 | minor | Variant assertion walks getByText(label).parent.props.className — sound (host-only tree; mutually distinguishing tokens) but couples to host-tree shape and cva class strings | order-status-badge.test.tsx:45-46; test-renderer index.cjs:119-140 | accept | Sound and honestly documented; the data-level STATUS_BADGE export pin is an optional future alternative — deferred with the docblock trade-off note |
| T08-R03 | minor | completed→outline mapping had no plan/worklog trace (exists only in the task packet + docblock) | rg outline features/preparation/docs → no matches | fix | Recorded in the T08 worklog entry (Lead-decreed gap-fill, terminal-calm rationale) |
