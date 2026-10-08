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
`afterEach` with a persistent `mockRejectedValue`. Three tests then failed in
the full suite and passed in isolation — the signature of leakage between
tests.

The fix (`mockImplementationOnce`) was right, but the explanation first written
here was half wrong, and a reviewer caught it. Corrected, with the probe that
settles it:

| probe                                                 | next test |
| ----------------------------------------------------- | --------- |
| `mockImplementationOnce`, no restore                  | passes    |
| `mockImplementationOnce` + `restoreAllMocks()`        | passes    |
| persistent `mockImplementation` + `restoreAllMocks()` | **fails** |

So the real cause is the third row: **`jest.restoreAllMocks()` does not give
AsyncStorage's mock its implementation back.** The module's jest mock is itself
a `jest.fn`, so after restore `getItem` resolves `undefined` instead of reading
the in-memory store, and the dialog silently stops rendering in every later
test.

What was WRONG in the first write-up: it also claimed `mockRejectedValue`
builds its rejected promise EAGERLY, at configuration time. It does not —
`mockRejectedValue(v)` is sugar for `mockImplementation(() => Promise.reject(v))`
and the promise is created per call. That claim was an invented mechanism for a
symptom (a rejection attributed to a later test) that the leakage above already
explains. Recording it because a plausible-sounding cause that was never tested
is exactly the kind of thing this worklog exists to catch.

`mockImplementationOnce` fixes it by never leaving a replaced implementation
behind in the first place.

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

## Release 1.2.0 (versionCode 7) — notes

Feature release (Help Me Choose, large variant sets, the hidden staff
sign-out): `app.config.ts` `version` 1.1.4 → 1.2.0 and `android.versionCode`
6 → 7; `package.json` version follows, as in every previous bump.

- Mode: behavior. RED: `pnpm exec jest features/release-notes/model` → 2 failed
  — "returns the written KISOK 1.2.0 notes at their exact release token"
  (`Expected - 5, Received + 1`: no entry) and the new guard "has written
  notes for the release this app config builds" (`Expected: > 0, Received: 0`).
  The guard builds the token from the real `app.config.ts` exactly as
  `readReleaseIdentity` does, so a future version bump without notes fails CI
  instead of shipping the generic line.
- GREEN: `RELEASE_NOTES["1.2.0+7"]`, three customer-facing bullets;
  `pnpm exec jest features/release-notes` → 25 passed. The staff sign-out is
  deliberately not announced: it is a hidden staff tool, not something a
  customer should see.
- "Once after an update, never on first install" is unchanged and already
  covered by `whats-new-gate.test.tsx` ("says nothing on a FIRST install",
  "announces once when the installed release differs", "does not reappear on a
  restart after Continue").
- Prebuild check: `expo prebuild --platform android --no-install --clean` →
  `android/app/build.gradle` has `versionCode 7`, `versionName "1.2.0"`.
