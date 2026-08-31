# Data and Supabase

**`supabase/migrations/*.sql` is the only source of truth for the data contract.**
Read the migration before writing code against it. The Flutter reference targets
an older database and will mislead you.

## The schema in one page

Sixteen tables, all with RLS enabled.

**Identity and settings:** `profiles`, `store_settings`, `media_assets`

**Catalog:** `brands`, `categories`, `products`, `product_categories`,
`option_types`, `option_values`, `product_variants`, `variant_option_values`,
`product_variant_media`

**Inventory and orders:** `inventory`, `inventory_adjustments`, `orders`,
`order_items`

### The variant model

There is **no `Flavor`**. Flutter's `Flavor` became a generic three-part model:

```
Product
  └── ProductVariant          (sku, optional title_override)
        └── variant_option_values → (option_type, option_value)
```

A variant's display label is `title_override`, or its option values joined in
option-type order. Use `variant`, `variantId`, `variantOptions` in code.

Other facts worth knowing before you design a screen:

- Category hierarchy is limited to **two levels** (enforced by a trigger).
- `product_categories` is many-to-many. There is **no primary category** and no
  category-specific product ranking.
- `order_items` are **immutable** — a trigger rejects any update or delete.
- Order display numbers are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (no I, O, 0, or 1). Regex: `^[A-HJ-NP-Z2-9]{6}$`.

## What this client may do

### RPCs

```ts
current_active_profile();
// → 0 or 1 row: { id, display_name, role, is_active }
// ZERO ROWS means missing or inactive profile. That is the "no access" signal,
// not an error.
```

```ts
get_customer_catalog();
// → one jsonb snapshot, schema_version "kiosk.catalog.lean.v1"
// Requires an active `customer` profile; raises 42501 otherwise.
// Contains: settings, brands, categories, products, product_categories,
//           option_types, option_values, variants, variant_option_values,
//           variant_media.
```

```ts
create_order(client_request_id: uuid, items: jsonb)
// items: [{ variant_id, quantity }]  — exactly these two keys, nothing else.
// → { kind: "success", order_id, display_number, created_at }
// → { kind: "stock_conflict", conflicts: [{ variant_id, requested_quantity,
//                                           available_quantity }] }
```

```ts
update_order_status(order_id: uuid, target_status: order_status, reason?: text)
// → { order_id, display_number, status, assigned_preparation_id,
//     completed_at, cancelled_at, cancellation_reason, updated_at }
```

### Direct table access

| Role          | May read directly                                                |
| ------------- | ---------------------------------------------------------------- |
| `customer`    | **nothing** — everything comes through `get_customer_catalog()`  |
| `preparation` | `orders`, `order_items`, `store_settings`                        |
| `admin`       | catalog and inventory tables — but Admin is the separate web app |

The `authenticated` grant on `profiles` is explicitly revoked. Resolve identity
through `current_active_profile()`; a `select` will fail.

Customers get store settings (including
`customer_success_reset_seconds`) from the `settings` key of the catalog
snapshot, not from `store_settings`.

**A direct table read does not go through `callRpc` and is not Zod-validated —
and that is correct, not an inconsistency.** `callRpc` exists because the
JSON-returning RPCs answer with `jsonb`, an untyped wire payload that has to be
checked before anything can trust its shape. A direct `select` on a real table
has no such gap: PostgREST returns exactly the columns the migration declares,
and the generated `Tables<'orders'>` type already describes that shape
precisely. Typing it is enough; validating it again would just be checking the
database's own schema against itself.

```ts
// features/preparation/api/fetch-active-orders.ts
import { getSupabaseClient, type Tables } from "@/core/supabase";
import { toAppError } from "@/core/errors";

export async function fetchActiveOrders(): Promise<Tables<"orders">[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("status", ["new", "preparing"]);

  if (error) throw toAppError(error);
  return data;
}
```

Still `api/`-only, still normalised to `AppError` on failure — the only
difference from an RPC call is that there is no schema argument, because there
is nothing left to validate.

## Calling an RPC

The JSON-returning business RPCs return `jsonb`, which Supabase generates as
the wide `Json` union. `current_active_profile()` is table-returning and arrives
as rows; it is validated too, against a rows schema.
Validation is what turns that into something the rest of the feature can trust:

```ts
// features/catalog/api/catalog-api.ts
import { callRpc } from "@/core/supabase";
import { catalogSnapshotSchema } from "../model/catalog-snapshot.schema";

export async function fetchCatalog() {
  return callRpc("get_customer_catalog", catalogSnapshotSchema);
}
```

`callRpc` validates the payload and converts every failure into an `AppError`.

