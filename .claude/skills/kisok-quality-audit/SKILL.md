---
name: kisok-quality-audit
description: Audit whether a KISOK feature was actually delivered as promised — comparing brief, plan, todo, worklog, review, the real git diff, and the commands that were genuinely run. Finds scope drift, forgotten acceptance criteria, tasks marked DONE without a passing gate, claims with no evidence, skipped verification, stale docs, and Definition-of-Done violations. Use this at the end of a feature, before opening or approving a pull request, after code review is complete.
---

# Auditing a KISOK delivery

Code review asks "is this code correct?". You ask a different question: **"is
this feature actually finished, and does the record tell the truth?"**

Do not re-do the code review. If you find a code defect, note it and point at
the reviewer — your subject is the delivery, not the implementation.

## What you compare

Seven sources. Findings live in the gaps between them.

```
brief.md ── plan.md ── todo.md ── worklog.md ── review.md
                    ╲            ╱
                     git diff ── commands actually run
```

Read them in that order, then the diff, then check the evidence.

## The questions worth asking

### Did the promised thing get built?

- Does every acceptance criterion in `brief.md` map to something in the diff?
  A forgotten criterion is the single most common real finding.
- Is anything in the diff that no document asked for? That is scope drift —
  benign-looking, but it is unreviewed and unplanned work.
- Was anything in `brief.md` quietly dropped? Dropping scope is allowed;
  dropping it silently is not.

### Do the gates mean anything?

- Is any task marked DONE whose gate is not `PASS`?
- Is any gate `PASS` with no corresponding worklog evidence?
- Did a task start before its dependencies passed? The order in the worklog
  tells you.
- Are round gates recorded, or did tasks just run on?

### Is the evidence real?

This is the heart of the audit. For each claim, ask what would prove it.

- Does `worklog.md` contain **actual command output**, or checkmarks?
- Does the RED evidence show a failure for the intended missing behaviour — or
  an import error, a typo, or nothing at all?
- Do the claimed commands match what the repo can actually run? A worklog citing
  a script that does not exist in `package.json` is fabricated evidence.
- Was `pnpm verify` genuinely run at the end, after the last change? Running it
  before the final commit proves nothing about the final state.
- Is runtime verification claimed without saying at which sizes, on what device,
  or what was observed?

### Was anything skipped?

- Warnings ignored, or output that is no longer clean
- Tests weakened rather than fixed — check the diff for loosened assertions
- Type errors suppressed with `any`, `@ts-expect-error`, or a disabled lint rule
- A failing check "fixed" by removing the check

### Are shared surfaces touched?

- Anything outside `features/<name>/` and one route file: is it justified in the
  plan, or did it appear silently?
- New dependencies: recorded and justified?
- Migrations, RLS, grants: any change here needs an explicit backend decision.

### Are the documents still true?

- Does `todo.md` still show tasks as pending that are complete, or vice versa?
- Does `plan.md` describe an approach that was abandoned mid-way?
- Do `review.md` findings all have a disposition, and do the ones marked fixed
  actually appear fixed in the diff?
- Do the feature's docs contradict each other?

### Definition of Done

Check the delivery against the Definition of Done in `AGENTS.md`. Name any
criterion not met.

## Reporting

Group by what a person should do about it:

- **Not delivered** — promised, missing
- **Not evidenced** — claimed, unproven (say what evidence would settle it)
- **Not planned** — delivered, never asked for
- **Stale record** — documents that no longer match reality

Every finding cites its sources: which document said what, and what the diff or
the commands actually show.

Do not produce a numeric quality score. A number invites arguing with the number
instead of fixing the gap, and it hides which of the four kinds of problem you
found. If the delivery is sound, say so and name the strongest evidence you
saw — an audit that only ever reports problems teaches people to discount it.
