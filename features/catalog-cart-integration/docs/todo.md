# CatalogCartIntegration — execution state

**This file is the working memory.** After a context compaction, an interrupted
session, or a handoff, this is what tells the next agent exactly where the work
stopped and what the next legal move is. Keep it current as you go, not at the
end.

Reasoning lives in `plan.md`; evidence lives in `worklog.md`. Do not restate
either here — a `todo.md` that duplicates the plan stops being scannable, which
defeats its only purpose.

## Current checkpoint

```
Current round     : 2 (of 2)
Current task      : — (T03 PASS; next: delegate T04 — scaffold already on disk)
Last gate         : T03 GATE: PASS (fresh reviewer 0 blocking / 1 major doc-reconciliation + 2 minors — all closed by the Lead; see review.md)
Next legal action : delegate T04 (persistent affordance + layout mount), then T05; NO export/live journey until T04 mounts the provider (C-T03-R2)
Blocked by        : —
```

## Rules

- A task is **DONE only at `GATE: PASS`**.
- **Task N+1 does not start until every dependency is `PASS`.**
- A failed gate is fixed **in that task**, not compensated in a later one.
- Every task declares a **verification mode** first — see the
  `test-driven-development` skill. All integration tasks are `behavior`.
- **The Lead runs the scaffold** immediately before delegating the task.
- Files outside `features/catalog-cart-integration/**` are touched ONLY by the
  Lead (the two plan-justified edits in T03/T04 are delegated with explicit
  allowed-file scope including them).

## Status board

| Task | Mode     | Acceptance                                       | Objective                                         | Deps     | Stage       | Gate |
| ---- | -------- | ------------------------------------------------ | ------------------------------------------------- | -------- | ----------- | ---- |
| T01  | behavior | Supporting AC-03, AC-04                          | Pure buildAddToCartInput mapping model            | —        | done        | PASS |
| T02  | behavior | Acceptance AC-01, AC-05; Supporting AC-08, AC-09 | Quick-cart context + experience provider          | —        | done        | PASS |
| T03  | behavior | Acceptance AC-02, AC-03, AC-04, AC-05            | AddToCartButton + Product Detail wiring           | T01, T02 | done        | PASS |
| T04  | behavior | Acceptance AC-06                                 | Persistent cart affordance + layout mount         | T02      | not started | —    |
| T05  | behavior | Acceptance AC-07, AC-08, AC-11                   | Integration convergence + public API + boundaries | T03, T04 | not started | —    |

Stage is one of: `not started` · `scaffolding` · `red/baseline` ·
`implementing` · `green` · `checks` · `diff review` · `done`.

## Round 1 — the seam (domain + shell)

### T01 — Pure mapping model

