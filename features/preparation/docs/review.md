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

### T09 review coverage statement (reviewer agent-26b2a373, fresh context)

Examined and clean: AC-03 content hierarchy (all seven elements), action
wiring (affordance && callback && !readOnly; !readOnly guard genuinely
pinned; action press does not fire onPress; card-press fires with the
order), presentational purity (type-only ActiveOrderRow import; no
client/query/store/navigation; lint-clean against the boundary rule),
RN hazards (no falsy-&& renders; explicit length comparison; no
effects; no speculative memoization; h-touch via the sanctioned compact
size), test quality (14/14; RED internally consistent with the
placeholder; fixtures per the T02 {type,value} convention; the
async-unmount fix matches the core/realtime precedent), boundaries
(exactly the scoped files), honest docblocks, the pin deviation accepted
as disclosed (legitimate minimum shape, load-bearing, correct
direction, nothing else changed). Pin negative-check verified by the
reviewer against database.types.ts.

## Re-review

After remediation, re-run the reviewer against the same scope. The Findings
table's Disposition column is the per-finding record; this block is the
round-level summary, refreshed at each round gate.

- Result after T08–T12 remediation: all findings resolved or carried with
  Lead dispositions recorded in the Findings table (see per-task entries in
  the worklog: T08-R01 fixed, T08-R02/R03 accepted/recorded, T09-R01–R05
  fixed, T10-R01 reconciled+carried→T11 (resolved), T10-R02 fixed,
  T11-R01 accepted, T11-R02–R05 carried→T12 (resolved), T12-R01 accepted).
