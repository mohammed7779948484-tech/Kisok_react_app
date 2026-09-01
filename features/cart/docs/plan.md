# Cart — implementation plan

**HOW the brief gets built.** Written with the `kisok-feature-plan` skill
after research, and before generating anything beyond this workspace.

Status: `READY`

`DRAFT` → no implementation task may start. The Lead Planning Review (all
checklist axes: requirements, backend, feature shape, routes, task graph,
skills, test strategy, runtime strategy, document consistency, integration)
was performed by the Lead after the three research Evidence Packets, direct
primary-source spot-checks of `20260826050007_lean_create_order.sql`,
`20260826050013_lean_rls_grants.sql`, `components/ui/adaptive-sheet.tsx`,
`core/storage`, `core/auth`, and Flutter reference §15/§16, and re-reading all
five control documents. `todo.md` now carries the real execution structure.

`DRAFT` → no implementation task may start. Set `READY` only when the checklist
at the bottom of this file is fully satisfied. If a material decision changes
later — an acceptance criterion, the shape, a dependency, a scaffold — return to
`DRAFT`, reconcile this file and `todo.md`, then restore `READY`.

There is no fourth gate: `TASK`, `ROUND` and `FEATURE` are the gates. This
status is the implementation-readiness signal.

## Feature shape (named early)

**Local-state feature** (the "Cart" row of the shape table): one durable
client-owned store, feature components, one routed screen + one adaptive sheet.
No `api/`, no `queries/` — the feature never talks to Supabase.

## Research synthesis

What the research actually established, with pointers. Findings, not opinions.

- **Data contract (negative, verified)**: there is NO server cart — 16 tables
  and 22 functions in `supabase/migrations/*.sql`, none cart-related; the only
  "cart" string is the header comment denying one
  (`20260826050007_lean_create_order.sql:2`). A customer cannot read
  catalog/inventory tables (RLS returns zero rows;
  `20260826050013_lean_rls_grants.sql:42–43,134–164`). `get_customer_catalog`
  exposes boolean `is_available` only (`20260826050006:216`). No
  exact-quantity reconciliation RPC exists. `create_order(client_request_id,
items[{variant_id,quantity}])` is the Checkout/server boundary
  (`20260826050007:6–13,116–206`). Only `public.orders` is published to
  Realtime and a customer session receives nothing
  (`20260826050012:5`, `20260826050013:148–155`). `current_active_profile()`
  returns `{id, display_name, role, is_active}` rows
  (`20260826050005:3–19`) — `profile.id` is the sanctioned ownership signal.
  ⇒ Cart is purely local state; Supabase is never called; future Checkout
  consumes normalized `{variant_id, quantity}` lines.
- **Behaviour (Flutter reference, product behavior only)**: cart is
  non-authoritative, profile-scoped, durable-restored (§15 lines 556–562);
  quick cart = non-route adaptive overlay, expanded → side panel / smaller →
  bottom sheet (§14 lines 525–534); sheet shows total quantity, lines,
  per-line quantity + remove + pending, empty state, persistence warning,
  Continue Shopping / View Full Cart (§14 lines 535–544); no price UI (§3);
  persisted / memory-only / rejected tri-state, serialized writes (§15 lines
  563–568); checkout can lock cart mutations (§15 lines 569, 580); Full Cart
  has restore loading/error, empty state with Browse Products, responsive list
  - summary (§16 lines 592–595); merge-same-selection vs distinct
    variant/option lines (§15 lines 571–572); never silently mutate the cart
    (§16 lines 596–612, §32 line 1366); one cart model only (§15 lines 576–581);
    clear-on-confirmed-success is Checkout-owned (§18 lines 691–699); kiosk
    reset/sign-out is gated by checkout resolution, then clears ordinary cart
    state (§20 lines 818–834). Exact-quantity reconciliation is impossible
    under Lean V2 (§16 lines 614–629) — out of scope, not a workaround.
