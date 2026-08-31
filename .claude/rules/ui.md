---
paths:
  - "components/**"
  - "features/**/components/**"
  - "features/**/screens/**"
---

# UI work

KISOK is **tablet-first and touch-first**, used at arm's length on a store
tablet. It should feel premium, calm, and deliberate.

## Rules

- **Compose from the design system.** `@/components/ui` for primitives,
  `@/components/feedback` for loading/empty/error/confirm/overlay states. Do not
  build a one-off button, card, or dialog.
- **Semantic tokens only.** `bg-primary`, `text-muted-foreground`,
  `border-border`, `bg-destructive`. Never a raw hex value. Colours are defined
  once in `global.css`; a hardcoded colour breaks dark mode and any re-theme.
- **Touch targets ≥ 48dp** (`h-touch`). Never smaller, even in dense internal UI.
- **Handle every state the feature actually HAS**, not just the happy path — and
  only the states it has. Inventing an empty state for a screen that cannot be
  empty produces a test asserting something impossible.

  | The feature has…        | Handle                                                                                                                            |
  | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | a data-backed read      | loading (skeleton when the shape is known), empty (with somewhere to go next), error (with retry when retrying can help), success |
  | a mutation              | pending (controls disabled), success, business conflict, error                                                                    |
  | static or local-only UI | only the states that genuinely exist                                                                                              |

- **Responsive:** check tablet portrait (768+), tablet landscape (1024+), and a
  narrow web width (<768). Use `useLayout()` from `@/core/responsive` or the
  Tailwind breakpoints — they are the same thresholds. No ad-hoc pixel maths.
- **Accessibility is part of done:**
  - every control has an accessible name (`label`, or `accessibilityLabel` when
    icon-only)
  - state is announced, not just coloured (`accessibilityState`, `accessibilityLiveRegion`)
  - text scaling to 200% must not clip
  - nothing essential depends on hover — this is a touch device
  - respect reduced motion
- **Motion is restrained.** A slow opacity fade at most. No shimmer, no looping
  animation, nothing that draws the eye on an idle kiosk.
- **Images go through `AppImage`**, which handles the missing/failed fallback and
  requires an `alt`. Pass `alt=""` for decorative imagery.
- **No prices, totals, or payment UI anywhere.** A deliberate product boundary.

Inspect everything at `/ui-lab` in a dev build. Add new shared components there
so the next agent can discover them.
