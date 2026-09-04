# Checkout — implementation plan

**HOW the brief gets built.** Written with the `kisok-feature-plan` skill
after research, and before generating anything beyond this workspace.

Status: `READY`

`DRAFT` → no implementation task may start. Set `READY` only when the checklist
at the bottom of this file is fully satisfied. If a material decision changes
later — an acceptance criterion, the shape, a dependency, a scaffold — return
to `DRAFT`, reconcile this file and `todo.md`, then restore `READY`.

The Lead Planning Review pass was completed on this revision: the task table
duplication (former T13/T16) was fixed, T08's dependency corrected (the review
screen renders cart lines directly and does not consume the normalization
rules), and all five control documents were re-read for consistency before
this status change.

There is no fourth gate: `TASK`, `ROUND` and `FEATURE` are the gates. This
status is the implementation-readiness signal.

## Research synthesis

Three Evidence Packets were returned by the research subagents this session
(supabase-contract, flutter-behaviour, ui); the Lead spot-checked every
load-bearing seam personally. Findings, not opinions:

- **Data contract.** The single Customer write path is
  `public.create_order(client_request_id uuid, items jsonb) → jsonb`
  (`supabase/migrations/20260826050007_lean_create_order.sql`; Lead read lines
  40–210 directly). Success JSON `{kind:'success', order_id, display_number,
created_at}`; stock conflict is a **normal JSON return** `{kind:
'stock_conflict', conflicts:[{variant_id, requested_quantity,
available_quantity}]}` (no order created). Exceptions: `42501` (no active
  customer), `K1001` (invalid shape / duplicate variants), `K1002`
  (unavailable variant / missing inventory), `K1003` (same
  `client_request_id` reused by a different actor or with a different
  fingerprint), `K1006` (server failure, rollback semantics). Validation:
  1–100 items, each exactly `{variant_id, quantity}`, quantity an integer
  1..2147483647, duplicate `variant_id`s rejected. Idempotency: unique
  `orders.client_request_id`; server fingerprint
  `'kiosk.checkout.lean.v1'` + sorted `variant_id:quantity` rows; advisory
  xact lock; **same actor + same fingerprint → idempotent success return**,
  checked before catalog/stock validation (a replay succeeds even if the
  variant later went unavailable).
- **Access.** Customer has ZERO direct rows on `orders`, `order_items`,
  `inventory` (`20260826050013_lean_rls_grants.sql` policies; Lead verified).
  `orders` Realtime is admin/preparation-visible only. After submission the
  success payload is the customer's last server contact — the success screen
  MUST render from the locally captured snapshot. No tracking RPC exists.
- **Settings.** `customer_success_reset_seconds integer not null default 25
check (> 0)` (`20260826050002:123–124`; note `> 0`, not `> 1`). It reaches
  the client ONLY inside `get_customer_catalog()`'s `settings` object
  (`20260826050006:99–113`), which can be `{}` when no settings row exists —
  so a client fallback is required. The catalog feature's public index
  currently exports screens only.
- **Cart seam.** `@/features/cart` public API: `useCart()`,
  `getCartSnapshot()`, `addItem/setLineQuantity/removeLine/clearCart/
lockCart/unlockCart/hydrateCart` (Lead read `index.ts`, `use-cart.ts`,
  `cart-store.ts` in full). `clearCart()` is a fire-and-forget `void` delegate
  onto the store's `clear(): Promise<StorageWriteResult>` — the durable result
  EXISTS inside the store but is dropped by the public surface. The store's
  lock blocks user mutations but deliberately NOT the programmatic
  post-success clear (plan decision 5 of the cart feature). `PersistenceStatus`
  (`persisted | memoryOnly | clearFailed`) is honest and observable. `CartLine`
  (`features/cart/model/cart-line.schema.ts`) carries the full display
  snapshot (productDisplayName, variantLabel, optionSelections labels,
  imageUri, quantity, variantId, productId, lineId) — everything the success
  UX and conflict join need, with no prices.
- **Auth seam.** `core/auth` exposes `registerSignOutGuard` /
  `registerSignOutCleanup` / `runSignOutGuards` / `runSignOutCleanup`;
  `docs/state-management.md:158–171` documents checkout as the motivating
  guard example. Guards are side-effect-free; cleanup is separate.
  `useSignOutAction` is the sign-out entry. The fail-closed handoff marker +
  `clearKisokStorage()` emergency reset already cover cleanup-failure cases.