- **UI/design system**: `AdaptiveSheet` is the approved quick-cart surface,
  purpose-built ("This is the shape the KISOK cart needs",
  `components/ui/adaptive-sheet.tsx:10-21`); quick-cart trigger+badge belongs
  to the future shell (not this PR). Full Cart composes `Screen` +
  `ScrollView` + fixed footer + `Button size="large" block` CTA. Line rows:
  `AppImage` (fallback built in), `Text`, `Separator`, ≥48dp touch targets.
  `EmptyState` for empty; `Alert variant="warning"` for memoryOnly (ui-lab
  demos exactly this cart scenario); `ConfirmDialog` (docstring names
  "remove a cart line", `destructive` must be true) for removals; `Button
disabled` + `BlockingOverlay` for locked states. No virtualization (≤100
  lines bound by `create_order`; every existing screen uses plain
  `ScrollView`). Quantity stepper genuinely missing → NEW at feature scope.
  Test frame defaults to 1024×768 (`core/testing/render.tsx:37-40`) so
  bottom-sheet tests must override initial metrics.

## Design decisions

For each: the decision, and the alternative rejected and why.

1. **Persisted envelope: ONE key, owner inside.**
   `storageKey("cart", "lines")` holds `{version, ownerId, lines}`.
   Rejected: per-profile keys (`kisok:cart:lines:<profileId>`) — several
   customers' carts could linger on a shared tablet and routine cleanup would
   need key enumeration; the single key means at most ONE cart is ever on
   disk (the most recent), sign-out cleanup clears exactly one key, and the
   auth emergency reset (`clearKisokStorage`) covers the namespace anyway.
2. **Owner scoping on restore, not on the key.** `hydrate(ownerId)` reads the
   single key; a payload whose `ownerId` differs from the active profile is
   discarded and durably cleared (never surfaced). Rejected: trusting the
   sign-out cleanup alone — defense-in-depth: cleanup, mismatch-discard, and
   the emergency reset are three independent barriers.
3. **Line identity = variantId + canonically SORTED set of optionValueIds**
   (derived in pure rules, persisted per line as `lineId`; array order is
   display order, not identity — the same option-value set in any order is the
   same selection). Same selection re-added →
   merge by SUMMING quantities (Lead decision on the Flutter open question;
   the researcher recommended sum). Different variant OR different option
   selection → distinct line. Rejected: product-only identity (two variants
   of one product would wrongly merge); variant-only identity (silently
   drops the option dimension the brief requires).
4. **Minimal display snapshot per line**: `productDisplayName`,
   `variantLabel`, option labels, `imageUri`, `variantId`, `productId`,
   `quantity`. Rejected: copying catalog availability (`is_available`) or
   wider product data into lines — cart rendering must not depend on live
   catalog state, and reconciliation is explicitly out of scope.
5. **Interaction lock: user-driven mutations (add/setQuantity/remove) are
   no-ops while locked; `clearCart()` is NOT blocked.** The lock exists to
   stop user edits racing a future checkout submission; the
   clear-after-confirmed-success path is programmatic and must not be
   blocked by its own lock. Rejected: throwing from locked mutations
   (unhandled errors from event handlers crash risk) and blocking clear
   (deadlocks the documented success path).
6. **Remove line and clear cart are CONFIRMED actions** (`ConfirmDialog`,
   `destructive: true`). The Flutter reference documents no confirmation
   (B-label: old detail, not an invariant), but KISOK's Definition of Done
   says destructive actions confirm, and `ConfirmDialog`'s own docstring
   names cart-line removal. Decrement never removes: quantity minimum is 1
   (minus disabled at 1); removal is always the explicit remove action.
   (Lead decision on the second Flutter open question.)
7. **Per-line quantity cap 99 as a UX guard only** (stepper plus disabled at 99) — not a domain invariant; the server validates at order time
   (Flutter §13 B-label "may revisit").
8. **Serialized persistence with trailing coalescing.** One durable write in
   flight; mutations mark dirty and the latest full state is re-enqueued
   when the in-flight write settles. Guarantees: writes never interleave,
   and the final state eventually lands (or the failure is reported).
   Rejected: per-mutation fire-and-forget writes (interleaving can persist a
   stale snapshot over a newer cart — the exact hazard the reference calls
   out).
