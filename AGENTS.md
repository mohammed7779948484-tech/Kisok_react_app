# AGENTS.md — how to work in this repository

The operating manual for anyone, human or AI, implementing features in KISOK.
Read this before writing code. [`CLAUDE.md`](./CLAUDE.md) is the short
always-loaded version; this file is the detail.

---

## 1. What KISOK is

A **private in-store catalog and ordering system** on store-owned Android
tablets. A customer browses the catalog, picks product variants, builds a local
cart, and submits one order. A preparation employee sees active orders and moves
them through the fulfilment workflow.

Two experiences share one client:

| Role          | Experience                                     | Route group          |
| ------------- | ---------------------------------------------- | -------------------- |
| `customer`    | Browse, cart, checkout, order success          | `app/(customer)/`    |
| `preparation` | Active order board, order details, history     | `app/(preparation)/` |
| `admin`       | **Not in this app.** Separate web application. | —                    |

### Hard product boundaries

These are deliberate. Do not add them "for completeness":

- No prices, subtotals, or any financial UI
- No payments, checkout charging, delivery, or shipping
- No public signup, onboarding, social login, or account creation from the tablet
- No catalog editing from the tablet
- No public/outside-store ordering

Accounts are provisioned by an administrator in the web admin app.

---

## 2. Source of truth

1. **`supabase/migrations/*.sql`** — authoritative for schema, columns,
   relationships, RPC signatures, RLS, grants, and Realtime.
2. **This repository** — architecture and conventions.
3. **`KISOK_FLUTTER_PRODUCT_REFERENCE.md`** — product behaviour and safety
   invariants only.

### ⚠️ The Flutter reference is a legacy behavioural document

The Flutter app was built against an **older database**. Tables, fields,
relationships, and RPCs have since changed. Use it to understand _what users
need and which reliability guarantees matter_. Never take a data contract from
it.

The most common trap: Flutter models a `Flavor`. **There is no `Flavor`.** The
current model is generic:

```
Product → ProductVariant → (option_type, option_value) pairs
```

Use `variant`, `variantId`, `variantOptions`. A variant's display label comes
from `title_override`, or from its ordered option values.

---

## 3. Architecture

```
app/            Expo Router routes. Thin: routing and composition only.
features/       Vertical slices. Each owns its api, state, UI, and tests.
core/           Shared foundation: supabase, query, auth, errors, logging,
                storage, env, responsive, testing.
components/     Shared design system and UX states.
ignite/         The feature generator.
supabase/       Database migrations — the data contract.
docs/           Detailed documentation and decision records.
```

Full rationale: [`docs/architecture.md`](./docs/architecture.md).

### Feature anatomy

```
features/<name>/
├── index.ts          Public API — the ONLY thing others may import
├── TODO.md           Your working memory for this feature
├── api/              The only place that calls Supabase
├── queries/          TanStack Query hooks + query keys
├── state/            Zustand store (client-owned state only)
├── schemas/          Zod schemas validating RPC payloads
├── components/       Presentational, feature-private
├── screens/          Composed screens
└── __tests__/        Colocated tests
```

### The five boundary rules

These are enforced by ESLint, not just documented. A violation is a build
failure, and the fix is to move the code — not to add a disable comment.

1. **Routes are thin.** `app/**` may not import Supabase, Zustand, or TanStack
   Query. A route renders a feature's screen and passes params.
2. **UI never touches the network.** Screens and components may not import the
   Supabase client. Data access lives in `api/`, exposed through a query hook.
3. **Features are private by default.** Import another feature only through
   `@/features/<name>`. Deep imports are blocked. Inside a feature, use relative
   imports.
4. **Server state lives in TanStack Query. Client state lives in Zustand.**
   Never mirror database data into a store.
5. **Legacy stacks stay gone.** tRPC, Drizzle, MySQL, Express, and axios are
   blocked at the lint level.

### Why the boundaries exist

Several agents work from this `main` in parallel. The architecture is optimised
so that adding a feature touches **only that feature's directory plus one new
route file**. There is no central feature registry, no global barrel, no shared
route map, and no central query-key file — because every one of those would be a
merge conflict on every PR.

If you find yourself editing a shared file, stop and ask whether the design can
put that decision inside your feature instead.

---

## 4. Supabase rules

Read [`docs/data-and-supabase.md`](./docs/data-and-supabase.md) before writing
data code. The essentials:

**Available to this client:**

| RPC                                                    | Who                   | Purpose                                  |
| ------------------------------------------------------ | --------------------- | ---------------------------------------- |
| `current_active_profile()`                             | any signed-in         | identity; returns 0 rows if inactive     |
| `get_customer_catalog()`                               | active `customer`     | the whole customer-safe catalog snapshot |
| `create_order(client_request_id, items)`               | active `customer`     | atomic, idempotent checkout              |
| `update_order_status(order_id, target_status, reason)` | `preparation`/`admin` | order transition                         |

**Direct table reads:** `preparation` may `select` from `orders` and
`order_items`. **A customer may not read any table directly** — everything comes
through `get_customer_catalog()`.

**Rules:**

- Read the migration before you code against a contract.
- Every RPC returns `jsonb`, which types as the wide `Json`. **Validate with a
  Zod schema** at the `api/` boundary — that is what makes the data trustworthy.
- Let `callRpc` map failures to `AppError`. Do not inspect Postgres codes in a
  screen.
