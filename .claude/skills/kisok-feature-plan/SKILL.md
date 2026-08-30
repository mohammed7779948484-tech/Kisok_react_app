---
name: kisok-feature-plan
description: Turn a KISOK feature brief into an implementation plan — research synthesis, design decisions, data contracts, generator commands, rounds of atomic TDD tasks with dependencies, risks and verification. Use this whenever you are writing or revising a feature's docs/plan.md, or when you have a brief and need to decide how to build it. Use it before generating any capability beyond the feature workspace.
---

# Planning a KISOK feature

A plan exists to make the build boring. It should answer, before any code is
written: what shape is this feature, what does it talk to, in what order do we
build it, and how will we know each step worked.

Write it into `features/<name>/docs/plan.md`, which the generator created.

The plan carries a status, and it is what says implementation may begin. There
is no fourth gate — `TASK`, `ROUND`, `FEATURE` stay as they are.

```
Status: DRAFT     ← starts here; no implementation task may start
Status: READY     ← implementation may begin
```

The checklist for `DRAFT → READY` is at the end of this skill. If a material
decision changes later, return the plan to `DRAFT`, reconcile it and `todo.md`,
and restore `READY` before implementation resumes.

## Before you plan: know the shape

KISOK features are not all the same shape, and the plan is mostly a consequence
of which one this is. Decide explicitly:

| Shape                    | Looks like        | Typically needs                                                   |
| ------------------------ | ----------------- | ----------------------------------------------------------------- |
| Read-heavy               | Catalog           | `schema`, `query`, `screen`, `route`, components                  |
| Local state              | Cart              | `store`, components, a screen or a sheet — often no `api/` at all |
| Mutation / state machine | Checkout          | `schema`, `mutation`, `store`, careful error branches             |
| Live operational         | Preparation board | `schema`, `query`, `realtime`, `screen`, `route`                  |
| Domain only              | Stock rules       | `model/` and nothing else                                         |

Naming the shape early stops you generating a screen for a feature that has no
UI, or a store for one that owns no client state.

## Research first, and cite it

Synthesise what the research subagents returned, with pointers. The plan should
be checkable by someone who reads the same sources.

- **Data contract** from `supabase/migrations/*.sql` only. Name the migration
  file. If the RPC you want does not exist there, the plan stops and says so.
- **Behaviour** may come from the Flutter reference — journeys, edge cases,
  safety rules. Its table and RPC names are from an older database and are
  wrong; never copy a data contract from it.
- **UI** from the existing design system and `/ui-lab`.

## What the plan must contain

**Design decisions.** For each, the decision and the alternative you rejected,
with the reason. A plan that lists only what you chose cannot be reviewed.

**Data contract.** A table of RPCs and tables: direction, which role may call
it, what it returns, which migration defines it. Note explicitly whether
Realtime is involved — it is Preparation-only, and it is an invalidation signal,
never a render source.

**Feature shape decision.** Every capability gets an explicit YES or NO with a
reason. "Not mentioned" is not a decision — it is how a feature ends up with an
empty `state/` nobody can explain.

| Capability   | Needed? | Evidence / reason                                    |
| ------------ | ------: | ---------------------------------------------------- |
| model/schema |     YES | RPC returns jsonb; needs a Zod boundary              |
| query        |     YES | reads `get_customer_catalog`                         |
| mutation     |      NO | nothing is written                                   |
| store        |      NO | no durable client-owned state; screen state is local |
| component    |     YES | availability badge is reused by two screens          |
| screen       |     YES | the catalog home                                     |
| realtime     |      NO | customer role; Realtime is Preparation-only          |
| route        |     YES | replaces the `(customer)/index.tsx` placeholder      |

Routes are planned explicitly, one line each:

```
route path → role/group → target screen → existing placeholder or new file
app/(customer)/index.tsx → customer → catalog-home → replaces placeholder
```

**Capabilities to generate.** The exact commands, in order, each mapped to the
task that will use it. The Lead runs each command immediately before delegating
that task — never all of them up front.

