---
paths:
  - "features/**/api/**"
  - "core/supabase/**"
  - "core/auth/**"
  - "supabase/migrations/**"
---

# Working with Supabase data

**The migrations under `supabase/migrations/` are the only truth.** Read the
relevant migration before writing code against a contract. Never take a table
name, column, or RPC from the Flutter reference — it targets an older database.

## The contract this client has

| RPC                                                    | Caller                  | Returns                                                           |
| ------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------- |
| `current_active_profile()`                             | any signed-in user      | 0 or 1 row: `{id, display_name, role, is_active}`                 |
| `get_customer_catalog()`                               | active `customer`       | one `jsonb` snapshot, `schema_version: "kiosk.catalog.lean.v1"`   |
| `create_order(client_request_id, items)`               | active `customer`       | `{kind:"success", …}` or `{kind:"stock_conflict", conflicts:[…]}` |
| `update_order_status(order_id, target_status, reason)` | `preparation` / `admin` | the updated order projection                                      |

Direct table access: **`preparation` may `select` from `orders` and
`order_items`.** A `customer` may read **no** table — RLS grants none, and the
`profiles` grant is explicitly revoked.

## Rules

- Every RPC returns `jsonb`, typed as the wide `Json`. **Validate with Zod** via
  `callRpc(name, args, schema)`. An unvalidated payload is an untyped payload.
- `create_order` returning `kind: "stock_conflict"` is a **successful call**, not
  an error. Do not route it through the error path.
- Error codes come from the migrations: `K1001` validation, `K1002` unavailable,
  `K1003` idempotency conflict, `K1004` state conflict, `K1005` validation,
  `K1006` server, `42501` forbidden. `toAppError` maps them — do not re-map.
- **Never** add a grant, weaken a policy, or write a security-definer function to
  make a screen easier. If data is unreachable for a role, that is a backend
  design decision to raise, not a client problem to solve.
- Checkout correctness (idempotency, request fingerprint, advisory locking, stock
  validation, inventory ledger, immutable snapshots) is **server-owned**. Never
  reimplement it in JavaScript. Reuse the same `client_request_id` when retrying
  an ambiguous submission — generating a new one can create a duplicate order.
- Realtime is an invalidation signal. Only `public.orders` is published, and RLS
  applies. Never render from a Realtime payload.
- Regenerate types with `pnpm db:types`. Never hand-edit
  `core/supabase/database.types.ts`.

Full detail: `docs/data-and-supabase.md`.