- **Error taxonomy.** `core/errors` `AppError` kinds with `network` =
  "the request never got a definitive answer — see the checkout ambiguity
  rules"; `KISOK_CODE_MAP` covers K1001–K1006 and `42501`. `toAppError`
  classifies by code and by network-failure message pattern — the client
  NEVER branches on raw exception text.
- **Behaviour (Flutter reference, behaviour only).** §17–§19, §32: six
  explicit states (Idle, Submitting, Stock Conflict, Unknown/Ambiguous,
  Failed, Succeeded) — never collapse to `isLoading + error`; attempt built
  in order normalize → fingerprint → id → **durable persist** → call; retry
  after ambiguity reuses the SAME identity; never mint a fresh id because a
  response was lost; success snapshot captured BEFORE cart clear; cart clears
  only after confirmed success; stock conflict keeps the cart with explicit
  correction; countdown from a stored deadline, recomputed on resume;
  stale/direct success route warns against resubmission; Track Order is
  BLOCKED (§21/§34) and must not be ported.
- **UI system.** All primitives exist: `Screen` (constrained 1280),
  `Button/Text/Card/Alert/Badge/Separator`, `BlockingOverlay` (doc comment
  names checkout submission specifically), `EmptyState/ErrorState/
SkeletonList/ConfirmDialog`, `AppImage`, `Progress` (required
  `accessibilityLabel`, doc example "Order resets in 12 seconds"). No
  "ambiguous" semantic token — `warning`/`info` serve it. The Full Cart screen
  is the structural template (edges contract, restore-pending skeleton,
  persistence-warning alerts, non-virtualized ScrollView bounded at 100
  lines, fixed footer, locked-disabled controls). Breakpoints: compact <768,
  medium 768–1023, expanded ≥1024 → 1280×800, 800×1180, 480×900.

Contradictions resolved: `docs/data-and-supabase.md` says customers "may read
nothing directly" while migration 13 grants table-level SELECT — migrations
are authoritative; RLS yields zero rows for customers (effective access as
documented). Migration 07 revokes `create_order` from `authenticated`, then
migration 13 re-grants it — final privilege surface is migration 13 (file
order wins); the deployed catalog feature confirms execution is live.

## Design decisions

- **D1 — One durable attempt record, single key.** The whole attempt
  lifecycle (`unresolved → confirmed`) is ONE record under
  `kisok:checkout:attempt`, owner-scoped, written through `@/core/storage`
  with honest results. Rejected: multiple keys / per-outcome records (more
  states to corrupt, no recovery value for definite outcomes). Definite
  failures and stock conflicts are discarded immediately — only
  `unresolved` (needs recovery) and `confirmed` (success payload + cleanup
  tracker) are durable. The confirmed record doubles as the Order Success
  payload and is removed at the Next Customer reset.
