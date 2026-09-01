# Preparation — implementation plan

**HOW the brief gets built.** Write this with the `kisok-feature-plan` skill
after research, and before generating anything beyond this workspace.

Status: `READY`

`DRAFT` → no implementation task may start. Set `READY` only when the checklist
at the bottom of this file is fully satisfied. If a material decision changes
later — an acceptance criterion, the shape, a dependency, a scaffold — return to
`DRAFT`, reconcile this file and `todo.md`, then restore `READY`.

There is no fourth gate: `TASK`, `ROUND` and `FEATURE` are the gates. This
status is the implementation-readiness signal.

**Lead Planning Review — completed.** Every checklist item at the bottom of this
file was personally verified by the Lead against the original feature request,
the three research Evidence Packets (spot-checked against migrations 02/04/08/
12/13 and `core/errors`), and the repository rules. Dependency corrections from
the review pass: T02 and T08 carry no dependencies (a direct read and a pure
badge); T11 and T13 gained their direct dependency on T05 (the mutation both
screens call).

## Shape

**Live operational** (the preparation board): `schema`, `query` ×4,
`mutation`, `realtime`, `component` ×4, `screen` ×3, `route` ×3, plus two pure
model rule modules. No store — all order state is server state.

## Research synthesis

What the research actually established, with pointers. Findings, not opinions.

- **Data contract** (supabase-contract-researcher, spot-checked by the Lead):
  - RLS gives an active `preparation` session `select` on ALL rows of `orders`,
    `order_items`, `store_settings` — no status/assignment row filters
    (`20260826050013_lean_rls_grants.sql:146-164` policies, `:189-205` grants;
    `profiles` revoked at `:281`).
  - `orders`: `display_number` (`^[A-HJ-NP-Z2-9]{6}$`, no ordering semantics),
    `status` enum `new|preparing|ready|completed|cancelled`, `created_at`
    (board ordering; `orders_status_created_idx (status, created_at desc)`),
    `assigned_preparation_id`, `completed_at`/`completed_by`,
    `cancelled_at`/`cancelled_by`/`cancellation_reason`
    (`20260826050004_lean_inventory_orders_schema.sql:48-90`).
  - `order_items` are immutable snapshots (trigger
    `order_items_are_immutable`, migration 04 `:139-152`): `product_name`,
    `variant_name`, `variant_sku`, `variant_options` (jsonb
    `[{type,value}]`), `brand_name`, `image_secure_url`, `quantity`
    (migration 04 `:100-117`). A joined read (`orders` → `order_items(*)`)
    is RLS-permitted; item order within an embed is not guaranteed — the
    client imposes a deterministic order (e.g. by `variant_sku`).
  - `update_order_status(order_id uuid, target_status public.order_status,
reason text default null) returns jsonb` — prep `new→preparing` (claims
    via `assigned_preparation_id = actor`; K1004 if already assigned), prep
    `preparing→ready` (assignee only, else 42501), prep cancel from
    `new|preparing` only (any active preparation employee; K1004 otherwise),
    admin `ready→completed`; everything else K1004. Cancels restore inventory
    exactly once (ledger-guarded). Returns
    `{order_id, display_number, status, assigned_preparation_id,
completed_at, cancelled_at, cancellation_reason, updated_at}` — jsonb,
    so it must go through `callRpc` + Zod
    (`20260826050008_lean_order_operations.sql:5-195`).
  - Realtime: exactly `public.orders` is published
    (`20260826050012_lean_realtime.sql:5`); RLS applies; invalidation-only
    (`core/realtime` + `docs/data-and-supabase.md:180-197`).
  - Error mapping already exists in `core/errors` (`K1004` →
    non-retryable `state-conflict`, `42501` → `forbidden`, `K1002` →
    `unavailable`, `K1006` → retryable `server`).
  - `store_settings` is a singleton; `store_timezone` is IANA text. No
    migration seeds the row — the deployed project may or may not have it;
    the read must tolerate zero rows.
