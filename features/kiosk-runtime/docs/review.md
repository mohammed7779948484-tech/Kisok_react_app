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
