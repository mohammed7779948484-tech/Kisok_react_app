---
name: kisok-feature-plan
description: Turn a KISOK feature brief into an implementation plan — research synthesis, design decisions, data contracts, generator commands, rounds of atomic TDD tasks with dependencies, risks and verification. Use this whenever you are writing or revising a feature's docs/plan.md, or when you have a brief and need to decide how to build it. Use it before generating any capability beyond the feature workspace.
---

# Planning a KISOK feature

A plan exists to make the build boring. It should answer, before any code is
written: what shape is this feature, what does it talk to, in what order do we
build it, and how will we know each step worked.

Write it into `features/<name>/docs/plan.md`, which the generator created.

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

**Capabilities to generate.** The exact commands, in order:

```bash
pnpm generate schema catalog catalog-response
pnpm generate query  catalog products
pnpm generate screen catalog product-detail --role=customer
pnpm generate component catalog availability-badge --screen=product-detail
```

Generate only what the shape needs. Empty architectural folders are not free —
they teach the next agent that this is the expected structure.

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

| Task | Mode                                            | Objective | Depends on                                 | Entry evidence |
| ---- | ----------------------------------------------- | --------- | ------------------------------------------ | -------------- |
| T01  | Catalog response schema                         | —         | rejects a payload with no `schema_version` |
| T02  | `api/fetch-catalog` calls the RPC and validates | T01       | throws AppError on a bad payload           |
| T03  | `useCatalog` exposes loading/error/data         | T02       | renders the error state on failure         |

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

## Before you call the plan done

- Every acceptance criterion in `brief.md` maps to at least one task
- Every task declares a verification mode, and its entry evidence follows from
  that mode — a RED test, a named baseline, or a verification command
- No task depends on a contract you have not found in a migration
- Nothing outside the feature directory is changed without a justification
- The shape you named at the top matches the capabilities you are generating
