# Preparation — brief

**WHAT this feature is, and how we will know it is done.** No implementation
sequencing here; that belongs in `plan.md`.

Status: `COMPLETE` — every TODO was replaced before implementation; the
plan is READY and the feature is delivered (see the worklog for evidence).

## Objective

A preparation employee signs in on a store tablet and runs the whole
order-fulfilment workflow: they see every active order on one operational
board, start preparation on a new order (which claims it to them), mark their
own preparing orders ready, cancel eligible orders, inspect any order's
immutable item snapshot, and review the current store day's completed and
cancelled orders — with live updates arriving as the orders change.

## User-visible behaviour

A signed-in `preparation` employee lands on the **Preparation Workspace**: a
board of active orders grouped into **New**, **Preparing** and **Ready**, each
group with its count. On a landscape tablet the three groups stand side by
side; on a portrait tablet or narrow web they become three tabs. Each order
card shows the order's display number prominently, when it was created, an
item summary, its status, whether it is assigned to the signed-in employee or
someone else, and the next allowed action. Cards open **Order Details**.

- A **new** order offers **Start preparing** — success moves it to Preparing
  and assigns it to the signed-in employee.
- A **preparing** order assigned to the signed-in employee offers **Mark
  ready** — success moves it to Ready. Orders assigned to a colleague show the
  assignment but no Mark-ready action.
- A **new** or **preparing** order offers **Cancel** behind a destructive
  confirmation — success cancels it.
- A **ready** order is visible on the board but has no preparation action
  (completion is the Admin web app's job, not the tablet's).

**Order Details** shows the order's display number, status, created time in
the store's timezone, the assignment indicator, the same allowed actions, and
the item list exactly as captured when the order was placed — product name,
variant label and options, brand, quantity, and image where one was captured.
Details opened from history are inspection-only because their orders are
terminal. A failed fetch shows an unavailable state instead of stale content.

**History** (reached from the workspace) shows the current store day's
terminal orders — grouped **Completed** and **Cancelled** under a date header
derived from the store timezone — read-only, with an empty state when the day
has no terminal orders yet.

