# 0007 — Vendor React Native Reusables primitives

**Status:** accepted · **Date:** 2026-08

## Context

React Native Reusables was a required part of the brief. It follows the
shadcn/ui model: a CLI copies component **source into your repository** rather
than installing a runtime dependency, so the components become yours to adapt.

The CLI is scriptable — `add <component> -y --path ...` exists, no TTY needed.
But it fetches component definitions from `reactnativereusables.com`, and that
host is **blocked by this build environment's egress proxy**. Running `add` here
hangs. The `@rn-primitives/*` packages it builds on are on npm and install fine.

## Decision

Build `components/ui/` on RNR's architecture directly, rather than pretending the
CLI ran:

- components are **owned source** in this repo, not a dependency
- built on the real `@rn-primitives/*` packages from npm
- styled with `class-variance-authority`, using RNR's `TextClassContext` pattern
  so a parent can style its child text
- themed through the **same HSL CSS-variable token contract** RNR generates, in
  `global.css`

`components.json` is configured with matching aliases and the `cssVariables`
setting, so on an unrestricted network the CLI works against this repo and
anything it adds themes correctly with no edits.

## Consequences

- The primitives are real, adaptable, and match RNR conventions.
- The set is curated to what KISOK actually needs — `Text`, `Button`, `Card`,
  `Input`, `Badge`, `Separator`, `Skeleton`, `Icon`, `Alert`, `Progress`,
  `Tabs`, `Dialog`, and the KISOK-specific `AdaptiveSheet` — rather than
  everything the library offers.
- Adding more later is one command on a normal network.
- **These components were not produced by the RNR CLI.** If you add a component
  with the CLI, review what lands and adapt it to the conventions here rather
  than assuming the two are identical.
