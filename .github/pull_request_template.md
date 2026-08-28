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

| Document                                  | Status                  |
| ----------------------------------------- | ----------------------- |
| `docs/brief.md`                           | <!-- complete / n/a --> |
| `docs/plan.md`                            |                         |
| `docs/todo.md` — all tasks `PASS`         |                         |
| `docs/worklog.md` — evidence per task     |                         |
| `docs/review.md` — findings + disposition |                         |

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

<!-- Paste the commands and their results. RED must show the test failing for
     the intended reason BEFORE the implementation existed. -->

```
RED
GREEN
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
- Quality audit:

## Explicitly NOT verified

<!-- The most valuable section. Anything you could not check here — no device,
     no credentials, no deployed database — belongs in this list. -->

-
