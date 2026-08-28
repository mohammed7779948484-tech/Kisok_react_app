# KISOK documentation

Start with [`AGENTS.md`](../AGENTS.md) — it is the operating manual and links
here for detail.

| Document                                         | What it covers                                              |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [architecture.md](./architecture.md)             | Layers, feature boundaries, and how they are enforced       |
| [data-and-supabase.md](./data-and-supabase.md)   | The database contract, RPCs, RLS, Realtime, type generation |
| [design-system.md](./design-system.md)           | Tokens, components, responsive rules, accessibility         |
| [state-management.md](./state-management.md)     | Server state vs client state, persistence, errors, logging  |
| [testing.md](./testing.md)                       | The testing stack, utilities, and TDD workflow              |
| [feature-workflow.md](./feature-workflow.md)     | Start-to-PR walkthrough for a new feature                   |
| [agent-harness.md](./agent-harness.md)           | Skills, subagents, and the task/round/feature gates         |
| [environment.md](./environment.md)               | Setup, environment variables, secret policy                 |
| [code-standards.md](./code-standards.md)         | Naming, file layout, TypeScript conventions                 |
| [ci.md](./ci.md)                                 | What CI runs and why it is tiered                           |
| [product-boundaries.md](./product-boundaries.md) | What KISOK deliberately is not                              |
| [adr/](./adr/)                                   | Why the significant decisions were made                     |

Product behaviour and user journeys live in
[`KISOK_FLUTTER_PRODUCT_REFERENCE.md`](../KISOK_FLUTTER_PRODUCT_REFERENCE.md) —
read the warning at the top of `AGENTS.md` first.
