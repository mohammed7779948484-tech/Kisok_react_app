# Checkout — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at
the end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

The single answer to "where are we?". Update it whenever any of it changes; it
is the first thing the next agent reads.

```
Current round     : 5 (safety remediation — independent review findings F-01..F-08)
Current task      : — (round complete at the implementation level; verification/browser/reviews in flight)
Current stage     : FEATURE GATE REOPENED — the Round-4 PASS claim was INVALIDATED by the independent safety review (eight findings) and is superseded by Round 5
Last gate         : Round 5 task gates PASS (R5-T01..R5-T05); Round 5 gate in progress
Next legal action : deterministic full verification → live browser journey → fresh full-scope review + quality audit → push to PR #13
Blocked by        : —
```

### Round 4's Feature Gate claim — superseded (honesty note)

The Feature gate checklist below still shows its Round-4 state, including
`FEATURE GATE: PASS`. That claim was made while the remote HEAD still
contained eight safety defects (F-01..F-08) found later by an independent
safety review: the local remediation of that review's session was never
pushed. The claim is therefore **not evidence about the current remote HEAD**
and is superseded by Round 5. The checklist will be re-earned on the final
Round-5 HEAD with fresh evidence; nothing below this note should be read as
the current gate state.

## Rules

- A task is **DONE only at `GATE: PASS`**.
- **Task N+1 does not start until every dependency is `PASS`.**
- A failed gate is fixed **in that task**, not compensated in a later one.
- Every task declares a **verification mode** first — see the
  `test-driven-development` skill. The mode decides the entry evidence:
  `behavior` / `bug` / `behavior-change` need a failing test, `refactor` needs a
  named green baseline, `config` needs the command that exercises the artifact.
- **No task starts while `plan.md` is `DRAFT`.**
- **The Lead runs the scaffold**, immediately before delegating the task. The
  implementer starts only once `Scaffold status` is `READY`.

## Status board

Scan this first. Detail is below.

| Task   | Mode                | Acceptance                                   | Objective                                                    | Deps                    | Stage | Gate |
| ------ | ------------------- | -------------------------------------------- | ------------------------------------------------------------ | ----------------------- | ----- | ---- |
| T01    | behavior            | Supporting AC-07, AC-08                      | create-order-response schema                                 | —                       | done  | PASS |
| T02    | behavior            | Acceptance: AC-05                            | normalized-request pure rules                                | —                       | done  | PASS |
| T03    | behavior            | Supporting AC-06, AC-07                      | checkout-attempt record schema                               | T02                     | done  | PASS |
| T04    | behavior            | Supporting AC-07–AC-10                       | submit-order api + mutation hook                             | T01                     | done  | PASS |
| T05    | behavior            | Supporting AC-07, AC-11                      | Cart `clearCartDurable()` extension                          | —                       | done  | PASS |
| T06    | behavior            | Acceptance: AC-04, AC-06, AC-09–AC-11        | Checkout attempt store (state machine + durable lifecycle)   | T02, T03, T04, T05      | done  | PASS |
| T07    | behavior            | Acceptance: AC-12                            | Sign-out guard + cleanup registration                        | T06                     | done  | PASS |
| T08    | behavior            | Acceptance: AC-02, AC-03                     | Order Review screen + order-line-row                         | —                       | done  | PASS |
| T09    | behavior            | Acceptance: AC-04, AC-08–AC-10               | Review submission flow + outcome panels                      | T04, T06, T08           | done  | PASS |
| T10    | behavior            | Supporting AC-14                             | Catalog settings seam                                        | —                       | done  | PASS |
| T11    | behavior            | Acceptance: AC-07, AC-14, AC-15              | Order Success screen + countdown                             | T06, T08, T10           | done  | PASS |
| T12    | behavior            | Acceptance: AC-13                            | recovery-gate + layout mounting                              | T06, T07                | done  | PASS |
| T13    | config              | N/A — routing                                | Routes + hardware-back guard (R3-02)                         | T08, T11                | done  | PASS |
| T14    | behavior            | Acceptance: AC-01                            | Full Cart Review Order CTA                                   | T13                     | done  | PASS |
| T15    | behavior            | Acceptance: AC-16                            | Customer journey integration test                            | T09, T11, T12, T13, T14 | done  | PASS |
| R5-T01 | bug                 | Safety finding F-02                          | PostgREST transport-failure objects → network (ambiguous)    | —                       | done  | PASS |
| R5-T02 | bug                 | Safety finding F-08 (+ held/terminal schema) | Canonical fingerprint + semantic persisted-record invariants | R5-T01                  | done  | PASS |
| R5-T03 | bug+behavior-change | Findings F-03, F-04, F-05, F-06, F-07        | Attempt-store fail-closed state machine                      | R5-T02                  | done  | PASS |
| R5-T04 | bug                 | Safety finding F-01                          | Sign-out guard fails closed pre-recovery + hold families     | R5-T03                  | done  | PASS |
| R5-T05 | behavior-change     | RT03-4 carry (user-facing hold surfaces)     | Recovery-gate held/terminal/unsafe-recovery surfaces         | R5-T03, R5-T04          | done  | PASS |

