# Phase 4 — execution evidence

Baseline before any change (develop @ fd77e4f): `pnpm typecheck` clean; `pnpm test` 97 suites / 1241 tests PASS.

## A1 — AddToCartButton controlled quantity

- Mode: behavior. Scaffold: N/A (existing component). Implementer: feature-implementer; Lead verified.
- RED: `pnpm exec jest features/catalog-cart-integration/components/add-to-cart-button.test.tsx` →
  2 new tests failed with `Unable to find an element with role: button, name: Add 3 to cart`
  (the prop was ignored; button showed its internal 1). 8 existing tests green.
- GREEN: `pnpm exec jest features/catalog-cart-integration` → 5 suites / 53 tests passed.
- Checks: eslint clean, prettier clean, typecheck clean.
- Diff review (Lead): optional `quantity`/`onQuantityChange`; one setter routes to the
  callback when controlled; uncontrolled path unchanged; stock clamping untouched.
- GATE: PASS

## A2 — CatalogGrid extraData / bottomInset / accessibility passthrough

- Mode: behavior. Scaffold: N/A (existing component). Implementer: Lead.
- RED: 3 new tests in `catalog-grid.test.tsx` ("selection grids") failed:
  `Expected: > 3 Received: 3` (no re-render on extraData), `Expected: "radiogroup" Received: undefined`,
  contentContainerStyle paddingBottom 40 ≠ 120.
- GREEN: `pnpm exec jest features/catalog/components/catalog-grid.test.tsx` → 17 passed.
- Checks: typecheck clean; eslint clean; prettier clean after `--write` on the test.
- GATE: PASS

## B1 — guided-discovery model

- Mode: behavior. Scaffold: N/A (pure domain model). Implementer: feature-implementer; Lead
  verified and extended in-task.
- RED: against a typed stub, `pnpm exec jest features/catalog/model/guided-discovery.test.ts`
  → 28 failed / 1 passed (assertion failures, not import errors).
- GREEN: 29 passed. Fixture mirrors the real catalog shape (4 roots, single-Flavor vapes with
  shared/drifted spellings, pouches with fixed Strength, title-only variants, sold-out items).
- Lead review found two gaps, fixed in this task test-first:
  - term ignored product/brand names ("focus" → false no-match): RED `Expected - 3 / Received + 1`;
  - suggestions repeated an answered option type: RED `Expected value: not "Cool mint"`
    (first version of that test was vacuous — it never reached the text step; rewritten).
- GREEN after fixes: `pnpm exec jest features/catalog/model` → 99 passed. eslint/prettier clean.
- Decisions accepted: the 8-value tap cap applies to brand too; malformed `match` entries ignored.
- GATE: PASS

## A3 — Option Browser, lifted quantity, Back handling

- Mode: behavior-change. Scaffold (Lead): `pnpm generate component catalog option-browser
--screen=product-detail` → `components/option-browser.tsx` (placeholder replaced).
- Implementer: feature-implementer; Lead verified and fixed one defect in-task.
- RED: `pnpm exec jest features/catalog/screens/product-detail` → 9 failed / 29 passed
  (new copy, `browseOrder is not a function`, `Unable to find … Browse all 30 flavors`).
- GREEN: 38/38; mutation checks (drop `browseOrder`, drop controlled quantity, drop the Back
  handler) each fail their tests.
- Lead review defect: the landscape context column used a full-width square image above the
  Order Bar in a non-scrolling column — at 1280×800 a selected option with its stepper would
  push the Order Bar off-screen (violates GD-02). Fixed: the image takes only leftover height
  (`flex-1`, `maxHeight` 400). Jest runs portrait, so this is verified at runtime, not here.
- Affected: `pnpm exec jest features/catalog` → 30 suites / 341 passed; typecheck 0 errors;
  eslint/prettier clean.
- Not covered by jest: split layout (≥900) and column counts — runtime check pending;
  Back handling with real navigator focus — device check pending.
- GATE: PASS

## B2 — Help Me Choose screen + route

- Mode: behavior. Scaffold (Lead): `pnpm generate screen catalog help-me-choose`;
  `pnpm generate route catalog help-me-choose --role=customer --screen=help-me-choose`
  (export added to `features/catalog/index.ts`). Implementer: feature-implementer; Lead verified.
