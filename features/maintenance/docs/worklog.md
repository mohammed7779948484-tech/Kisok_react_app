# Maintenance — worklog

Evidence, by task ID. A checkmark with no command output is not evidence.

Append entries; do not rewrite history. If a gate failed and was then fixed,
both belong here — a task that failed twice is a signal worth keeping.

## Template

Record the scaffold before anything else: the command the Lead actually ran and
what it put on disk. That is what makes the chain checkable —
`plan command → command run → filesystem → task evidence`. Without it, nobody
can tell later whether a file was generated, hand-written, or left over.

The entry evidence depends on the task's declared mode, so record the mode
first. `behavior`, `bug` and `behavior-change` open with RED; `refactor` opens
with a named BASELINE shown green; `config` has no RED at all — run the thing
it configures and paste the result under VERIFICATION.

```
### T01 — <objective>
MODE: behavior | bug | behavior-change | refactor | config
ACCEPTANCE: AC-xx | Supporting AC-xx | N/A — <reason>

SCAFFOLD          (Lead, before delegating — omit only when genuinely N/A)
  $ <the exact generator command the Lead ran>
  created  : <paths>
  skipped  : <paths that already existed>
  replaced : <paths overwritten, and why that was safe>
  manual   : <planned artifacts no capability covers>

RED               (behavior | bug | behavior-change)
  $ <command>
  <the failure, and why it is the RIGHT failure — not a typo or bad import>

BASELINE          (refactor)
  $ <command naming the existing tests being preserved>
  <green, before any change>

IMPLEMENT
  <the smallest change that does it>

GREEN             (behavior | bug | behavior-change | refactor)
  $ <command>
  <pass>

VERIFICATION      (config)
  $ <the thing it configures, actually run>
  <output proving the configuration works — not that a file contains a string>

AFFECTED CHECKS
  $ <typecheck / lint / focused tests>
  <result>

DIFF
  <files touched, and anything surprising>

GATE: PASS | FAIL
```

Delete the lines that do not apply to the mode. An empty RED heading under a
`config` task is the fabricated evidence this shape exists to prevent.

## Entries

_None yet._

## T01 — customer sign-out teardown (AC-07)

- Mode: bug (risk raised in planning: `useActiveProfile()` throws without a profile and
  `CheckoutGate`/`useCart` call it). Scaffold: N/A — a test only. Implementer: Lead.
- New test `app/__tests__/customer-sign-out-teardown.test.tsx` uses the real Expo Router
  navigator (`expo-router/testing-library` `renderRouter`), a customer group whose layout
  and screen read the profile through a throwing hook, then signs out.
- Result: GREEN on first run — the risk does **not** reproduce: the guarded group is torn
  down without a profile-less render; the app lands on sign-in with zero console errors.
- Discrimination check: temporarily forcing the customer guard to `true` makes the test
  fail with `useActiveProfile called outside an authenticated experience.` — reverted.
- No product fix required (`CheckoutGate`/`useCart` unchanged). Unverified: native-stack
  exit animation on an Android device (record at the device check).
- GATE: PASS

## T02 — discardCart (supporting AC-03/AC-04)

- Mode: behavior. Scaffold: N/A (additive export). Implementer: feature-implementer; Lead verified.
- RED: `pnpm exec jest features/cart/state/cart-store.test.ts -t "discard"` →
  `TypeError: useStore.getState(...).discard is not a function` (7 failed).
- GREEN: `pnpm exec jest features/cart` → 11 suites / 159 tests passed.
- Mutation check: dropping the queued re-empty fails only the pending-restore test.
- Checks: typecheck, eslint, prettier clean. Public-API pin in `use-cart.test.tsx`
  updated for the new export.
- Diff review (Lead): memory emptied now; removal always queued (even pre-hydration);
  `saved` true only on `persisted`; owner/lock/hydrated untouched.
- GATE: PASS

## T03 — Staff screen + route (AC-02, AC-03–AC-06)

- Mode: behavior. Scaffold (Lead): `pnpm generate screen maintenance maintenance` →
  `screens/maintenance/maintenance-screen.tsx` + `.test.tsx`;
  `pnpm generate route maintenance maintenance --role=customer --screen=maintenance` →
  `app/(customer)/maintenance.tsx`, export added to `features/maintenance/index.ts`.
- Implementer: feature-implementer; Lead verified.
- RED: placeholder screen → 8 failed (`Unable to find an element with text: Staff`,
  missing `maintenance-back` / `maintenance-sign-out`).
- GREEN: `pnpm exec jest features/maintenance` → 9 passed, zero console output.
- Covered: account name; cart sentence singular/plural/absent; Back (back or replace "/");
  discard before signOut with "Signing out…" and both buttons disabled; discard failure blocks
  signOut then retry; signOut failure reason then retry; thrown error → generic message.
- Known test limit: the double-press test cannot isolate the ref guard (the button is
  disabled after the first press); the ref remains as defence for presses before re-render.
- No checkout import. GATE: PASS

## T04 — lockup long press (AC-01)

- Mode: behavior. Scaffold: N/A (existing shell). Implementer: Lead.
- New `features/catalog/components/catalog-shell.test.tsx`. RED (after adding only the
  testID): hold test failed `Expected: "/maintenance"`.
- Implementation: `onLongPress` → `router.push("/maintenance")`, `delayLongPress={3000}`.
  Test premise corrected once: a 1 s press is an ordinary tap and goes Home (asserted).
- GREEN: 3 passed (tap → Home; 1 s → Home, no push; 3.2 s → `/maintenance`, no Home;
  no visible staff text, no hint). eslint/prettier clean.
- GATE: PASS

## T05 — docs that became false

- Mode: config. `docs/state-management.md` customer-isolation section and an ADR-0003
  amendment now describe the staff discard; `pnpm check:docs` → "Documentation matches the
  current workflow (103 files checked)". GATE: PASS

## Runtime evidence (web, 1280×800)

- Harness: the real app under `pnpm web`, Playwright with network mocks (stored session,
  `current_active_profile` → customer, catalog snapshot); details in
  `features/catalog/docs/phase-4-guided-discovery-worklog.md` ("Runtime harness").
- Mouse-down on `catalog-store-lockup` for 3.3 s → Staff page ("Signed in as Front Counter
  Kiosk", Back to the catalog / Sign out); Sign out → `/sign-in`; zero page errors. This also
  exercises AC-07 (customer group teardown) in the real navigator on web.
- Not verified: Android device (long-press timing with a finger, native-stack teardown,
  TalkBack long-press announcement).
