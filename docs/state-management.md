# State, errors, and logging

## The split

| Kind                                          | Tool           | Examples                                  |
| --------------------------------------------- | -------------- | ----------------------------------------- |
| **Server state** — anything from the database | TanStack Query | catalog snapshot, active orders           |
| **Client state** — owned by the client        | Zustand        | cart, selections, kiosk-local preferences |

**Never mirror server data into a store.** Two caches for the same data drift,
and the bug appears later, in a screen, far from the cause.

## Server state

Query keys live in your feature (`features/<name>/queries/keys.ts`). There is no
central registry — it would conflict on every PR.

```ts
export const catalogKeys = {
  all: ["catalog"] as const,
  snapshot: () => [...catalogKeys.all, "snapshot"] as const,
  product: (id: string) => [...catalogKeys.all, "product", id] as const,
};
```

General-to-specific, so `invalidateQueries({ queryKey: catalogKeys.all })` clears
the whole feature.

The shared `QueryClient` sets sensible defaults:

- **Retry only what could succeed.** `shouldRetry` consults `AppError.retryable`,
  so a `forbidden` or `validation` failure surfaces immediately rather than after
  three round trips.
- **Mutations never auto-retry.** Checkout must control its own retry so it can
  reuse the same `client_request_id`.
- `focusManager` is wired to `AppState` and `onlineManager` to NetInfo, so
  refetch-on-focus and refetch-on-reconnect mean something on a tablet.

On sign-out, `queryClient.clear()` runs so the next account cannot read the
previous session's data.

## When a store is the right answer

Not every client-owned value needs one.

| State                                  | Where it belongs                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Used by one screen, discarded with it  | React state in that screen                                                               |
| Shared across screens, or outlives one | a Zustand store in `state/`                                                              |
| Must survive an app restart            | a Zustand store, persisted through `@/core/storage`, with an explicit persistence result |
| Comes from the database                | TanStack Query — never mirrored into a store                                             |

A store for state a single screen owns adds a module, a subscription and a
lifetime to reason about, for nothing. Generate one when the state genuinely
outlives or spans screens.

Non-persistent stores are legitimate; `pnpm generate store` produces a persisted
one because that is the harder case to get right, and dropping persistence is a
smaller edit than adding it correctly.

## Client state and persistence

Zustand, writing through `@/core/storage`.

**Why not zustand's `persist` middleware:** a store sometimes has to act on a
failed write, and `persist` hides it. `@/core/storage` returns a result:

```ts
const result = await storage.write(key, value);
// { status: "persisted" } | { status: "rejected", error }
```

What a failure means is the store's decision, and it should be the cheapest
honest response:

- **Cart** — a failed save is a small, non-blocking note ("this change may not
  survive a restart"). The cart keeps working in memory.
- **Checkout** — a pending order that cannot be saved is **not sent**: without
  the saved request id a lost response could not be retried safely.

One serialized queue per store keeps writes in order. Do not build lifecycle
states around storage details; a record that cannot be read is discarded,
logged, and the experience starts clean.

Storage is AsyncStorage-backed: it works unchanged on Android and, via
localStorage, on the web dev preview. See
[adr/0003-client-state.md](./adr/0003-client-state.md) for why not MMKV.

Namespace keys with `storageKey("cart", "lines")` → `kisok:cart:lines`.

### Customer isolation

Every persisted customer record carries its `ownerId`. Restoring for a
different profile starts empty and removes the other customer's record, so
one customer's cart or order never reaches another — without any sign-out
cleanup. The customer UI has no sign-out; preparation and unauthorized
accounts own no local state.

### Checkout's duplicate-order guarantee

The one client-side guarantee checkout must keep, end to end:

1. a new order gets a fresh `client_request_id`;
2. the id and the exact items are saved **before** the first `create_order`;
3. an ambiguous result (network, unknown, malformed response) keeps them;
4. every retry — including after a restart — re-sends the same id and items;
   `create_order` deduplicates server-side;
5. the cart is cleared only after the server confirms the order.

The saved record is only ever `null`, `pending` or `confirmed`. A definite
answer (success, stock conflict, error) replaces or removes it.

## Errors

One shape, `AppError`, converted at the `api/` boundary:

```ts
try {
  return await callRpc("create_order", args, createOrderResultSchema);
} catch (error) {
  throw toAppError(error); // callRpc already does this — shown for illustration
}
```

| `kind`                 | Meaning                                    | Retryable |
| ---------------------- | ------------------------------------------ | --------- |
| `auth`                 | No usable session — go to sign-in          | no        |
| `forbidden`            | Authenticated but not permitted (RLS/role) | no        |
| `validation`           | Malformed request                          | no        |
| `unavailable`          | Entity inactive, missing, or out of stock  | no        |
| `idempotency-conflict` | Same request id, different contents        | **never** |
| `state-conflict`       | The record moved on                        | no        |
| `server`               | Server could not complete                  | yes       |
| `network`              | No definitive answer                       | yes       |
| `unknown`              | Unclassified                               | no        |

Two messages, deliberately separate:

- `userMessage` — vetted, safe to render
- `technicalMessage` — for logs only, may contain database detail

In UI, branch on `kind` and render `userMessage`. `ErrorState` and `InlineError`
already do this.

**Never** write `try/catch → console.log → Alert`.

## Logging

```ts
const log = createLogger("cart.persist");
log.warn("Cart saved in memory only", { reason: result.error.message });
```

- `console` is a lint error everywhere except the logger itself.
- Any key that looks sensitive (`token`, `password`, `secret`, `key`,
  `authorization`, `session`, …) is **redacted before output**, recursively.
- Development logs at `debug`; production only `warn` and above.
- `setLogSink` is the single wiring point if a crash reporter is adopted later.

**Never log a token, password, or key** — and do not defeat redaction by
stringifying an object before passing it.

## Sign-out

`useAuth().signOut()` signs out **this device** (`scope: "local"`; a store
account is shared by several tablets), then clears the query cache so the
next account cannot read the previous session's data. If Supabase reports an
error, `core/auth` checks whether the local session actually remains and
never reports success while it may still be usable.

`useSignOutAction()` surfaces a failure; do not discard the outcome with
`void signOut()`.
