# Checkout — independent review

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

## Accepted risks and explicit dispositions (Lead, post Round 4)

- **Native tier (Android build, Maestro): UNVERIFIED** — no device or
  emulator exists in this environment. Browser evidence only; never
  equated with native evidence. The BackHandler guards are
  deterministic-test-verified but not device-verified.
- **Web-tier back affordance unguarded (F-R4-06)**: BackHandler is an
  inert stub on react-native-web, so the narrow-web browser back can
  still leave a submitting review or kill the success countdown.
  Accepted: Android is the delivery target; the flows self-heal (server
  idempotency, locked cart, the recovery gate's next-mount resolution);
  zero console errors across the full web journey.
- **Back-stack growth on the cart↔review correction loop (F-R4-05)**: the
  flow's Back/Return-to-Cart pushes grow history across a shift (the
  gated reset prunes only the success entry). No duplicate-order or data
  risk — every reachable presentation has an escape; the Next-Customer
  reset lands on the home with the empty-review escape beneath. Accepted
  as polish; a dismissTo-style prune would need expo-router APIs outside
  this feature's scope.
- **Live hosted coverage limits**: the stock-conflict, ambiguous-network,
  and same-request idempotent-replay flows were not forced live on the
  shared hosted TEST project (destructive setup would be required); all
  three are covered deterministically (T09/T12/the journey suites) and
  dispositioned in the worklog's runtime-evidence section.
