# The agent harness

How several agents build KISOK features in parallel without conflicting or
quietly producing work nobody can verify.

The [feature workflow](./feature-workflow.md) is the summary. This document
describes the machinery behind it: which skills exist, which subagents exist,
and what the gates actually mean.

## Skills

Project-owned skills live in `.claude/skills/`. They carry the workflow so it
lives in one place instead of being restated in every feature's `todo.md`.

| Skill                      | Load it when                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `feature-delivery`         | Building any feature — the orchestration workflow              |
| `kisok-feature-plan`       | Turning a brief into the feature's `docs/plan.md`              |
| `test-driven-development`  | Any implementation, bug fix, or behaviour change               |
| `kisok-code-review`        | Reviewing a diff, a PR, or a feature before merge              |
| `kisok-quality-audit`      | Checking a delivery matches what was promised                  |
| `kisok-design-system`      | Writing or reviewing any UI                                    |
| `kisok-react-native-rules` | Growing lists, animation, images, crashes, performance/runtime |
| `kisok-maestro-e2e`        | Adding device-level end-to-end coverage                        |

Official Supabase skills (`supabase`, `supabase-postgres-best-practices`) are
installed project-scoped from `supabase/agent-skills`. They live once in
`.agents/skills/` and are symlinked into `.claude/skills/`; `skills-lock.json`
records their source and hash. Update them with
`npx skills add supabase/agent-skills`, not by hand.

**External skills provide platform knowledge, not project policy.** Where any
vendored Expo or Supabase skill conflicts with KISOK's architecture, product
boundaries, hosted-test ownership, or workflow, `AGENTS.md`, `CLAUDE.md`,
`.claude/rules/` and the project-owned `kisok-*` skills win. In particular an
external Supabase skill must never be read as permission for a feature agent to
reset, reseed, migrate, or weaken the shared hosted test project.

### Expo

Expo maintains an official skills repository at **`github.com/expo/skills`**,
with each skill one level deep under `plugins/expo/skills/<name>/`. An earlier
version of this file claimed otherwise. That search looked for an npm package
and a Claude Code plugin, found neither, and concluded the wrong thing: the
repository is the distribution channel.

Two of them are vendored, whole directories including `references/`:

| Skill             | Why it is here                                               |
| ----------------- | ------------------------------------------------------------ |
| `expo-router`     | Routing is the one Expo API every KISOK feature touches      |
| `expo-dev-client` | Building and distributing a dev client for on-device testing |

Deliberately NOT vendored, because each conflicts with something KISOK already
owns and a contradiction in an agent's context is worse than a missing skill:

| Skill                    | Why not                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `expo-project-structure` | Teaches a generic `src/` layout; KISOK's root layout is settled |
| `expo-design-system`     | KISOK owns `kisok-design-system` and its token contract         |
| `expo-tailwind-setup`    | NativeWind here is already set up and verified                  |

Other Expo and EAS skills are not vendored for completeness — add one when a
real task needs it, not before.

Provenance is `.agents/expo-skills.json` (upstream URL, path, the commit the
copies came from, and why each excluded skill is excluded).
`tools/refresh-expo-skills.sh` re-copies them and records the new commit. They
are not in `skills-lock.json` because the `skills` CLI expects a skill at the
repository root, and Expo nests them under `plugins/expo/skills/`.

**What the vendored copies get wrong for this project**, and why they are still
worth having:

- `expo-router`'s `references/tabs.md`, `search.md` and `zoom-transitions.md`
  cover `NativeTabs`, header search bars and `Link.AppleZoom`. None of those
  exist in the installed `expo-router` (SDK 54) — they are SDK 56+ and largely
  iOS. KISOK ships Android tablets on SDK 54, so treat that material as **not
  applicable**, not as something to reach for.
- `SKILL.md` points at an `expo-native-ui` skill for colours and styling. It is
  deliberately **not** vendored: KISOK's colour contract is
  `kisok-design-system` plus the semantic Tailwind tokens, and a raw-hex palette
  would contradict it. Ignore that pointer.
- `expo-dev-client` contains iOS/TestFlight/EAS material because it is a general
  Expo skill. KISOK currently targets Android tablets and uses the repository's
  existing Gradle/GitHub Actions workflows. Do not introduce EAS, TestFlight or
  iOS workflows unless a future task explicitly plans that platform change.

What remains genuinely useful is the routing model itself — file-based routes,
groups, dynamic segments, `Stack`, modals — which is what every KISOK feature
touches.

Keep external copies unchanged unless a compatibility fix is strictly required,
so they can be refreshed from upstream; put KISOK-specific policy here or in the
project-owned rules instead.

`expo-mcp` (`github.com/expo/expo-mcp`, maintained by Expo core) is official and
deliberately **not** installed: it is a _local device-automation_ server that
needs a running dev server and an attached device, which these agents'
environments do not have. Committing it would hand every agent a tool that
cannot work.

## Subagents

Project subagents live in `.claude/agents/`. The roles are separated because the
separation is what makes the checks worth anything.

Mandatory skills are **preloaded** through each subagent's `skills:`
frontmatter, so they are in context before the agent's first turn instead of
depending on it remembering to load them. Task-dependent skills stay opt-in
through the Skill tool.

