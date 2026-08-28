# KISOK — product and design overview

The design index for the project. The reusable pieces — tokens, components,
responsive rules, accessibility — are documented in
[`docs/design-system.md`](./docs/design-system.md). This file describes **what
KISOK is** and the surfaces it will grow.

> Replaces the generic mobile-starter design document that shipped with the
> template. That document described a phone-first iOS starter and was wrong for
> this project in almost every respect.

## What we are building

A **private in-store catalog and ordering system** running on store-owned
Android tablets. A customer standing in the shop browses the catalog, chooses a
product variant, builds a local cart, and submits one order. A preparation
employee works that order through fulfilment.

It is not an e-commerce app. See
[`docs/product-boundaries.md`](./docs/product-boundaries.md).

## Design principles

**Tablet-first, touch-first.** The real device is a store tablet used standing
up, at arm's length, often in both orientations. Not a phone, not a desktop.
Every layout must work in portrait and landscape.

**Premium and calm.** Retail, not admin dashboard. Generous type, generous
spacing, restrained colour, real photography given room. The customer is
choosing a product, not operating software.

**Legible at a distance.** Larger base sizes than a phone app. Touch targets
never below 48dp.

**Quiet.** An idle kiosk sits in a shop. No looping animation, no shimmer,
nothing that pulls the eye. A slow fade at most.

**Honest about state.** Loading, empty, error, and retry are designed states,
not afterthoughts. A customer who hits a dead end asks an employee for help —
which is the failure we are designing against.

**No financial UI.** No prices, no totals, no payment. A deliberate boundary.

## Colour

A warm near-white ground with deep ink text, a **deep emerald** primary, and an
**amber** accent. Emerald reads fresh and retail rather than defaulting to the
generic software blue; amber gives a warm highlight for featured content without
competing with the primary action.

Full token list and the dark palette:
[`docs/design-system.md`](./docs/design-system.md).

## Layout sizes

| Size       | Width    | Context                                                |
| ---------- | -------- | ------------------------------------------------------ |
| `compact`  | < 768    | Narrow browser preview during development              |
| `medium`   | 768–1023 | **Tablet portrait — the primary in-store orientation** |
| `expanded` | ≥ 1024   | Tablet landscape                                       |

Web preview is a first-class _development_ target: agents verify UI in a browser
without an Android device for every change. It is not a shipping surface.

---

## Surfaces

Planned product surfaces. **These are not instructions to build now** — they
describe the shape the foundation must support. Each will be its own feature,
generated with `pnpm ignite feature`.

### Customer

| Surface                      | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| Home                         | Store identity and fast discovery: featured products, brands, categories |
| Products                     | Every visible orderable product                                          |
| Brands · Brand detail        | Discovery by brand, then products scoped to it                           |
| Categories · Category detail | Visual category browsing, subcategories, brand filter                    |
| Search                       | Fast local search over the catalog snapshot                              |
| Product detail               | Variant/option selection, availability, quantity, add to cart            |
| Cart sheet                   | The adaptive surface: side panel in landscape, bottom sheet otherwise    |
| Cart                         | Full cart management before review                                       |
| Review                       | Final confirmation before submission                                     |
| Success                      | Order reference, submitted items, safe reset for the next customer       |
| Track order                  | **Blocked** — no secure backend contract yet (ADR 0006)                  |
| Maintenance                  | Hidden employee diagnostics, refresh, safe reset, sign out               |

### Preparation

| Surface          | Purpose                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Active workspace | New / Preparing / Ready — three columns in landscape, tabs when narrower |
| Order details    | One order, its immutable item snapshots, and the allowed actions         |
| History          | Completed and cancelled orders for the store day                         |

## Design freedom, and its limits

The Flutter application is a **behavioural** reference. Do not reproduce its UI
pixel for pixel. The React implementation should improve navigation, hierarchy,
density, the option selector, the success screen, and the preparation board.

What must **not** change casually are the reliability guarantees:
idempotent checkout, an ambiguous result treated differently from a failure, the
cart clearing only after confirmed success, a stock conflict never silently
mutating the cart, and reset or sign-out never risking a duplicate order. Those
are listed in
[`docs/product-boundaries.md`](./docs/product-boundaries.md#invariants-that-must-not-be-casually-changed).

## Seeing the design system

```bash
pnpm web    # then open /ui-lab
```

Every token, component, and state in one page, with the current width and
orientation shown. Development-only.
