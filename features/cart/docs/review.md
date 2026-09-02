# Cart — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID  | Severity                 | Finding | Evidence                | Disposition           | Remediation |
| --- | ------------------------ | ------- | ----------------------- | --------------------- | ----------- |
| R01 | blocking / major / minor | TODO    | file:line, or a command | fix / accept / reject | TODO        |

Severity means: **blocking** — must not merge; **major** — fix in this feature;
**minor** — worth doing, safe to defer with a note.

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

## Findings

| ID       | Severity | Finding                                                                                                          | Evidence                                          | Disposition                                                                      | Remediation |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| R-T01-01 | minor    | `addToCartInputSchema` exported with no test and no consumer yet                                                 | cart-line.schema.ts:32                            | defer to T02 (its consumer; T02 packet adds tests + documents strip-mode caveat) | T02         |
| R-T01-02 | minor    | Guards unproven by tests: productId uuid, option ids uuid, lineId min                                            | cart-line.schema.test.ts:82 only variantId tested | defer to T02 (three one-line tests in same model scope)                          | T02         |
| R-T01-03 | minor    | Comment/behavior tension: 99-cap comment says "UX guard" but max(99) is a hard restore boundary within format v1 | cart-line.schema.ts:27-28                         | reword comment in T02; cap changes require version bump                          | T02         |
| R-T01-04 | minor    | Worklog carried only SCAFFOLD at review time; RED/GREEN evidence unrecorded                                      | worklog diff                                      | resolved — Lead recorded full evidence at gate                                   | done        |
| R-T01-05 | minor    | Restore boundary does not enforce unique lineIds (foreign/duplicate payload could restore ambiguous lines)       | persisted-cart.schema.ts:17                       | remediate in T02: `.refine` unique lineIds + test (AC-02 restore validation)     | T02         |

| R-T02-01 | minor | addLine append trusted stray input lineId over derived identity | cart-rules.ts:25 (pre-fix); reviewer /tmp empirical run | fixed in-task — derived id spread last + regression test (RED→GREEN) | done |
| R-T02-02 | minor | 99 cap duplicated as two literals with divergent rationale | cart-rules.ts:10 vs cart-line.schema.ts:29 | fixed in-task — single MAX_LINE_QUANTITY export in schema; rules import; round-trip test | done |
| R-T02-03 | minor | NaN escaped floor-then-clamp (unpersistable line) | cart-rules.ts:39; empirical | fixed in-task — Number.isFinite guard (NaN→1, ±Inf→max/min) + tests | done |
| R-T02-04 | minor | empty-cart 0/0 and post-setQuantity recompute untested | cart-rules.test.ts | fixed in-task — two honest coverage tests | done |
| R-T02-05 | minor | plan.md decision 3 said "ordered set" while implementation sorts (identity vs display order) | plan.md decision 3 | fixed by Lead — wording now "canonically SORTED set; array order is display order, not identity" | done |

T02 re-review note: findings were all minor; remediations verified by Lead
(focused 46/46, full 20 suites/184, checks clean, single-99-literal audit).
Carried constraint into T04: the store must parse add input through
`addToCartInputSchema` before calling the rules (defense-in-depth per
reviewer).

| R-T03-01 | major | durableClear bypassed the write queue — cleared cart resurrection, write/fallback overlap, clearFailed erasure | cart-store.ts:99-114,177,219-228; race harness empirical | fixed round 1 — ONE serialized durable-op chain | done |
| R-T03-02 | major | clearFailed downgraded to memoryOnly by later failed write (stale cross-customer data on disk) | cart-store.ts:184-186; empirical | fixed round 1 — sticky clearFailed precedence (failure keeps; success clears) | done |
| R-T03-03 | minor | persistNow pre-hydrate wrote ownerless schema-invalid envelope | cart-store.ts:40,84-88,209-217 | fixed round 1 — skip + rejected result + unknown | done |
| R-T03-04 | minor | flush not throw-safe (waiters stranded, unhandled rejection) | cart-store.ts:164-194 | fixed round 1 — try/catch resolves waiters with rejection | done |
| R-T03-05 | minor | race/waiter test gaps | cart-store.test.ts:292-297 | fixed round 1 — waiter values asserted + 3 deterministic race tests | done |
| R-T03R-01 | minor | read and mismatch/corrupt discard were two chain ops — mid-restore write landed in the gap and was wiped while status said persisted | cart-store.ts:195,213 | fixed round 2 — read+discard folded into ONE serialized op (RestoreOutcome) | done |
| R-T03R-02 | minor | throw-safety only on flush — throwing remove/read escaped as rejections | cart-store.ts:144-165,180-182 | fixed round 2 — rawDiscard whole-body catch; read throw → corrupt path | done |
| R-T03R-03 | minor | pre-owner clear() fallback wrote ownerless envelope (schema-invalid) | cart-store.ts:133 | fixed round 2 — fail closed: skip fallback → rejected + clearFailed (auth emergency path owns stale data) | done |
| R-T03R-04 | nit | runSerialized/runSerializedRead duplicated | cart-store.ts:106-125 | fixed round 2 — one generic runSerialized<T> | done |
| R-T03R2-01 | minor | mid-restore mutation on a HIT restore is clobbered in memory by outcome application (pre-existing; UI restore-pending gating prevents it) | cart-store.ts:213,255-257 | carry-forward: T04 mutations gated on `hydrated` | T04 |

