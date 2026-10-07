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

- Result: fresh `code-reviewer` on `git diff 366aa46..0435b51` (shared with catalog): R01
  RESOLVED, R02 ACCEPT, R03 fixed. One new maintenance finding, N-04 (minor): no test that
  Back is released after a failed sign-out, and spies restored only at test end.
- Findings resolved: N-04 fixed in 9e1204c (`afterEach` restores mocks; failure-path release
  test). Catalog N-01–N-03 and R-01: `features/catalog/docs/review.md`.
- Still open: none.

## Accepted risks

Anything deliberately not fixed, with the reason and who decided.

- R02 / m-04: the teardown test uses hand-built layouts rather than the real RootNavigator
  (Lead; reason in the table above).

## Quality audit

A **different question** from the review above. Code review asks "is the
implementation correct?". The audit asks "was the promised delivery actually
completed, and is the evidence real?" — comparing `brief.md`, `plan.md`,
`todo.md`, `worklog.md`, this file, and the actual diff.

Run by `quality-auditor` with fresh context, after review findings are
dispositioned. It returns findings; the Lead records them here.

| Category      | Finding                                                                                 | Evidence                                          | Resolution                                                                                          |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| not evidenced | AC-06 "Observable how" claimed a screen test asserting no checkout API use; none exists | `brief.md` AC-06 vs `maintenance-screen.test.tsx` | Reworded: import review + `CheckoutGate` route placement (verified in `app/(customer)/_layout.tsx`) |
| not evidenced | No SCAFFOLD entry for `pnpm generate feature maintenance --role=customer`               | `worklog.md`                                      | SCAFFOLD record added to the worklog                                                                |
| stale record  | Re-review section TODO                                                                  | this file                                         | Re-review recorded above                                                                            |
| stale record  | `todo.md` "Last gate: —", feature-gate boxes unchecked                                  | `todo.md`                                         | Round gate and feature gate recorded with evidence                                                  |
| stale record  | T01 labelled `bug` but never went RED                                                   | `plan.md`, `todo.md`, `worklog.md` T01            | Relabelled guard / characterization; worklog note                                                   |
| not evidenced | No `pnpm verify` after the last change; CI on final HEAD                                | worklogs                                          | `pnpm verify` on 747d8dd recorded; CI recorded at the gate                                          |

- Acceptance criteria in `brief.md` all implemented: yes (AC-01–AC-07)
- Every task gate `PASS`, every round gate `PASS`: yes (T01–T05; round 1)
- Worklog carries real command output per task: yes
- Shared files touched beyond this feature: planned only — `features/cart` (`discardCart`,
  T02), `features/catalog` shell long press (T04), `docs/state-management.md` and ADR-0003
  (T05), `app/__tests__/customer-sign-out-teardown.test.tsx` (T01), route `app/(customer)/maintenance.tsx`
- Definition of Done (`AGENTS.md`) met: yes, with Android and 200% text explicitly UNVERIFIED

Audit result: first pass `NOT CLEAN` (records only; full report summarised in
`features/catalog/docs/review.md`); resolutions recorded above; `PENDING RE-AUDIT`.