- Still open (Round 2, at gate time): R2-01 (major — in remediation by the
  resumed T11 implementer), R2-02/R2-03 (Lead-side doc fixes, applying),
  R2-04/R2-05 (folded into the same remediation session).

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
| T09-R01 | major | No per-card in-flight state surface — plan decision 5 (per-card disabled + label swap + repeat guard, AC-04/10) unimplementable at T11/T13 (scopes exclude components/\*\*) | order-card.tsx:37-57,78-103; plan.md:136-140; todo.md:220,244 | fix | pendingAction prop added: disabled + label swap per the sign-in-form convention, per-action; mutation-verified; implementer resumed |
| T09-R02 | minor | Accessible name composed from the raw status word, bypassing T08's label mapping — drift risk | order-card.tsx:156 | fix | orderStatusLabel(status) exported from order-status-badge.tsx; the badge itself renders through it (one source); the card name composes from it |
| T09-R03 | minor | The "assigned to you" accessible-name branch unpinned | order-card.tsx:146-151; test :253,266 | fix | One focused test added (actor-assigned preparing order) |
| T09-R04 | minor | Header row (mono number + badge) overflow risk at 200% text scaling / narrow columns — no flex-wrap | order-card.tsx:121; .claude/rules/ui.md:39 | fix | flex-wrap added (the repo's dense-row idiom) |
| T09-R05 | minor | Card Pressable had no press feedback | order-card.tsx:154-158; button.tsx:13 | fix | active:opacity-90 added (the Button primitive's own idiom) |
| T10-R01 | minor | AC-06's rejection half unowned at the dialog layer — inline feedback is invisible behind an open modal, so nothing pins that a rejected cancel closes the dialog and surfaces feedback; plan.md:329 as written implied the dialog should test "error feedback" | plan.md:326-329; cancel-order-dialog.tsx:25; components/ui/dialog.tsx:23; review of dialog z-50 overlay | fix | plan.md test-strategy line reconciled (screen-owned error feedback, recorded per the T06-revision precedent); REQUIRED constraint added to T11/T13 packets: rejected cancel → dialog open=false + feedback near the card + invalidate/refetch + its own screen test |
| T10-R02 | minor | Test docblock misattributed "presentational" to plan decision 4 (decision 4 governs the copy; presentational-ness is the repo component convention) | cancel-order-dialog.test.tsx:9-10; plan.md:131-135 | fix | One comment line corrected (Lead-applied and disclosed in the worklog — the original implementer context was lost to the session interruption; re-verified 5/5) |
| T11-R01 | minor | While one transition is in flight, other cards' action buttons render enabled but presses are no-ops — no disable, no feedback (decision 5's rationale was a usable board; it looks usable but isn't during the RPC window) | workspace-screen.tsx:134,161; flutter ref §22:940 | accept | Single-RPC-round-trip window; the reference itself blocks interactions during status-mutation processing (gap is feedback, not the block); one tablet = one signed-in session, so simultaneous two-employee taps are not a real path. Per-order in-flight client map recorded as an optional future enhancement |
| T11-R02 | minor | Arrival announcement caption persists until the next arrival — stale visible residue on an all-shift screen | workspace-screen.tsx:98,115-119,272-276 | carry | Carried to T12 (which touches the workspace screen): clear after a short delay with timer + cleanup per RN rules |
| T11-R03 | minor | Empty-group-within-populated-board state ("No orders" columns) has no test pin | board-section.tsx:82-87 | carry | Carried to T12: one-line getByText("No orders") assertion in the expanded grouping test |
| T11-R04 | minor | Failed background/manual refetch with stale data is fully silent (error branch requires data === undefined); T12's realtime multiplies background refetches, growing this window | workspace-screen.tsx:207,259 | carry | Carried to T12: transient banner (InlineError/OfflineNotice) when isError && data !== undefined |
| T11-R05 | minor | formatCreatedAt can render "24:00" on h24-cycle ICU builds (Node here resolves h23; Hermes tablets are the risk) — the feature's own model documents and guards this | workspace-screen.tsx:71-78 vs model/store-day.ts:113-114 | carry | Carried to T12: reuse the model's % 24 absorption |
| T12-R01 | minor | Comment claimed a newer arrival restarts the announcement timer — false for an identical caption string (React same-value setState bailout → effect does not re-run → the older timer clears the new caption early); restart path unpinned by a test; consequence benign | workspace-screen.tsx:151-157; workspace-screen.test.tsx:663-693 | accept | Comment corrected (Lead-applied, disclosed, 22/22 re-verified); epoch-keyed captions + two-arrival restart test recorded as the optional future alternative |

- **R2-S1** (Lead, shared-file change — justified): `pnpm generate:smoke`
  failed after T11's sanctioned placeholder replacement — the check
  `replaces the preparation index.tsx placeholder deliberately` reads the
  TRACKED route as its fixture and asserts it still contains
  FoundationPlaceholder, but the documented first-feature workflow (docs/
  generator.md:105-115) consumes exactly that placeholder. Fixed in commit
  b4fce20: the check now falls back to a faithful placeholder copy once the
  tracked route has been replaced, and the "repository was never written to"
  assertion compares against the actual tracked content. Without this, CI
  (`pnpm generate:smoke` is a dedicated CI step) would be permanently red
  for every experience whose first feature shipped — this feature is the
  first, so it hit the gap first. Full `pnpm verify` green afterwards.
- **R2-S2** (Lead, observation — pre-existing core, NOT touched by this
  feature, carried from the T12 review): `core/realtime/index.ts:83` fires
  `void supabase.removeChannel(...)` — a rejection there is unhandled.
  Recorded for a core-owner chore; T12's tests never hit it (the spy's
  removeChannel resolves).
  | R2-01 | major | AC-10's rejection feedback is card-anchored and can render NOWHERE: (a) the rejected order departs the board (cancel race — the K1004 refetch removes the card, failure indistinguishable from success); (b) tabs layout moves the errored order to a hidden group (TabsContent null → error mounted nowhere visible) | workspace-screen.tsx:174-195,234-241; board-section.tsx:90-106; tabs.js:129-132 | fix | Resumed T11 implementer: visibleOrderIds (selected-tab group on tabs; all groups on columns) + orphanedActionError InlineError fallback in the screen body; two RED-first tests + exactly-once pin; re-reviewed RESOLVED (mutual exclusion by construction) |
  | R2-02 | minor | todo.md strikethrough erased the REQUIRED marker for T13's half of the cancel-rejection constraint | todo.md:46-50 vs plan.md:330-335 | fix | Strikethrough re-scoped: T11 half done, T13 half still REQUIRED |
  | R2-03 | minor | review.md's Re-review block was a stale TODO record | review.md:186-192 | fix | Block populated with the round-level summary; refreshed at each round gate |
  | R2-04 | minor | The announcement seam's two no-op behaviours unpinned (same-data refetch must not announce; departure must not announce) | workspace-screen.test.tsx:640-693 | fix | Two characterization tests added (structural-sharing path + empty-diff path) |
  | R2-05 | minor | The decision-5 pending derivation against a mid-mutation realtime refetch unpinned | workspace-screen.tsx:217-230; test :426-471, :730-769 | fix | Characterization test added (unresolved mutation + realtime event → pending preserved, repeat press ignored once; settle → cleared) |
  | R2-06 | minor | The orphaned fallback persists until the next action dispatch (unlike the stale-read banner, which clears on the next successful read) — same lifetime the card-adjacent copy always had; a decision, not an accident | workspace-screen.tsx:174 vs :346-348 | accept | Consistency with the sign-in-form convention + guaranteed visibility; auto-clearing would reintroduce the miss-it race R2-01 exists to fix. T13 packet carries: the details screen should adopt the SAME lifetime so the two screens agree |
  | T13-R01 | minor | Screen-local `formatCreatedAt` is byte-identical in workspace-screen.tsx:98-109 and order-details-screen.tsx:94-105; `PENDING_ACTION_BY_TARGET` and the pending label strings exist in three places — the two screens sharing `useUpdateOrderStatusMutation` must stay in agreement on the in-flight convention and the % 24 midnight guard; a future fix to one copy silently diverges the other | order-details-screen.tsx:94-105 vs workspace-screen.tsx:98-109 (diff-verified identical); plan.md:266-270; todo.md:208 | carry | Carried to T14 (the likely third consumer — the design system's own promotion trigger): lift `formatCreatedAt` into `features/preparation/model/order-display.ts` (a planned allowed manual file), both screens import it; the pending-label map stays per-screen (T14 is read-only, so no third consumer fires) |
  | T13-R02 | minor | The failed-fetch read state is pinned only for the retryable case; a non-retryable read failure (expired-session PGRST301 / forbidden 42501 — reachable on an all-day kiosk) renders the same "Order unavailable" ErrorState with canRetry=false, converging visually with the no-such-order EmptyState — the distinction judgement call 2 rests on, half-pinned | order-details-screen.test.tsx:263-287; core/errors/index.ts:157-160; error-state.tsx:30 | carry | Carried to T14: one additive test in the order-details suite — reject the read with a non-retryable AppError, assert no "Try again" (sanctioned small scope extension: the T14 implementer touches this suite for T13-R01 anyway) |
  | T13-R03 | minor (optional hardening) | Option label used as the React key in the items map — a malformed snapshot with duplicate {type, value} pairs would emit duplicate keys (React warning only; bounded list; migration 07's jsonb_agg cannot produce duplicates) | order-details-screen.tsx:473-477 | accept (defer) | Compound `key={`${label}-${index}`}` folded into T14's sanctioned touch of the file; no test change needed |
  | T13-N01 | note | First test in the repo to render `AppImage` needs a file-local `lucide-react-native` jest mock (jest-expo cannot transform its ESM; AppImage imports ImageOff at module scope). Promote to shared test infrastructure only when a second suite needs AppImage (likely the catalog feature) — a future note, not this feature's change | jest.config.js transformIgnorePatterns vs lucide-react-native package.json react-native condition; app-image.tsx:5 | note | Recorded here for the catalog feature's implementer |

### T13 review coverage statement (reviewer agent-8d6cd18d, fresh context)

Re-ran read-only: `pnpm typecheck` PASS, `pnpm lint` exit 0, format check
PASS, targeted 24/24, feature 16/168, repo 33/306, zero console output —
all matching the implementer's report. Judgement calls: lucide mock ACCEPT
(premise mechanically verified — lucide's react-native condition resolves
to untransformed ESM outside jest's allowlist; file-local blast radius;
promotion note recorded as T13-N01), failed-fetch-with-retry vs
no-such-order-without-retry ACCEPT (reference §24 grounds the shared
title; the retry distinction is ErrorState's own canRetry contract),
variant SKU KEEP (reference §24 Lean V2 list includes it; load-bearing
for the decision-7 ordering pin), feedback placement ACCEPT (card renders
for every loaded state incl. terminal; fallback covers non-loaded states;
mutual exclusion by construction; both homes pinned).

Examined and clean: scope hygiene (exactly the three declared paths +
one barrel line; route stays a thin param-reader; no suppressions/TODOs/
raw hex/inline styles/Dimensions); stale-data policy (isError renders
ErrorState even with retained data — the brief-required difference from
the workspace; ownActionError keyed by orderId so a param change cannot
leak another order's error); RN/design rules (all text in Text; ternary
conditionals only; no effects/subscriptions/timers to leak; ScrollView +
bounded list, no virtualization per plan ADR; AppImage for imagery;
default-size Buttons h-touch; roles/labels throughout; no colour-only
meaning; Screen constrained; flex-wrap at scaling risk points); Json
safety (optionTexts guards Array.isArray + per-entry checks; stable
codepoint sort); test quality (24 behaviour-named tests; mocks at the
api boundary; per-test QueryClient with gcTime: Infinity; installMockAuth
restored in afterEach); all six carried constraints implemented AND
pinned (T03-R03 two no-fetch assertions; T10-R01 own dedicated test with
dialog-closed-first; T05-R02 every rejection test asserts refetch ≥ 2;
T04 O-1 zero error.kind reads grep-verified; R2-06 feedback survives a
successful terminal refetch; R2-01 exactly-once visibility in both
homes); actions derive from allowedOrderActions (T07) — no duplicated
state machine; one-in-flight guard in both runTransition and
handleCancelRequested.

Out-of-scope observations (no action): no realtime subscription on the
details screen — plan-conformant (the workspace beneath it on the stack
stays subscribed and invalidates transitively); route file untested
matches the thin-route convention; a loose "migration-07 shape" comment
wording (columns are 04's, values 07's) — defensible.