Stage is one of: `not started` · `scaffolding` · `red/baseline` ·
`implementing` · `green` · `checks` · `diff review` · `done`.

This board is the only summary. Do not add a second task-checkbox list beside
it — two summaries disagree the moment one is updated and the other is not.

## Round 1 — domain model & contract

### T01 — create-order-response schema

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07, AC-08`
- **Depends on**: —
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate schema checkout create-order-response`
- **Expected generated files**: `model/create-order-response.schema.ts`,
  `model/create-order-response.schema.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/model/create-order-response.schema*`

### T02 — normalized-request pure rules

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-05`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: — (manual: no capability fits pure mapping rules)
- **Expected generated files**: —
- **Allowed manual files**: `model/normalized-request.ts`,
  `model/normalized-request.test.ts`
- **Scaffold status**: `N/A — no generator capability applies (pure domain rules, planned in plan.md)`
- **Allowed file scope**: `features/checkout/model/normalized-request*`

### T03 — checkout-attempt record schema

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-06, AC-07`
- **Depends on**: T02
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate schema checkout checkout-attempt`
- **Expected generated files**: `model/checkout-attempt.schema.ts`,
  `model/checkout-attempt.schema.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/model/checkout-attempt.schema*`

### T04 — submit-order api + mutation hook

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07, AC-08, AC-09, AC-10`
- **Depends on**: T01
- **Skills**: test-driven-development, supabase
- **Lead scaffold**: `pnpm generate mutation checkout submit-order`
- **Expected generated files**: `api/submit-order.ts`,
  `queries/use-submit-order-mutation.ts`, `queries/keys.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/api/submit-order*`,
  `features/checkout/queries/*`

## Round 2 — attempt lifecycle & safety