| R-T04-01 | minor | stale `locked` survived an owner switch — next customer's mutations silently no-op with no unlock path | cart-store.ts:262 (reset omitted locked); empirical probe | fixed in-task — locked:false in owner-switch reset + RED→GREEN tests (owner-switch resets; same-owner re-hydrate keeps lock) | done |
| R-T04-02 | minor | no mutation-level write-failure test (fire-and-forget persist wiring unpinned) | cart-store.test.ts:815-895 | fixed in-task — addItem-on-failing-setItem test (line kept + memoryOnly) | done |
| R-T04-03 | minor | clearCart doc comment stated wrong rationale for the pre-restore gate | cart-store.ts:113-115 | fixed in-task — reworded (uniform user-action gating; pre-restore discards are hydrate()'s) | done |

| R-T05-01 | minor | no-guard test ran on an empty unlocked store — a future lock-keyed guard could be added and still pass it | sign-out-cleanup.test.ts (pre-fix) | fixed in-task — no-guard test now seeds locked+populated; honest immediate-pass coverage, marked in test | done |
| R-T05-02 | minor | registration test proved memory clear only — durable miss unproven in the lifecycle path | sign-out-cleanup.test.ts | fixed in-task — ONE lifecycle test: seed → persistNow → pre-assert hit → runSignOutCleanup() → memory AND durable miss | done |
| R-T05-03 | minor | module doc implied auth consumes the persistence status; the real consumers are cart surfaces | sign-out-cleanup.ts | fixed in-task — comment names cart surfaces as the persistence-status consumers | done |
| R-T05-04 | minor | worklog entry recorded only after the review snapshot (evidence timing) | worklog diff | resolved — Lead recorded full RED/GREEN/checks evidence at gate | done |
| R-T05-05 | minor | `clearCartForSignOut` export is test-only — risk of accidental public re-export widening the API | sign-out-cleanup.ts | carry-forward: T10 must NOT re-export it (documented in module + this row) | T10 |

T05 review note: reviewer verified through context.tsx Phase 2 ordering,
runSignOutCleanup capture, and clearKisokStorage namespace wipe that NO
swallow path exists; registration idempotent; real-zustand action-replacement
test approach judged real behavior (no mock framework). 0 blocking / 0 major /
5 minor — all dispositioned above.

| R-T06-01 | minor | NaN `value` leaves both buttons enabled and emits NaN (NaN comparisons are false; `NaN !== NaN` passes the change guard) — the stepper amplifies non-finite input instead of failing safe; reachability low (schema int 1–99 on restore; setLineQuantity clamps) | quantity-stepper.tsx:62-68,77,93; node trace; cart-rules.ts:36-42; cart-store.ts:481 | defer to T07 — Number.isFinite fail-safe mirroring cart-rules + regression test where the real value source is wired | T07 |
| R-T06-02 | nit | domain minimum 1 exists as a third literal (schema `.min(1)`, rules `Math.max(1,…)`, stepper `MIN_LINE_QUANTITY`) — asymmetric with the centralized MAX treatment of R-T02-02 | quantity-stepper.tsx:50; cart-line.schema.ts:35; cart-rules.ts:39 | defer to T07 — schema exports MIN_LINE_QUANTITY, stepper imports it (rules' floor logic unchanged) | T07 |
| R-T06-03 | nit | test 4 compounds two scenarios (default 99 + override max=5) in one `it` | quantity-stepper.test.tsx:61-71 | accepted as-is (fresh render per scenario; cosmetic) | done |

T06 review note: reviewer empirically re-ran all checks (focused 7/7; full 23
suites/246; typecheck/lint/format clean; working tree contained only the two
T06 files + the Lead's known todo.md scaffold-status edit). Bounds/callback
clamping, a11y chains (names, live region, disabled→accessibilityState),
mock neutrality, and RED credibility all verified clean. The
lucide-react-native jest.mock was judged the only in-contract solution
(jest.config.js transform allowlist absent; shared/core-config edits forbidden
by AC-13) — the Lead standardized the exact per-file mock text for T07/T08
rather than widening scope.

| R-T07-01 | nit | ±Infinity divergence: stepper maps ALL non-finite value → min while cart-rules maps +Inf → max; both fail safe; the remediation spec mandated the stepper behavior; reachability nil (schema int 1–99 on restore; setLineQuantity clamps) | quantity-stepper.tsx:59-62 vs cart-rules.ts:34-43 | accepted divergence — do NOT unify (would deviate from the remediation spec); surfaces feed validated CartLine.quantity so the branch stays dead | done |
| R-T07-02 | nit | dialog dismissal paths other than Cancel (overlay press, hardware back, escape) untested — onRemove is wired exclusively to onConfirm so no dismissal path can fire it | cart-item-row.test.tsx:122-134; @rn-primitives dialog overlay behavior | accepted as-is; optional overlay-dismiss assertion when T08/T09 drive the real dialog anyway | done |
| R-T07-03 | nit | row-test fixture lineId not in deriveLineId's full format (inherited from the T01 fixture); lineId is never rendered or asserted in the row test | cart-item-row.test.tsx:41 vs cart-rules.ts:10-17 | accepted; use full-id fixtures if a future fixture pass happens | done |

T07 review note: 0 blocking / 0 major / 0 minor / 3 nits — all accepted
as-is with reasons above. Carry-forwards for T08/T09 (recorded in the T08/T09
task packets): the row owns and closes its own dialog (surfaces hold no
dialog state); onSetQuantity receives already-clamped in-bounds values;
onRemove fires exactly once per confirmed removal; pending is
presentation-only (caller-owned); the lucide mock standard text now includes
Minus/Plus/Trash2/ImageOff; getByRole("dialog") is unusable with this
RNTL/@rn-primitives combination — assert dialog openness via real
headings/buttons; renderWithProviders already mounts PortalHost.

| R-T08-01 | minor | plan.md risk row + todo.md T08 spec line factually inverted: the default test window is 750×1334 compact portrait (bottom sheet), and initialMetrics pins insets only — renderWithProviders exposes no initialMetrics option at all; the wrong premise would have misled T09 into a non-existent override mechanism | plan.md risk table; todo.md T08 spec; empirical probe (reviewer); adaptive-sheet.tsx:31,44-45 | fixed by Lead at gate — plan risk row + todo spec line reworded to the verified Dimensions.set({window, screen})-before-render pattern | done |
| R-T08-02 | nit | doc comment stated the sheet is "exported through the feature's index" — index.ts is still `export {}` until T10 | quick-cart-sheet.tsx doc comment; features/cart/index.ts | fixed in remediation — softened to "intended for the feature's public index (the public-API task wires that export)" | done |
| R-T08-03 | nit | inverse honesty un-pinned: no assertion that persisted/unknown render NO alert | quick-cart-sheet.test.tsx | fixed in remediation — text-query absence assertions in the populated + empty tests (probed: role "alert" not queryable under this RNTL build; the text inverse matches the positive assertions) | done |
| R-T08-04 | nit | worklog entry recorded only after the review snapshot (evidence timing) | worklog headings | resolved — Lead recorded full evidence at gate | done |

T08 review note: the reviewer verified the Dimensions-default claim
empirically (default 750×1334 → compact portrait bottom sheet;
initialMetrics drives insets/safe-area frame only; Dimensions.set genuinely
re-drives useLayout both ways). Controlled contract, store wiring (no
mirrored totals; real action signatures; act-safe write settling),
persistence honesty (exact status union; unknown/persisted render nothing),
empty/locked semantics, and test quality (non-vacuous closed/open
structure; order-independent frame control; standardized lucide mock +
ShoppingCart) all verified clean. Carry-forwards for T09: reuse the
setFrame / Dimensions.set-before-render pattern and the
resetCartSingleton/seedCart/settleDurableWrites helpers verbatim; Full
Cart's empty state should use EmptyState's action prop (Browse Products →
router.push("/")); the Alert role is NOT queryable under this RNTL build —
alert assertions use text queries (positive and inverse).

| R-T09-01 | minor | bottom safe-area edge unowned in the restore-pending and empty presentations (footer SafeAreaView is the only bottom owner but renders only when populated; Screen ran default 3-edge form; every other footer-less screen passes all four edges) | full-cart-screen.tsx:71,84,130,133; components/layout/screen.tsx:8,27 | fixed in remediation — Screen edges track the footer's mount state (`FOOTER_EDGES` / `FOOTERLESS_EDGES` constants; one bottom owner per presentation; new remove test exercises the footer→footer-less handover) | done |
| R-T09-02 | minor | per-row remove wiring untested through the screen (stepper + clear were end-to-end; a rewired no-op onRemove would pass) | full-cart-screen.test.tsx; quick-cart-sheet.test.tsx:194-211 precedent | fixed in remediation — one screen-level remove end-to-end test (press → real dialog → confirm → store line gone → empty state revealed) | done |

T09 review note: reviewer re-ran everything fresh (focused 12/12 ×4 runs —
stable; full 26 suites/278; typecheck/lint/hook-eslint/format/check:docs
clean; rg zero catalog/Supabase imports; working tree exactly the declared
files; index.ts route-gen export byte-identical to the generator's render;
route file template-identical). All implementer claims verified true; no
eslint-disables, no casts. Verified clean: AC-11 fidelity (route contract
pinned by render-through-route + static import analysis incl. side-effect
imports), summary via module selectors (never mirrored), restore-pending
honesty (no hooks-after-return hazard), locked semantics (rows AND Clear
Cart disabled; escape stays enabled), clear flow (only onConfirm; cancel
safe; honest post-clear status), persistence warnings (same copy as sheet;
persisted inverse), router mock (hoisting-safe, documented, no repo
precedent — verified by grep), T08 carry-forwards honored verbatim, RN
hazards (no falsy && renders, stable keys, ScrollView justified by the
create_order 100-item bound), a11y. Both findings remediated in-task and
re-verified (13/13 focused; 26 suites/279; all checks clean). Carry-forwards
for T10: the screen reads `hydrated` but nothing hydrates yet — T10's
useCart() owns hydration via useActiveProfile() (plan decision 11);
sign-out-cleanup registration goes live via the index.ts side-effect
import in T10.

| R-T10-01 | blocking (feature-level; T10's own spec met) | nothing in the app ever calls `useCart()`/`hydrateCart` — FullCartScreen subscribes to the store directly and never hydrates; `/cart` renders restore-pending skeleton forever; AC-02/AC-11 runtime reachability and the plan's reload-restore verification unreachable | full-cart-screen.tsx:2,71-83; grep: only runtime index load is app/(customer)/cart.tsx:1; plan.md decision 11 + Verification section | spawned T11 (Lead revised plan: design decision 15 + task-table row) — FullCartScreen consumes useCart() | T11 |
| R-T10-02 | major | evidence-record accuracy: the final T10 implementation is the prior unreported attempt reused verbatim (index.ts + use-cart.ts byte-identical to /tmp/t10-prior-attempt-backup; test differs only in comment wording) — the "from scratch" worklog claim was wrong; the prior attempt originated from an earlier subagent launch whose report was lost to a transport timeout | diff /tmp/t10-prior-attempt-backup vs final; worklog T10 entry | resolved — Lead corrected the T10 worklog evidence record at gate; this review + the re-run checks stand as the independent review of that code | done |
| R-T10-03 | minor | exact-surface pin filtered `Object.entries` by typeof function — a non-function value export would pass | use-cart.test.tsx:285-289 | fixed in remediation — full key equality `Object.keys(cartApi).sort()` vs the 13-name list (catches any export kind; type re-exports erased at runtime); discrimination probe: stray `CART_T10_PROBE` export failed the test, then reverted (index.ts byte-identical) | done |
| R-T10-04 | minor | CartView identity is per-render (fresh object each render) — a future consumer putting `view` in a dependency array would loop; undocumented | use-cart.ts | fixed in remediation — CartView doc comment: destructure the view; identity is per-render | done |

T10 review note: reviewer re-ran everything fresh (focused 9/9; sign-out-
cleanup 5/5 — registry hygiene unbroken; ALL 5 auth suites 41/41 — no
cross-suite surprise from the side-effect import, auth tests never load
@/features/cart, jest per-file registries confirmed empirically; FULL 27
suites/288; typecheck/lint/check:docs/hook-eslint/format clean; working
tree exactly the 3 declared files). Verified clean: side-effect trace
(index → sign-out-cleanup → registerSignOutCleanup; name-keyed Map,
idempotent; T09 route-test load registers once per its own file registry,
no sign-out runs there), hook mechanics (per-slice subscriptions, derived
totals via module selectors, stable module-level action identities,
effect keyed [profile.id] with ref-guard set BEFORE the call — real
StrictMode double-invoke guard + store serialized same-owner no-op),
hydration-ownership tests real (restore test seeds envelope + renders probe
only; owner-switch test proves old lines discarded + envelope miss),
plain-action name mapping (lockCart→lock etc.), getCartSnapshot time-
independence, boundaries (FullCartScreen export line byte-identical;
forbidden names only in doc comments, pinned absent), test quality (9/9
discriminating), no circular imports. R-T10-01 dispositioned as T11 (the
plan revision is recorded in plan.md decision 15 + task table); R-T10-02
corrected in the worklog; R-T10-03/04 remediated in-task and re-verified
(9/9, 27/288, all checks clean).
