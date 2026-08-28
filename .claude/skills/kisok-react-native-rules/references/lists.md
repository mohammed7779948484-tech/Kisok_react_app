# Lists on a KISOK tablet

## Choosing

| Situation                                        | Use                                     | Why                                                    |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------ |
| Product catalog, order board, search results     | `FlashList`                             | Grows with the store's data; unbounded                 |
| Cart lines                                       | `FlashList` once it can exceed a screen | A busy order is unbounded in practice                  |
| Option values, filter chips, one order's summary | `ScrollView` / `View`                   | Bounded and small; virtualization adds bugs, not speed |

The deciding question is whether the length is bounded by design or by data.

## Why ScrollView hurts when it is wrong

`ScrollView` mounts every child immediately. Two hundred product cards is two
hundred component trees, their images, and their layout — paid on first paint,
before the customer sees anything. `FlashList` renders roughly what is visible.

## Row prop stability

Inside a virtualized list this is load-bearing, because the list re-renders rows
as they recycle:

```tsx
// Every render gives every row new props — memoization cannot help.
<FlashList
  data={products}
  renderItem={({ item }) => <ProductCard product={item} onPress={() => open(item.id)} />}
  contentContainerStyle={{ padding: 16 }}
/>;

// Stable identities.
const renderItem = useCallback(({ item }) => <ProductCard product={item} onPress={open} />, [open]);
const contentContainerStyle = useMemo(() => ({ padding: 16 }), []);
```

Have the row take the id and call a stable handler, rather than closing over the
item in an inline arrow.

## Measuring

Before and after, on a real tablet where possible:

- time to first paint of the screen
- frames dropped while flinging the list
- memory after scrolling to the end and back

If none of these moved, revert the change. An optimization that cannot be
demonstrated is complexity someone will have to maintain forever.