`skills:` is a supported subagent frontmatter field — verified against the
official subagent documentation on **2026-08-29**, which lists it alongside
`name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`,
`maxTurns`, `mcpServers`, `hooks`, `memory`, `background`, `effort`,
`isolation`, `color` and `initialPrompt`, and defines it as injecting the full
skill content at startup. Because a silently ignored field would leave an agent
with no instruction at all, each agent body also says to load its skill with the
Skill tool if it is not already in context. That fallback costs one sentence and
removes the whole failure mode.

| Agent                                   | Preloaded                 | Job                                 | Deliberately cannot                                              |
| --------------------------------------- | ------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `feature-implementer`                   | `test-driven-development` | One bounded task, returns evidence  | Certify its own task, run the generator, or widen its file scope |
| `code-reviewer`                         | `kisok-code-review`       | Independent review, fresh context   | Edit code, or author `review.md` — it returns findings           |
| `quality-auditor`                       | `kisok-quality-audit`     | Did the delivery match the promise? | Re-do the code review, or write its own verdict                  |
| `research/supabase-contract-researcher` | —                         | What the backend actually offers    | Invent a contract, or propose weakening RLS                      |
| `research/flutter-behavior-researcher`  | —                         | What the product should DO          | Return a data contract — that app's schema is older              |
| `research/ui-researcher`                | `kisok-design-system`     | How to build it from what exists    | Design a new shared primitive                                    |

Reviewer and auditor are given no `Write` or `Edit` tool, and the Lead records
what they return — in the **Findings** and **Quality audit** sections of
`features/<feature>/docs/review.md` respectively. An agent that rewrites the
record of its own review is not an independent check.

Be precise about what that buys: both agents keep `Bash`, because an audit that
cannot run a command is worthless, and `Bash` can write any file. So the
separation is an **instruction plus a removed convenience**, not a sandbox. It
makes the reviewer's job clear and makes an accidental edit unlikely; it does
not make one impossible. The real defence is that the Lead reads what comes back
and writes the record itself.

The **Lead** — the parent agent — owns research orchestration, the brief, the
plan, task derivation, **every structural generator command**, delegation, gate
verification, the worklog, remediation decisions and the final handoff.

Scaffolding is Lead-owned and **just-in-time**: each planned generator command
runs immediately before the task that needs it, never all of them up front. The
implementer receives a task whose scaffold is already `READY` and whose
generated paths are listed; it must not run the generator, and must not
hand-write a file a capability would have produced. If an unplanned structural
artifact turns out to be necessary, it stops and reports, and the Lead revises
the plan first. That is what keeps a feature's shape checkable against a
document rather than being whatever the implementer happened to create.

## Plan readiness

`plan.md` carries `Status: DRAFT` or `Status: READY`. No implementation task
starts while it is `DRAFT`. This is deliberately **not** a fourth gate — the
three below are the gates, and adding another would mean two mechanisms for the
same idea. A material change to an acceptance criterion, the shape, a dependency
or a scaffold returns the plan to `DRAFT` until it is reconciled.

## Gates

Three levels, each answering a different question.

### Task gate

```
Lead scaffold → CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE
```

`PENDING` until verified, then `PASS` or `FAIL`. A task is DONE only at `PASS`,
and **task N+1 does not start until every dependency is `PASS`**.

The point is debugging locality. Six files changed and three failures at the end
means every change is suspect; one small verified change at a time means exactly
one is.

When a gate fails, the fix happens **in that task**. Compensating in a later
layer leaves the original defect in place with a workaround on top of it.

### Round gate

A round is a group of tasks that leaves the feature coherent. At the gate, run
the relevant subsystem verification and review the whole accumulated round diff
— tasks that each pass can still combine into something incoherent.

### Feature gate

An explicit checklist, in the PR template. Fast GitHub CI on the **final HEAD**
is required evidence alongside the local run: several checks depend on an
environment only CI has, so `pnpm verify` alone is not the fail-closed authority
for all of them.

Open the **Draft PR early**, once there is coherent verified work, so PR CI and
label-gated native jobs can run while implementation continues. The final
sequence is: full `pnpm verify`, required runtime/native evidence, independent
code review, remediation, re-review of blocking/major findings, then the quality
audit. Only after the Feature Gate passes is the draft marked ready for a human.
Agents never merge it.

## Control documents

Every generated feature owns five, and they stay distinct — when they blur, all
five become one long file nobody trusts.

| File         | Holds                                   | Never holds          |
| ------------ | --------------------------------------- | -------------------- |
| `brief.md`   | What, and how we will know it is done   | Sequencing           |
| `plan.md`    | How: decisions, contracts, tasks, risks | Progress             |
| `todo.md`    | Execution state and gates, concise      | A copy of the plan   |
| `worklog.md` | Evidence per task ID, appended          | Plans                |
| `review.md`  | Independent findings and disposition    | Implementation notes |

## Keeping this true

`pnpm check:docs` fails when documentation describes a workflow the repository
no longer has — an old generator flag, a moved directory, a renamed command.
Prose drifts silently because nothing executes it; that check is what stops a
rename leaving a document lying for months. It runs as part of `pnpm verify`.