9. **Corrupt/unreadable persisted payload → attempted durable clear** (then
   `persisted` if cleared, `clearFailed` if not). This deliberately tightens
   the store template's "start clean + memoryOnly": an unreadable blob on a
   shared kiosk may be a previous customer's cart, so the cart tries to
   remove it rather than leaving it for the next cold start.
10. **Sign-out cleanup registers via the CURRENT public registry and throws
    on durable-clear failure.** `registerSignOutCleanup({name: "cart", …})`
    from `@/core/auth`; the task clears memory + disk and THROWS when the
    durable clear cannot be proven, so `runSignOutCleanup` records the
    failure and the auth lifecycle's emergency `kisok:*` reset runs. Cart
    registers NO guard (future Checkout owns it). Registration is a module
    side-effect of `features/cart/state/sign-out-cleanup.ts`, imported by
    the feature's `index.ts` (the sanctioned "features register from their
    own modules" pattern; the route module load at startup makes it live).
11. **Public API is narrow and Zustand-free for consumers.** `index.ts`
    exports components, a `useCart()` hook (narrow view + bound actions,
    owns hydration via `useActiveProfile()`), plain action functions
    (delegate to the store's `getState()`) for non-React callers (future
    Checkout), and types. Rejected: exporting the raw `useCartStore` — it
    would freeze the whole state shape as public contract.
12. **Quick-cart sheet is a stateful feature component** scaffolded by the
    `component` capability (`components/quick-cart-sheet.tsx`), composing
    `AdaptiveSheet` + store. The generated "presentational only" doc comment
    is updated to describe its stateful role — ESLint boundaries permit
    store reads in feature components (only `app/**` routes are barred from
    Zustand). Rejected: a manual file (the capability structurally fits) and
    a screen (the sheet is not routed).
