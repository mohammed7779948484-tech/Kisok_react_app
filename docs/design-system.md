# Design system

KISOK should feel **premium, calm, deliberate, and unmistakably touch-first**. It
is read at arm's length on a store tablet, not held in the hand. Avoid the
generic dense-dashboard look — this is retail.

## Tokens

All colour lives in `global.css` as semantic HSL triples, consumed by
`tailwind.config.js` as `hsl(var(--token))`. This is the same contract React
Native Reusables generates, so components added later via its CLI theme
correctly with no edits.

| Token                                 | Use                               |
| ------------------------------------- | --------------------------------- |
| `background` / `foreground`           | Page surface and primary text     |
| `card` / `card-foreground`            | Raised content surfaces           |
| `popover` / `popover-foreground`      | Dialogs and sheets                |
| `primary` / `primary-foreground`      | Primary actions (deep emerald)    |
| `secondary` / `secondary-foreground`  | Secondary surfaces and actions    |
| `muted` / `muted-foreground`          | De-emphasised surfaces and text   |
| `accent` / `accent-foreground`        | Highlights (amber)                |
| `success` / `warning` / `destructive` | Status, each with a `-foreground` |
| `border` / `input` / `ring`           | Edges, field borders, focus       |

**Never hardcode a colour.** Use `bg-primary`, `text-muted-foreground`,
`border-border`. A hex value breaks dark mode and any future re-theme.

Sizing note: `metro.config.js` sets NativeWind's `inlineRem: 16`. The default is
14, which would make every rem-based size ~12% smaller on the tablet than in the
web preview and smaller than Tailwind documents. 16 keeps native, web and the
Tailwind scale in agreement — and suits a screen read at arm's length.

Radius scale: `rounded-sm|md|lg|xl`, derived from `--radius` (14px).
Spacing: the Tailwind scale, plus `h-touch` / `w-touch` = **48dp**.

React Navigation cannot read CSS variables, so `core/theme.ts` mirrors the
tokens as values and supplies `NAV_THEME` to the root `ThemeProvider` — without
it the navigator paints its own white default behind every screen. That mirror
is a second copy of the tokens, so `core/__tests__/theme.test.ts` fails if it
ever stops matching `global.css`, including when a new token is added there.

## Typography

Use the `Text` component's `variant`, never raw font sizes:

`display` · `h1` · `h2` · `h3` · `lead` · `body` · `label` · `caption` · `mono`

`mono` is for order numbers and SKUs — anything read aloud or typed back in.

Tone is separate from size: `<Text variant="body" tone="muted">`.

## Components

**Primitives** — `@/components/ui`:

`Text` · `Button` · `Card` · `Input` · `Badge` · `Separator` · `Skeleton` ·
`Icon` · `Alert` · `Progress` · `Tabs` · `Dialog` · `AdaptiveSheet`

**Shared UX states** — `@/components/feedback`:

`LoadingState` · `SkeletonList` / `SkeletonGrid` · `EmptyState` · `ErrorState` /
`InlineError` · `BlockingOverlay` · `ConfirmDialog` · `OfflineNotice`

**Also:** `Screen` (`@/components/layout/screen`) and `AppImage`
(`@/components/media/app-image`).

### `AdaptiveSheet`

The surface the cart needs: a right-side panel on a landscape tablet, a bottom
sheet otherwise. Built on the dialog primitive, so focus handling and roles are
correct in both presentations.

### React Native Reusables

`components/ui/` follows RNR's architecture: components are **owned source in
this repo**, built on `@rn-primitives/*`, styled with `class-variance-authority`,
using the `TextClassContext` pattern so a parent can style its child text.

`components.json` is configured, so on an unrestricted network you can add more:

```bash
npx @react-native-reusables/cli@latest add popover -y
```

The token contract matches, so an added component themes correctly. Review what
lands and adapt it to the conventions here — these are our components once
vendored, not a dependency.

## Responsive

Tablet-first. The Tailwind breakpoints and `useLayout()` use the same
thresholds, so classes and hooks can never disagree:

| Size       | Width    | Context                                       |
| ---------- | -------- | --------------------------------------------- |
| `compact`  | < 768    | Narrow browser preview, split screen          |
| `medium`   | 768–1023 | **Tablet portrait — the primary orientation** |
| `expanded` | ≥ 1024   | Tablet landscape                              |

```tsx
const { isExpanded, isPortrait } = useLayout();
const columns = useResponsiveValue({ compact: 2, medium: 3, expanded: 4 });
```

Or in classes: `className="flex-col md:flex-row"`.

Wrap screens in `<Screen>` — it handles background, safe area, and constrains
content to a readable measure (a full-bleed grid on a 1280px tablet is
unreadable).

**Always check portrait, landscape, and a narrow web width.** Orientation is
unlocked; the kiosk is used both ways.

## Accessibility

Not a polish step — part of done.

- **Touch targets ≥ 48dp.** `h-touch` on anything pressable.
- **Accessible names.** `label` on `Input`; `accessibilityLabel` on any
  icon-only control.
- **Announce state**, do not just colour it: `accessibilityState`,
  `accessibilityLiveRegion="polite"` for errors and status.
- **Text scaling to 200%** must not clip or overlap.
- **No hover-only affordances.** This is a touch device.
- **Reduced motion** respected — `Skeleton` already does.
- **Colour is never the only signal.** A `Badge` always carries text.

## Motion

Deliberately restrained. A slow opacity fade at most. No shimmer, no looping
animation — an idle kiosk in a shop should not be drawing the eye. Elevation is
a border plus a flat surface colour, not a shadow: shadows render inconsistently
across Android and react-native-web and add noise to a dense grid.

## The UI lab

```bash
pnpm web    # then open /ui-lab
```

Every token, component, and state in one scrollable page, with the current width
and orientation shown at the top. It lives under `app/(dev)/`, guarded by
`__DEV__`, so it cannot ship.

**When you add a shared component, add it to the lab.** That is how the next
agent discovers it exists instead of building a duplicate.
