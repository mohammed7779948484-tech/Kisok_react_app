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
