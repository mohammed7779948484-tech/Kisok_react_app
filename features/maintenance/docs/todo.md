# Maintenance — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at the
end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

```
Current round     : 1
Current task      : —
Current stage     : all tasks PASS; feature gate pending
Last gate         : —
Next legal action : feature gate (verify, CI, runtime, review, audit)
Blocked by        : —
```

## Status board

| Task | Mode     | Acceptance          | Objective                    | Deps | Stage | Gate |
| ---- | -------- | ------------------- | ---------------------------- | ---- | ----- | ---- |
| T01  | bug      | AC-07               | Customer sign-out guard test | —    | done  | PASS |
| T02  | behavior | Supporting AC-03/04 | `discardCart()`              | —    | done  | PASS |
| T03  | behavior | AC-02–AC-06         | Staff screen + route         | T02  | done  | PASS |
| T04  | behavior | AC-01               | Lockup long press            | T03  | done  | PASS |
| T05  | config   | N/A — docs          | Docs that become false       | T03  | done  | PASS |

## Feature gate

- [ ] Every Task Gate PASS
- [ ] Every AC verified
- [ ] `pnpm verify` PASS after the final local change
- [ ] fast GitHub CI PASS on the final HEAD
- [ ] runtime evidence recorded; Android verified or explicitly unverified
- [ ] reviewer findings dispositioned; quality audit clean

FEATURE GATE: PENDING
