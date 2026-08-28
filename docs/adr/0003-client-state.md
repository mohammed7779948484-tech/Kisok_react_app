# 0003 — Zustand + AsyncStorage, with explicit persistence results

**Status:** accepted · **Date:** 2026-08

## Context

KISOK needs client-owned state that survives a restart — principally the cart.

One requirement makes this more than a default choice. The Flutter app goes out
of its way to distinguish **persisted** from **memory-only** state, and to warn
the customer when a cart change could not be durably saved. Telling someone their
cart is saved when the write failed is a correctness bug on a shared kiosk, not
a nuisance.

Zustand's `persist` middleware has no hook for observing a **write** failure —
`onRehydrateStorage` covers reads only. A failed `setItem` is effectively
swallowed.

Storage backends were compared:

| Option                                      | Verdict                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@react-native-async-storage/async-storage` | Works on Android and, via localStorage, on the web dev preview. Works in Expo Go. No native build step. |
| `react-native-mmkv`                         | Faster, but requires a native build and does not work in Expo Go. Real cost, no benefit at cart size.   |
| `expo-sqlite/kv-store`                      | Official and capable, but heavier than a cart needs.                                                    |

## Decision

Zustand for client state, writing through `@/core/storage` rather than the
`persist` middleware. `core/storage` wraps AsyncStorage and returns a result:

```ts
{ status: "persisted" } | { status: "rejected", error }
```

A store keeps an honest `persistence: "persisted" | "memoryOnly"` flag the UI can
render. The generated `state/` template demonstrates the pattern.

## Consequences

- A failed write is visible and actionable instead of silent.
- Slightly more code per store than `persist` would need. Worth it — this is the
  one place the shortcut costs correctness.
- One storage adapter works on both target platforms with no native build.
- `createMemoryStore({ failOn: "setItem" })` makes the failure path directly
  testable, so it can be covered rather than assumed.
