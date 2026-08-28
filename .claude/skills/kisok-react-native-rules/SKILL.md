---
name: kisok-react-native-rules
description: React Native and Expo rules that matter for KISOK on Android store tablets — crash-avoidance in JSX, list performance and when virtualization is actually warranted, state that represents ground truth, animation on the UI thread, images, and re-render discipline. Each rule states the failure mode it prevents. Use this whenever you are writing or reviewing React Native components, screens, lists, animations, or diagnosing sluggishness or a crash on device.
---

# React Native rules for KISOK

Every rule here names a **failure mode**. If you cannot state what breaks
without it, it is not a rule — it is a preference, and following it mechanically
costs more than it saves.

Target: store-owned Android tablets, Expo SDK 54, React Native 0.81, New
Architecture, React 19. Long-lived sessions — a tablet may run all day without
the app being killed, so leaks that a phone app never notices matter here.

## Rules that prevent a crash

### Never render a possibly-falsy value with `&&`

`{count && <Text>…</Text>}` renders `0` as a bare number when `count` is `0`.
Text outside a `<Text>` component is a **hard crash on Android**, and it only
happens on the empty-cart or zero-stock path — exactly the states least likely
to be exercised by hand.

```tsx
{
  count > 0 ? <Text>{count} items</Text> : null;
}
{
  name !== "" ? <Text>{name}</Text> : null;
}
```

The same applies to `""`. Compare explicitly rather than relying on truthiness.

### All text lives inside `<Text>`

A stray string in a `<View>` crashes on Android. It is easy to introduce when
refactoring JSX; the failure is immediate and total.

## Rules that prevent a leak

### Clean up every subscription, timer and listener

A tablet runs for a whole shift. An `AppState` listener, an interval, or a
Realtime channel that is never removed accumulates across every navigation.
Return a cleanup function from `useEffect`, always.

### Keep effect dependencies stable

An effect keyed on an inline callback re-runs on every render. For a Realtime
subscription that means unsubscribe/resubscribe on each render — the pattern
`core/realtime` already solves by holding the handler in a ref. Key an effect on
what actually **identifies** the work, not on everything it uses.

## Lists

### Virtualize when the list is large or grows — not always

Use `@shopify/flash-list` for anything that scales with the catalog, the order
board, or the cart on a busy day. `ScrollView` mounts every child upfront, so a
few hundred products costs memory and a slow first paint.

Do **not** virtualize a short, bounded list — a handful of option values, four
filter chips, the lines of one order. A virtualizer there adds layout
complexity, measurement bugs and a worse empty state for no gain.

The question is not "is this a list?" but **"can this grow without bound?"**

### Keep row props stable

Inside a virtualized list, an inline object, array or arrow function creates a
new prop identity for every row on every render, defeating the memoization the
virtualizer relies on. Hoist them, or wrap in `useCallback`/`useMemo` — here
the cost is real and measurable, which is what justifies the ceremony.

This does **not** generalise into "memoize everything". See below.

## State

### State should represent ground truth

Store what something _is_ — `pressed`, `isOpen`, `progress` — and derive what it
_looks like_. Storing `scale` or `opacity` directly means two sources of truth
for one fact, and they drift; you then cannot tell from state whether the sheet
is open.

### Server data belongs in TanStack Query, not a store

Copying server data into Zustand gives it a second lifetime with no
invalidation. It goes stale silently. Zustand owns client-only state: cart
contents, UI selections, in-progress input.

## Animation

Run animations on the UI thread with Reanimated, driving transform and opacity.
Animating layout properties (`width`, `height`, `top`) forces layout work per
frame and drops frames on the tablets we actually ship to.

Do not reach for `GestureDetector` when a `Pressable` does the job — extra
gesture machinery around a simple tap is complexity without a failure mode it
prevents. Our `Button` primitive already uses `Pressable`; prefer it over
`TouchableOpacity`, which is legacy.

## Images

Use `AppImage` (`@/components/media`). Product images come from Cloudinary at
unpredictable sizes; it handles sizing, caching and the failure state. An
unbounded remote image in a list is one of the easiest ways to exhaust memory
on a tablet.

Always handle the **broken image** case. Catalog images will 404 in production.

## Re-render discipline, honestly

React 19 and the React Compiler remove most of the reason to memoize by hand.
Memoize when you can name the cost: a virtualized row, a genuinely expensive
computation, a value used as an effect dependency.

Do not memoize by default. `useMemo` on a cheap expression adds allocation, a
dependency array that can go wrong, and noise that hides the places where
memoization is load-bearing.

## Diagnosing before optimizing

Slowness has a cause; find it before changing code. Profile with React DevTools,
check what is re-rendering and why, and confirm the fix moved the number. An
optimization with no measurement is a guess that adds permanent complexity.

`references/` holds longer notes:

- `references/lists.md` — choosing between ScrollView and FlashList, row-prop
  stability, and measuring the difference
- `references/profiling.md` — how to find the actual cause of jank on a tablet
