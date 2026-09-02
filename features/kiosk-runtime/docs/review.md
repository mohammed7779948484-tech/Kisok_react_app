# KioskRuntime — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID      | Severity | Finding                                                                                                                                                            | Evidence                                                    | Disposition                    | Remediation                                                                                                                                                                                                                                  |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01-F01 | major    | check:docs flagged 3 bare docs/&lt;doc&gt;.md references in this feature's control documents                                                                       | `pnpm check:docs` output; brief.md/plan.md/worklog.md lines | fixed                          | Lead rephrased with feature-local qualifiers (reviewer agent-077e8b21)                                                                                                                                                                       |
| T01-F02 | major    | worklog/todo did not yet record the T01 implementation state before gating                                                                                         | worklog.md (pre-fix)                                        | fixed                          | Full T01 entry recorded; todo updated before gate                                                                                                                                                                                            |
| T01-F03 | minor    | null-valued restriction keys would cross the bridge as null, breaking the TS union and making T02's Zod boundary reject the WHOLE snapshot (fail-open consequence) | KioskPolicyModule.kt applicationRestrictionsAsMap           | fixed                          | Implementer resumed: null-valued keys dropped (Android: explicit null == unset); doc comments updated; Lead re-verified. Fresh full re-review not re-run for this 2-line minor remediation — Round 1 gate review covers the accumulated diff |
| T01-F04 | minor    | plan said kiosk_device_role "choice"; shipped schema uses "string"                                                                                                 | plan.md design decision 4 vs app.plugin.js                  | fixed                          | Plan text reconciled with the choice→string rejection rationale                                                                                                                                                                              |
| T02-R1  | minor    | Control-record lag: todo/worklog did not yet carry the T02 RED/GREEN evidence before gating                                                                        | todo.md/worklog.md (pre-fix)                                | fixed                          | Full T02 entry recorded with RED failure output, GREEN output, affected checks; todo updated before gate                                                                                                                                     |
| T02-R2  | minor    | Brief AC-02 wording tension: "contradictory values leave the device standard" vs plan decision 2 resolving config-vs-allowlist contradiction toward kiosk          | brief.md:65 vs plan.md decision 2                           | accepted (interpretation note) | See Accepted risks — "contradictory" means contradictory VALUES; the config-vs-allowlist contradiction resolves kiosk per plan decision 2 (safety first)                                                                                     |

| T05-R1 | minor | Plan's test strategy promised "(blocked/failed message surfaced)"; only the blocked outcome was tested at the screen seam (the failed→message mapping is owned and tested by core/auth) | plan.md test strategy vs screen test (blocked only) | fixed | Implementer resumed: one failed-outcome test (mock signOut error + session retained → pipeline's failed reason in the announced Alert, exactly one signOut call, scope "local"); seam-sensitivity probe proves it pins the failed mapping |
| T05-R2 | minor | Committed todo.md status board contradicted the worklog (T01–T04 "not started/PENDING" vs GATE: PASS) — previous session's record lag, carried by the PR HEAD | git show ae8f9ca:...todo.md vs ...worklog.md | fixed | Board catch-up (T01–T04 → done/PASS) committed with the T05 gate commit; board+checkpoint updated in the same commit as each gate from now on |

| T06-R1 | minor | RED relay said "2 trivially-passing tests"; empirical RED re-run shows 3 (the overlay's standard-device absence pin also passed trivially) | reviewer scratch-copy RED re-run: 21 failed / 3 passed / 24 | fixed | Lead recorded the corrected count (3 honest post-contract absence pins) in the T06 worklog entry; no test change needed |
| T06-R2 | minor | Sheet Close button not disabled while signOut.pending — mid-flight close hides a blocked/failed outcome (success unaffected) | maintenance-sheet.tsx:154 vs primary action :125 | fixed | Implementer resumed: Close mirrors the primary action's disabled state; regression RED reproduced the gap exactly, then green; in-flight test extended to both controls |

Severity means: **blocking** — must not merge; **major** — fix in this feature;
**minor** — worth doing, safe to defer with a note.

## Re-review

After remediation, re-run the reviewer against the same scope.

- Result: TODO
- Findings resolved: TODO
- Still open: TODO

## Accepted risks

Anything deliberately not fixed, with the reason and who decided.

- AC-02 interpretation (T02-R2, Lead decision): "missing, invalid, pending, or
  contradictory values" in the brief means contradictory restriction VALUES
  (e.g. a malformed role string). The config-vs-allowlist contradiction
  (explicit "standard" while the DPC allowlists this package) resolves toward
  KIOSK per plan Design decision 2 — safety first; downgrading a store tablet
  is an MDM action (remove the allowlist), not an app-config toggle. Pinned by
  `model/derive-device-policy.test.ts` (contradiction row) and recorded here
  so a later audit does not misread the brief.
- T01 Kotlin compilation is not provable in this environment (no Android SDK
  / gradle). Static contract review (fresh reviewer, verified against the
  installed expo-modules-core SDK-54 sources) found nothing expected to fail
  compile; the label-gated `android-build` CI job is the compile evidence once
  the PR exists (external dependency — no push credentials here).
- Cold-start policy-vs-auth ordering (Lead decision, T04 design): the device
  policy is read from LOCAL managed-configuration storage (disk, ~ms) while
  auth readiness requires a network profile resolution, so the kiosk policy
  lands before routing decisions in every realistic ordering. A pathological
  inversion (native read slower than the network) could show the preparation
  experience for a sub-second window on a kiosk tablet with a persisted
  preparation session. Accepted because: the root routing guard is UX
  protection (routes.md — RLS is the real authorization boundary), the MDM
  keeps the device locked regardless, and no meaningful interaction is
  possible in that window. Revisit only if a final reviewer rates it
  blocking/major.

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