- Realtime is an **invalidation signal**, never a second source of truth.
  Only `public.orders` is published, and RLS applies.
- The server owns correctness for checkout: idempotency, stock locking,
  inventory ledger, immutable snapshots. **Do not reimplement any of it in
  JavaScript.**

---

## 5. Errors, logging, state

- **Errors:** convert everything to `AppError` at the `api/` boundary
  (`toAppError`). Branch on `error.kind` in UI. Render `error.userMessage`;
  never render `technicalMessage`. Never write
  `try/catch → console.log → Alert`.
- **Logging:** `createLogger("scope")` from `@/core/logging`. `console` is a
  lint error everywhere else. Never log tokens, passwords, or keys.
- **Server state:** TanStack Query. Query keys live in your feature.
- **Client state:** Zustand + `@/core/storage`. If state must be durable,
  surface a failed write — see [`docs/state-management.md`](./docs/state-management.md).

---

## 6. UI and design system

- Compose from `@/components/ui` and `@/components/feedback`. Do not build a
  one-off button, card, or dialog.
- Use **semantic token classes** (`bg-primary`, `text-muted-foreground`,
  `border-border`). Never a raw hex value or an arbitrary pixel dimension that
  should be a token.
- Minimum touch target **48dp** (`h-touch`).
- Every screen handles **loading, empty, error, retry** — not just the happy path.
- Check **tablet portrait, tablet landscape, and a narrow web width**.
- Accessibility is not optional: accessible names, announced state, text
  scaling, no hover-only actions.

Inspect everything at `/ui-lab` in a dev build. Details:
[`docs/design-system.md`](./docs/design-system.md).

---

## 7. Feature workflow

```bash
pnpm ignite feature catalog --role=customer
```

Then:

1. **Read `features/catalog/TODO.md`** and expand it into a concrete plan.
2. **Read the relevant migration** and write the Zod schema for the real payload.
3. **Write failing tests first** where the behaviour is testable. Confirm they
   fail for the _intended_ reason.
4. **Implement.** Do not weaken a test to make it pass.
5. **Update the TODO as you go**, with evidence — a test name, a command, a
   screen and state you actually looked at.
6. **`pnpm verify`.**
7. Open a focused PR.

Full walkthrough: [`docs/feature-workflow.md`](./docs/feature-workflow.md).
Generator reference: [`IGNITE.md`](./IGNITE.md).

### Changing the architecture

The foundation is shared. If you believe a `core/`, `components/`, or config
change is genuinely needed:

1. Confirm it cannot live inside your feature.
2. Make it additive — do not change an existing signature other features use.
3. Say so explicitly in your PR description, and list every shared file touched.
4. If it is a significant decision, add an ADR under `docs/adr/`.

---

## 8. Definition of Done

A feature is done when **all** of these are true:

**Product**

- [ ] Every user story in the TODO is implemented
- [ ] Loading, empty, error, and retry states exist
- [ ] No forbidden scope introduced (prices, payments, signup, …)

**Architecture**

- [ ] Feature owns its api/state/UI; no business logic in a route
- [ ] No Supabase call from a screen or component
- [ ] Cross-feature imports go through public APIs
- [ ] Shared files touched: ideally zero, and each one justified in the PR

**Data**

- [ ] Contract checked against the migration, not assumed
- [ ] RPC payloads validated with Zod
- [ ] No RLS bypass, no new grant, no invented contract
- [ ] Realtime used as a signal only

**UI**

- [ ] Design-system components and semantic tokens only
- [ ] Touch targets ≥ 48dp
- [ ] Portrait, landscape, and narrow web checked
- [ ] Accessible names and announced states
- [ ] Text scaling does not clip

**Verification**

- [ ] `pnpm verify` passes
- [ ] Screen opened in a browser and interacted with
- [ ] Android verified, or explicitly noted as unverified
- [ ] `TODO.md` updated with evidence; nothing ticked without it

**Reliability**

- [ ] Duplicate actions cannot fire twice
- [ ] Destructive actions confirm
- [ ] Durable-state write failures surfaced, not swallowed

---

## 9. Forbidden patterns

| Don't                                                | Do                                          |
| ---------------------------------------------------- | ------------------------------------------- |
| `console.log`                                        | `createLogger("scope")`                     |
| `try/catch → Alert`                                  | `toAppError` + `ErrorState` / `InlineError` |
| Supabase call in a screen                            | feature `api/` module + query hook          |
| Deep import `@/features/x/api/y`                     | `@/features/x` public API                   |
| Raw hex colour / magic pixel size                    | semantic token class                        |
| Mirroring query data into Zustand                    | read from the query hook                    |
| Copying a Flutter table or RPC name                  | read the migration                          |
| New grant or security-definer function to unblock UI | raise it as a backend decision              |
| Editing a shared registry to register a feature      | there is none — that is the point           |

---

## 10. Known gaps

- **Customer order tracking has no secure backend contract.** The Flutter app
  has a Track Order screen, but the current schema gives customers no `orders`
  access and there is no tracking RPC. Do not weaken RLS to build it. It needs a
  deliberate backend design first. See
  [`docs/adr/0006-customer-tracking-gap.md`](./docs/adr/0006-customer-tracking-gap.md).
- **Exact stock quantity is not exposed to customers.** The catalog snapshot
  carries boolean `is_available` only. Showing quantity is not forbidden as
  product design — it needs a new secure contract, not a client workaround.
