# KISOK Redesign — UI & Component Reference

> **Purpose:** Compact, project-wide reference for an autonomous redesign agent.
>
> **Important:** This document is **not** a visual specification and **does not prescribe** colors, layout direction, styling language, motion style, component choices, or folder structure. The redesign agent is expected to inspect the current product, use the installed design/frontend skills, form its own design judgment, and produce its own redesign plan before implementation.
>
> The only product-level visual constraint assumed here is that KISOK is a **tablet-first React Native / Expo experience**. Customer and Preparation surfaces may require different visual density and interaction treatment.

---

## 1. What This Reference Is For

Use this file to quickly understand:

- the current UI technology stack;
- the component/library ecosystem available to the redesign;
- the current UI ownership patterns in the repository;
- the complete known inventory of routes, screens, shared UI, feature UI, and screen-local components that must be accounted for before the redesign plan is created.

The inventory is a **baseline, not a substitute for inspecting the current source tree**. Before planning, reconcile this list against the current branch and include any UI files added, renamed, moved, or removed since this reference was written.

Do not assume that a component is weak, must be replaced, or must stay where it currently lives simply because it appears here.

---

## 2. Current UI Stack

The redesign currently sits on top of the following UI/frontend stack:

- **Expo / React Native**
- **NativeWind v4** for utility-driven styling
- **Tailwind-style semantic utilities/tokens** through the NativeWind setup
- **React Native Reanimated v4** for native animations and interaction motion
- **Lucide React Native** for iconography
- **React Native Reusables (RNR)** / `@rn-primitives` for vendored headless/mobile primitives where useful
- Existing project-owned UI components under `components/` and feature-local UI under `features/`

Current audit notes:

- RNR primitives already present include at least **Dialog**, **Tabs**, **Progress**, and **Portal**.
- `lucide-react-native` is already integrated through `components/ui/icon.tsx`.
- `react-native-reanimated` is already installed.
- The project already has an interactive UI lab surface that can be evolved into a redesign/design-system validation surface.

The redesign agent may reuse, refactor, replace, vendor, wrap, or create UI primitives as appropriate, provided existing product behavior and feature boundaries remain correct.

---

## 3. Component Ownership — Current Baseline, Not a Restriction

The current codebase broadly contains three UI ownership levels:

### A. Project-level UI

Usually under `components/`.

Typical responsibility:

- generic UI primitives;
- shared feedback states;
- common layout helpers;
- media wrappers;
- app-wide visual infrastructure.

Examples: Button, Card, Text, Input, Dialog, Badge, Screen, AppImage, EmptyState.

### B. Feature-level UI

Usually under `features/<feature>/components/`.

Typical responsibility:

- UI that understands a specific feature/domain;
- UI reused by more than one screen inside that feature.

Examples: ProductCard, CartItemRow, OrderStatusBadge.

### C. Screen-local UI

Usually under `features/<feature>/screens/<screen>/components/`.

Typical responsibility:

- visual pieces used only by one screen or one tightly scoped screen flow.

Examples: ProductMediaGallery, VariantChoiceList, OutcomePanels.

### Redesign freedom

This is the **current organization**, not a mandatory final architecture.

The redesign agent may:

- create new project-level UI folders;
- reorganize shared primitives;
- promote a screen-local component when real reuse appears;
- move feature UI closer to a screen when reuse does not justify broader ownership;
- create new folders for feedback, motion, form controls, surfaces, navigation, data display, or other coherent UI concerns;
- vendor/wrap a library primitive at the narrowest ownership scope that makes sense.

Do **not** create duplicate generic primitives in multiple features when a shared project-level primitive is clearly the better abstraction. Likewise, do **not** promote feature semantics into global UI merely for the sake of reuse.

Large UI files should stay cohesive. When a screen/component grows into multiple independently meaningful visual or interaction regions, split it into colocated components/hooks/helpers rather than allowing one monolithic file to absorb the entire redesign.

---

## 4. Library / Primitive Reference

This section is informational. It tells the redesign agent what is available to draw from; it does **not** assign any specific primitive to any specific screen.

### 4.1 React Native Reusables (RNR)

Available RNR component families include:

- Accordion
- Alert
- Alert Dialog
- Aspect Ratio
- Avatar
- Badge
- Bottom Sheet / Sheet
- Button
- Card
- Checkbox
- Collapsible
- Context Menu
- Dialog
- Dropdown Menu
- Hover Card
- Input
- Label
- Menubar
- Navigation Menu
- Popover
- Progress
- Radio Group
- Select
- Separator
- Skeleton
- Slider
- Switch
- Table
- Tabs
- Textarea
- Toast / Sonner-style feedback
- Toggle / Toggle Group
- Tooltip

