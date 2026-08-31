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
  not a nuisance: the NEXT customer's cold start would read the previous
  customer's data straight back. Never report this as `memoryOnly` — that
  status undersells what actually happened.

Storage is AsyncStorage-backed: it works unchanged on Android and, via
localStorage, on the web dev preview. See
[adr/0003-client-state.md](./adr/0003-client-state.md) for why not MMKV.

Namespace keys with `storageKey("cart", "lines")` → `kisok:cart:lines`.

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

## The sign-out lifecycle

`core/auth` runs sign-out in two separate PHASES, in two separate registries,
so that a later blocker can never be undone by an earlier task's cleanup.

**Phase 1 — guards.** Side-effect-free checks, run to completion before
anything is touched. Any guard can veto the whole sign-out:

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
that throws is treated exactly like one that returns `blocked` — an exception is
just as uncertain, and "we don't know" must never be read as "safe to proceed".

**Phase 2 — cleanup.** Destructive teardown of a feature's own state, run only
after every guard (from every feature) has approved AND the session is actually
gone:

```ts
registerSignOutCleanup({ name: "cart", run: () => clearCart() });
```

A cleanup task never gets a say in whether sign-out proceeds — by the time it
runs, the account is already signed out, so there is nothing left to protect by
blocking there. One task's failure is logged and does not stop the others, and
does not turn a successful sign-out back into a failure.

**Never combine the two.** A single function that both checks a condition and
performs cleanup makes the safety property depend on registration order: if it
ran before another feature's guard blocked, its cleanup would already have
happened by the time the block was discovered. Register a guard and a cleanup
task separately — even under the same `name`, since they are different
registries.

Features register their own guards and cleanup from their own modules — there is
no central list to edit.
