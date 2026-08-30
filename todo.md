# Foundation status

Tracks the state of the Golden `main` foundation. **Feature work is tracked in
each feature's own `features/<name>/docs/todo.md`**, not here — a shared task file
would be edited by every agent and conflict constantly.

The starter-era task list this replaces described a generic mobile template and
no longer had any relationship to the repository.

---

## Complete

**Hardening pass**

- [x] Auth lifecycle split so no Supabase call happens inside `onAuthStateChange`
- [x] Profile resolution keyed on user id — a token refresh no longer refetches
- [x] Realtime subscriptions stable across renders; latest handler kept via a ref
- [x] Database types verified against the migrations on every CI run
- [x] Generator renamed to the KISOK generator (`pnpm generate`) and made composable
- [x] Foundation dependency direction enforced (`core`/`components` cannot import features)
- [x] Expo packages aligned to the SDK 54 manifest
- [x] `inlineRem: 16` so native sizing matches the web preview and Tailwind's scale
- [x] `expo-doctor` distinguishes real incompatibilities from network failures
- [x] Shared auth test helper so features do not hand-roll a session fake

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
- [x] Foundation test suite runs with zero console output
- [x] `pnpm verify` runs everything CI runs
- [x] CI: fast checks on every PR, Android build behind a label

**Generator**

- [x] Generator with `--role`, `--with`, `--screen`, `--dry-run`, `--force`
- [x] Generated code compiles, lints, formats, and passes its own tests
- [x] Control documents generated for every feature, under
      `features/<name>/docs/` — brief, plan, todo, worklog, review
- [x] `pnpm generate:smoke` verifies all of the above in CI

**Agent harness**

- [x] `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`
- [x] Documentation set under `docs/`, with decision records

---

## Outstanding

**Needs a real environment**

- [x] **`core/supabase/database.types.ts` is genuinely generated.** Produced by
      Supabase's own generator against the deployed project, and `pnpm db:verify`
      proves it matches the migrations on every CI run — in required mode, so
      "could not run" fails rather than passing quietly.
- [x] **`pnpm run doctor` completes cleanly in CI**, where Expo's compatibility
      services are reachable. It distinguishes a real incompatibility from an
      unreachable service, so it cannot go green by failing to check. It must be
      invoked as `pnpm run doctor` — pnpm has a built-in `doctor` that shadows
      the script, and `pnpm check:ci-scripts` fails the build on that mistake.
- [x] **The Maestro smoke flow passes on an emulator.** Run 33289290576:
      `1/1 Flow Passed in 10s`. It found a real defect first — the release APK
      died in `Application.onCreate` with
      `SoLoaderDSONotFoundError: libreactnative.so`, an ABI mismatch — which no
      test, typecheck or lint in this repository could have seen.
- [ ] **Verify on a physical Android tablet.** The emulator flow is green, but
      splash, adaptive icon, real orientation changes, AsyncStorage across a
      genuine cold start, and Realtime over a real connection still need the
      actual device.
- [ ] **Point the app at the deployed database and exercise it.** The types come
      from that project, but no screen has performed a real RPC against it with a
      real session.

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