- **D2 — Client fingerprint mirrors the server's canonical form.**
  `variant_id:quantity` rows sorted by `variant_id` (lowercase uuid text —
  the PR #12 cart hardening already canonicalises uuid casing), joined with
  the same separator convention. It never travels to the server (the server
  computes its own); it binds id ↔ logical request locally so a changed cart
  can never silently reuse an identity. Rejected: hashing the raw cart lines
  (would treat display-only drift as a different request and re-mint
  needlessly).
- **D3 — Ambiguity boundary = `AppError.kind`.** AMBIGUOUS (preserve
  attempt, replay same identity): kinds `network` and `unknown`. DEFINITE
  (server answered; resolve and discard attempt): every other kind
  (`validation`, `unavailable`, `forbidden`, `idempotency-conflict`,
  `state-conflict`, `server`, `auth`). Rationale: `toAppError` only produces
  `network` from transport-level failure signatures, and a Postgres error
  response means the server answered; K1006 carries rollback semantics in the
  migration; a 401 means the RPC never executed. Fail-safe direction: what we
  cannot classify as a server answer stays ambiguous. Rejected: sniffing
  exception messages in the screen (the taxonomy exists precisely so we do
  not).
- **D4 — Success ordering: capture → durably confirm → clear.** On a
  validated success response: (1) write the confirmed attempt record
  (snapshot + server fields) durably; (2) then attempt the cart clear through
  the NEW Cart-owned awaitable seam; (3) track cleanup state in the record.
  If (1) fails the attempt stays `unresolved` (a restart replays the same id
  → idempotent re-confirmation; no duplicate possible). If (2) fails the
  order is still CONFIRMED — surface the unsafe cleanup honestly, block the
  reset, retry the clear. Rejected: clearing the cart first (destroys
  recovery evidence before the confirmation is durable).
- **D5 — Cart public seam extension (the smallest the feature request
  anticipated).** Add `clearCartDurable(): Promise<StorageWriteResult>` to
  `@/features/cart` — a thin public delegate onto the store's EXISTING
  `clear()` (which already returns the durable result). Additive, no
  signature change, no store logic duplicated in Checkout. Rejected: (a)
  subscribing to `persistence` transitions to observe the fire-and-forget
  clear (no completion signal — a race, not a proof); (b) deep-importing the
  store (blocked by lint and by boundary discipline); (c) Checkout writing
  the cart's storage key itself (two owners of one key).
- **D6 — Catalog settings seam.** Add a narrow Catalog-owned public hook
  `useCustomerCatalogSettings()` (a thin manual file in
  `features/catalog/queries/` that selects from the EXISTING
  `useCatalog()` query cache) exported from `features/catalog/index.ts`.
  One server-state truth, zero extra RPC calls, no deep imports. Checkout
  derives `seconds = settings.customer_success_reset_seconds ?? 25`. Rejected:
  (a) Checkout calling `get_customer_catalog()` itself (a second fetch of a
  cached server state); (b) exporting the whole `useCatalog` (wider public
  surface than needed); (c) generating a new `query` capability for it (would
  create a second query/RPC path — exactly what must not happen).
- **D7 — Recovery composition.** A Checkout-owned `RecoveryGate` component
  exported from `@/features/checkout` and mounted ONCE in
  `app/(customer)/_layout.tsx` inside `CatalogCartProvider` (so the cart
  hydration owner stays unique). On mount it loads the durable attempt:
  unresolved + same owner → lock cart + render blocking recovery surface +
  auto-replay once with the stored identity; unresolved + foreign owner →
  discard the record without replay (no path from a foreign-owner replay can
  be safe: it would either create the order under the WRONG actor or K1003),
  log, continue; confirmed + cleanup unsafe → lock cart + show the
  recovery-resolution surface (retry clear); confirmed + cleanup safe →
  render the success flow (fresh countdown). Importing `@/features/checkout`
  in the layout is also the module load that registers the sign-out guard
  (the cart feature's own index uses the same side-effect pattern).
  Rejected: recovery living inside the review screen only (correctness would
  depend on that screen having stayed mounted — explicitly forbidden by the
  brief), and a checkout-owned second cart hydration (the
  `CatalogCartProvider` is the one hydration owner).
- **D8 — Checkout state machine owns the critical operation; the store is
  the single phase authority.** The review screen drives submission through
  the generated mutation hook (transport), but every phase transition —
  `review → submitting → {confirmed | stock-conflict | unknown | failed}` —
  is a store action, so the recovery gate and the screens render the SAME
  machine. Rejected: screen-local `isLoading + error` (the Flutter reference
  explicitly forbids collapsing the six states; recovery needs them durable).
- **D9 — Stock conflict joins client-side.** The conflict payload carries
  only `variant_id` + quantities; the panel joins each `variant_id` to the
  LIVE cart lines for names/labels. [Reconciled at Round 3 review R3-04: the
  original wording said the ATTEMPT'S captured snapshots — but the store
  discards the record at the definite conflict resolve (D1), so no capture
  exists at render time; the flight/replay lock guarantees the live lines
  are exactly the submission context. The deviation was accepted by the
  T09/T12 task reviews with exactly that documentation.] Requested vs available
  rendered as words + numbers, never colour alone. No auto-correction, no
  cart mutation. Rejected: re-rendering conflict rows from the catalog (the
  cart snapshot is the submission context; catalog state is irrelevant and
  unreachable post-submit).
- **D10 — Countdown is deadline-based.** `deadline = now + seconds` held in
  the success surface; every render recomputes remaining from
  `Date.now()`; `AppState` active transitions re-check (an expired deadline
  fires immediately on resume); any user interaction resets the deadline.
  The reset action is gated: confirmed + cleanup safe → clear checkout data,
  navigate to customer home; cleanup unsafe → surface warning, do not reset.
  Rejected: `setInterval` tick accumulation (drifts under pause; the
  reference explicitly warns against trusting a paused counter).
- **D11 — K1003 is surfaced, never auto-resolved.** An idempotency conflict
  means an order with this `client_request_id` exists under a different
  actor/fingerprint — our own minting rules make it unreachable in correct
  operation, so it indicates corruption or external reuse: render the honest
  failure, resolve the attempt as failed-with-conflict (discard — the server
  state is definite), never mint a new id to "try again". Rejected: auto
  re-mint (explicitly forbidden by the brief's AC-10 and by the Flutter §18
  rules).
- **D12 — No cross-feature catalog invalidation.** After a successful order,
  the catalog's `is_available` booleans may be stale until the cache
  refetches naturally. Rejected: invalidating catalog keys from Checkout (no
  public invalidation seam exists; constructing another feature's key shape
  is a deep-import in spirit) — noted as out of scope in the brief.
- **D13 — The mutation hook is the screen's transport; the api module is
  the single Supabase door.** `api/submit-order.ts` (generated) is the only
  file calling `create_order`, through `callRpc` with the response schema —
  runtime validation is not optional. The review screen submits via the
  generated `useSubmitOrderMutation` hook around the store's
  prepare/resolve actions; the recovery replay calls the api function
  directly from the store's recovery action (a non-React context). Rejected:
  calling Supabase from the store (ESLint blocks it — `api/` is the door) and
  a second api wrapper for recovery (one contract, one module).
- **D14 — Environment limitation recorded up front.** This Super Z sandbox
  has NO GitHub push credentials (verified: `git push --dry-run` fails
  authentication; no tokens exist in the environment). All local delivery,
  verification, review, and audit proceed normally on `feature/checkout`;
  the Draft PR creation and remote CI evidence steps will be recorded as
  explicitly requiring the human (push the branch, open the PR targeting
  `develop`) rather than fabricated. This is a disposition, not a silent
  skip. If credentials appear later in the session, the PR step runs
  normally.

## Data contract

| RPC / table                                         | Direction                                                                              | Role                                                       | Returns                                         | Migration                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `create_order(client_request_id uuid, items jsonb)` | write (the ONLY backend call)                                                          | active customer (granted `authenticated`; enforced inside) | jsonb: success family or stock_conflict family  | `20260826050007_lean_create_order.sql`     |
| `get_customer_catalog()`                            | read (NOT called by checkout — settings arrive via the Catalog feature's cached query) | active customer                                            | settings incl. `customer_success_reset_seconds` | `20260826050006_lean_customer_catalog.sql` |
| `orders`, `order_items`, `inventory`                | NO direct access                                                                       | customer: zero rows under RLS                              | —                                               | `20260826050013_lean_rls_grants.sql`       |

Realtime: **NO** — `public.orders` is published but RLS gives a customer
session zero rows; the generator rejects `realtime` for role `customer`, and
no Customer tracking exists in this feature.

Error contract (mapped by `core/errors` at the api boundary):
`42501→forbidden`, `K1001→validation`, `K1002→unavailable`,
`K1003→idempotency-conflict`, `K1006→server`; transport failures → `network`
(AMBIGUOUS, see D3); unrecognized → `unknown` (treated ambiguous, D3).

## Feature shape decision

Every capability gets an explicit YES or NO with a reason.

| Capability   | Needed? | Evidence / reason                                                                                                                                                                                               |
| ------------ | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model/schema |     YES | `create_order` returns untyped `jsonb` — needs the Zod boundary (success/stock-conflict discriminated union) plus the durable attempt record schema; two schema tasks                                           |
| query        |      NO | Checkout performs no read; the settings arrive through the Catalog feature's existing query via a thin Catalog-owned seam (D6). Generating a checkout query would invent a read this feature does not have      |
| mutation     |     YES | The write RPC needs its `api/` module (the single Supabase door, D13) + the generated hook the review screen drives                                                                                             |
| store        |     YES | The attempt lifecycle is durable client-owned state that must outlive screens and survive restart — exactly the Zustand + `@/core/storage` contract                                                             |
| component    |     YES | `order-line-row` (read-only line presentation, used by review + success + conflict join) at feature scope; `success-countdown` screen-local to Order Success; `recovery-gate` feature-level session composition |
| screen       |     YES | Order Review and Order Success are the two routed surfaces                                                                                                                                                      |
| realtime     |      NO | customer role; Realtime is Preparation-only and gives a customer zero rows                                                                                                                                      |
| route        |     YES | two new thin routes under `app/(customer)/`                                                                                                                                                                     |

Feature shape class: **mutation / state machine** (per the
`kisok-feature-plan` shape table: schema, mutation, store, careful error
branches).

Routes are planned explicitly, one line each:

```
route path → role/group → target screen → existing placeholder or new file
app/(customer)/checkout.tsx → customer → order-review → new file (nothing occupies it)
app/(customer)/checkout-success.tsx → customer → order-success → new file (nothing occupies it)
```

No `--force`: neither path is a Foundation placeholder. The Review Order
entry into the flow is the Cart screen's CTA (an owning-feature edit), not a
route replacement.

## Generator commands, mapped to tasks

The exact commands, in order, each mapped to the task that uses it. **The Lead
runs each one immediately before delegating that task** — not all of them up
front.

| Generator command                                                                                                                                                                                                            | Task       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `pnpm generate schema checkout create-order-response`                                                                                                                                                                        | T01        |
| `pnpm generate schema checkout checkout-attempt`                                                                                                                                                                             | T03        |
| `pnpm generate mutation checkout submit-order`                                                                                                                                                                               | T04        |
| `pnpm generate store checkout attempt`                                                                                                                                                                                       | T06        |
| `pnpm generate component checkout order-line-row`                                                                                                                                                                            | T08        |
| `pnpm generate screen checkout order-review`                                                                                                                                                                                 | T08        |
| `pnpm generate screen checkout order-success`                                                                                                                                                                                | T11        |
| `pnpm generate component checkout success-countdown --screen=order-success`                                                                                                                                                  | T11        |
| `pnpm generate component checkout recovery-gate`                                                                                                                                                                             | T12        |
| (promoted, not generated: `components/conflict-row.tsx` — the F-T12-03 review remediation: two real consumers appeared, so the row moved from screen-local copies to the feature level per the design-system ownership rule) | T12 review |
| `pnpm generate route checkout checkout --role=customer --screen=order-review`                                                                                                                                                | T13        |
| `pnpm generate route checkout checkout-success --role=customer --screen=order-success`                                                                                                                                       | T13        |

Allowed manual files (with the reason no capability fits):

- `features/checkout/model/normalized-request.ts` (+ colocated test) — pure
  domain rules mapping Cart lines → unique-variant RPC items + the client
  fingerprint (D2); a mapper/predicate, not a payload schema.
- `features/checkout/state/sign-out-cleanup.ts` — guard + cleanup
  registration following the cart feature's established module side-effect
  pattern; no capability produces feature lifecycle registration.
- `features/checkout/checkout-journey.test.tsx` — the customer-journey
  integration test (feature root, mirroring the integration feature's
  `convergence.test.tsx` precedent).
- `features/catalog/queries/use-customer-settings.ts` (+ test) — the thin
  settings selector over the EXISTING catalog query (D6); generating a
  `query` capability would create a second RPC path, which D6 rejects.
- Edits to existing files (not new artifacts): `features/cart/index.ts`,
  `features/cart/state/use-cart.ts` (`clearCartDurable` delegate, D5),
  `features/cart/screens/full-cart/full-cart-screen.tsx` (+ test) for the
  Review Order CTA, `features/catalog/index.ts` (export the seam),
  `app/(customer)/_layout.tsx` (mount the recovery gate, D7).

## Files expected to change

Anything outside `features/checkout/` must be listed and justified — shared
files are where parallel agents collide.

- `features/checkout/…` — the feature (all capabilities + manual files above).
- `app/(customer)/checkout.tsx`, `app/(customer)/checkout-success.tsx` — NEW
  thin route files (generator-owned; the standard one-file-per-route
  registration).
- `app/(customer)/_layout.tsx` — mount `<RecoveryGate>` inside
  `CatalogCartProvider` (D7). Two-line change + import; justified by the
  brief's recovery requirement — correctness must not depend on the checkout
  screen having remained mounted.
- `features/cart/index.ts`, `features/cart/state/use-cart.ts` — additive
  public `clearCartDurable()` (D5); no existing signature changes.
- `features/cart/screens/full-cart/full-cart-screen.tsx` (+ its test) — the
  Review Order CTA (AC-01): an owning-feature edit the brief explicitly
  scopes ("A Checkout entry from Cart is an expected cross-feature
  integration seam").
- `features/catalog-cart-integration/components/catalog-cart-provider.test.tsx`
  and `features/catalog-cart-integration/convergence.test.tsx` — thin-mount
  pin refreshes + positive RecoveryGate mount pins (added at T12 review:
  the layout now imports `@/features/checkout`, which those pins police;
  checkout plan D7 listed the layout edit).
- `features/catalog/index.ts`, `features/catalog/queries/use-customer-settings.ts`
  (+ test) — the narrow settings seam (D6, AC-14).
- `core/testing/query.tsx` — ONE shared test-infra option (added at T09):
  `mutations: { gcTime: Infinity }` on the shared test QueryClient. Root
  cause (verified): a completed mutation schedules a 5-minute GC setTimeout
  when its last observer unmounts (RNTL cleanup runs after the file's
  afterEach destroy loop), keeping jest alive invisibly. Additive,
  test-only, mirrors the file's own queries rationale. [Reconciled into
  this list at the final review — F-FR-01.]
- Shared `core/` / `components/` files: otherwise **none** — no new shared
  primitives
  (the UI research confirmed everything needed exists).

## Required skills

- `test-driven-development` — every task
- `kisok-design-system` — T08, T09, T11, T12, T14 (all UI work)
- `kisok-react-native-rules` — T08/T09 (bounded list rendering), T11
  (countdown/interval/AppState concerns)
- `expo-router` — T12 (layout composition), T13 (routes), T14 (navigation)
- `supabase` — T01, T04 (RPC contract + runtime validation)
- Lead-only: `feature-delivery`, `kisok-feature-plan` (already loaded),
  `kisok-code-review` (review phase), `kisok-quality-audit` (audit phase)

## Test strategy

What is worth a test and why — behaviour, contracts, state transitions,
safety invariants, accessibility. Deterministic suites run in Jest +
@testing-library/react-native with the repo's `renderWithProviders`,
`installMockAuth`, `createMemoryStore` (incl. `failOn`), and api-module
mocking conventions.

- **Normalization (T02):** cart lines sharing a `variantId` (different option
  selections, different uuid casing) merge into ONE item with summed
  quantity; same logical cart → byte-identical request + fingerprint; item
  shape is exactly two keys; >100 distinct variants and non-positive
  quantities rejected.
- **Response contract (T01/T04):** discriminated union parses both families;
  rejects wrong `kind`, missing fields, non-uuid ids; the api module maps
  each K-code/SQLSTATE to the expected `AppError` kind; transport failures
  map to `network`.
- **Attempt lifecycle (T06):** durable write BEFORE submit (write failure
  aborts submission — AC-06); unresolved survives store recreation
  (restart); same-fingerprint retry reuses the id; changed fingerprint
  refuses reuse; success ordering capture→confirm→clear (D4); clear-failure
  keeps the confirmed record and blocks reset; definite outcomes discard;
  K1003 surfaces without re-minting (D11); foreign-owner recovery discard
  (D7).
- **Sign-out integration (T07):** guard returns `blocked` with reason while
  unresolved, `ok` otherwise; the guard mutates nothing; cleanup clears
  checkout keys after resolution.
- **Cart seam (T05):** `clearCartDurable` resolves the store's real durable
  result; remove-failure exercises the fallback path with
  `createMemoryStore({ failOn: "removeItem" })` (the exact scenario the
  memory store exists for).
- **Screens (T08/T09/T11):** review renders lines/summary from the cart
  snapshot, no prices, back navigation, restore-pending/empty/persistence
  states, disabled-while-locked; duplicate submit suppressed; conflict panel
  joins names + requested/available; unknown panel ≠ failure panel; success
  renders the confirmed record (display number mono, items, Next Customer);
  stale route shows the escape state; countdown: setting value, 25 fallback,
  interaction restart, resume recompute (fake timers + AppState);
  reset blocked while cleanup unsafe.
- **Recovery (T12):** remount with an unresolved record locks the cart and
  shows the recovery surface; auto-replay uses the stored identity;
  foreign-owner record discarded without RPC.
- **Cross-feature edits (T10, T14):** Review Order CTA disabled in
  restore-pending/empty/locked, navigates to `/checkout`; settings hook
  returns cached settings and `{}` → undefined.
- **Journey (T15):** one test drives cart → review → confirm (mocked api) →
  success → next-customer reset with real providers mounted — the state
  machine, screens, and composition proven together.
- **Accessibility:** every interactive element queried by role/name; the
  submitting overlay and outcome panels announced (`role="alert"` /
  live regions from the primitives); countdown `accessibilityLabel` with
  remaining time; no colour-only meaning (words + numbers on conflicts).

Not tested: styling/snapshot assertions, unreachable states (a "loading
order" state on success), anything requiring the hosted project
(deterministic suites never touch the network).

## Rounds and tasks

Group tasks so each round leaves the feature coherent. Every task is atomic:
CLASSIFY → RED / BASELINE → IMPLEMENT → GREEN → AFFECTED CHECKS → DIFF REVIEW → GATE.

### Round 1 — domain model & contract

| Task | Mode     | Acceptance                            | Objective                                                                                           | Depends on | Entry evidence                                                      |
| ---- | -------- | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| T01  | behavior | Supporting AC-07, AC-08               | `create-order-response` Zod schema (discriminated union)                                            | —          | failing test: rejects a payload with an unknown `kind`              |
| T02  | behavior | Acceptance: AC-05                     | `normalized-request` pure rules: cart lines → unique-variant items + client fingerprint             | —          | failing test: two lines sharing a variant produce one summed item   |
| T03  | behavior | Supporting AC-06, AC-07               | `checkout-attempt` record schema (unresolved/confirmed lifecycle payload)                           | T02        | failing test: rejects a record missing `clientRequestId`            |
| T04  | behavior | Supporting AC-07, AC-08, AC-09, AC-10 | `submit-order` api module + generated mutation hook: `callRpc` + runtime validation + error mapping | T01        | failing test: a K1003 PostgrestError maps to `idempotency-conflict` |

### Round 2 — attempt lifecycle & safety

| Task | Mode     | Acceptance                                    | Objective                                                                                                                                                                                       | Depends on         | Entry evidence                                                                    |
| ---- | -------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| T05  | behavior | Supporting AC-07, AC-11                       | Cart public `clearCartDurable()` extension (owning-feature edit)                                                                                                                                | —                  | failing test: the awaited result reports the honest durable status                |
| T06  | behavior | Acceptance: AC-04, AC-06, AC-09, AC-10, AC-11 | Checkout attempt store: the state machine + durable lifecycle (prepare/persist-before-submit, resolve outcomes, confirmed-before-clear, cleanup tracking, recovery load, foreign-owner discard) | T02, T03, T04, T05 | failing test: submission does not reach the api until the attempt write persisted |
| T07  | behavior | Acceptance: AC-12                             | Sign-out guard + cleanup registration (module side-effect)                                                                                                                                      | T06                | failing test: guard returns `blocked` while an attempt is unresolved              |

### Round 3 — surfaces

| Task | Mode     | Acceptance                             | Objective                                                                                                                                                                                                 | Depends on    | Entry evidence                                                                                                 |
| ---- | -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| T08  | behavior | Acceptance: AC-02, AC-03               | Order Review screen + `order-line-row`: content states (restore-pending, empty escape, persistence warnings, populated rows + summary, Back to Cart)                                                      | —             | failing test: populated review renders rows and the totals summary; no price text                              |
| T09  | behavior | Acceptance: AC-04, AC-08, AC-09, AC-10 | Review submission flow: confirm → submitting (lock, overlay, duplicate suppression) → outcome panels (conflict join, unknown retry-same-id, definite failure)                                             | T04, T06, T08 | failing test: a second confirm press while in flight makes no second api call                                  |
| T10  | behavior | Supporting AC-14                       | Catalog settings seam (`useCustomerCatalogSettings`) (owning-feature edit)                                                                                                                                | —             | failing test: the hook returns the cached settings object, `undefined` when `{}`                               |
| T11  | behavior | Acceptance: AC-07, AC-14, AC-15        | Order Success screen + screen-local `success-countdown`: confirmed content from the record, stale-route escape, countdown (setting/fallback, interaction restart, resume recompute), Next Customer gating | T06, T08, T10 | failing test: success renders display number + submitted items from the record; stale route renders the escape |
| T12  | behavior | Acceptance: AC-13, Supporting AC-12    | `recovery-gate` component + customer layout mounting: restart recovery, auto-replay once, foreign-owner discard, confirmed-with-unsafe-cleanup resolution                                                 | T06, T07      | failing test: mounting with a persisted unresolved attempt locks the cart and renders the recovery surface     |

### Round 4 — routes, entry & journey

| Task | Mode     | Acceptance        | Objective                                                                                                                        | Depends on              | Entry evidence                                                                                             |
| ---- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| T13  | config   | N/A — routing     | Generate both routes (thin files, screens exported through the public index)                                                     | T08, T11                | `pnpm web` resolves `/checkout` and `/checkout-success`; routes stay thin                                  |
| T14  | behavior | Acceptance: AC-01 | Full Cart Review Order CTA (owning-feature edit): enabled only when hydrated + populated + unlocked, navigates to `/checkout`    | T13                     | failing test: the CTA is disabled in restore-pending/empty/locked presentations and navigates when enabled |
| T15  | behavior | Acceptance: AC-16 | Customer journey integration test (cart → review → confirm → success → next-customer reset) with real providers and a mocked api | T09, T11, T12, T13, T14 | failing test: the full journey drives the real store + screens to the reset state                          |

Round 4 gate additionally runs the full `pnpm verify` and the browser
runtime evidence pass (see Verification).

Task granularity follows **capability** granularity: T04 is the mutation
pipeline (api + hook + keys), T06 is the store, T08 is screen + its row
component. Splitting a scaffold's output by file would produce slices that
cannot be verified independently.

## Risks

| Risk                                                                           | Likelihood                                                             | Mitigation                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage write failure timing (attempt must be durable BEFORE the RPC)          | medium (storage failures are rare but the ordering is the safety core) | T06 RED proof + `failOn` write-failure test; the store refuses to submit on a rejected write (AC-06)                                                                                                           |
| Ambiguity misclassification (a definite error treated ambiguous or vice versa) | medium                                                                 | D3's kind-based boundary is centralized in the store's resolver; every kind has a dedicated test (T04/T06); the fail-safe direction is "unclassifiable → ambiguous"                                            |
| Recovery race (user interacts before the async attempt read completes)         | low                                                                    | Correctness is owned by the idempotency identity, not the lock: any new submission is refused while an unresolved record exists; the lock minimizes the window (D7)                                            |
| Cart lock state lost on restart (lock is in-memory only)                       | certain by design, harmless                                            | The recovery gate re-locks from the durable record; the attempt identity, not the lock, is the duplicate-order barrier                                                                                         |
| K1003 arriving despite minting discipline                                      | low (indicates corruption)                                             | D11: surfaced honestly, no auto re-mint; treated as a definite outcome                                                                                                                                         |
| Merge pressure from parallel PRs (#6/#7/#9)                                    | medium                                                                 | Feature-local scope + six explicitly justified external touch points; `develop` re-fetch + integration before final verification per the develop-integration rule                                              |
| Hosted TEST data drift (variants unavailable, zero-stock catalog)              | medium                                                                 | The journey only needs ANY two addable variants; if the catalog cannot support a live order, record honestly and rely on the deterministic journey (the hosted account is documented in `docs/environment.md`) |
| No push credentials in this sandbox (D14)                                      | certain (verified)                                                     | All evidence collected locally on `feature/checkout`; Draft PR + remote CI recorded as explicit handoff actions for the human; nothing fabricated                                                              |
| Countdown drift/accuracy                                                       | low                                                                    | Deadline-based recomputation (D10), fake-timer tests for restart/resume                                                                                                                                        |

## Verification

- `pnpm verify` (typecheck, lint, format, jest ci, docs check, commit check,
  e2e appid check, ci-scripts check, db:verify, generator smoke) after the
  final local change — and per affected checks after every task.
- **Browser runtime evidence** with `pnpm web` against the committed hosted
  TEST project (`docs/environment.md`): sign in as the documented Customer
  account; populate a real cart from the real catalog; Review; submit a REAL
  `create_order` (a small number of test orders is the intended mutation
  footprint); confirm the success screen shows the real display number;
  confirm the cart clears only after success; exercise Next Customer reset
  to a clean customer home; verify zero console errors/warnings at 1280×800,
  800×1180, 480×900. Same-request idempotent replay exercised live when
  feasible (e.g., simulating a transport cut via the browser's offline
  control during submission, then recovering with the same identity);
  otherwise recorded as covered by deterministic tests only. A live stock
  conflict is recorded separately if it can be produced without destructive
  setup; never forced.
- **Native tier:** no Android device/emulator exists in this environment —
  Android and Maestro evidence will be explicitly recorded as UNVERIFIED
  (per the workflow's PASS / N/A / UNVERIFIED rule), never equated with
  browser evidence.
- **Fast GitHub CI on final HEAD:** requires the pushed PR — per D14 this is
  an explicit handoff action; local `pnpm verify` is the strongest available
  substitute and is run on the exact final HEAD.

## `DRAFT` → `READY`

Set the status at the top to `READY` only when every line here is true.

- [x] Acceptance criteria complete, stable IDs, each mapped to at least one task
- [x] Feature shape matrix complete; every YES justified
- [x] Data contracts verified against `supabase/migrations/*.sql`
- [x] Every generator command mapped to a task
- [x] Manual-only artifacts justified
- [x] Dependencies coherent
- [x] Route mappings known, target screen named
- [x] Changes outside `features/checkout/` listed and justified
- [x] No unnecessary capability or folder planned