- **Behaviour** (flutter-behavior-researcher, from
  `KISOK_FLUTTER_PRODUCT_REFERENCE.md` §22–§26, §34): three surfaces (board /
  details / history); New / Preparing / Ready grouping with counts; columns on
  expanded, tabs on compact; action matrix strictly status- and
  assignment-conditional with the server as authority; claim-on-start;
  assignee-only Mark Ready; cancel only New/Preparing; "Order unavailable"
  instead of stale content; history = current store day, terminal groups,
  read-only; realtime = invalidate-then-refetch; states: loading skeleton,
  empty, error+retry, manual refresh, in-flight interaction blocking.
- **UI** (ui-researcher, from `components/**`, `core/responsive`,
  `components/app/ui-lab.tsx`): Tabs (compact/medium) + three columns
  (expanded via `useLayout().isExpanded`); `Text variant="mono"` for display
  numbers; Badge mapping New→default/neutral, Preparing→primary,
  Ready→success, Cancelled→destructive (ui-lab precedent); `compact` Button is
  explicitly sanctioned for the Preparation board card footers;
  `ConfirmDialog` for destructive cancel; per-card mutation disable +
  label-swap convention (`sign-in-form.tsx`); conflict feedback via
  `InlineError`/`Alert` near the action (no toast primitive exists,
  deliberately); `SkeletonList` for known-shape loading; `EmptyState` with
  optional action; `AppImage` for snapshot images; no virtualization
  (ADR-0011); no new shared primitives — everything needed exists.

## Design decisions

For each: the decision, and the alternative rejected and why.

1. **Order Details route is a static route with `orderId` as a query param**
   (`app/(preparation)/order-details.tsx`, read with `useLocalSearchParams`).
   The route generator writes flat kebab-case files only — it cannot produce a
   dynamic segment like `orders/[orderId].tsx`, and the route template itself
   documents reading params in the route file. Rejected: hand-writing a
   dynamic route — no capability produces it, the screen's `index.ts` export
   would have to be hand-added (breaking the generator-owned append), and it
   sets a precedent of manually maintaining route files.
2. **History keys the store day on the terminal timestamp** — an order
   belongs to the day it _became_ terminal: `completed_at` for completed,
   `cancelled_at` for cancelled, evaluated in `store_timezone`. The read
   pre-filters server-side on `status in ('completed','cancelled')` AND
   `(completed_at ≥ dayStart OR cancelled_at ≥ dayStart)` — the terminal
   timestamps themselves are the prefilter bound, giving EXACT decision-2
   semantics — then the model filters to the day window `[start, end)`.
   Rejected: keying on `created_at` — an order created before midnight and
   cancelled after would land in _yesterday's_ history, splitting the day's
   finished work. Also rejected (T06 review, T06-R01): a `created_at ≥
dayStart − 24h` transfer bound — an order created days earlier and
   cancelled today (a weekend-stale order cancelled Monday is reachable)
   would be silently excluded from today's history, violating decision 2's
   own keying. The window end is the next LOCAL date's midnight (23h on
   spring-forward days, 25h on fall-back days — T06-R02), not start+24h.
   The contract does not fix this (research R-09, MEDIUM) — this is a Lead
   decision from the product reading, REVISED at the T06 gate after review
   (T06-R01/T06-R02); no acceptance criterion, capability, dependency, or
   scaffold changed, so the plan stays READY with this reconciliation
   recorded here.
3. **Assignment is shown as "you" vs "another employee"** by comparing
   `assigned_preparation_id` with `useAuth().profile.id`. Rejected: showing
   names — `profiles` is revoked from `authenticated` and no RPC resolves
   another employee's uuid; names need a deliberate backend decision
   (recorded under risks, NOT attempted here).
4. **Cancel confirms destructively without reason capture.** The
   `ConfirmDialog` flow matches the repo's destructive-confirm convention and
   the reference's silence on reason UX. The RPC's `reason` parameter is left
   at its `null` default. Rejected: a reason input — no product behaviour
   evidence supports it; it can be added additively later.