While the workspace is open, changes to orders (new order placed, another
employee's action, admin completion) arrive via Realtime and refresh the board
by refetching — the rendered truth is always the query result, never the
Realtime payload.

## Acceptance criteria

Each one must be observable and checkable. These become tests.

**IDs are stable.** Every task in `plan.md` links to one by ID. Once the plan is
`READY`, never renumber or reuse an ID: a new criterion gets a new ID, and a
removed one stays here marked superseded, with the reason. Renumbering silently
invalidates every reference in `worklog.md`.

| ID    | Criterion                                                                                                                                                                                                                                                                                                                                          | Observable how                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | The preparation home route renders the live workspace board (replacing the Foundation placeholder): active orders grouped **New / Preparing / Ready**, one count per group.                                                                                                                                                                        | Runtime: sign in as the preparation test account, land on the board; component test: three groups with correct membership and counts.                  |
| AC-02 | The board read handles its reachable states: loading skeleton on first fetch, empty state when no active orders exist, error state with retry when the read fails.                                                                                                                                                                                 | Component test with a mocked `api/` module: each state renders; retry re-attempts the read.                                                            |
| AC-03 | An order card shows the display number prominently, the created time, an item summary, its status badge, an assignment indicator ("you" vs "another employee" by id comparison), the allowed actions for its state, and opens Order Details when pressed.                                                                                          | Component test on `order-card` + workspace test: content, actions per status, press handler; read-only mode (history) hides actions.                   |
| AC-04 | **Start preparing** on an eligible new (unassigned) order succeeds: the order is claimed to the signed-in employee and moves to Preparing. While the mutation is pending the action is disabled and repeat presses are ignored.                                                                                                                    | Component/hook tests with mocked mutation: call, pending disable, repeat-guard; live runtime if suitable test data exists.                             |
| AC-05 | **Mark ready** is offered only for a preparing order assigned to the signed-in employee; success moves it to Ready. A preparing order assigned to another employee shows the assignment but no Mark-ready action.                                                                                                                                  | Component test with both assignment cases; model rule test mirroring migration 08.                                                                     |
| AC-06 | **Cancel** on an eligible new or preparing order asks for destructive confirmation, then cancels the order. A server rejection is surfaced as feedback, never silently ignored. The client never cancels a ready/terminal order.                                                                                                                   | Component test on the cancel dialog + card; model rule test: `ready`/`completed`/`cancelled` are never cancel-eligible.                                |
| AC-07 | **Order Details** (reached from board and history) renders the immutable order-item snapshot (product name, variant label, options, brand, quantity, image when present), order metadata, status, the allowed actions for its current state, and a back action; a failed fetch shows an unavailable state; terminal orders render inspection-only. | Component test with a mocked order: snapshot fields, quantity prominence, image alt text, actions per state, back handler, unavailable state on error. |
| AC-08 | **History** (reached from the workspace) shows the current store day's terminal orders grouped Completed and Cancelled under a date header derived from the store timezone, read-only, with a per-day empty state.                                                                                                                                 | Component test with mocked terminal orders spanning the day boundary: only in-day terminal orders appear, grouped correctly, no action buttons.        |
| AC-09 | A change to `orders` invalidates the feature's queries and the board refetches; the rendered state always comes from the query result, never from the Realtime payload.                                                                                                                                                                            | Hook test: realtime event → query invalidation/refetch; runtime: a real order change refreshes the open board.                                         |
| AC-10 | When the server rejects a transition (state conflict, forbidden), the UI shows feedback near the action and refreshes the affected data — the client never fabricates a transition or silently swallows the failure.                                                                                                                               | Component test: mocked K1004/42501 mutation failure renders inline feedback and triggers invalidation/refetch.                                         |

State requirements are **capability-aware**. Put a state into an AC only when
that feature can actually reach it — inventing an empty state for a screen that
cannot be empty produces a test asserting something impossible.

| If the feature has… | The states to specify                                           |
| ------------------- | --------------------------------------------------------------- |
| a data-backed read  | loading, empty, error with retry, success — only as applicable  |
| a mutation          | pending, success, business conflict, error — only as applicable |

## General delivery requirements

These are Definition-of-Done checks, not extra Acceptance Criteria, so they do
not get fake AC IDs and tasks do not link to them as if they described product
behaviour.

- [ ] Applicable read/mutation states above are handled.
- [ ] Works at the tablet sizes in `docs/design-system.md` (landscape and portrait).
- [ ] Accessible: roles and labels on interactive elements; no colour-only meaning.

## Scope

- `features/preparation/**` — model rules, api reads, the one RPC write, query
  hooks, realtime invalidation, board card / badge / cancel-dialog components,
  three screens.
- Three routes under `app/(preparation)/`: the home route (a deliberate
  one-time replacement of the Foundation placeholder), an order-details route,
  and a history route.
- Reads: `orders`, `order_items` (embedded), `store_settings` — the direct
  reads the preparation role is granted.
- Write: `update_order_status` — the controlled order-state RPC, for
  new→preparing, preparing→ready, and cancellation.
- Realtime: `public.orders` changes → query invalidation.

## Out of scope

Be explicit. This is what stops a feature growing while it is being built.

- Prices, payments, delivery, shipping, public signup, social login — permanent
  product boundaries, not deferrals. See `docs/product-boundaries.md`.
- Admin completion of ready orders (Ready→Completed) — Admin is the separate
  web app; the tablet never completes orders.
- Customer Catalog, Cart, Checkout, customer order tracking — parallel or
  separate features; no code sharing beyond public APIs.
- **Assignee display names.** `profiles` is unreadable to `authenticated`, and
  no RPC resolves another employee's uuid to a name. The board shows "you" vs
  "another employee" by id comparison. Showing real names needs a deliberate
  backend decision (see `plan.md` risks) — not a client workaround.
- **Re-assignment / un-assignment / handover** between employees — no such
  transition exists in the contract; once claimed, an order ends only by
  cancellation (or admin completion).
- **Cancellation reason capture** — the RPC accepts a `reason`, but no product
  behaviour evidence describes a reason-capture UX. This feature confirms
  destructively and passes no reason. Adding reason capture later is a small,
  additive change.
- **Past-day history browsing / date picker** — current product behaviour is
  the current store day only.
- Sounds, toasts, badges beyond per-group counts, and new-order alerts beyond
  a polite accessibility announcement — no evidence in the product reference;
  deliberately not invented.
- Virtualization of the board or history lists — not warranted at realistic
  store-day volume (ADR-0011 resolved blanket virtualization against KISOK's
  needs).
- Any change to RLS, grants, migrations, generated database types, or shared
  `core/**` / `components/**` files.

## Constraints

- Backend contracts come from `supabase/migrations/*.sql`. If an RPC you need
  does not exist there, STOP and raise it — do not invent one.
- Never weaken RLS, add a grant, or write a security-definer workaround.
- `update_order_status` is the only order-state write path; the client renders
  action buttons as UX hints but the RPC is the authority — a rejected
  transition is surfaced, never retried blindly or fabricated locally.
- Order item labels, options, and images come from the immutable
  `order_items` snapshot — never reconstructed from current catalog rows
  (which are additionally unreadable to this role).
- Realtime is an invalidation signal only; the rendered truth is the query
  refetch.
- Direct table reads use the generated `Tables<>` types and are not
  Zod-revalidated; the `update_order_status` jsonb result IS Zod-validated
  through `callRpc`.
- `store_settings.store_timezone` defines the operational store day and the
  displayed order times; if the settings row is absent the screens degrade to
  the device timezone rather than failing.
- Tablet-first: touch targets ≥ 48dp, portrait/landscape/compact-web layouts,
  accessible names and announced states, text scaling without clipping.

## Evidence

Link what this brief is based on: migration files, the Flutter reference for
BEHAVIOUR only, existing screens, research findings.

- `supabase/migrations/20260826050004_lean_inventory_orders_schema.sql` —
  `orders` and `order_items` columns, status enum, immutability trigger,
  indexes.
- `supabase/migrations/20260826050008_lean_order_operations.sql` —
  `update_order_status` signature, allowed transitions, assignment and
  cancellation rules, returned projection, error codes.
- `supabase/migrations/20260826050013_lean_rls_grants.sql` — preparation
  direct-read policies; `profiles` revoked.
- `supabase/migrations/20260826050012_lean_realtime.sql` — `public.orders`
  publication.
- `supabase/migrations/20260826050002_lean_identity_media_settings.sql` —
  `store_settings.store_timezone`.
- `KISOK_FLUTTER_PRODUCT_REFERENCE.md` §22–§26, §34 — Preparation workspace,
  actions matrix, details, history, realtime semantics, story list
  (behaviour only).
- `docs/data-and-supabase.md` — direct-read pattern, `callRpc` validation,
  realtime invalidation pattern.
- `components/app/ui-lab.tsx` — status badge mapping and board tab precedent.
- Research Evidence Packets (supabase-contract-researcher
  agent-4094b702, flutter-behavior-researcher agent-9a76d3bb, ui-researcher
  agent-4c6d555e), spot-checked by the Lead against the migrations above.