- RED: placeholder → 18 failed (`Unable to find an element with role: link, name: KISOK Test
Store, explore the store`). GREEN: 18 passed, zero console output; mutation checks on
  reconcile and Clear each fail their tests.
- Scope trim (Lead): Home chips will start Help Me Choose scoped by root category instead of a
  `start` dimension — in the real catalog a Flavor tap question would list ~200 values.
- Runtime (web, real-shaped catalog — see "Runtime harness" below) found and fixed:
  - split layout inverted at 1280 (web ScrollView grew in the row) → pinned column width;
  - suggestions were noise with real data (unique flavours) → only values shared by ≥2
    products (model rule + tests updated, behavior-change);
  - card copy "Matched Matching · 1 option" → "Matched Your choices · 1 option".
- After fixes: `pnpm exec jest features/catalog` → 30 suites / 362 passed; typecheck 0; lint clean.
- GATE: PASS

## B3 — `match` hand-off into Product Detail

- Mode: behavior. Scaffold: N/A (existing files). Implementer: Lead.
- RED: PD "opened from Help Me Choose" — order and "N flavors match your choices." absent
  (2 failed; the ignore-non-matching test passed as expected); HMC hand-off — params lacked
  `match`.
- Implementation: `productDetailHref(id, backLabel, match)`; route reads `match`; Product
  Detail orders matching available variants first (preview and browser) and states the count;
  never selects; a non-matching term is never serialised.
- GREEN: catalog suite 362 passed; runtime: Help Me Choose → "mint" → Geekbar 25k opened with
  `match=t.mint`, "1 variation matches your choices." and the match first.
- GATE: PASS

## Runtime harness (evidence method)

No Customer credentials exist in this environment. The real app ran under `pnpm web`
(Metro dev, CI mode) driven by Playwright with network mocks: a stored session, the
`current_active_profile` RPC returning a customer, and `get_customer_catalog_v2` returning a
v2 snapshot generated from REAL Test_kisok labels (read-only query): UT 50K (46), Geekbar 25k
(40, many unavailable), 7-Hydroxy (30 titled), Zyn 9mg (16, Flavor+Strength), Zyn 15mg,
Perks, Pebble. Sizes: 1280×800, 768×1024, 600×900. All scenarios: zero page errors.

- Product Detail: preview 6 + "Browse all 46 variations"; browser 3 columns at 1280 after
  tuning (`TILE_MIN_WIDTH` 280→230); Order Bar visible with selection + quantity; search
  "mint" → 3 of 46 with unavailable marked; closing the browser keeps "Add 3 to cart" at all
  three sizes.

## B4 — entry points (GD-09)

- Mode: behavior-change. Scaffold (Lead): `pnpm generate component catalog help-me-choose-pill`
  → `components/help-me-choose-pill.tsx`. Implementer: feature-implementer; Lead verified.
- RED: 23 failed / 126 passed (`Unable to find … button, name: Help me choose`, clearance
  constant undefined, cart button absent on `/help-me-choose`).
- GREEN: `pnpm exec jest features/catalog features/catalog-cart-integration` → 31 suites /
  375 passed; typecheck 0; eslint/prettier clean.
- Delivered: extended pill (Compass + "Help me choose", `bg-card`, secondary to the filled
  cart), opt-in `CatalogShell` prop, scoped on Category/Brand detail, bottom clearance on the
  5 screens; Home panel → Help Me Choose CTA + root-category quick starts (option-type text
  search chips removed); `/help-me-choose` added to `CATALOG_BROWSING_ROUTES`.
- Lead check: `Screen` default edges exclude bottom, so `insets.bottom + 16` is not doubled.
- Runtime (1280×800, 768×1024): Home panel renders; pill bottom-right on Products, readable,
  not competing with Cart; pill → `/help-me-choose`; cart access present there; zero errors.
- GATE: PASS

## Review remediation (findings in `review.md`)

- M-01 (bug): RED `product-detail-screen.test.tsx` "brings the Order Bar back when the keyboard
  hides…" failed (bar never hid on `keyboardDidShow`). Fix: keyboard-driven visibility. GREEN 42/42.
- m-01 (bug): RED "drops a scope with nothing in stock on first open…" showed the notice. Fix:
  announce only after a refresh. GREEN 20/20.