5. **Mutation in-flight state is per-card** (disabled action + label swap +
   repeat-tap guard, the `sign-in-form` convention). Rejected: a screen-wide
   `BlockingOverlay` — it would freeze the whole multi-employee board for one
   card's transition; per-card disable keeps the board usable while still
   guarding the double-press on that action.
6. **The board includes `ready` display-only.** Employees must see orders
   awaiting admin completion; the contract keeps them readable. Rejected:
   hiding `ready` — the reference's board has three groups and the Ready
   column is where a "done, waiting for handover" order lives.
7. **Board/detail reads embed `order_items` in one select** (`orders` →
   `order_items(*)`), with a client-side deterministic item order
   (`variant_sku`). RLS evaluates both policies for the same session, so one
   request is safe and gives one consistency point. Rejected: separate item
   reads — two requests, two consistency points, no benefit.
8. **Store-timezone resolution degrades to the device timezone when the
   settings row is absent.** The read returns `Tables<"store_settings"> |
null`; a model resolver prefers the store timezone. Rejected: failing the
   whole board when the singleton row is missing — no migration seeds it, and
   time display should not take the operational board down.
9. **New-order arrival is announced with a polite accessibility live region**
   (screen-local `Text`), not a sound or toast. No toast primitive exists
   (deliberately) and the reference is silent on alerts. Rejected: inventing
   a toast/sound — no evidence, new shared surface.
10. **Cards show the created time (store timezone), not a ticking elapsed
    timer.** The reference shows created time on cards; a ticking timer has
    no repo precedent and fights the restrained-motion policy. Rejected:
    elapsed-time ticking.
11. **Board grouping: tabs on compact/medium, three columns on expanded** —
    exactly the ui-lab precedent and `useLayout` contract. Rejected: one
    grouped scroll — it hides two statuses at a time on portrait, which is
    the primary in-store orientation.

## Data contract

| RPC / table                                             | Direction | Role                    | Returns                                            | Migration                    |
| ------------------------------------------------------- | --------- | ----------------------- | -------------------------------------------------- | ---------------------------- |
| `orders` (direct select)                                | read      | preparation — all rows  | `Tables<"orders">` rows (typed; no Zod)            | 04 (schema) + 13 (RLS/grant) |
| `order_items` (embedded in `orders` select)             | read      | preparation — all rows  | `Tables<"order_items">` rows (typed; no Zod)       | 04 + 13                      |
| `store_settings` (direct select)                        | read      | preparation             | `Tables<"store_settings">` row or null (typed)     | 02 (schema) + 13             |
| `update_order_status(order_id, target_status, reason?)` | write     | preparation (and admin) | jsonb projection — Zod-validated through `callRpc` | 08                           |

Read shapes:

- Active board: `orders` where `status in ('new','preparing','ready')`,
  ordered `created_at desc`, with `order_items(*)` embedded.
- Order detail: one `orders` row by `id` with `order_items(*)` embedded.
- History: `orders` where `status in ('completed','cancelled')` and
  `(completed_at ≥ dayStart or cancelled_at ≥ dayStart)`, ordered
  `created_at desc`; the model filters to the current store-day window by
  terminal timestamp. (Revised at the T06 gate — see decision 2.)
- Settings: the `store_settings` singleton row.

Realtime: `public.orders` changes → invalidate `preparationKeys.all` →
refetch. An invalidation signal ONLY — never a render source. Preparation-only
(RLS gives customer sessions nothing on this channel).

## Feature shape decision

Every capability gets an explicit YES or NO with a reason. "Not mentioned" is
not a decision — it is how a feature ends up with an empty directory nobody can
explain.