### T05 — Cart `clearCartDurable()` extension

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-07, AC-11`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: — (edit of an existing owning-feature file; no capability applies)
- **Expected generated files**: —
- **Allowed manual files**: edits to `features/cart/state/use-cart.ts`,
  `features/cart/index.ts` (additive public delegate + export), plus tests in
  the cart feature's existing test files
- **Scaffold status**: `N/A — owning-feature edit, planned in plan.md`
- **Allowed file scope**: `features/cart/state/use-cart.ts`,
  `features/cart/index.ts`, `features/cart/state/*.test.ts(x)`

### T06 — Checkout attempt store

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-04, AC-06, AC-09, AC-10, AC-11`
- **Depends on**: T02, T03, T04, T05
- **Skills**: test-driven-development
- **Lead scaffold**: `pnpm generate store checkout attempt`
- **Expected generated files**: `state/attempt-store.ts`,
  `state/attempt-store.test.ts`
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/state/attempt-store*`
- **Note (from T05 review F-T05-02)**: recovery flows that retry the durable cart clear MUST await `hydrateCart(owner)` (or confirm hydration settled) BEFORE `clearCartDurable()` — a clear awaited mid-restore resolves honest-on-disk but the restore apply can resurrect memory lines.

### T07 — Sign-out guard + cleanup registration

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-12`
- **Depends on**: T06
- **Skills**: test-driven-development
- **Lead scaffold**: — (module side-effect registration; cart precedent; no capability)
- **Expected generated files**: —
- **Allowed manual files**: `features/checkout/state/sign-out-cleanup.ts` (+ its
  test), edit `features/checkout/index.ts` (side-effect import)
- **Scaffold status**: `N/A — lifecycle registration, planned in plan.md`
- **Allowed file scope**: `features/checkout/state/sign-out-cleanup*`,
  `features/checkout/index.ts`

## Round 3 — surfaces

### T08 — Order Review screen + order-line-row

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-02, AC-03`
- **Depends on**: —
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component checkout order-line-row` then
  `pnpm generate screen checkout order-review`
- **Expected generated files**: `components/order-line-row.tsx` (+ test),
  `screens/order-review/order-review-screen.tsx` (+ test)
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/components/order-line-row*`,
  `features/checkout/screens/order-review/**`

### T09 — Review submission flow + outcome panels

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-04, AC-08, AC-09, AC-10`
- **Depends on**: T04, T06, T08
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: — (wiring the existing screen/store/hook; no new structure)
- **Expected generated files**: —
- **Allowed manual files**: screen-local components under
  `features/checkout/screens/order-review/components/` for the outcome panels
  (planned: conflict panel, unknown panel, failure panel)
- **Scaffold status**: `N/A — wiring task over existing scaffold`
- **Allowed file scope**: `features/checkout/screens/order-review/**`,
  `features/checkout/queries/**` (hook wiring)

### T10 — Catalog settings seam

- **Mode**: behavior
- **Acceptance**: `Supporting: AC-14`
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: — (manual thin selector over the existing query; generating a query would create a second RPC path — plan D6)
- **Expected generated files**: —
- **Allowed manual files**: `features/catalog/queries/use-customer-settings.ts`
  (+ test), edit `features/catalog/index.ts` (export)
- **Scaffold status**: `N/A — thin selector, planned in plan.md (D6)`
- **Allowed file scope**: `features/catalog/queries/use-customer-settings*`,
  `features/catalog/index.ts`

### T11 — Order Success screen + countdown

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-07, AC-14, AC-15`
- **Depends on**: T06, T08, T10
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate screen checkout order-success` then
  `pnpm generate component checkout success-countdown --screen=order-success`
- **Expected generated files**: `screens/order-success/order-success-screen.tsx`
  (+ test), `screens/order-success/components/success-countdown.tsx`
  (the generator emits no component test — the colocated test is planned
  manual)
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/screens/order-success/**`

### T12 — recovery-gate + layout mounting

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-13`
- **Depends on**: T06, T07
- **Skills**: test-driven-development, kisok-design-system, expo-router
- **Note (from Round 2 review R2-03 / sign-out-cleanup.ts edge-timing)**: the
  recovery gate must fire `recover()` at layout mount and sign-out-reachable
  UI must stay blocked (or the store's recordLoaded guard consulted) until
  the first durable read lands — the sign-out guard reads the IN-MEMORY
  record, so the restart window (a durable record from a prior session not
  yet loaded) is closed by THIS composition, not by the guard alone.
- **Lead scaffold**: `pnpm generate component checkout recovery-gate`
- **Expected generated files**: `components/recovery-gate.tsx` (+ test)
- **Allowed manual files**: edit `app/(customer)/_layout.tsx` (mount the gate),
  edit `features/checkout/index.ts` (export the gate)
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `features/checkout/components/recovery-gate*`,
  `features/checkout/index.ts`, `app/(customer)/_layout.tsx`

## Round 4 — routes, entry & journey

### T13 — routes

- **Note (from Round 3 review R3-02, AC-04 gap)**: the checkout surfaces have
  no hardware/gesture-BACK defense yet — Android's back button can pop the
  review screen during submitting/unknown (stranding the unknown-phase
  customer on a locked cart with no Check Again until restart) and can kill
  the success screen's countdown. Subscribe `BackHandler` while phase is
  submitting/unknown on the review screen and while the success countdown
  owns the session (return true; clean removal) — pin with RN's BackHandler
  jest mock. Land with the routes (T13/T14).

- **Note (from T11 review F-T11-04, disposition deferred here)**: decide the
  reset navigation semantics when the routes land — the success reset
  currently pushes "/"; the catalog convention for top-level destinations is
  replace (a growing back stack across a shift on a long-lived kiosk).
  Back-landing is already covered by the escape state, so this is polish,
  not a safety gap — but prefer `router.replace` for the Next Customer/expiry
  reset if it composes cleanly.

- **Mode**: config
- **Acceptance**: `N/A — routing`
- **Depends on**: T08, T11
- **Skills**: test-driven-development, expo-router
- **Lead scaffold**: `pnpm generate route checkout checkout --role=customer --screen=order-review` then
  `pnpm generate route checkout checkout-success --role=customer --screen=order-success`
- **Expected generated files**: `app/(customer)/checkout.tsx`,
  `app/(customer)/checkout-success.tsx`, index.ts export additions
- **Allowed manual files**: —
- **Scaffold status**: `READY` (ran by the Lead; SCAFFOLD block in worklog)
- **Allowed file scope**: `app/(customer)/checkout.tsx`,
  `app/(customer)/checkout-success.tsx`, `features/checkout/index.ts`,
  `features/checkout/screens/order-review/**` and
  `features/checkout/screens/order-success/**` (the BackHandler guard —
  R3-02, sanctioned by the note above; scope widened per F-T13-02)

### T14 — Full Cart Review Order CTA

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-01`
- **Depends on**: T13
- **Skills**: test-driven-development, kisok-design-system, expo-router
- **Lead scaffold**: — (owning-feature edit)
- **Expected generated files**: —
- **Allowed manual files**: edits to
  `features/cart/screens/full-cart/full-cart-screen.tsx` and its test
- **Scaffold status**: `N/A — owning-feature edit, planned in plan.md`
- **Allowed file scope**: `features/cart/screens/full-cart/**`

### T15 — Customer journey integration test

- **Mode**: behavior
- **Acceptance**: `Acceptance: AC-16`
- **Depends on**: T09, T11, T12, T13, T14
- **Skills**: test-driven-development, kisok-react-native-rules
- **Lead scaffold**: — (integration test, convergence.test.tsx precedent)
- **Expected generated files**: —
- **Allowed manual files**: `features/checkout/checkout-journey.test.tsx`
- **Scaffold status**: `N/A — integration test, planned in plan.md`
- **Allowed file scope**: `features/checkout/checkout-journey.test.tsx`

Rounds 1–4 gates: `PASS` (the worklog's ROUND GATE blocks carry the evidence)

## Feature gate

Every line is a box, and `pnpm verify` alone is not the authority — several
of these depend on an environment only CI has. See `review.md` for the review and
audit findings this checklist points at.

- [x] Every Task Gate PASS — T01–T15, each with a fresh independent reviewer
- [x] Every Round Gate PASS — Rounds 1–4, each with a fresh round reviewer
- [x] Every AC verified — AC-01..AC-16 (the quality auditor's not-delivered category: CLEAN)
- [x] `pnpm verify` PASS after the final local change — exit 0, 69 suites / 864 tests at the final HEAD 6721600
- [x] required fast GitHub CI PASS on the final HEAD — the CI workflow SUCCESS on 6721600 (run 33880375499: Verify incl. the REAL db:verify, Web bundle, Expo Doctor all green; Android/Maestro label-gated — skipped)
- [x] required runtime evidence recorded — the hosted-TEST journey: a REAL order SL329M, the live auto-reset, all three sizes, zero console errors (worklog's Round 4 runtime section)
- [x] required native tier(s): explicitly UNVERIFIED — no device/emulator in this environment (review.md dispositions)
- [x] Reviewer findings dispositioned — every task/round/final finding fixed or accepted with rationale (review.md)
- [x] blocking/major fixes re-reviewed — R2-01/F-06-01/F-06-02/F-T11-01 remediations verified by fresh reviewers / reviewer-verified evidence; the final full review found 0 blocking/major
- [x] Quality Audit clean — CLEAN-WITH-OBSERVATIONS, all observations dispositioned at audit time
- [x] anything not verified explicitly recorded — review.md's dispositions (live conflict/ambiguity/replay, web back, stack growth, text scaling)
- [x] shared/core changes justified — plan.md's external-changes list (reconciled incl. core/testing/query.tsx)
- [x] PR evidence matches the worklog — PR #13's body updated to the final state with the CI link

FEATURE GATE: **PASS**

## Blocked

What cannot proceed, and what it is waiting for. Empty is good.

- —

## Round 5 — safety remediation (independent review findings F-01..F-08)

Opened because an independent safety review of the REMOTE PR #13 HEAD (055e674)
found eight VALID duplicate-order/unsafe-recovery defects the Round-4 record had
already claimed past. PATH B recovery: the previous local remediation was lost
with its sandbox, and was rebuilt in this round with fresh task gates.

Each remediation task had a FRESH feature-implementer (RED → implement → GREEN)
and a FRESH READ-ONLY code-reviewer, with the Lead dispositioning every finding.
Commits: R5-T01 `1aef2ca`, R5-T02 `564a131`, R5-T03 `edff3f4`+`b718919`,
R5-T04 `95e7071`, R5-T05 `af4fe8f`.

### R5-T01 — F-02: PostgREST transport-failure classification (core/errors)

- **Mode**: bug
- **Finding**: `@supabase/postgrest-js` 2.112.4 RETURNS (does not throw) an
  error object with an EMPTY code on fetch rejection; `toAppError` mapped the
  unmapped empty-code family to the DEFINITE `server` kind, so Checkout
  discarded the idempotency identity on transport failures that cannot prove
  rollback.
- **Fix**: canonical transport signatures (incl. anchored `FetchError:`/
  `TypeError:`/`AbortError:` name prefixes postgrest-js constructs) →
  `network` (ambiguous, retryable); mapped codes and unmapped non-transport
  codes unchanged. Pinned at the rpc boundary and in the checkout api suite.

### R5-T02 — F-08: persisted-record semantic integrity (+ held/terminal shapes)

- **Mode**: bug
- **Fix**: ONE canonical `deriveRequestFingerprint`; the persisted schema
  enforces canonical fingerprint, per-variant snapshot quantity aggregate,
  mint-form items, and (terminal) conflicts-belong-to-items on ALL FOUR
  statuses; two new durable statuses `held` (K1003) and `terminal` (definite
  no-order verdict, kind excludes network/unknown/idempotency-conflict).

### R5-T03 — F-03/F-04/F-05/F-06/F-07: the fail-closed state machine

- **Mode**: bug + behavior-change
- **Fixes**: RPC_SCHEMA_MISMATCH → ambiguous; K1003 → durable HELD record +
  phase `held` + cart locked + no fresh mint + restart-stable; corrupt/foreign
  records HELD as evidence (never silently deleted; only foreign-confirmed-
  done discarded); definite outcomes persist a TERMINAL record when the
  discard fails (restart restores the verdict with ZERO create_order calls);
  the cart unlocks only when the durable clear is proven done.

### R5-T04 — F-01: sign-out guard fails closed

- **Mode**: bug
- **Fix**: the guard blocks while `recordLoaded === false` (the pre-recovery
  window), and blocks the staff-hold family (held/unsafe-recovery/unsafeHold)
  with its own accurate reason. Holds exit only via staff intervention (the
  documented design trade).

### R5-T05 — Recovery-gate surfaces (RT03-4 carry)

- **Mode**: behavior-change
- **Fix**: phase-scoped `held` (in-session AND restored) and `unsafe-recovery`
  staff panels — no actions by design; the terminal outcome joins the
  outcome-scoped conflict/failure panels (no auto-replay); the episode flag
  never suppresses a hold.

### Round 5 gate

- [x] R5-T01..R5-T05 task gates PASS, each with fresh implementer + reviewer
- [x] All eight findings dispositioned (F-01..F-08 CLOSED; evidence in worklog)
- [x] Full deterministic verification on the final HEAD (pnpm verify exit 0 — typecheck/lint/format/69 suites/953 tests/docs/commits/e2e-appid/ci-scripts/db:types/generator-smoke; export:web exit 0; doctor 18/18)
- [x] Live browser journey on the hosted TEST project (worklog Round-5 live section: 4 real orders, natural stock conflict, ambiguous-network retention, stale routes, three sizes, zero console errors)
- [ ] Fresh full-scope code review: 0 blocking / 0 major
- [ ] Fresh quality audit
- [ ] Pushed to origin/feature/checkout; PR #13 HEAD == local HEAD; CI green on that exact SHA

Round 5 gate: **IN PROGRESS**