- m-02 (bug, maintenance): RED "keeps staff on the page while signing out…" `Expected: true,
Received: undefined` (no Back handler). Fix in `maintenance-screen.tsx`. GREEN 10/10.
- m-03/m-07 (bug + test quality): RED `useHelpMeChoosePillLayout is not a function`. Fix: one hook
  for offset and clearance; 5 screens + shell switched. GREEN.
- m-05 (record): `features/catalog/screens/help-me-choose/components/{answer-chip,choice-tile,
no-text-match,question-panel}.tsx` were written by hand inside B2's scope. They are
  screen-private presentational pieces (the placement `component --screen=help-me-choose`
  would produce); no generator command was run for them. Recorded here as planned manual
  artifacts of B2 rather than regenerated, to avoid churn with identical output.
- m-06: deleted `features/catalog/model/discovery-presentation.ts` (dead); typecheck 0.
- After all: `pnpm exec jest features/catalog features/maintenance` → 32 suites / 388 passed;
  eslint clean; typecheck 0.

## Re-review remediation (N-01–N-04, `review.md`)

- N-01 (bug): new `components/option-browser.test.tsx` "shows the Order Bar again after
  rotating away and back while the keyboard was up". RED against the previous
  `option-browser.tsx`: failed (bar still hidden after stacked → split → stacked). Fix: seed
  from `Keyboard.isVisible()` on subscribe, reset on cleanup. GREEN.
- N-02 (test quality): the M-01 test now focuses "Search flavors" before `keyboardDidShow`
  and sends `keyboardDidHide` without a blur, so a focus-driven regression fails it; its
  `Keyboard` spy is restored in a scoped `afterEach`.
- N-03: orphan comments removed from `categories-screen.tsx` and `category-detail-screen.tsx`.
- N-04 (maintenance): see `features/maintenance/docs/worklog.md`.
- Runtime finding R-01 (portrait, after remediation): stacked Help Me Choose said the
  no-match sentence twice (panel + results). RED "says no-match once when the questions sit
  above the results" → `Expected length: 1, Received length: 2`. Fix: the results region
  repeats it only in the split layout. GREEN 21/21.
- RED re-confirmed for both new tests by restoring the previous source of
  `option-browser.tsx` and `help-me-choose-screen.tsx`: `Tests: 2 failed, 20 passed`;
  sources restored → green.
- Affected suites: product-detail, help-me-choose, maintenance, categories, category-detail
  → `Tests: 103 passed, 103 total`.
- Commits: bdc874a (N-01/N-02), 80bec6e (R-01), 9e1204c (N-04), 747d8dd (N-03).

## Feature gate

**Runtime on the final code (747d8dd), web under `pnpm web` with the harness above,
server restarted on that tree.** Every scenario at 1280×800, 1024×768, 768×1024 and
600×900, zero page errors in all 13 runs:

- Product Detail (UT 50K, 46): preview → "Browse all 46 variations" → select → quantity 3 →
  search "mint" → back; the Add label reads "Add 3 to cart" after closing the browser at all
  four sizes. 1024×768: 2 columns, context column with the Order Bar on screen.
- Help Me Choose, full path at all four sizes: Vape Products → skip brand → "mint" →
  "bubblegum" (no-match: other answers kept, term editable, Clear offered; stacked shows the
  sentence once) → Clear → "mint" → Geekbar 25k opened with `match=t.mint`.
- Entry: Home panel; Products pill → `/help-me-choose`, cart access present there.
- Staff (1280×800): 3 s hold → Staff page → Sign out → `/sign-in`.
- Post-remediation layout (keyboard-driven Order Bar, inset-aware pill clearance) is
  covered by these runs; web has no soft keyboard, so the keyboard path itself remains a
  jest + device item.

**200% text: UNVERIFIED.** The harness option that doubles the root font size does not
emulate text scaling: React Native Web sets font sizes in px, so only rem-based spacing
grew and text stayed the same size (screens checked: Product Detail browser at 1280,
Help Me Choose at 1024). There is no faithful web emulation; it moves to the Android
device check (system font scale 200% on Product Detail's Order Bar, the Option Browser
context column and the Help Me Choose panel).

**Android: UNVERIFIED.** No device or emulator here; the label-gated Android/Maestro CI
jobs were not run on #42. Device checks pending: long-press timing, Android Back in the
Option Browser and on the Staff page, keyboard show/hide with the stacked Order Bar,
FlashList column changes on rotation, sign-out teardown on the native stack, TalkBack.

