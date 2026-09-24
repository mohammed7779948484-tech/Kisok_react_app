# KISOK Design System

KISOK uses **Store Signal**, a tablet-first visual language inspired by retail wayfinding, product display bays, and preparation tickets. It is confident and highly legible under bright store lighting without borrowing the visual density of a desktop dashboard.

## Direction

Customer surfaces are spacious and image-led. Photography occupies the visual foreground; navigation and actions use strong cobalt fields, while citron appears only as a high-attention selection or wayfinding signal.

Preparation uses the same palette and typography at a denser rhythm. Orders read as dispatch tickets inside persistent status lanes rather than customer product cards. Status always combines icon, text, and color.

## Color

Semantic HSL tokens live in `global.css` and are mirrored in `core/theme.ts` for native navigation.

- `background`: cool mist, reducing glare around white product surfaces
- `foreground`: deep graphite-indigo for arm's-length contrast
- `primary`: saturated cobalt for navigation and committed actions
- `accent`: citron for selection edges and rare attention markers
- `success`, `warning`, `destructive`: distinct operational states with dedicated foreground roles
- `secondary`, `muted`, `border`, `input`: cool blue-neutrals that keep the interface cohesive

Dark mode uses deep indigo surfaces rather than an inverted gray palette. Accent and state colors are raised in lightness to preserve contrast.

## Typography

The Android system typeface is used intentionally for reliable rendering and text scaling on managed tablets. Weight, scale, and spacing provide the identity:

- Display and primary screen titles are heavy and tightly tracked.
- Section titles use clear bold steps rather than decorative labels.
- Body text remains generous and allows native font scaling.
- Monospace is reserved for order numbers and identifiers that are read back to staff.
- Interface copy uses sentence case.

## Shape And Surfaces

- The base radius is 12px. Cards and controls use restrained 9-16px derived radii; pills are reserved for compact status metadata.
- Depth comes from tonal surface separation and borders, not decorative shadows.
- Product cards use edge-to-edge imagery with a disciplined information band.
- Operational lanes use strong header bands, dividers, and independently scrolling ticket lists.
- Dialog, sheet, tabs, progress, portal, and radio behavior is supplied by `@rn-primitives` behind KISOK-owned styling wrappers.

## Interaction

- Every touch target remains at least 48dp; primary customer actions use 56-64dp heights.
- Press feedback is immediate and restrained through slight scale and opacity changes.
- Motion is reserved for feedback, overlays, state explanation, and the rare success moment. There is no idle or looping decorative motion.
- Selection and status never rely on color alone.
- Destructive actions remain interruptive, explicit, and confirmed.

## Responsive Strategy

- Compact widths degrade gracefully without becoming the design target.
- Tablet portrait uses stacked content, substantial tab controls, and bottom sheets.
- Tablet landscape uses split product-detail composition, side trays, and independent preparation lanes.
- Text-heavy content remains width-constrained while imagery and operational boards use the available tablet canvas.
- Rotation derives from `core/responsive`; presentation state is never fixed at mount.

## Experience Modes

### Customer

Discovery behaves like a digital store floor: a five-destination icon dock, clear storefront headings, image-led product/category/brand bays, a visible cart access point, and calm packing-list review surfaces. Checkout uncertainty and recovery remain visually distinct from definite failure.

### Preparation

The workspace behaves like a live dispatch board: New, Preparing, and Ready lanes have persistent state headers, readable counts, compact ticket cards, explicit assignment, and action rails. Portrait preserves the same information through accessible library-backed tabs.

## Accessibility

Accessible names, roles, selected/disabled states, safe-area ownership, live announcements, text scaling, reduced motion, and verbal state labels are part of the component contract. Product images retain meaningful alternatives; decorative icons and marks stay hidden from assistive technology.
