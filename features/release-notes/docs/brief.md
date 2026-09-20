# release-notes — brief

## What

After ManageEngine has already installed a new KISOK build, tell the customer
once that the tablet changed: "KISOK has been updated", the version, any
bundled release-note bullets, and a Continue button.

## Why

The kiosk updates silently. A tablet that looks different with no explanation
reads as a fault, and there is no other surface — the Single-App Kiosk shows
nothing but KISOK.

## What this is NOT

Not an updater, and the distinction is the whole design. ManageEngine checks
for, downloads and installs updates. This feature learns that one already
happened by comparing the running build's version with the last one this tablet
acknowledged. It polls nothing, calls no backend, downloads nothing, and cannot
trigger an install.

## Acceptance criteria

- **AC-01** A first install shows nothing and records the current release.
- **AC-02** A stored release that differs from the running one shows the
  message once.
- **AC-03** Continue is what records the new release; it does not reappear on
  a normal restart afterwards.
- **AC-04** Customer experience only. Preparation, sign-in, the unauthorized
  screen and the device-mismatch screen never show it.
- **AC-05** A storage read or write failure never blocks startup, never strands
  the customer, and never falsely claims an update.
- **AC-06** A release with no written bullets still shows a truthful generic
  line.
- **AC-07** No new dependency, no backend, no version bump.

## Boundaries

No MDM polling, no update-state API, no Supabase tables, no changelog service,
no rollout framework. Release notes are bundled static copy.

Deferred: notifying the owner or store BEFORE an update lands.