**`pnpm verify` on 747d8dd** (final code change): exit 0 — typecheck, lint, format
("All matched files use Prettier code style!"), `Test Suites: 104 passed, 104 total`,
`Tests: 1351 passed, 1351 total`, check:docs (103 files), check:commits (19 cases),
check:e2e-appid (2 flows), check:ci-scripts (5 workflows, 10 checks), db:verify
(16 tables, 3 enums, 11 functions), generator smoke test passed.

## Feature gate — CI

- GitHub CI run 37690946342 on 6dedba1 (final HEAD): **success** — Verify (typecheck, lint,
  format, tests, guards, db, generator), Web bundle, Expo doctor. Android build/E2E, Maestro
  and prebuild skipped (label-gated; Android recorded UNVERIFIED). The run on 747d8dd
  (37690777710) was cancelled by concurrency when 6dedba1 superseded it.
  https://github.com/mohammed7779948484-tech/Kisok_react_app/actions/runs/37690946342

## Round C — pre-merge human review of #42 (H-01–H-03)

The independent human review on a051f0b kept the direction approved and confirmed
the Android Dialog exit-animation mitigation from the Review Cart hotfix is intact
(neither the Option Browser nor the Staff page adds a Portal/Dialog/exiting
teardown path). Three items, recorded in `review.md`.

### C1 — quantity bound to its variant across a refresh (H-02)

- Mode: bug. Scaffold: N/A (existing screen). Implementer: Lead.
- RED: `product-detail-screen.test.tsx` "starts at 1 when a refresh removes the chosen
  option and leaves exactly one other" (Banana × 3 → refresh to Apple only) →
  `Unable to find an element with role: button, name: Add 1 to cart` — the single
  remaining option was offered with Banana's 3. Two guards passed on the old code, as
  expected: "keeps the quantity when the chosen option survives the refresh" and "keeps the
  quantity of a single-option product when that option survives".
- Fix: the quantity state records its variant (`{ variantId, value }`); the shown quantity
  is 1 unless it belongs to the effective selection; a selection whose variant a refresh
  removed is cleared in render (the screen's existing reconcile pattern).
- GREEN: `pnpm exec jest features/catalog/screens/product-detail` → 46 passed; typecheck 0.
- Mutation check: deriving the quantity without the variant check fails only the RED test
  (`Tests: 1 failed, 3 passed` in the refresh/browser subset); restored.
- Commit b324e81. GATE: PASS

### C2 — product keywords in Help Me Choose text (H-03)

- Mode: behavior. Scaffold: N/A (pure model). Implementer: Lead.
- RED: `guided-discovery.test.ts` "matches a term against the product's own keywords,
  still per available variant" → `Expected ["night"], Received []`.
- Fix: `variantText()` adds `product.search_keywords` beside the product and brand names;
  matching stays per available variant with the option answers (the test proves a keyword
  product is excluded when its only variant for the answer is unavailable).
- GREEN: `pnpm exec jest features/catalog` → 32 suites / 384 passed; typecheck 0; eslint clean.
- Commit 2fa4c34. GATE: PASS

### C3 — deterministic Option Browser journey on Android (H-01)

- Mode: config (E2E flow). Scaffold: N/A (existing flow).
- Read-only TEST check before pinning (Supabase SQL, no writes): UT 50K
  `7a7ed8a8-eeba-433d-abc2-0930c2f19593` — 46 active variants, 41 in stock, its one category
  active. Float 3k (display_order 2890) is first in store order, confirming the review's
  premise that the old "first available product" step could skip the browser.
- `catalog-review-cart.yaml`: pinned `LARGE_PRODUCT_ID` in `env`; taps its card by id;
  taps `catalog-option-show-all` unconditionally; waits for and asserts
  `catalog-option-browser`, asserts the rack is gone; selects the first available option
  inside the browser; asserts the browser again before `catalog-add-to-cart`; the Quick Cart
  → Review Cart → Keep browsing → reopen → Review Cart cycle is unchanged. Screenshots
  `catalog-review-cart-option-browser` and `-option-selected` added.
- `.github/scripts/run-maestro.sh` unchanged: per flow, one app process with the same PID
  alive at the end, no `am_crash`/`am_anr`/death, FATAL/ANR greps, redaction.
- Local: `pnpm check:e2e-appid` → "Maestro flows target com.kisok.kiosk (2 flow(s)
  checked)"; YAML parses (34 steps). Maestro cannot run here (no emulator); the evidence is
  the label-gated Android E2E job (below).
