# Finding the real cause of jank

Optimizing without measuring adds permanent complexity for an unknown benefit.
Work in this order.

## 1. Reproduce it precisely

Which screen, which interaction, which data volume, which orientation? "The
catalog feels slow" is not reproducible. "Flinging the catalog with 400 products
in landscape drops frames after the third screen" is.

## 2. Separate the three usual causes

- **Too much mounted** — a `ScrollView` where a `FlashList` belongs; images
  without bounds. Symptom: slow to appear, memory grows with data.
- **Too many re-renders** — unstable props, state too high in the tree, a
  context that changes on every render. Symptom: interaction lags, profiler
  shows components re-rendering that did not change.
- **Work on the JS thread** — heavy computation, JSON parsing a large catalog
  payload, animation driven from JS. Symptom: everything freezes together.

## 3. Use the profiler before editing

React DevTools Profiler shows what re-rendered and why. Record the interaction,
find the components that rendered most, and read the reason. It is common for
the actual cause to be somewhere other than where the slowness is felt.

## 4. Change one thing, then measure again

If the number did not move, the hypothesis was wrong. Revert and re-measure
rather than stacking speculative fixes — a screen carrying five unmeasured
"optimizations" is harder to fix than the original.

## 5. Record it

Put the before/after in the feature's `docs/worklog.md`. Someone will later
wonder why a row is memoized; the measurement is the answer.
