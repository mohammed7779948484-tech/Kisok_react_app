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

| R-T02-01 | minor | addLine append trusted stray input lineId over derived identity | cart-rules.ts:25 (pre-fix); reviewer /tmp empirical run | fixed in-task — derived id spread last + regression test (RED→GREEN) | done |
| R-T02-02 | minor | 99 cap duplicated as two literals with divergent rationale | cart-rules.ts:10 vs cart-line.schema.ts:29 | fixed in-task — single MAX_LINE_QUANTITY export in schema; rules import; round-trip test | done |
| R-T02-03 | minor | NaN escaped floor-then-clamp (unpersistable line) | cart-rules.ts:39; empirical | fixed in-task — Number.isFinite guard (NaN→1, ±Inf→max/min) + tests | done |
| R-T02-04 | minor | empty-cart 0/0 and post-setQuantity recompute untested | cart-rules.test.ts | fixed in-task — two honest coverage tests | done |
| R-T02-05 | minor | plan.md decision 3 said "ordered set" while implementation sorts (identity vs display order) | plan.md decision 3 | fixed by Lead — wording now "canonically SORTED set; array order is display order, not identity" | done |

T02 re-review note: findings were all minor; remediations verified by Lead
(focused 46/46, full 20 suites/184, checks clean, single-99-literal audit).
Carried constraint into T04: the store must parse add input through
`addToCartInputSchema` before calling the rules (defense-in-depth per
reviewer).

| R-T03-01 | major | durableClear bypassed the write queue — cleared cart resurrection, write/fallback overlap, clearFailed erasure | cart-store.ts:99-114,177,219-228; race harness empirical | fixed round 1 — ONE serialized durable-op chain | done |
| R-T03-02 | major | clearFailed downgraded to memoryOnly by later failed write (stale cross-customer data on disk) | cart-store.ts:184-186; empirical | fixed round 1 — sticky clearFailed precedence (failure keeps; success clears) | done |
| R-T03-03 | minor | persistNow pre-hydrate wrote ownerless schema-invalid envelope | cart-store.ts:40,84-88,209-217 | fixed round 1 — skip + rejected result + unknown | done |
| R-T03-04 | minor | flush not throw-safe (waiters stranded, unhandled rejection) | cart-store.ts:164-194 | fixed round 1 — try/catch resolves waiters with rejection | done |
| R-T03-05 | minor | race/waiter test gaps | cart-store.test.ts:292-297 | fixed round 1 — waiter values asserted + 3 deterministic race tests | done |
| R-T03R-01 | minor | read and mismatch/corrupt discard were two chain ops — mid-restore write landed in the gap and was wiped while status said persisted | cart-store.ts:195,213 | fixed round 2 — read+discard folded into ONE serialized op (RestoreOutcome) | done |
| R-T03R-02 | minor | throw-safety only on flush — throwing remove/read escaped as rejections | cart-store.ts:144-165,180-182 | fixed round 2 — rawDiscard whole-body catch; read throw → corrupt path | done |
| R-T03R-03 | minor | pre-owner clear() fallback wrote ownerless envelope (schema-invalid) | cart-store.ts:133 | fixed round 2 — fail closed: skip fallback → rejected + clearFailed (auth emergency path owns stale data) | done |
| R-T03R-04 | nit | runSerialized/runSerializedRead duplicated | cart-store.ts:106-125 | fixed round 2 — one generic runSerialized<T> | done |
| R-T03R2-01 | minor | mid-restore mutation on a HIT restore is clobbered in memory by outcome application (pre-existing; UI restore-pending gating prevents it) | cart-store.ts:213,255-257 | carry-forward: T04 mutations gated on `hydrated` | T04 |