13. **Full Cart is a routed screen at a NEW disjoint route** —
    `app/(customer)/cart.tsx` renders `FullCartScreen` through the public
    API. No `--force` (nothing occupies the path; `app/(customer)/index.tsx`
    stays Catalog's placeholder). Rejected: replacing the customer root
    (explicitly forbidden for Cart) and a modal-only cart (the brief requires
    the Full Cart management surface).
14. **Persistence-status presentation**: `memoryOnly` → `Alert
variant="warning"` (the ui-lab-documented cart scenario);
    `clearFailed` → `Alert variant="destructive"` (a safety issue must not
    be undersold as a memory-only warning — `docs/state-management.md:76-86`).

## Data contract

| RPC / table | Direction | Role | Returns | Migration |
| ----------- | --------- | ---- | ------- | --------- |
| — none      | —         | —    | —       | —         |

The Cart feature performs **zero** backend calls. The negative contract is
the contract: no server cart exists, none is invented, RLS is untouched.
Identity for ownership comes from the CURRENT auth foundation
(`useActiveProfile()` → `profile.id`, backed by `current_active_profile()`,
`20260826050005_lean_identity_admin_functions.sql`).

Realtime: **NO** — customer role; only `public.orders` is published and a
customer session receives nothing. Never render from a Realtime payload.

## Feature shape decision

Every capability gets an explicit YES or NO with a reason.

| Capability   | Needed? | Evidence / reason                                                                                                                                        |
| ------------ | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model/schema |     YES | Persisted restore must be validated (store template's own TODO: "validate the restored value with a Zod schema"); two schemas: line + persisted envelope |
| query        |      NO | Cart owns no server reads; catalog reads belong to Catalog                                                                                               |
| mutation     |      NO | No Supabase writes exist for cart (negative contract)                                                                                                    |
| store        |     YES | The single authoritative cart model: durable client-owned state, persistence status, lock                                                                |
| component    |     YES | quantity-stepper, cart-item-row, quick-cart-sheet — feature-level UI shared by the two surfaces                                                          |
| screen       |     YES | Full Cart management screen (brief AC-11)                                                                                                                |
| realtime     |      NO | Customer role; Realtime is Preparation-only by generator policy and by publication contents                                                              |
| route        |     YES | `/cart` renders the Full Cart screen — a new disjoint customer route                                                                                     |

Routes are planned explicitly, one line each:

```
route path → role/group → target screen → existing placeholder or new file
app/(customer)/cart.tsx → customer → full-cart → NEW file (nothing occupies the path; no --force)
```

## Generator commands, mapped to tasks

The exact commands, in order, each mapped to the task that uses it. **The Lead
runs each one immediately before delegating that task** — not all of them up
front.

| Generator command                                                  | Task |
| ------------------------------------------------------------------ | ---- |
| `pnpm generate schema cart cart-line`                              | T01  |
| `pnpm generate schema cart persisted-cart`                         | T01  |
| `pnpm generate store cart cart`                                    | T03  |
| `pnpm generate component cart quantity-stepper`                    | T06  |
| `pnpm generate component cart cart-item-row`                       | T07  |
| `pnpm generate component cart quick-cart-sheet`                    | T08  |
| `pnpm generate screen cart full-cart`                              | T09  |
| `pnpm generate route cart cart --role=customer --screen=full-cart` | T09  |

(`pnpm generate feature cart --role=customer` was already run — workspace
only. The route command runs AFTER the screen scaffold exists; it also appends
the screen export to `features/cart/index.ts`, which T10 then completes.)

Allowed manual files (with the reason no capability fits):

- `features/cart/model/cart-rules.ts` (+ `cart-rules.test.ts`) — pure domain
  rules: line identity derivation, merge/distinct-line decisions, quantity
  bounds, summary derivation. Domain rules have no generator capability.
- `features/cart/state/sign-out-cleanup.ts` (+ test) — lifecycle wiring into
  the CURRENT `core/auth` cleanup registry. No capability covers cross-module
  registration.
- `features/cart/state/use-cart.ts` (+ test) — the narrow public hook + plain
  action delegates. A public-API wrapper is behavior-specific.
- `features/cart/index.ts` — filling the generated placeholder with the
  planned public exports (the intended use of the generated file; route
  generation appends its own export first).
- Screen-local subcomponents under
  `features/cart/screens/full-cart/components/` if the screen needs
  Full-Cart-specific composition (e.g. summary/footer block) — planned path,
  feature-internal.

## Files expected to change

Anything outside `features/cart/` must be listed and justified.

- `features/cart/**` — the whole feature slice (this is the PR's substance).
- `app/(customer)/cart.tsx` — NEW thin route file (generated). The ONLY file
  outside the feature directory; additive, no `--force`, no edits to
  `app/(customer)/index.tsx`, `_layout.tsx`, or any other shared file.
- Shared files: none.

## Required skills

- `test-driven-development` — every task
- T06–T10: `kisok-design-system` (UI composition, tokens, a11y)
- T07–T09: `kisok-react-native-rules` (lists, images, runtime concerns)
- T09: `expo-router` (route wiring, navigation intents; vendored — SDK-54
  relevant parts only)

## Test strategy

What is worth a test and why — behaviour, contracts, safety invariants,
accessibility; not coverage for its own sake.

- **Store/domain (safety-critical)**: restore empty/valid/mismatched-owner/
  corrupt; owner isolation across profiles; add first line; merge same
  selection (sum); distinct variant/option lines; setQuantity bounds; remove;
  clear (memory + durable, fallback, clearFailed); total quantity and line
  count derivation; lock no-ops + clear-not-blocked; persistence write
  serialization (never interleaved, final state lands, coalescing); write
  failure → memoryOnly; durable clear failure → clearFailed (never
  memoryOnly). Failure paths use `createMemoryStore({failOn})` /
  `createJsonStorage` with a failing backend — the sanctioned pattern.
- **Auth/handoff integration**: cleanup registers through the public
  registry; `runSignOutCleanup()` clears memory + disk; cleanup THROWS on
  durable-clear failure (propagates to the auth emergency path); no guard is
  registered by cart.
- **UI (component level)**: quick sheet — empty, populated (lines + totals +
  per-line controls), locked (controls disabled), memoryOnly warning
  rendered; quantity stepper bounds and accessible names; row remove opens
  destructive confirm; full-cart screen — restore-pending skeleton, empty
  with escape action, populated list, warning; both layout presentations
  (override initial metrics for the compact/bottom-sheet variant). Test
  behavior and a11y (`getByRole`, `getByLabelText`, `toBeDisabled()`) —
  never resolved NativeWind styles.
- **Route**: thin route renders the screen via `@/features/cart` (public API
  import only); no catalog imports anywhere (architecture/lint check).
- **Public API**: `useCart()` exposes the narrow view; plain actions work
  without React; index exports importable without deep paths.

## Rounds and tasks

Group tasks so each round leaves the feature coherent. Every task is atomic:
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN / AFFECTED CHECKS → DIFF REVIEW → GATE.

### Round 1 — Cart domain and state foundation

| Task | Mode     | Acceptance                                   | Objective                                                                                                                                                                                                    | Depends on | Entry evidence                                                                                                     |
| ---- | -------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| T01  | behavior | Supporting AC-01, AC-02, AC-03               | Line + persisted-cart Zod schemas with tests: well-formed accepted; quantity ≤0 / non-uuid variantId / missing ownerId / wrong version rejected                                                              | —          | failing tests: `cartLineSchema` rejects `quantity: 0`; `persistedCartSchema` rejects missing `ownerId`             |
| T02  | behavior | Supporting AC-03, AC-08                      | Pure cart rules + tests: line identity derivation (variantId + optionValueIds), merge-same-selection sums, distinct selection → new line, quantity bounds, summary derivation                                | T01        | failing tests: `deriveLineId` / `mergeOrAppendLine` missing behaviour                                              |
| T03  | behavior | Acceptance AC-01, AC-02, AC-06               | Store restore/persistence: `hydrate(ownerId)` owner-scoped restore, mismatch discard + durable clear, miss → empty, corrupt → attempted clear, serialized+coalesced writes, persisted/memoryOnly/clearFailed | T01, T02   | failing tests: mismatch-owner hydrate leaves empty memory and removes key; rapid mutations never interleave writes |
| T04  | behavior | Acceptance AC-03, AC-04, AC-05, AC-08, AC-09 | Store mutations: add/merge, setQuantity (min 1, cap 99 UX guard), removeLine, clearCart (lock-exempt, honest status), lock/unlock no-ops, summaries                                                          | T03        | failing tests: add-merge sums; locked `setQuantity` is a no-op; totals recompute                                   |
| T05  | behavior | Acceptance AC-07                             | Sign-out cleanup wiring + tests: registers via `registerSignOutCleanup`, clears memory + disk, THROWS on clearFailed, registers no guard                                                                     | T04        | failing test: after `runSignOutCleanup()`, memory and key are empty; failing backend → task throws                 |

### Round 2 — Cart UI surfaces and public API

| Task | Mode     | Acceptance                     | Objective                                                                                                                                                                                                                        | Depends on                                             | Entry evidence                                                                                                   |
| ---- | -------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| T06  | behavior | Supporting AC-04, AC-12        | `QuantityStepper` component + test: value, min/max disabled bounds, accessible increment/decrement labels, announced value, ≥48dp targets                                                                                        | — (conceptually after T02; run sequentially after T05) | failing test: stepper renders labelled buttons, disables minus at min                                            |
| T07  | behavior | Supporting AC-03, AC-04, AC-12 | `CartItemRow` component + test: image w/ fallback, name, variant/options label, stepper, confirmed destructive remove, disabled while locked                                                                                     | T01, T06                                               | failing test: row renders line snapshot; remove opens `ConfirmDialog` with destructive confirm                   |
| T08  | behavior | Acceptance AC-10               | `QuickCartSheet` + tests (both layout presentations): AdaptiveSheet composition, total quantity, lines, empty state, memoryOnly warning, clearFailed alert, locked-disabled controls, Continue Shopping / View Full Cart intents | T04, T07                                               | failing test: sheet renders populated state with totals and intents; compact metrics → bottom-sheet presentation |
| T09  | behavior | Acceptance AC-11               | Full Cart screen + `/cart` route + tests: restore-pending skeleton, empty state w/ browse escape, populated list, persistence warning, locked states; thin route via public API; no catalog imports                              | T04, T07                                               | failing test: screen renders empty state with escape action; route imports `@/features/cart` only                |
| T10  | behavior | Acceptance AC-13               | `useCart()` hook + plain actions + `index.ts` public API + tests: narrow view, bound actions, non-React action calls, cleanup registration live via index import                                                                 | T05, T08, T09                                          | failing test: importing `@/features/cart` exposes hook/actions/components/types and registers cleanup            |

Mode, Acceptance, Objective are three different columns (see
`kisok-feature-plan`). All tasks are `behavior` — each opens with a failing
test for the missing behaviour.

T06 is written with no hard dependency; execution is sequential
(T01→T10) to keep verification simple — only research is parallelised.

## Risks

| Risk                                                                   | Likelihood | Mitigation                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration runs before profile resolution (ownerId unavailable)         | medium     | Cart surfaces mount only inside the auth-gated `(customer)` group; `useCart()` hydrates via `useActiveProfile()`; tests cover the no-op path |
| Write serialization bug persists stale state                           | medium     | Dedicated serialization tests: instrumented backend detecting overlap; coalescing asserted (writes ≤ mutations, final state correct)         |
| Cleanup registration not live at runtime (module never imported)       | low        | Route module imports `@/features/cart` at startup (expo-router loads route files eagerly); runtime verification signs in and signs out       |
| AdaptiveSheet test presentation defaults to landscape (1024×768 frame) | certain    | Bottom-sheet tests override initial metrics (documented in `core/testing/render.tsx`)                                                        |
| Parallel Catalog/Preparation PRs collide                               | low        | Only `features/cart/**` + the new `app/(customer)/cart.tsx`; no shared-file edits; merge check against `develop` before final verification   |
| `db:verify` cannot run in this sandbox (no PostgreSQL)                 | certain    | It SKIPs cleanly locally; CI provides it; local `pnpm verify` covers everything else                                                         |

## Verification

- `pnpm verify` after the final local change (baseline PASS recorded on the
  clean tree this session; `db:verify` SKIPs locally, CI provides it).
- Focused jest per task (`pnpm test -- <pattern>`).
- Runtime browser evidence (`pnpm web`, port 8081, agent-browser): real
  Customer sign-in on the hosted TEST project (`Customer@gmail.com`), then —
  `/cart` renders; empty state + escape action; populated cart demonstrated
  by writing a well-formed persisted payload into KISOK-owned local storage
  (`kisok:cart:lines` with the active profile's ownerId — captured from the
  app's own `current_active_profile` call), reload, verify restore; exercise
  quantity +/-, remove (confirm), clear (confirm); reload to prove durable
  persistence of edits; tablet landscape 1280×800, tablet portrait 800×1180,
  compact 480×900; no console errors; no redirect loops.
- Persistence-failure and locked behaviors: automated test evidence only
  (inducing a real storage failure or a checkout lock at runtime is unsafe/
  impossible pre-Checkout) — recorded explicitly as such.
- Native/Android: **explicitly unverified** (no device/emulator in this
  environment; no native configuration is touched — web runtime + RN
  component tests carry the coverage). Maestro: not warranted here.
- Fast GitHub CI on the final HEAD via the Draft PR.

## `DRAFT` → `READY`

Set the status at the top to `READY` only when every line here is true.

- [x] Acceptance criteria complete, stable IDs, each mapped to at least one task
- [x] Feature shape matrix complete; every YES justified
- [x] Data contracts verified against `supabase/migrations/*.sql`
- [x] Every generator command mapped to a task
- [x] Manual-only artifacts justified
- [x] Dependencies coherent
- [x] Route mappings known, target screen named
- [x] Changes outside `features/cart/` listed and justified
- [x] No unnecessary capability or folder planned