| Generator command                                                         | Task |
| ------------------------------------------------------------------------- | ---- |
| `pnpm generate schema catalog catalog-response`                           | T01  |
| `pnpm generate query catalog products`                                    | T02  |
| `pnpm generate screen catalog catalog-home`                               | T03  |
| `pnpm generate route catalog index --role=customer --screen=catalog-home` | T04  |

Generate only what the shape needs. Empty architectural folders are not free —
they teach the next agent that this is the expected structure.

**Generator-first.** If a structural capability matches, use it. Hand-writing a
file a capability would have produced gives two features different shapes for
the same thing. Manual artifacts are legitimate when no capability fits, the
path and purpose are planned, and the file is in the task's allowed scope —
domain rules, selectors, state-machine helpers, mappers, predicates, and
behaviour-specific tests. List them in the plan as `Allowed manual files`.

**Files expected to change.** Anything outside `features/<name>/` must be listed
and justified. Expect none. Shared files are where parallel agents collide, so a
plan that quietly assumes one is a plan that will cause a merge conflict.

**Required skills**, per task. At minimum `test-driven-development`; add
`kisok-design-system` for UI work and `kisok-react-native-rules` for anything
with a list, an animation, or a performance concern.

**Test strategy.** What is worth testing and why — behaviour, contracts, state
transitions, safety invariants, accessibility. Not a coverage target.

**Rounds and tasks.** Group tasks so each round leaves the feature coherent.
Every task is atomic and independently verifiable:

| Task | Mode     | Acceptance       | Objective               | Depends on | Entry evidence                             |
| ---- | -------- | ---------------- | ----------------------- | ---------- | ------------------------------------------ |
| T01  | behavior | Supporting AC-01 | Catalog response schema | —          | rejects a payload with no `schema_version` |
| T02  | behavior | Acceptance AC-01 | Catalog read pipeline   | T01        | throws AppError on a bad payload           |
| T03  | behavior | Acceptance AC-02 | Catalog home renders    | T02        | renders the error state on failure         |
| T04  | config   | N/A — routing    | Route to catalog home   | T03        | `pnpm export:web` resolves `/`             |

Read that table carefully: **Mode** is the verification mode, **Acceptance** is
the criterion link, **Objective** is what the task does. They are three separate
columns and mixing them is the single most common way this table goes wrong.

**Task granularity follows capability granularity, not files.** T02 above is one
task, not three, even though `pnpm generate query` emits `api/fetch-catalog.ts`,
`queries/keys.ts` and `queries/use-catalog.ts`. Those are one read pipeline and
one verifiable behaviour. Atomic means _one independently verifiable slice_, not
_one file_ — an api module with no hook proves nothing on its own. Do not ask
for `--api-only` style flags until repeated real use shows they are needed.

Dependencies are what make the gates meaningful, so get them right: if T03 does
not really depend on T02, say so and let them proceed independently.

**Risks.** Likelihood and mitigation. The useful ones are specific: "the catalog
snapshot may exceed what a tablet can hold in memory", not "performance".

**Verification.** Which commands, which browser sizes, whether this feature
warrants Android or Maestro evidence.

## Keep it a plan, not paperwork

No story points, no sprints, no invented ticket IDs. Task identifiers exist so
the worklog and the gates can refer to them — that is their whole job.

If a section has nothing useful in it, write one line saying why rather than
padding it. A plan nobody reads is worse than a short one.

## `DRAFT → READY`

Set `Status: READY` only when every one of these holds. Until then no
implementation task may start.

- Acceptance criteria are complete, carry stable IDs (`AC-01`, `AC-02`, …), and
  each maps to at least one task
- Every task declares a verification mode, an acceptance link
  (`Acceptance:` / `Supporting:` / `N/A — reason`), and entry evidence that
  follows from its mode — a RED test, a named baseline, or a verification command
- The feature shape matrix is complete and every YES is justified
- No task depends on a contract you have not found in a migration
- Every planned generator command is mapped to a task
- Manual-only artifacts are justified
- Dependencies are coherent
- Route mappings are known, target screen named
- Anything changing outside `features/<name>/` is listed and justified
- No unnecessary capability or folder is planned

After `READY`, acceptance-criterion IDs are never renumbered or reused.
