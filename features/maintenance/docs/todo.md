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
Current stage     : feature gate PASS
Last gate         : FEATURE GATE PASS (CI 37690946342 on 6dedba1)
Next legal action : human review of #42; Android device check when a device is available
Blocked by        : —
```

## Status board

| Task | Mode             | Acceptance          | Objective                    | Deps | Stage | Gate |
| ---- | ---------------- | ------------------- | ---------------------------- | ---- | ----- | ---- |
| T01  | characterization | AC-07               | Customer sign-out guard test | —    | done  | PASS |
| T02  | behavior         | Supporting AC-03/04 | `discardCart()`              | —    | done  | PASS |
| T03  | behavior         | AC-02–AC-06         | Staff screen + route         | T02  | done  | PASS |
| T04  | behavior         | AC-01               | Lockup long press            | T03  | done  | PASS |
| T05  | config           | N/A — docs          | Docs that become false       | T03  | done  | PASS |

## Feature gate

- [x] Every Task Gate PASS (T01–T05)
- [x] Round gate PASS (round 1 — T01–T05; worklog "Feature gate")
- [x] Every AC verified (AC-01–AC-07; AC-06 by import review + route placement)
- [x] `pnpm verify` PASS after the final local change (747d8dd; worklog)
- [x] fast GitHub CI PASS on the final HEAD (run 37690946342 on 6dedba1)
- [x] runtime evidence recorded; Android explicitly UNVERIFIED (worklog)
- [x] reviewer findings dispositioned, re-review recorded (`review.md`)
- [x] quality audit: CLEAN AFTER RESOLUTIONS (re-audit; `features/catalog/docs/review.md`)

FEATURE GATE: PASS — Android explicitly UNVERIFIED; PR stays with the human (agents never merge)