- **Mode**: behavior
- **Acceptance**: Supporting: AC-03, AC-04
- **Depends on**: —
- **Skills**: test-driven-development
- **Lead scaffold**: N/A — no capability fits (mapper; plan "Allowed manual
  files")
- **Allowed manual files**: `model/add-to-cart-mapping.ts` +
  `model/add-to-cart-mapping.test.ts`
- **Allowed file scope**: `features/catalog-cart-integration/model/**`
- **Spec**: `CatalogCartSource` structural type (productId, productName,
  variant {id, titleOverride, isAvailable, primaryImageUri, options[]},
  variantCount, variantIndex); `buildAddToCartInput` → the cart's
  `AddToCartInput` with the plan decision-3 label rule, quantity 1,
  imageUri chain, option selections; anti-duplication invariant tests; output
  key-set pin (no forbidden fields).

### T02 — Quick-cart context + experience provider

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-01, AC-05; Supporting: AC-08, AC-09
- **Depends on**: —
- **Skills**: test-driven-development, kisok-design-system, expo-router
- **Lead scaffold**: `pnpm generate component catalog-cart-integration
catalog-cart-provider`
- **Expected generated files**: `components/catalog-cart-provider.tsx` (+ test)
- **Allowed manual files**: `components/quick-cart-context.tsx` (+ test may
  live in the provider test file or its own)
- **Allowed file scope**: `features/catalog-cart-integration/components/**`
- **Spec**: context exposes open state + open/close; provider mounts
  `useCart()` (hydration session-wide), renders `QuickCartSheet` (public
  component, controlled open, `onViewFullCart` → `router.push("/cart")`);
  children render first; cleanup registration observed through the public
  import path (R-FR-05 closure).

## Round 2 — the visible seam (surface + convergence)

### T03 — AddToCartButton + Product Detail wiring

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-02, AC-03, AC-04, AC-05
- **Depends on**: T01, T02
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules
- **Lead scaffold**: `pnpm generate component catalog-cart-integration
add-to-cart-button`
- **Expected generated files**: `components/add-to-cart-button.tsx` (+ test)
- **Allowed manual files**: — (the Product Detail edit is a delegated
  owning-feature edit with explicit scope)
- **Allowed file scope**: `features/catalog-cart-integration/components/**`,
  `features/catalog/screens/product-detail/product-detail-screen.tsx`,
  `features/catalog/screens/product-detail/product-detail-screen.test.tsx`
  (the two Catalog files ONLY as the plan-justified owning-feature edit)
- **Spec**: button maps source → input (T01 mapper), calls `addItem`,
  opens quick cart (context); disabled when variant unavailable, cart
  locked, OR the cart is not yet hydrated (F-R1-1 — the async durable
  read means `hydrated === false` is a real transient window in which
  addItem would be a logged no-op; disable is safe because hydrate()
  terminates with `hydrated: true` on every path, so no permanent-disable
  risk); a test presses Add during the pre-hydration window; Product
  Detail builds the source from its resolved view and renders the button
  below the variant list; existing Product Detail behavior unchanged.

### T04 — Persistent cart affordance + layout mount

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-06
- **Depends on**: T02
- **Skills**: test-driven-development, kisok-design-system, kisok-react-native-rules, expo-router
- **Lead scaffold**: `pnpm generate component catalog-cart-integration
cart-access-button`
- **Expected generated files**: `components/cart-access-button.tsx` (+ test)
- **Allowed manual files**: —
- **Allowed file scope**: `features/catalog-cart-integration/components/**`,
  `app/(customer)/_layout.tsx` (the thin provider mount — Lead-sanctioned
  layout edit; stays logic-free)
- **Spec**: affordance = Button (icon size, 48dp) + Badge (count text when
  > 0. absolutely positioned bottom-end with safe-area insets; provider
  >    renders it; hidden on `/cart` (usePathname); press → quick cart opens
  >    with zero cart mutation; badge = totalQuantity from the single model.

### T05 — Integration convergence

- **Mode**: behavior
- **Acceptance**: Acceptance: AC-07, AC-08, AC-11
- **Depends on**: T03, T04
- **Skills**: test-driven-development, expo-router
- **Lead scaffold**: N/A — convergence/pin tests
- **Allowed manual files**: — (the public index trio was already wired in
  T03 as a structurally forced, documented deviation — the task-mandated
  public import could not resolve against an empty index; T05 OWNS the
  key-equality pin that locks the surface, boundary scans, and the
  convergence regression nets; C-T03-R1 reconciliation)
- **Allowed file scope**: `features/catalog-cart-integration/**`
- **Spec**: public index pinned by key equality; add same selection ×2 →
  merged line; different variant/options → distinct lines; re-hydration
  keeps lines; boundary scans (no deep imports, no Supabase in the
  integration); both-frame affordance/sheet checks as applicable.

## Feature gate checklist

- [ ] Every Task Gate PASS
- [ ] Every Round Gate PASS
- [ ] Every AC verified (incl. the live hosted journey)
- [ ] `pnpm verify` PASS after the final change
- [ ] `pnpm export:web` PASS
- [ ] required fast GitHub CI PASS on the final HEAD
- [ ] real hosted Customer Catalog → Local Cart journey verified live
- [ ] protected PRs untouched (verified at handoff)
- [ ] reviewer findings dispositioned; blocking/major fixes re-reviewed
- [ ] Quality Audit clean
- [ ] anything not verified explicitly recorded

## Blocked

- —
