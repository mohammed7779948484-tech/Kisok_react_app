# release-notes — todo

## Tasks

- [x] **T01** model + dialog behaviour — `behavior` — GATE `PASS`
      (first install silent, update announces once, Continue persists, same
      release stays silent, generic fallback)
- [x] **T02** storage-failure behaviour — `behavior` — GATE `PASS`
      (read failure: silent, no startup block; write failure: still dismisses)
- [x] **T03** mount point — `behavior` — GATE `PASS`
      (customer layout only; not preparation, not root)

## Feature gate

- [x] Every task gate PASS
- [x] Every AC verified — AC-01..AC-07
- [x] `pnpm verify` PASS after the final change
- [x] No new dependency, no version bump
- [x] Customer-only mount proven, not assumed
- [ ] PHYSICAL VALIDATION REQUIRED — a real N→N+1 silent update on the
      Galaxy Tab A9+, the message appearing once, and not reappearing after
      Continue plus a restart. Cannot be observed without hardware.

FEATURE GATE: PASS (with the physical gate above recorded as external)
