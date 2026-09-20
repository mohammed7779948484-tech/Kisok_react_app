# release-notes — worklog

## T01 — model and dialog

`behavior`. RED first: `shouldAnnounce` and `readReleaseIdentity` were written
against failing tests, then the dialog against failing render tests.

The token design is the part worth recording. A first attempt keyed on
`Constants.expoConfig.version` alone, which is wrong in the one case that
matters most: Android enforces N→N+1 on `versionCode`, so a release can ship a
new build with an unchanged marketing version and the message would never
appear. The token is `"<version>+<versionCode>"`, pinned by a test that moves
only the versionCode.

## T02 — storage failures

`behavior`. Two failures, two different correct answers:

- **Read fails** → stay silent. An unreadable store is neither a first install
  nor an update. Announcing would claim an update that may never have happened;
  recording would swallow the next real one. `readLastSeenRelease` returns
  `undefined` for this, distinct from `null`.
- **Write fails** → still dismiss. The dialog closes before the write is
  awaited, so a full or locked store cannot trap a customer behind a modal. The
  message reappears after a restart; that is the lesser failure.

### A test that passed for the wrong reason

The first version of the failure tests used `jest.restoreAllMocks()` in
`afterEach` with `mockRejectedValue`. Two problems, both caught by running the
suite rather than the test:

1. `mockRejectedValue` builds the rejected promise EAGERLY, so it surfaced as
   an unhandled rejection attributed to a LATER test.
2. AsyncStorage's own jest mock is already a `jest.fn`, so `restoreAllMocks`
   RESET its implementation instead of restoring it — every subsequent
   `getItem` returned `undefined` and the dialog silently stopped rendering.
   Three tests failed in the full run and passed in isolation, which is the
   signature of leakage.

Both replaced with `mockImplementationOnce`, which leaves the real mock intact.

## T03 — mount point

`behavior`, structural. The requirement IS the mount point, so the test reads
the layout files: `<WhatsNewGate />` in `app/(customer)/_layout.tsx`, and
absent from both `app/(preparation)/_layout.tsx` and `app/_layout.tsx`.
Rendering the preparation stack would prove less and need the whole provider
tree.

## Gate

```
npx jest features/release-notes → 20 passed
```