Use only what improves the product. Do not install or vendor every component by default.

### 4.2 Gluestack UI — Pattern Reference

Gluestack can be used as **design/component API inspiration** without introducing a second styling runtime merely for visual parity.

Useful pattern families include:

- Actionsheet
- Alert / AlertDialog
- Avatar
- Badge
- Button / ButtonGroup / spinner/icon slots
- Card
- Checkbox
- Divider
- Fab
- FormControl
- Grid / GridItem
- Heading
- HStack / VStack
- Icon
- Image
- Input with slots/adornments
- Link
- Menu
- Modal
- Popover
- Progress
- Radio / RadioGroup
- Select
- Slider
- Spinner
- Switch
- Tabs
- Text / Textarea
- Toast
- Tooltip

Treat these as patterns to study, not mandatory dependencies.

### 4.3 Lucide React Native

Current icon system. Commonly relevant families already identified in the project include:

- ShoppingCart, ShoppingBag, Package
- Search, Grid, SlidersHorizontal
- ArrowLeft, ChevronRight, X
- Clock, Timer, History, Calendar
- CheckCircle2, AlertTriangle, XCircle
- ChefHat, UserCheck
- Plus, Minus, Trash2
- RefreshCw, Check, Lock, LogOut

The redesign agent may choose different icons from the same library where a clearer semantic fit exists.

### 4.4 React Native Reanimated

Available for native motion, transitions, state changes, press feedback, skeletons, layout motion, countdowns, and other interaction polish.

Motion direction and parameters are intentionally **not specified here**. The redesign agent should derive them from the chosen design language and tablet interaction requirements.

---

## 5. Complete Known UI Inventory

**Requirement before planning:** Inspect every item below at least once, understand its current responsibility, and reconcile the list against the current source tree. Do not create the redesign plan until the current UI surface is fully accounted for.

### 5.1 Expo Router / Route Composition (`app/`)

- `app/_layout.tsx` — root providers, auth/role routing composition
- `app/index.tsx` — app entry routing/redirect
- `app/sign-in.tsx` — sign-in route
- `app/unauthorized.tsx` — unauthorized route
- `app/+not-found.tsx` — missing route fallback

#### Customer routes

- `app/(customer)/_layout.tsx` — customer shell, cart provider, recovery gate
- `app/(customer)/index.tsx` — catalog home route
- `app/(customer)/products.tsx` — products route
- `app/(customer)/product-detail.tsx` — product detail route
- `app/(customer)/categories.tsx` — categories route
- `app/(customer)/category-detail.tsx` — category detail route
- `app/(customer)/brands.tsx` — brands route
- `app/(customer)/brand-detail.tsx` — brand detail route
- `app/(customer)/search.tsx` — catalog search route
- `app/(customer)/cart.tsx` — full cart route
- `app/(customer)/checkout.tsx` — order review route
- `app/(customer)/checkout-success.tsx` — order success route

#### Preparation routes

- `app/(preparation)/_layout.tsx` — preparation navigation shell
- `app/(preparation)/index.tsx` — preparation workspace route
- `app/(preparation)/order-details.tsx` — preparation order details route
- `app/(preparation)/history.tsx` — preparation store-day history route

#### Development UI

- `app/(dev)/_layout.tsx` — dev tools shell
- `app/(dev)/ui-lab.tsx` — UI lab route

---

### 5.2 Project-level UI (`components/`)

#### `components/ui/`

- `components/ui/button.tsx` — shared button primitive
- `components/ui/card.tsx` — shared card/surface primitive
- `components/ui/text.tsx` — project typography abstraction
- `components/ui/badge.tsx` — shared badge/status pill
- `components/ui/dialog.tsx` — dialog primitive based on `@rn-primitives/dialog`
- `components/ui/adaptive-sheet.tsx` — responsive sheet/drawer abstraction
- `components/ui/progress.tsx` — progress primitive based on `@rn-primitives/progress`
- `components/ui/tabs.tsx` — tabs primitive based on `@rn-primitives/tabs`
- `components/ui/radio-group.tsx` — selection primitive based on `@rn-primitives/radio-group`
- `components/ui/separator.tsx` — divider/separator
- `components/ui/skeleton.tsx` — loading skeleton
- `components/ui/alert.tsx` — shared alert surface
- `components/ui/input.tsx` — shared input wrapper
- `components/ui/icon.tsx` — Lucide icon wrapper

#### `components/feedback/`