### Error codes

Raised by the database functions and mapped by `toAppError`:

| Code    | `AppError.kind`        | Meaning                                                      |
| ------- | ---------------------- | ------------------------------------------------------------ |
| `42501` | `forbidden`            | role gate or RLS rejected the call                           |
| `K1001` | `validation`           | malformed request payload                                    |
| `K1002` | `unavailable`          | variant inactive/missing, or order does not exist            |
| `K1003` | `idempotency-conflict` | same `client_request_id`, different contents                 |
| `K1004` | `state-conflict`       | order already final, already assigned, or illegal transition |
| `K1005` | `validation`           | inventory adjustment invalid (admin surface)                 |
| `K1006` | `server`               | the write could not complete                                 |

**`stock_conflict` is not an error.** `create_order` returns it as a successful
result. Handle it as a business outcome: keep the cart, show which variants are
affected, and let the customer correct them explicitly.

## Checkout is server-owned

`create_order()` already provides: role validation, request validation, duplicate
variant rejection, a deterministic request fingerprint, an advisory lock on the
request id, idempotent replay of the same request, rejection of a conflicting
reuse of the same id, catalog validation, deterministic inventory row locking,
stock-conflict reporting, immutable order-item snapshots, atomic inventory
deduction, and an inventory adjustment ledger entry.

**Do not reimplement any of this in JavaScript.** The client's job is to:

1. build normalised `{ variant_id, quantity }` lines,
2. create and **persist** a `client_request_id` before calling,
3. call the RPC,
4. handle `success`, `stock_conflict`, and — critically — an **ambiguous**
   result where the response was lost.

On an ambiguous result, **retry with the same `client_request_id`**. Generating a
fresh one can create a second real order. This is why `core/auth` provides a
sign-out gate: a feature can block sign-out and kiosk reset until a pending
attempt is resolved.

## Realtime

Only `public.orders` is in the `supabase_realtime` publication, and RLS applies —
so a customer session receives nothing.

```ts
// from "@/core/realtime" — a subscription is a query-invalidation concern, so
// a feature's queries/ layer may use it. The Supabase client stays in api/.
useRealtimeInvalidation({
  channel: "preparation-orders",
  table: "orders",
  queryClient,
  queryKey: preparationKeys.all,
});
```

The event says _something changed_; the refetch says _what it is now_. Never
render from the payload.

## Auth lifecycle

Supabase runs `onAuthStateChange` callbacks while holding an internal auth lock.
**Calling back into the Supabase client from inside one can deadlock** — the app
hangs on the startup screen with no error. `core/auth` therefore splits the
lifecycle into three stages: the callback only records the session; a separate
effect resolves the profile; a third keeps Realtime's token current.

Profile resolution is keyed on the **user id**, not the session, so a token
refresh does not re-fetch a profile that has not changed.

If you add work that reacts to auth, follow the same shape. Do not add it to the
callback.

## Verifying and generating types

```bash
pnpm db:verify   # apply the migrations to a throwaway Postgres and compare
pnpm db:types    # regenerate from the linked Supabase project
```

`pnpm db:verify` runs in CI. It proves `database.types.ts` matches the schema the
migrations actually produce — tables, columns, nullability, enum values, and the
argument names of every function `authenticated` can execute — and proves the
migrations still apply cleanly. See
[adr/0008-database-types-verification.md](./adr/0008-database-types-verification.md).

Wraps `supabase gen types typescript`. It needs the Supabase CLI and either a
linked project (`supabase link`) or `SUPABASE_PROJECT_ID`.

`core/supabase/database.types.ts` is checked in so typecheck and CI work without
credentials. Never hand-edit it.

The committed file **was generated from the deployed project** at this
checkpoint, using Supabase's own generator — it is not hand-derived.

`pnpm db:verify` is a different guarantee, and both matter:

| Check            | Proves                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:verify` | the committed types match `supabase/migrations/*.sql`, deterministically, against a throwaway PostgreSQL. Runs on every CI run. |
| `pnpm db:types`  | regenerates from the deployed project                                                                                           |

Neither rules out future drift: someone can change the deployed schema without a
migration. If the live schema may have moved, regenerate and let `db:verify`
tell you whether the migrations agree.

## Known gap: customer order tracking

The Flutter app has a Track Order screen. The current schema has **no secure
contract for it**: customers have no `orders` policy, `orders` Realtime is
intended for Preparation, and there is no tracking RPC.

Do not solve this by weakening RLS, broadening a grant, or writing a
security-definer function. It needs a deliberate backend design.
See [adr/0006-customer-tracking-gap.md](./adr/0006-customer-tracking-gap.md).
