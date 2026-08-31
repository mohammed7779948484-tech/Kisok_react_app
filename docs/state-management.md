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

**Why not zustand's `persist` middleware:** it gives no way to observe a failed
write. For KISOK that is a correctness problem, not a nuisance — telling a
customer their cart is saved when the write failed is exactly the kind of lie the
Flutter app went out of its way to avoid. `@/core/storage` returns a result:

```ts
const result = await storage.write(key, value);
// { status: "persisted" } | { status: "rejected", error }
```

So a store can hold an honest `persistence` status and the UI can say so. The
generated `state/` template shows the pattern, and distinguishes two DIFFERENT
failures rather than collapsing them into one `memoryOnly`:

- `memoryOnly` — the current value only exists in memory; a plain write failed.
  Worth a small warning ("your changes may not be saved"), nothing more.
- `clearFailed` — a durable **clear** could not remove the previous value from
  disk, even after the template's own fallback (overwriting the key with an
  explicit empty value) also failed. On a shared kiosk this is a safety bug,
  not a nuisance: the NEXT customer's cold start could read the previous
  customer's data straight back. Never report this as `memoryOnly` — that
  status undersells what actually happened.

Storage is AsyncStorage-backed: it works unchanged on Android and, via
localStorage, on the web dev preview. See
[adr/0003-client-state.md](./adr/0003-client-state.md) for why not MMKV.

Namespace keys with `storageKey("cart", "lines")` → `kisok:cart:lines`.
`core/auth` reserves another namespaced key for the durable kiosk-handoff marker.
The emergency handoff fallback removes **only** `kisok:*` keys; it never clears
unrelated browser/device storage.

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

## The sign-out and kiosk-handoff lifecycle

Authentication and **device handoff** are related but not identical. A Supabase
session can be gone while stale customer-owned state still exists on disk. KISOK
must prove both before the tablet is considered safe for the next customer.

### Phase 1 — guards: decide, do not mutate

All registered guards are side-effect-free and run before auth or local feature
state is touched. Any guard can veto the whole sign-out:

```ts
registerSignOutGuard({
  name: "checkout",
  run: () =>
    hasUnresolvedAttempt()
      ? { status: "blocked", reason: "An order submission is still unresolved." }
      : { status: "ok" },
});
```

This encodes a hard KISOK invariant: wiping the cart and its idempotency metadata
while a submission's outcome is unknown could produce a duplicate order. A guard
that throws is treated exactly like `blocked` — uncertainty is never permission
to destroy recovery state.

### Handoff marker — durable before auth is removed

After all guards pass, `core/auth` writes a durable `kisok:auth:*` handoff marker
**before** calling Supabase sign-out. If that marker cannot be persisted, sign-out
stops while the current session is still intact. This prevents a cold restart
from forgetting that customer cleanup still needs to happen.

### Phase 2 — local Supabase sign-out

Supabase sign-out uses `scope: "local"`; a store account can be used by several
tablets, so one kiosk must not revoke every other tablet's refresh token. If the
call errors, `core/auth` checks whether the local session actually remains. It
never reports a successful auth sign-out while the stored session may still be
usable.

### Phase 3 — feature cleanup, then prove safe handoff

Only after the auth session is gone do destructive feature cleanup tasks run:

```ts
registerSignOutCleanup({ name: "cart", run: () => clearCart() });
```

Every cleanup task gets a chance even if another one fails. Then:

- if every cleanup succeeds, the durable handoff marker is removed;
- if any cleanup fails, `core/auth` performs an emergency reset of all KISOK-owned
  `kisok:*` storage keys;
- if that reset succeeds, the tablet is safe even though one feature cleanup had
  failed;
- if the reset cannot be proven, sign-out returns `unsafe`, the durable marker
  remains, and the next sign-in is blocked.

`useSignOutAction()` surfaces `blocked`, `failed`, and `unsafe`; do not discard the
outcome with `void signOut()`.

### Cold restart recovery

The handoff marker survives process death. On startup with an existing session,
`AuthProvider` recovers a pending marker **before** resolving the profile and
making the experience `ready`. On a signed-out screen, `signIn()` performs the
same recovery before calling `signInWithPassword`. If recovery cannot clear the
KISOK namespace, the tablet fails closed rather than exposing stale state.

### Never combine guards and cleanup

A function that both checks a condition and performs cleanup makes safety depend
on registration order: an earlier task could destroy state before a later guard
blocks. Register the guard and cleanup separately — even under the same `name`,
because they live in different registries.

Features register their own guards and cleanup from their own modules — there is
no central list to edit.
