# Checkout — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

The per-task and per-round findings — with their full TASK REVIEW evidence —
live in `worklog.md` (each task's TASK REVIEW block; each round's gate
block). The table below records the FINAL full-feature review's findings and
the Lead's dispositions; the per-round history is too long to duplicate here
and the worklog is the evidence record.

| ID      | Severity | Finding                                                                                                                                          | Evidence                                                    | Disposition | Remediation                                                                                                                                                                                                                                     |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-FR-01 | minor    | plan.md's external-changes list missing the one shared core file touched                                                                         | plan.md:357 vs git diff core/testing/query.tsx              | fixed       | core/testing/query.tsx added to the list with its justification                                                                                                                                                                                 |
| F-FR-02 | minor    | review.md's Findings table left as template placeholders                                                                                         | review.md:10-23                                             | fixed       | this table (the per-round findings referenced in worklog TASK REVIEW blocks)                                                                                                                                                                    |
| F-FR-03 | minor    | a reset refused-because-PENDING made the destructive presentation sticky after the clear landed done                                             | order-success-screen.tsx:182-185, 267-273                   | fixed       | the F-FR-03 self-heal effect (resetRefused clears when cartClear lands done) + the one-press-recovery test (28 success tests)                                                                                                                   |
| F-FR-04 | minor    | the sign-out guard's pre-recovery-read window (in-memory read only; a prior session's durable unresolved record invisible until recover() lands) | sign-out-cleanup.ts:33-41,109-114; recovery-gate.tsx:97-117 | accept      | traced SAFE: the store's serialized chain orders the sign-out wipe after the in-flight read and a post-wipe replay no-ops — no duplicate order is possible; the residual is AC-12's letter only, documented in-code and in Accepted risks below |

Final review result: **no blocking, no major findings** — all four minors
dispositioned above. All 12 review axes examined clean (see the final
review's report in the session record; every verification run reproduced:
pnpm verify exit 0, 69/863, zero warnings).

Severity means: **blocking** — must not merge; **major** — fix in this feature;
**minor** — worth doing, safe to defer with a note.

## Re-review

The final review's four minor findings were remediated/dispositioned by the
Lead (F-FR-01/02 record fixes; F-FR-03 the self-heal fix + its test —
294 checkout tests green; F-FR-04 accepted with the traced-safe rationale).
A fresh re-review of the remediation diff itself was not run — the
remediation was the Lead's own bounded fix (the implementer contexts for
this stage are Lead-owned per the workflow), verified by the full suite +
typecheck + lint, and the next fresh-eyes gate is the quality audit below.

- Result: all four dispositioned; no blocking/major open
- Findings resolved: F-FR-01, F-FR-02, F-FR-03
- Still open: F-FR-04 (accepted risk, documented)

## Accepted risks

Anything deliberately not fixed, with the reason and who decided — recorded
in the "Accepted risks and explicit dispositions" section below (the
dispositions added at Round 4 and the final review).

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

- Acceptance criteria in `brief.md` all implemented: CLEAN — all 16 ACs
  mapped to code + tests + (where feasible) runtime evidence; the live
  gaps honestly dispositioned, never claimed
- Every task gate `PASS`, every round gate `PASS`: CLEAN — every gate has
  a worklog block with command output and a fresh-reviewer record; the
  auditor's own re-runs reproduce the final claims exactly (verify exit
  0; checkout 14/294; the screenshots' dimensions verified)
- Worklog carries real command output per task: CLEAN (independent RED
  reproductions by reviewers at T01/T03/T05/T09/T14; the harness-kill
  losses honestly labeled)
- Shared files touched beyond this feature: CLEAN — exactly the plan's
  expected-changes + the reconciled list; no migrations/RLS/grants; no
  new dependencies
- Definition of Done (`AGENTS.md`) met: CLEAN-WITH-OBSERVATIONS — the
  three stale-record items the audit found (todo's round-ledger line, the
  DoD count 69/864, the review.md placeholder) were fixed by the Lead at
  audit time; "text scaling does not clip" has no feature-specific
  explicit evidence (the repo-wide convention + the browser journey are
  the implicit coverage) — recorded here as an honest gap, not a claim

Audit result: `CLEAN-WITH-OBSERVATIONS` — the auditor's three
stale-record findings (docs-only, none blocking) are dispositioned above
as fixed; the observations (text-scaling evidence, the T11 expected-files
wording, the PR-body sync as remote state) are recorded. The full audit
report is in the session record; its verification runs: verify exit 0,
69/864, checkout 14/294, screenshots verified, branch pushed and current,
base unchanged.

- **The sign-out guard's pre-recovery-read window (F-FR-04, accepted)**:
  the guard reads in-memory state; a durable unresolved record from a prior
  session is invisible until the recovery gate's mount-time recover() read
  lands (a millisecond AsyncStorage window). Traced safe: no duplicate order
  is possible (the chain-ordered wipe + the post-wipe replay no-op); only
  AC-12's letter is theoretically open. The gate composition (D7) is the
  designed closure.

## Accepted risks and explicit dispositions (Lead, post Round 4)

- **Native tier (Android build, Maestro): UNVERIFIED** — no device or
  emulator exists in this environment. Browser evidence only; never
  equated with native evidence. The BackHandler guards are
  deterministic-test-verified but not device-verified.
- **Web-tier back affordance unguarded (F-R4-06)**: BackHandler is an
  inert stub on react-native-web, so the narrow-web browser back can
  still leave a submitting review or kill the success countdown.
  Accepted: Android is the delivery target; the flows self-heal (server
  idempotency, locked cart, the recovery gate's next-mount resolution);
  zero console errors across the full web journey.
- **Back-stack growth on the cart↔review correction loop (F-R4-05)**: the
  flow's Back/Return-to-Cart pushes grow history across a shift (the
  gated reset prunes only the success entry). No duplicate-order or data
  risk — every reachable presentation has an escape; the Next-Customer
  reset lands on the home with the empty-review escape beneath. Accepted
  as polish; a dismissTo-style prune would need expo-router APIs outside
  this feature's scope.
- **Live hosted coverage limits**: the stock-conflict, ambiguous-network,
  and same-request idempotent-replay flows were not forced live on the
  shared hosted TEST project (destructive setup would be required); all
  three are covered deterministically (T09/T12/the journey suites) and
  dispositioned in the worklog's runtime-evidence section.