| Capability   | Needed? | Evidence / reason                                                                                                                                                           |
| ------------ | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model/schema |     YES | `update_order_status` returns `jsonb` (typed as the wide `Json` union) — the Zod schema is what makes the mutation result trustworthy at the boundary.                      |
| query        |     YES | Four reads: active orders (board), order detail, store-day history, store settings. Server state → TanStack Query.                                                          |
| mutation     |     YES | One write: `update_order_status` — new→preparing, preparing→ready, cancel.                                                                                                  |
| store        |      NO | No durable client-owned state: order state is server state; dialogs/tabs/selection are ephemeral screen state.                                                              |
| component    |     YES | Four feature/screen-local components: order-status-badge, order-card, cancel-order-dialog (feature-level, ≥2 consumers each) and board-section (screen-local to workspace). |
| screen       |     YES | Three screens: workspace (board), order-details, store-day-history.                                                                                                         |
| realtime     |     YES | `public.orders` is published and preparation is its intended consumer; the board must stay fresh. Invalidation-only.                                                        |
| route        |     YES | Three routes under `app/(preparation)/`: index (replaces the Foundation placeholder — deliberate `--force`), order-details, history.                                        |

Routes are planned explicitly, one line each:

```
route path → role/group → target screen → existing placeholder or new file
```

- `/` (preparation home) → `(preparation)` → `WorkspaceScreen` → REPLACES the
  existing `app/(preparation)/index.tsx` Foundation placeholder (one-time,
  planned, `--force`)
- `/order-details?orderId=<uuid>` → `(preparation)` → `OrderDetailsScreen` →
  new file `app/(preparation)/order-details.tsx`
- `/history` → `(preparation)` → `StoreDayHistoryScreen` → new file
  `app/(preparation)/history.tsx`

## Generator commands, mapped to tasks

The exact commands, in order, each mapped to the task that uses it. **The Lead
runs each one immediately before delegating that task** — not all of them up
front. Generate only what the shape actually needs.

If a structural capability matches, use it. Files a capability would have
produced must not be hand-written. Manual artifacts are legitimate only when no
capability fits, the path and purpose are planned, and the file is inside the
task's allowed scope — domain rules, selectors, state-machine helpers, mappers,
predicates, behaviour-specific tests.

| Generator command                                                                         | Task |
| ----------------------------------------------------------------------------------------- | ---- |
| `pnpm generate schema preparation order-status-update`                                    | T01  |
| `pnpm generate query preparation active-orders`                                           | T02  |
| `pnpm generate query preparation order-detail`                                            | T03  |
| `pnpm generate query preparation store-settings`                                          | T04  |
| `pnpm generate mutation preparation update-order-status`                                  | T05  |
| `pnpm generate query preparation store-day-history`                                       | T06  |
| `pnpm generate component preparation order-status-badge`                                  | T08  |
| `pnpm generate component preparation order-card`                                          | T09  |
| `pnpm generate component preparation cancel-order-dialog`                                 | T10  |
| `pnpm generate screen preparation workspace`                                              | T11  |
| `pnpm generate component preparation board-section --screen=workspace`                    | T11  |
| `pnpm generate route preparation index --role=preparation --screen=workspace --force`     | T11  |
| `pnpm generate realtime preparation orders --role=preparation`                            | T12  |
| `pnpm generate screen preparation order-details`                                          | T13  |
| `pnpm generate route preparation order-details --role=preparation --screen=order-details` | T13  |
| `pnpm generate screen preparation store-day-history`                                      | T14  |
| `pnpm generate route preparation history --role=preparation --screen=store-day-history`   | T14  |

Notes: `queries/keys.ts` is created by the first query command (T02) and
skipped thereafter; each hook embeds its own key segment, so no manual key
registry is ever extended. `T07` has no generator command — it is a pure model
rules module.

Allowed manual files (with the reason no capability fits):

- `features/preparation/model/status-actions.ts` (+ test) — pure
  action-eligibility rules mirroring migration 08's transition matrix; domain
  rules, no IO, no capability produces this.
- `features/preparation/model/store-day.ts` (+ test) — store-day window
  computation (IANA timezone via `Intl`), terminal-timestamp day filter,
  store-timezone resolver with device fallback; domain rules.
