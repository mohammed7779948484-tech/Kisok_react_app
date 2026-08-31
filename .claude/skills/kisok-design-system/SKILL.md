---
name: kisok-design-system
description: How to build KISOK UI — which existing tokens and primitives to use, semantic colour tokens, where feature UI stops and shared design-system UI begins, accessibility conventions for a shared store tablet, responsive/tablet layout rules, when NOT to add another shared primitive, and what the UI Lab is for. Use this whenever you are writing or reviewing any screen, component, or styling in this repository.
---

# Building KISOK UI

The design system already exists. Most UI work is composing what is here, not
adding to it. A second primitive that does almost the same thing is worse than
none, because now every future agent has to guess which one to use.

Look at `/ui-lab` in the running app before building anything — it renders every
primitive in every state, and it is faster than reading the source.

## What already exists

| Where                   | What                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@/components/ui`       | `Button` `Text` `Card` `Input` `Badge` `Alert` `Dialog` `Tabs` `Progress` `Separator` `Skeleton` `Icon` `AdaptiveSheet` |
| `@/components/feedback` | `LoadingState` `EmptyState` `ErrorState` `SkeletonList` `ConfirmDialog` `BlockingOverlay` `OfflineNotice`               |
| `@/components/layout`   | `Screen` — safe-area aware page wrapper                                                                                 |
| `@/components/media`    | `AppImage`                                                                                                              |
| `@/core/responsive`     | `useLayout` `useResponsiveValue` `BREAKPOINTS` `CONTENT_MAX_WIDTH`                                                      |

## Colour and spacing come from tokens

Semantic tokens are HSL CSS variables in `global.css`, surfaced through Tailwind:
`background` `foreground` `card` `primary` `secondary` `muted` `accent`
`destructive` `success` `warning` `border` `input` `ring`.

```tsx
<View className="rounded-lg border border-border bg-card p-4">
  <Text tone="muted">Sold out</Text>
</View>
```

Name the **role**, not the colour: `text-destructive`, not `text-red-600`. A raw
hex value or an inline dimension that should be a token is a review finding — it
silently opts that element out of theming and out of every future adjustment.

Need a colour that does not exist? Add the token to `global.css` and
`tailwind.config.js` first, then use it. Do not inline it "just here".

## Where UI belongs

Ownership follows the **nearest stable consumer**:

```
used by one screen             → features/<f>/screens/<s>/components/
used by 2+ screens, 1 feature  → features/<f>/components/
reused across features, stable → components/ (the design system)
```

Start at the narrowest scope. Move it up when a second consumer actually
appears — not in anticipation of one. Generate it in the right place rather than
creating it and moving it:

```bash
pnpm generate component catalog availability-badge --screen=product-detail
pnpm generate component catalog product-card
```

## When NOT to add a shared primitive

Promoting something into `components/` makes it everyone's problem: every future
feature inherits it, and changing it later means checking every use.

Do not promote when:

- there is one consumer — that is a feature component
- an existing primitive does it with different props — extend that one instead
- it wraps a primitive only to preset props — a variant belongs on the primitive
- it encodes one feature's business rules — those are not shared UI

Do promote when several features genuinely need the same interaction, its
behaviour is settled, and you can render it in `/ui-lab` in every state.

## Accessibility on a shared tablet

This is a device used by many people in a public place, some of them briefly and
under pressure. Accessibility here is basic usability.

- Every interactive element needs a **role** and an accessible **name**:
  `accessibilityRole`, and a label when the visible text is not enough.
- Touch targets **at least 48dp** (`h-touch`) — a store tablet is used standing
  up, often in a hurry. This is the same number as the `touch` spacing token in
  `tailwind.config.js`; do not introduce a smaller one.
- **Never carry meaning in colour alone.** "Out of stock" needs words, not just
  a red dot.
- Keep the visible text and the accessible name consistent — a label that
  disagrees with what is on screen is worse than none.
- Test behaviour through roles and labels: `getByRole`, `getByLabelText`. That
  is both a better test and a check that the element is reachable at all.

## Responsive and tablet rules

Tablets are used in **both orientations**, and the layout must handle rotation
mid-session rather than assuming the orientation at mount.

```tsx
const { size, isLandscape } = useLayout();
const columns = useResponsiveValue({ compact: 2, medium: 3, expanded: 4 });
```

- Drive layout from `useLayout()` / `useResponsiveValue()`, not from raw
  `Dimensions` reads.
- Cap reading width with `CONTENT_MAX_WIDTH`; full-bleed text on a wide tablet
  is hard to read.
- `AdaptiveSheet` already switches between a side panel in landscape and a
  bottom sheet otherwise — use it rather than branching by hand.
- Verify in a browser at 1280×800, 800×1180 and 480×900 before claiming done.

## Handle the states the capability actually has

State requirements are **capability-aware**. Do not invent an empty state for a
screen that cannot be empty, or a retry action for a deterministic conflict.
Those become tests for impossible behaviour and make the UI harder to reason
about.

| The feature has…        | Handle                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| a data-backed read      | loading, empty, error with retry when retry can help, success — only where each state is genuinely reachable                       |
| a mutation              | pending, success, business conflict, error — only the outcomes the contract can actually produce                                   |
| static or local-only UI | only the local states that genuinely exist                                                                                         |

For a real empty state, give the user somewhere to go next. On a kiosk a dead
end means a customer looks for an employee, which is the outcome the product is
trying to reduce.

```tsx
if (isPending) return <SkeletonList />;
if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
if (items.length === 0) return <EmptyState … />;
```

Use the example only when those branches are possible for that screen.

## Errors people can act on

Show `error.userMessage` from `AppError`. Never show a Postgres message, a
stack, or an error code to a customer — `toAppError` has already produced
something safe and specific.
