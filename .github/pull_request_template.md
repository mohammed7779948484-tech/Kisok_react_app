<!--
  Evidence, not assertions. Every "yes" below should be something a reviewer
  could re-run. Delete rows that genuinely do not apply and say why — an
  unexplained blank is treated as "not done".
-->

## What and why

<!-- One paragraph. What changes for someone using the tablet, and why now? -->

## Scope

- Feature / area:
- Linked brief: `features/<name>/docs/brief.md`
- Out of scope (explicitly):

## Feature documents

| Document                                          | Status                  |
| ------------------------------------------------- | ----------------------- |
| `features/<name>/docs/brief.md`                   | <!-- complete / n/a --> |
| `features/<name>/docs/plan.md`                    |                         |
| `features/<name>/docs/todo.md` — all gates `PASS` |                         |
| `features/<name>/docs/worklog.md` — evidence      |                         |
| `features/<name>/docs/review.md` — findings       |                         |
| `features/<name>/docs/review.md` — quality audit  |                         |

## How it was built

- Generator commands used:
- Skills used:
- Shared files touched (expect none — justify each):
- Dependencies added / removed (with the reason):

## Database impact

- RPCs / tables used:
- Migration read for the contract:
- RLS or grant changes: **none** <!-- Anything else needs an explicit backend decision. -->
- `pnpm db:verify`:

## Test evidence

<!-- Paste the commands and their results. What counts as entry evidence
     depends on each task's verification mode:

       behavior / bug / behavior-change  a test failing for the intended
                                         reason BEFORE the implementation
       refactor                          the named tests pinning the behaviour,
                                         shown green first
       config                            no RED — the command that exercises
                                         the thing you configured

     Do not invent a failing test for configuration or documentation work. -->

```
MODE
RED or BASELINE
GREEN / VERIFICATION
```

- Affected checks (typecheck / lint / format / focused tests):
- `pnpm verify`:

## Gates

| Gate            | Result |
| --------------- | ------ |
| All task gates  |        |
| All round gates |        |
| Feature gate    |        |

## Runtime verification

- Browser (which sizes, what was checked):
- Android device / emulator:
- Maestro flows run:

## Review

- Reviewer findings (blocking / major / minor):
- Remediation:
- Re-review result:
- Quality audit result <!-- recorded in the Quality audit section of review.md -->:

## Explicitly NOT verified

<!-- The most valuable section. Anything you could not check here — no device,
     no credentials, no deployed database — belongs in this list. -->

-
