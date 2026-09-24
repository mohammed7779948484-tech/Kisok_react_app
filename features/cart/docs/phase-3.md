# Phase 3 — Cart to confirmed order

Status: READY

## Brief and direction contract

Mode: Operate. Customers use a shared Android tablet at arm's length.
The current Catalog implementation and semantic tokens are the visual authority;
the older global DESIGN.md palette description is stale.

- P3-01: Quick Cart is a bounded read-only preview, with useful whole-cart context.
- P3-02: Full Cart is the editable final review, with direct Confirm Order.
- P3-03: Landscape has an independently scrolling selection list and action rail;
  portrait has a list and fixed confirmation area. Growable lists use FlashList.
- P3-04: Customer line captions share one presentation helper, retain structured
  options, suppress repeated labels, and use contained portrait product imagery.
- P3-05: Browsing cart chrome reserves its own space and cannot escape recovery.
- P3-06: Submission, conflict, unknown, failure and staff holds own clear surfaces.
- P3-07: Confirmed order number is immediately visible, even while settings load;
  next-customer cleanup and absolute-deadline/AppState safety remain intact.
- P3-08: Preserve durable cart/attempt engines and exact ambiguous replay identity.

Thesis: an editable packing workspace ends in one explicit confirmation, then a
clear staff-readable order number. No intermediate review page.
Own-world: Catalog's existing semantic surfaces, system typography and contained
packaging imagery. Quiet separators, generous grouping, no nested card stack.
Story: inspect selections, adjust, confirm once, understand the actual outcome.
First viewport: Cart heading and browse escape; landscape list occupies the wide
left region and summary/action rail the right. Success leads with confirmation
and the order number; submitted items and tablet reset are secondary.
Form: user-pinned tablet workspace and order-number-first outcome, implemented
code-led within the established visual system.
Finish: source review and targeted verification; runtime appearance remains
unverified because this phase explicitly excludes browser/device execution.

## Audit and architecture

Read-only parallel audits covered cart, checkout, integration, customer routes,
shared UI/feedback/layout, responsive APIs, installed libraries and Catalog.
The sole submission contract remains create_order(client_request_id, items), as
defined in 20260826050007_lean_create_order.sql. It accepts up to 100 normalized
variants; cart snapshots are not row-bounded. No new data reads or Realtime.

Checkout already depends on Cart. Checkout will compose Cart's FullCartScreen
through an additive action slot and interaction-disabled seam. Cart never imports
Checkout. The existing review screen is renamed/reworked as CartOrderScreen;
/cart renders it and /checkout becomes a compatibility redirect without submit.
The controller remains mounted when successful cleanup empties the cart.

## Tasks and shape

| Task | Mode                       | Acceptance | Scope / verification                                                                                   |
| ---- | -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------ |
| A1   | behavior-change            | P3-01–04   | Cart rows, preview, FullCartScreen, line display helper; affected cart tests                           |
| A2   | behavior-change            | P3-05      | Integration provider/context/add button and customer layout; chrome tests and affected Catalog spacing |
| A3   | behavior-change            | P3-02,08   | Checkout-owned direct confirmation, routes and focused orchestration tests                             |
| B1   | refactor / behavior-change | P3-06–08   | Outcome/recovery/success presentation and pending-settings behavior; focused checkout tests            |
| V1   | config                     | all        | Required checks, multiple source review passes, independent review, commits and push                   |

A3 depends on A1. B1 follows A3. A2 does not change cart or checkout engines.
Existing feature workspaces/components/screens are refactored in place. No new
schema/query/mutation/store/realtime capabilities. No new generic UI primitive
or library needed: installed AdaptiveSheet, Dialog, ConfirmDialog, FlashList,
AppImage, Button, Text, Spinner and Alert cover the actual interactions.
Allowed manual artifact: cart/model/customer-line-identity.ts and its focused
test, a pure presentation mapper (no generator capability fits). Export via Cart
for existing Checkout consumers. Existing screen/test rename is a move, not a
new scaffold. Additional structural capabilities require a plan update first.

External paths: features/catalog-cart-integration/\*\* owns browsing chrome;
app/(customer)/{\_layout,cart,checkout}.tsx owns thin composition;
features/catalog/components/catalog-grid.tsx and catalog-home/product-detail
screens lose floating-button bottom-clearance geometry. Checkout files implement
the above orchestration and outcome presentation. No shared foundation changes
are currently required.

## Safety and verification

Immediate single-flight submit/replay guard; disable edits through preparation;
guard already-open destructive confirms; explicit return-to-edit after definite
outcomes; preserve unknown/held escape restrictions. Recycled rows must not retain
another selection's open dialog. Preview tracks a just-added selection ephemerally,
not by assuming the last persisted row was most recently added.

Run targeted affected Jest tests, pnpm typecheck, pnpm lint, pnpm format:check,
git diff --check. No full-suite, browser automation, Android build, Playwright,
Maestro or E2E execution. Source-review UX journey, responsive layout,
accessibility, state safety, boundaries, visual consistency and obsolete UI.
Record actual evidence, not inherited historical PASS claims.

Requested commits: refactor(cart): rebuild customer cart experience;
refactor(checkout): rebuild order submission experience. Push origin/redesign.
