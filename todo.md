# Foundation status

Tracks the state of the Golden `main` foundation. **Feature work is tracked in
each feature's own `features/<name>/TODO.md`**, not here — a shared task file
would be edited by every agent and conflict constantly.

The starter-era task list this replaces described a generic mobile template and
no longer had any relationship to the repository.

---

## Complete

**Repository**

- [x] Manus starter stack removed: OAuth/session/JWT, tRPC, Express, MySQL, Drizzle, LLM/image/voice helpers, notifications, heartbeat, storage proxy, demo components and assets
- [x] `template.json` deleted
- [x] Unused dependencies and scripts removed; lockfile consistent
- [x] `.env.local` untracked; `.env.example` committed; no secrets in the repo

**Architecture**

- [x] Feature-first vertical slices with a public-API boundary
- [x] Thin-route policy, enforced by lint
- [x] Supabase access confined to feature `api/` modules, enforced by lint
- [x] Server-state vs client-state policy documented and enforced
- [x] No central registry, barrel, route map, or shared query-key file

**Supabase**

- [x] All 13 migrations read; contract documented in `docs/data-and-supabase.md`
- [x] Typed client with the Expo storage adapter and AppState auto-refresh
- [x] Zod-validating `callRpc` — every RPC returns `jsonb`, so validation is the boundary
- [x] `AppError` mapping for the real KISOK codes (`K1001`–`K1006`, `42501`)
- [x] Auth/session lifecycle with role resolution and the sign-out safety gate
- [x] Realtime → query invalidation helper
- [x] Type generation workflow (`pnpm db:types`)

**UI**

- [x] KISOK token system on the React Native Reusables contract
- [x] Curated primitives, including the adaptive cart surface
- [x] Shared loading / empty / error / retry / confirm / blocking / offline states
- [x] Responsive helpers matching the Tailwind breakpoints
- [x] `AppImage` with placeholder and error fallback
- [x] Accessibility conventions documented and applied
- [x] `/ui-lab` development gallery

**Tooling and tests**

- [x] jest-expo + RNTL; Vitest removed
- [x] Test utilities: providers, test QueryClient, Supabase mock, memory storage
- [x] 55 foundation tests; suite runs with zero console output
- [x] `pnpm verify` runs everything CI runs
- [x] CI: fast checks on every PR, Android build behind a label

**Ignite**

- [x] Generator with `--role`, `--layers`, `--realtime`, `--no-route`, `--dry-run`
- [x] Generated code compiles, lints, formats, and passes its own tests
- [x] `TODO.md` generated for every feature
- [x] `pnpm ignite:smoke` verifies all of the above in CI

**Agent harness**

- [x] `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`
- [x] Documentation set under `docs/`, with decision records

---

## Outstanding

**Needs a real environment**

- [ ] **Regenerate `core/supabase/database.types.ts`** against the live project
      with `pnpm db:types`. The committed file was derived by hand from the
      migrations so CI can typecheck without credentials; it has not been
      verified against a real database.
- [ ] **Verify on an Android tablet.** Everything here was verified on web and in
      the test suite. Native behaviour — splash, adaptive icon, orientation
      changes, safe areas, AsyncStorage persistence, Realtime over a real
      connection — is unverified.
- [ ] Run `pnpm doctor` with network access and resolve anything it reports.

**Backend decisions**

- [ ] **Customer order tracking has no secure contract.** See
      [`docs/adr/0006-customer-tracking-gap.md`](./docs/adr/0006-customer-tracking-gap.md).
      Do not build it by weakening RLS.
- [ ] Decide whether customers should see exact stock quantity. The snapshot
      exposes boolean `is_available` only; showing a quantity needs an
      intentional secure contract, not a client workaround.

**Deferred**

- [ ] **Expo SDK upgrade.** Deliberately deferred — see
      [`docs/adr/0001-expo-sdk-version.md`](./docs/adr/0001-expo-sdk-version.md).
      Do it as its own change, verified on a device, never folded into feature work.
- [ ] Replace the placeholder app icon and splash with real KISOK brand assets.

**Feature work**

Not started, and correctly so — this repository is the foundation. Each becomes
its own feature and its own PR:

`auth` (sign-in screen beyond the reference) · `catalog` · `cart` · `checkout` ·
`preparation` · `maintenance` · `tracking` (blocked)

Start with [`docs/feature-workflow.md`](./docs/feature-workflow.md).
