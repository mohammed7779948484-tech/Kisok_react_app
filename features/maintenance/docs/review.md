# Maintenance — independent review

Written by a reviewer with a FRESH context, not by the implementer. Findings
only — the reviewer reports, it does not quietly fix.

Implementation notes do not belong here; they belong in `worklog.md`.

## Findings

| ID  | Severity | Finding                                                                                                            | Evidence                                            | Disposition | Remediation                                                                                                                   |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R01 | minor    | (m-02) Back during sign-out could unmount the page and drop a later failure; success briefly re-enabled "Sign out" | `maintenance-screen.tsx` sign-out handler           | fix         | BackHandler held while pending; `ok` keeps the action spent; RED test added                                                   |
| R02 | minor    | (m-04) Teardown test uses hand-built layouts                                                                       | `app/__tests__/customer-sign-out-teardown.test.tsx` | accept      | Mutation-checked real-router test + runtime evidence of the real tree (worklog); full RootNavigator mount not worth its fakes |
| R03 | minor    | (CodeRabbit) AC-07 evidence path pointed at `root-layout-guards.test.tsx`                                          | `brief.md:34`, `plan.md:52,61`                      | fix         | 9200a74                                                                                                                       |

The full shared table (catalog + maintenance) is in `features/catalog/docs/review.md`
("Phase 4 — independent review").

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