- `components/feedback/loading-state.tsx` — loading feedback
- `components/feedback/empty-state.tsx` — empty-result feedback
- `components/feedback/error-state.tsx` — full error/retry feedback
- `components/feedback/error-state.tsx` also owns compact `InlineError` feedback
- `components/feedback/confirm-dialog.tsx` — shared confirmation dialog
- `components/feedback/blocking-overlay.tsx` — blocking mutation/recovery overlay
- `components/feedback/offline-notice.tsx` — offline state notice
- `components/feedback/skeleton-list.tsx` — repeated loading placeholders

#### `components/layout/`

- `components/layout/screen.tsx` — safe-area/max-width screen wrapper

#### `components/media/`

- `components/media/app-image.tsx` — Expo Image/media wrapper with cache/fallback behavior

#### `components/app/`

- `components/app/env-gate.tsx` — environment/configuration gate UI
- `components/app/error-boundary.tsx` — catch-all React error UI
- `components/app/foundation-placeholder.tsx` — removed during redesign after confirming it had no consumers
- `components/app/ui-lab.tsx` — current component/token gallery and design-system playground

---

### 5.3 Auth UI (`features/auth/`)

#### Screens

- `features/auth/screens/sign-in-screen.tsx` — employee/kiosk sign-in screen
- `features/auth/screens/startup-screen.tsx` — session/startup resolving screen
- `features/auth/screens/unauthorized-screen.tsx` — profile authorization failure screen

#### Feature components

- `features/auth/components/sign-in-form.tsx` — email/password sign-in form

---

### 5.4 Catalog UI (`features/catalog/`)

#### Screens

- `features/catalog/screens/catalog-home/catalog-home-screen.tsx` — main customer discovery/home surface
- `features/catalog/screens/products/products-screen.tsx` — full products listing
- `features/catalog/screens/product-detail/product-detail-screen.tsx` — product detail/variant selection surface
- `features/catalog/screens/categories/categories-screen.tsx` — category listing
- `features/catalog/screens/category-detail/category-detail-screen.tsx` — category products/detail surface
- `features/catalog/screens/brands/brands-screen.tsx` — brand listing
- `features/catalog/screens/brand-detail/brand-detail-screen.tsx` — brand products/detail surface
- `features/catalog/screens/search/search-screen.tsx` — local catalog search surface

#### Screen-local components

- `features/catalog/screens/product-detail/components/product-media-gallery.tsx` — product media/gallery UI
- `features/catalog/screens/product-detail/components/variant-choice-list.tsx` — variant/option choice UI
- `features/catalog/screens/category-detail/components/category-brand-filter.tsx` — category brand filtering UI

#### Feature components

- `features/catalog/components/product-card.tsx` — product listing card
- `features/catalog/components/category-card.tsx` — category card
- `features/catalog/components/brand-card.tsx` — brand card
- `features/catalog/components/availability-badge.tsx` — customer-visible availability status
- `features/catalog/components/catalog-grid.tsx` — product/list grid abstraction
- `features/catalog/components/catalog-navigation.tsx` — catalog navigation/header UI

---

### 5.5 Cart UI (`features/cart/`)

#### Screens

- `features/cart/screens/full-cart/full-cart-screen.tsx` — dedicated full cart screen

#### Feature components

- `features/cart/components/quick-cart-sheet.tsx` — quick cart drawer/sheet
- `features/cart/components/cart-item-row.tsx` — editable cart line UI
- `features/cart/components/quantity-stepper.tsx` — cart quantity control

---

### 5.6 Catalog ↔ Cart Integration UI (`features/catalog-cart-integration/`)

- `features/catalog-cart-integration/components/add-to-cart-button.tsx` — catalog-to-cart primary action
- `features/catalog-cart-integration/components/cart-access-button.tsx` — persistent/header/floating cart access UI
- `features/catalog-cart-integration/components/catalog-cart-provider.tsx` — integration provider coordinating cart UI
- `features/catalog-cart-integration/components/quick-cart-context.tsx` — quick cart presentation state/context

The latter two are mostly coordination/headless components, but inspect them because they determine where global customer-cart UI is mounted and how it opens/closes.

---

### 5.7 Checkout UI (`features/checkout/`)

#### Screens

- `features/checkout/screens/order-review/order-review-screen.tsx` — final order review/submission UI
- `features/checkout/screens/order-success/order-success-screen.tsx` — confirmed order/success/reset UI

#### Screen-local components

- `features/checkout/screens/order-review/components/outcome-panels.tsx` — stock conflict, unknown outcome, and failure presentation
- `features/checkout/screens/order-success/components/success-countdown.tsx` — inactivity/reset countdown presentation

#### Feature components