- `features/preparation/model/order-display.ts` — small pure formatting
  helpers (item summary, deterministic item ordering by `variant_sku`,
  option-label joining) if the screens need them; mappers/selectors.
- Screen-internal compositions (column layouts, action bars, back buttons,
  the live-region announcement) live inside the generated screen files
  themselves — they are screen composition, not structural components.

## Files expected to change

Anything outside `features/preparation/` must be listed and justified —
shared files are where parallel agents collide.

- `features/preparation/**` — everything this feature owns.
- `app/(preparation)/index.tsx` — REPLACED by the route generator with
  `--force` (the documented, deliberate one-time replacement of the tracked
  Foundation placeholder; the generator exports `WorkspaceScreen` into
  `features/preparation/index.ts` in the same atomic write).
- `app/(preparation)/order-details.tsx` — new route file.
- `app/(preparation)/history.tsx` — new route file.
- `features/preparation/index.ts` — appended by the route generator only
  (screens become public exactly when a route renders them).
- Shared files: one — `tools/generator/smoke-test.mjs`, the R2-S1 fix
  (commit b4fce20, recorded in review.md's Quality-audit notes): the
  placeholder smoke check's fixture was the TRACKED preparation route, which
  this feature's documented first-feature `--force` legitimately consumed;
  without the fix CI's smoke step would be permanently red. A Lead-owned
  foundation chore, justified and disclosed. No `core/**`, no `components/**`,
  no `app/_layout.tsx`, no migrations, no generated types. The Customer
  Catalog feature (in parallel) touches `app/(customer)/**` and
  `features/catalog/**` only — the two features cannot collide.

## Required skills

- `test-driven-development` — every task
- `supabase` — T02, T03, T04, T05, T06, T12 (data/api contracts)
- `kisok-design-system` — T08, T09, T10, T11, T13, T14 (all UI tasks)
- `kisok-react-native-rules` — T09, T11, T12, T13, T14 (lists, images,
  runtime discipline)
- `expo-router` — T11, T13, T14 (route wiring, params, navigation)

## Test strategy

What is worth a test and why — behaviour, contracts, state transitions, safety
invariants, accessibility; not coverage for its own sake.

- **T01 schema**: the Zod schema accepts the exact migration-08 projection
  (including `null` optionals) and rejects malformed payloads — the RPC trust
  boundary.
- **T02–T04, T06 api modules** (`installMockSupabase` or mocked client):
  correct table, filters, embed, ordering; PostgREST error → `AppError`;
  `store_settings` zero-row tolerance. Hook-level: key shape (params in key)
  where applicable. Mock at the feature's `api/` boundary, never `@/core/supabase`
  in screen tests.
- **T05 mutation**: `callRpc` receives the exact argument names
  (`order_id`, `target_status`), result validated by the T01 schema, errors
  map to `AppError` kinds; the hook invalidates `preparationKeys.all` on
  success and never auto-retries.
- **T06/T07 model rules**: store-day windows across timezone boundaries
  (fixed dates, fixed IANA zones incl. one with DST), terminal-timestamp
  filtering (before/after boundary, both terminal kinds); action rules
  mirroring migration 08 exactly — the matrix `canStartPreparing`,
  `canMarkReady` (assignee vs other), `canCancel` (new/preparing yes;
  ready/completed/cancelled no).
- **T08–T10 components** (`renderWithProviders`): badge label text per
  status; card content, action visibility per rules, read-only mode,
  press/assignment semantics via `getByRole`/`getByLabelText`; cancel dialog
  confirm → mutation call, busy disable. (Reconciled at the T10 gate,
  T10-R01: "error feedback" was mis-attached to the dialog — the dialog is
  deliberately presentational with no error surface; the rejection half of
  AC-06 is screen-owned. The cancel-rejection flow — dialog `open=false`,
  feedback near the card, invalidate/refetch, with its own screen test — is
  a REQUIRED constraint on the T11/T13 packets. No acceptance criterion,
  capability, dependency, or scaffold changed.)
- **T11–T14 screens**: loading/empty/error+retry for reads; grouped
  membership + counts; tabs vs columns driven by the responsive layer
  (mocked `useLayout`); pending disable + repeat-guard; conflict (K1004/42501
  mock) → inline feedback + invalidation; details snapshot fields, image alt,
  back handler, unavailable state; history grouping, day filter, read-only;
  live-region announcement present with an accessible name; sign-out
  affordance and manual refresh present on the workspace.
- **T12 realtime**: an orders event invalidates the feature's queries and the
  refetch repopulates — render truth stays the query.
- Suite hygiene: zero console output (`setLogSink`/`resetLogging` on failure
  paths), `await renderWithProviders`, `userEvent` over `fireEvent`, no
  snapshot tests, no style assertions.

## Rounds and tasks

Group tasks so each round leaves the feature coherent. Every task is atomic:
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE.

### Round 1 — Domain and data layer

The feature's contracts: schema, four reads, the write, and the pure rules —
all verifiable without any UI.

| Task | Mode     | Acceptance                 | Objective                                                                            | Depends on                                                             | Entry evidence                                                 |
| ---- | -------- | -------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| T01  | behavior | Supporting: AC-04/05/06    | Zod schema for the `update_order_status` jsonb result                                | —                                                                      | failing schema test: rejects the real migration-08 projection  |
| T02  | behavior | Supporting: AC-01/02/03    | `fetchActiveOrders` + `useActiveOrders` (status filter, ordering, embed)             | — (a direct table read; no schema involved)                            | failing api test: throws NOT_IMPLEMENTED before implementation |
| T03  | behavior | Supporting: AC-07          | `fetchOrderDetail` + `useOrderDetail` (by id, embed)                                 | T02 (scaffold ordering: keys.ts is generated once, by the first query) | failing api test                                               |
| T04  | behavior | Supporting: AC-03/07/08    | `fetchStoreSettings` + `useStoreSettings` (singleton, null-tolerant)                 | T02 (scaffold ordering, as above)                                      | failing api test                                               |
| T05  | behavior | Supporting: AC-04/05/06/10 | `updateOrderStatus` + `useUpdateOrderStatusMutation` (callRpc, schema, invalidation) | T01                                                                    | failing api test                                               |
| T06  | behavior | Supporting: AC-08          | `fetchStoreDayHistory` + `useStoreDayHistory` + `model/store-day.ts`                 | T04                                                                    | failing model test: day window / terminal filter               |
| T07  | behavior | Supporting: AC-04/05/06/10 | `model/status-actions.ts` — eligibility rules mirroring migration 08                 | —                                                                      | failing rule test: wrong/absent matrix                         |

### Round 2 — The workspace board

The operational surface: components, the workspace screen replacing the
placeholder, and live invalidation.

| Task | Mode     | Acceptance                                    | Objective                                                              | Depends on                              | Entry evidence                                 |
| ---- | -------- | --------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| T08  | behavior | Supporting: AC-03/07/08                       | `OrderStatusBadge` — status → label + variant                          | — (uses only the generated status type) | failing render test                            |
| T09  | behavior | Acceptance: AC-03                             | `OrderCard` — content, actions, assignment, read-only mode             | T07, T08                                | failing render test                            |
| T10  | behavior | Acceptance: AC-06                             | `CancelOrderDialog` — destructive confirm → mutation                   | T05                                     | failing render/interaction test                |
| T11  | behavior | Acceptance: AC-01, AC-02, AC-04, AC-05, AC-10 | `WorkspaceScreen` + board-section + index route (replaces placeholder) | T02, T04, T05, T07, T08, T09, T10       | failing screen test: error state before wiring |
| T12  | behavior | Acceptance: AC-09                             | `useOrdersRealtime` wired into the workspace                           | T11                                     | failing invalidation test                      |

### Round 3 — Order details and store-day history

The two secondary surfaces complete the employee experience.

| Task | Mode     | Acceptance               | Objective                                                                 | Depends on                   | Entry evidence      |
| ---- | -------- | ------------------------ | ------------------------------------------------------------------------- | ---------------------------- | ------------------- |
| T13  | behavior | Acceptance: AC-07, AC-10 | `OrderDetailsScreen` + route — snapshot items, actions, unavailable state | T03, T04, T05, T07, T08, T10 | failing screen test |
| T14  | behavior | Acceptance: AC-08        | `StoreDayHistoryScreen` + route — day header, groups, read-only           | T04, T06, T08, T09           | failing screen test |

## Risks

| Risk                                                                                                              | Likelihood              | Mitigation                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| PostgREST embed typing: `order_items` embed must typecheck against the generated `Tables<"orders">` relationships | medium                  | Verified in T02 against `core/supabase/database.types.ts`; if the embed fights the types, fall back to two direct reads (RLS permits both) — a T02-scoped decision, not a plan change.                                                                              |
| `store_settings` singleton row absent on the deployed test project                                                | medium                  | T04 returns `row                                                                                                                                                                                                                                                    | null`; the model resolver prefers store tz and degrades to device tz (decision 8) — the board never fails on it. |
| Assignee names are unobtainable under current RLS                                                                 | certain (contract fact) | Decision 3: id-comparison indicator. If product later wants names, that is a deliberate backend decision to raise — recorded here, NOT attempted in this feature.                                                                                                   |
| Live mutation testing on shared hosted data                                                                       | medium                  | Exercise only against suitable existing test orders, preferring the non-destructive `new→preparing→ready` chain; if no safe data exists, verify through focused automated tests and record the live path as UNVERIFIED (per `docs/environment.md` ownership rules). |
| Realtime in the browser preview                                                                                   | low                     | `@supabase/supabase-js` websockets work in the Expo web preview; the invalidation path is additionally covered by a hook test.                                                                                                                                      |
| Day-boundary/DST edge cases in store-day math                                                                     | medium                  | Fixed-date tests over IANA zones including a DST-observing zone; pure model function, no IO.                                                                                                                                                                        |
| Parallel Catalog feature colliding                                                                                | low                     | Disjoint scopes by construction: `features/preparation/**` + `app/(preparation)/**` vs `features/catalog/**` + `app/(customer)/**`; zero shared files (see Files expected to change).                                                                               |

## Verification

- `pnpm verify` at every ROUND gate (typecheck, lint, format, tests,
  `db:verify`, `check:docs`, generator smoke); each task gate carries
  its own affected-checks output (targeted + full jest, typecheck, scoped
  lint/format) — the full verify run rides the round boundaries. (Cadence
  reconciled at the quality audit: the delivery ran verify at R1/R2/R3/
  final; per-task full-verify remains the ideal for future features.)
- Fast GitHub CI on the final HEAD (the Draft PR must exist before this).
- Runtime: `pnpm web`, sign in as the preparation test account
  (`docs/environment.md`) against the hosted test project; board / details /
  history navigation; a Realtime refresh observed on a real order change if
  safe data exists; tablet landscape (1280×800), tablet portrait (800×1180),
  compact web (480×900) — the design-system contract sizes.
- Mutations live: only against suitable test data (see risks); otherwise
  verified by focused tests and recorded UNVERIFIED for the live path.
- Native/Android: no native configuration is touched by this feature; the
  existing Maestro smoke flow covers foundation sign-in. Device-level
  evidence for the new screens is **explicitly unverified** in this
  environment (no emulator/device available) and recorded as such in the PR.

## `DRAFT` → `READY`

Set the status at the top to `READY` only when every line here is true.

- [x] Acceptance criteria complete, stable IDs, each mapped to at least one task
- [x] Feature shape matrix complete; every YES justified
- [x] Data contracts verified against `supabase/migrations/*.sql`
- [x] Every generator command mapped to a task
- [x] Manual-only artifacts justified
- [x] Dependencies coherent
- [x] Route mappings known, target screen named
- [x] Changes outside `features/preparation/` listed and justified
- [x] No unnecessary capability or folder planned
