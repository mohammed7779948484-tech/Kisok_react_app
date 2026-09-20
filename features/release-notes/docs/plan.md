# release-notes — plan

Status: READY

## Design decisions

**D1 — the release token includes `android.versionCode`, not just `version`.**
Android enforces N→N+1 on versionCode, so a release can ship a new build
without touching the marketing version. A versionName-only token would miss it
silently. The token is `"<version>+<versionCode>"`.

**D2 — three storage outcomes, not two.** `readLastSeenRelease` returns
`string | null | undefined`. `null` is "nothing stored — first install";
`undefined` is "could not tell". They must not collapse: treating an unreadable
store as a first install would silently swallow the next update's message, and
treating it as an update would announce one that never happened. On `undefined`
the feature stays silent.

**D3 — a first install is silent.** Nothing was updated. Announcing an update
on a brand-new tablet is simply false, and it would happen on every tablet.

**D4 — Continue is the acknowledgement.** The release is recorded on dismissal,
not on display, so a message a customer never saw is never marked as seen.

**D5 — dismissal closes the dialog BEFORE it awaits the write.** A tablet with
a full or locked store must not trap the customer behind a modal. The write
failing means the message reappears after a restart; that nuisance is strictly
better than a stuck kiosk.

**D6 — mounted in `app/(customer)/_layout.tsx`.** The smallest correct point:
that layout renders only under the customer guard, after auth and routing have
settled. At the root it would sit in front of sign-in, the unauthorized screen,
the device-mismatch screen and Preparation.

**D7 — notes are a plain record in `model/release-notes.ts`.** Bundled static
copy. A CMS, an API or a changelog service would be a backend for three lines.

## Shape

```
features/release-notes/
├── model/release-notes.ts          identity, notes, shouldAnnounce  (no IO)
├── state/last-seen-release.ts      the one AsyncStorage key
└── components/whats-new-gate.tsx   the dialog
```

Reuses `components/ui/dialog` and `components/ui/button`. No new dependency:
`@react-native-async-storage/async-storage` and `expo-constants` are installed.

## Verification

| task | mode     | covers            |
| ---- | -------- | ----------------- |
| T01  | behavior | AC-01,02,03,06,07 |
| T02  | behavior | AC-05             |
| T03  | behavior | AC-04             |