- `features/checkout/components/order-line-row.tsx` — read-only checkout/order line
- `features/checkout/components/conflict-row.tsx` — requested-vs-available conflict presentation
- `features/checkout/components/recovery-gate.tsx` — recovery/verification gate presentation and mount point

---

### 5.8 Preparation UI (`features/preparation/`)

#### Screens

- `features/preparation/screens/workspace/workspace-screen.tsx` — main preparation board/workspace
- `features/preparation/screens/order-details/order-details-screen.tsx` — detailed order view
- `features/preparation/screens/store-day-history/store-day-history-screen.tsx` — store-day history surface

#### Screen-local components

- `features/preparation/screens/workspace/components/board-section.tsx` — one preparation board section/column/tab

#### Feature components

- `features/preparation/components/order-card.tsx` — active order card
- `features/preparation/components/order-status-badge.tsx` — order status display
- `features/preparation/components/cancel-order-dialog.tsx` — cancellation UI

---

## 6. UI Surfaces the Redesign Must Account For

When reconciling the source tree, ensure the redesign plan covers all relevant visual/interaction states, not only the happy-path screens:

- startup/session resolving
- sign-in
- unauthorized/access failure
- not-found/recovery
- catalog discovery
- product listing
- product details
- category/brand discovery and detail
- search
- add-to-cart interaction
- quick cart
- full cart
- order review
- stock conflict
- unknown checkout outcome / safe retry presentation
- checkout failure
- recovery/verification
- order success
- kiosk reset/countdown presentation
- preparation workspace
- order details
- cancellation interaction
- store-day history
- loading states
- empty states
- error/retry states
- offline states
- blocking states
- disabled/locked states
- image fallback/loading states
- development UI lab/design-system validation surface

This list describes **coverage**, not appearance.

---

## 7. Data and Behavior Awareness for UI Work

The redesign agent is free to change visual composition and interaction presentation, but it must first understand the existing behavior exposed to each screen/component.

If a proposed design requires information that is not currently exposed to the UI:

1. Determine whether the value can be safely derived from existing feature data.
2. If not, identify it explicitly as a **data/product requirement** rather than fabricating it in production UI.
3. Do not add new raw backend access, business semantics, thresholds, workflow states, or server contracts merely to satisfy a visual concept unless that change is separately approved.

Examples of unsupported assumptions that must not be invented without verification include concepts such as “featured” products, exact stock counts, preparation SLAs, priority scores, predefined cancellation taxonomies, or other new domain meaning.

---

## 8. What This Reference Deliberately Does Not Decide

This document intentionally does **not** choose:

- brand colors;
- light/dark visual direction;
- typography family;
- glassmorphism, gradients, shadows, blur, glow, or flat design;
- card geometry;
- navigation appearance;
- product-detail composition;
- catalog layout direction;
- cart layout direction;
- checkout visual metaphor;
- preparation/KDS visual language;
- motion style or spring values;
- whether a specific current component should be retained or replaced;
- whether RNR, a custom primitive, or another suitable implementation should back a given component;
- the final directory structure for project-level UI.

Those are redesign decisions to be made by the agent after inspection, skill use, UX reasoning, and planning.

---

## 9. Pre-Plan Audit Completion Gate

Before writing the redesign implementation plan, the agent should be able to answer all of the following from the current source tree:

- Have all routes with visible UI been inspected?
- Have all project-level UI components been inspected?
- Have all Auth UI files been inspected?
- Have all Catalog UI files been inspected?
- Have all Cart UI files been inspected?
- Have all Catalog↔Cart UI files been inspected?
- Have all Checkout UI files been inspected?
- Have all Preparation UI files been inspected?
- Have loading, empty, error, offline, blocking, recovery, and disabled states been accounted for?
- Have any UI files missing from this reference been discovered and added to the redesign scope?
- Is the agent clear which files are visual/presentation code versus behavior/state/domain code that should only be read when necessary to preserve behavior?
- Is the agent clear on the available UI libraries/primitives and installed design/frontend skills?

Only after this reconciliation should the agent form its own design direction, design system, component architecture, and implementation plan.

---

## 10. Reference Summary

The redesign starts from a mature functional product with a wide existing UI surface. This file exists to make sure the agent sees that surface **completely** before making design decisions.

The expected sequence is conceptually:

```text
Installed design/frontend skills
        +
This compact UI/component reference
        +
Current source tree
        ↓
Complete UI inspection
        ↓
Agent's own UX / visual audit
        ↓
Agent's own design direction
        ↓
Agent's own design system & component architecture
        ↓
One full redesign implementation
```

The source tree remains the authority for what currently exists. This document is the checklist and orientation layer that prevents any UI surface from being missed.