- Commit 1dfc1e9.

### Round C checks

- `pnpm verify` on 1dfc1e9 (final code change): exit 0 — `Test Suites: 104 passed, 104 total`,
  `Tests: 1355 passed, 1355 total`; typecheck, lint, format, check:docs (103), check:commits
  (19), check:e2e-appid (2 flows), check:ci-scripts, db:verify (16 tables, 3 enums,
  11 functions), generator smoke passed. commitlint over a051f0b..1dfc1e9: clean.
- Labels `android-build` and `e2e` added to #42 (requested by the reviewer).

### Round C — focused independent review (fresh `code-reviewer`, `a051f0b..1dfc1e9`)

0 blocking, 0 major, 4 minor, 3 info (dispositions in `review.md`). Fixes, test-first:

- R-01 (bug): a refreshed-away quantity was hidden, not dropped, so it could reappear if the
  option came back. RED "starts at 1 when a refresh swaps the only option away and later
  brings it back" (Apple×3 → Banana → Apple) → `Unable to find … Add 1 to cart`. Fix: the
  stale quantity is reset in render (same pattern as the selection). GREEN.
- R-02 (test gap): two tests pin the stale-selection reconcile — "treats the one option a
  refresh leaves as the current one, so tapping it keeps its quantity" and "does not re-pick
  a removed option when a later refresh brings it back". Mutation: deleting the
  `setSelectedId(null)` line fails both (`Tests: 2 failed, 5 passed`); restored.
- R-03 (test gap): the survival guards now prove the refresh landed ("Browse all 10
  flavors"; "20 → 15 available now" with a restocked snapshot, so structural sharing cannot
  make the refresh a no-op).
- R-04 (test gap): the keyword test asserts `matchingVariantIds` is only the available
  variant, in the result and through `serializeMatch` → `parseMatch` → `matchingVariantIds`.
  Mutation: removing the `is_available` gate fails it; restored.
- R-06 (optional, taken): the flow asserts `catalog-option-browser` again after Keep browsing.
- Commits 6f4ac4d, ff2d7d2, 48b6820. `pnpm exec jest features/catalog/screens/product-detail`
  → 49 passed; guided-discovery 32 passed; typecheck 0; eslint/prettier clean.
- `pnpm verify` on 48b6820 (final code change): exit 0 — `Test Suites: 104 passed, 104 total`,
  `Tests: 1358 passed, 1358 total`, all guards. commitlint bfd916a..48b6820 clean.

### Round C — CI and Android on 48b6820 (final code HEAD)

- Fast CI: Verify, Web bundle, Expo doctor — success.
- Android build (label `android-build`): "Android prebuild check" — success.
- Android E2E (label `e2e`), run 37696791985, job "Maestro flows" — **success**. Release APK
  (bundled JS, x86_64) on the CI emulator: API 34, `google_apis`, `pixel_tablet` profile,
  2560×1600 @ 320 dpi, animations at 1.
  - `[Passed] Catalog — choose from the Option Browser, review cart and reopen without losing
selections (2m 42s)`; `Exact-package events: [('am_proc_start', '5134')]`, `Final PID:
['5134']`, `PASS: exactly one app process; same PID alive after the test attempt`,
    `Maestro=0 native-process=0`.
  - `[Passed] Smoke — app launches to sign-in (14s)`; one process (7071), `Maestro=0
native-process=0`.
  - Passing the flow means its assertions held on device: the pinned UT 50K card was found
    and opened, `catalog-option-browser` was visible with the rack gone, an option was
    chosen and added from inside the browser, the Review Cart → Keep browsing (browser still
    shown) → reopen → Review Cart cycle matched line identity and counts, with no crash,
    death or ANR. Screenshots and logs: artifact `android-runtime-evidence` (7-day retention).
  - The earlier runs on 1dfc1e9 and bfd916a were cancelled by concurrency when newer commits
    were pushed; none failed.
- The records commit after this entry re-runs the same jobs (labels stay on #42); their
  result on that exact HEAD is reported on the PR.
